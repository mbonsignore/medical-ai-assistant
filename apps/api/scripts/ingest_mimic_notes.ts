import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import { pool } from "../src/rag/pg.js";

function normalizeText(s: string) {
  return (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

// Replace MIMIC de-id patterns like: [**Name (NI) 123**]
function redactDeidMarkers(s: string) {
  return (s || "").replace(/\[\*\*.*?\*\*\]/g, "[REDACTED]");
}

function normalizeIdField(s: any) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  // many CSVs store numeric IDs as "12345.0"
  return t.endsWith(".0") ? t.slice(0, -2) : t;
}

function clip(s: string, n = 160) {
  const t = normalizeText(s);
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

type NoteRow = {
  ROW_ID?: string;
  SUBJECT_ID?: string;
  HADM_ID?: string;
  CHARTDATE?: string;
  CHARTTIME?: string;
  STORETIME?: string;
  CATEGORY?: string;
  DESCRIPTION?: string;
  CGID?: string;
  ISERROR?: string;
  TEXT?: string;
};

function chunkText(text: string, chunkSize = 1200, overlap = 200) {
  const t = text.trim();
  if (!t) return [];
  if (t.length <= chunkSize) return [t];

  const chunks: string[] = [];
  let i = 0;
  while (i < t.length) {
    const end = Math.min(i + chunkSize, t.length);
    chunks.push(t.slice(i, end));
    if (end >= t.length) break;
    i = Math.max(0, end - overlap);
  }
  return chunks;
}

function parseCsvStream(filePath: string) {
  const input = fs.createReadStream(filePath);
  const parser = parse({
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
  });
  return input.pipe(parser);
}

async function ensurePgcrypto() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
}

async function main() {
  // Root directory for the Kaggle dataset folder you added
  // Default matches your path: data/MIMIC -III (10000 patients)
  const root =
    process.env.MIMIC_DIR ||
    path.resolve(process.cwd(), "../../data/MIMIC -III (10000 patients)");

  const notesFile =
    process.env.MIMIC_NOTES ||
    path.join(root, "NOTEEVENTS", "NOTEEVENTS_sorted.csv");

  // -------- Limits / Controls (tweak via env) ----------
  const MAX_NOTES_TOTAL = Number(process.env.MIMIC_NOTES_MAX_TOTAL || "15000");
  const MAX_NOTES_PER_CATEGORY = Number(process.env.MIMIC_NOTES_MAX_PER_CATEGORY || "2500");
  const MAX_CHUNKS_PER_NOTE = Number(process.env.MIMIC_NOTES_MAX_CHUNKS_PER_NOTE || "8");

  const CHUNK_SIZE = Number(process.env.MIMIC_NOTES_CHUNK_SIZE || "1200");
  const CHUNK_OVERLAP = Number(process.env.MIMIC_NOTES_CHUNK_OVERLAP || "200");

  // Categories to ingest. Keep tight for quality + manageable doc counts.
  // Nursing/other is excluded by default (too noisy, plus lots of de-id tokens).
  const includeCategories = new Set(
    (process.env.MIMIC_NOTES_CATEGORIES ||
      "Discharge summary,Radiology,Physician,ECG,Echo")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
  );

  // Optional: if you want to include Nursing/other but capped heavily:
  // export MIMIC_NOTES_CATEGORIES="Discharge summary,Radiology,Physician,ECG,Echo,Nursing/other"
  // and keep MAX_NOTES_PER_CATEGORY low.

  console.log("MIMIC root:", root);
  console.log("NOTEEVENTS:", notesFile);
  console.log("Categories:", [...includeCategories].join(", "));
  console.log("Limits:", {
    MAX_NOTES_TOTAL,
    MAX_NOTES_PER_CATEGORY,
    MAX_CHUNKS_PER_NOTE,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
  });

  if (!fs.existsSync(notesFile)) {
    throw new Error(`NOTEEVENTS file not found: ${notesFile}`);
  }

  await ensurePgcrypto();

  const perCatCount = new Map<string, number>();
  let inserted = 0;
  let skipped = 0;

  const stream = parseCsvStream(notesFile);

  for await (const raw of stream as any as AsyncIterable<NoteRow>) {
    if (inserted >= MAX_NOTES_TOTAL) break;

    const isError = normalizeText(raw.ISERROR || "");
    if (isError === "1" || isError === "1.0" || isError.toLowerCase() === "true") continue;

    const category = normalizeText(raw.CATEGORY || "");
    if (!includeCategories.has(category)) continue;

    const catN = perCatCount.get(category) || 0;
    if (catN >= MAX_NOTES_PER_CATEGORY) continue;

    const rowId = normalizeIdField(raw.ROW_ID);
    const subjectId = normalizeIdField(raw.SUBJECT_ID);
    const hadmId = normalizeIdField(raw.HADM_ID);

    const description = normalizeText(raw.DESCRIPTION || "");
    const chartTime = normalizeText(raw.CHARTTIME || raw.CHARTDATE || "");

    const textRaw = String(raw.TEXT || "");
    const textClean = redactDeidMarkers(textRaw).trim();
    if (!textClean) continue;

    // Build a compact header that helps the LLM + retrieval
    const header =
      `MIMIC-III NOTE\n` +
      `Category: ${category}${description ? ` • ${description}` : ""}\n` +
      (chartTime ? `Chart time: ${chartTime}\n` : "") +
      (subjectId ? `subject_id: ${subjectId}\n` : "") +
      (hadmId ? `hadm_id: ${hadmId}\n` : "");

    const chunks = chunkText(textClean, CHUNK_SIZE, CHUNK_OVERLAP).slice(0, MAX_CHUNKS_PER_NOTE);

    for (let ci = 0; ci < chunks.length; ci++) {
      if (inserted >= MAX_NOTES_TOTAL) break;

      const stableId = `mimic_note_${rowId || `${subjectId}_${hadmId}_${Date.now()}`}_${ci}`;

      const title = `MIMIC Note: ${category}${description ? ` - ${description}` : ""}`;
      const body = `${header}\n\n${chunks[ci]}`;

      const metadata = {
        dataset: "MIMIC-III-10K",
        table: "NOTEEVENTS",
        rowId: rowId || null,
        chunkIndex: ci,
        subjectId: subjectId || null,
        hadmId: hadmId || null,
        category,
        description: description || null,
        chartTime: chartTime || null,
        pii_risk: true,
        redacted_deid_markers: true,
      };

      try {
        await pool.query(
          `INSERT INTO "Document"(id, source, title, text, metadata, "createdAt")
           VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
           ON CONFLICT (id) DO NOTHING`,
          [stableId, "MIMIC_NOTES", title, body, JSON.stringify(metadata)]
        );

        inserted++;
      } catch (e: any) {
        skipped++;
        if (skipped === 1) console.error("First insert error:", e?.message || e);
      }
    }

    perCatCount.set(category, catN + 1);

    if (inserted > 0 && inserted % 500 === 0) {
      console.log(
        `Inserted ${inserted} docs. Latest: ${category} | ${clip(description || title, 120)}`
      );
    }
  }

  console.log("Inserted:", inserted, "Skipped:", skipped);
  console.log("Per-category notes processed (pre-chunk):");
  for (const [k, v] of [...perCatCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`- ${k}: ${v}`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});