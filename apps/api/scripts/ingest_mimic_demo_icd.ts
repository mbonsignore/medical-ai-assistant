import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import { pool } from "../src/rag/pg";

function normalizeText(s: string) {
  return s.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

function clip(s: string, n = 180) {
  const t = normalizeText(s);
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

async function ensurePgcrypto() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
}

async function loadIcdDictionary(dictPath: string) {
  const map = new Map<string, { short: string; long: string }>();

  const input = fs.createReadStream(dictPath);
  const parser = parse({ columns: true, skip_empty_lines: true, relax_quotes: true });
  const stream = input.pipe(parser);

  for await (const row of stream as any) {
    const code = String(row.icd9_code ?? row.ICD9_CODE ?? "").trim();
    if (!code) continue;

    const shortTitle = normalizeText(String(row.short_title ?? row.SHORT_TITLE ?? ""));
    const longTitle = normalizeText(String(row.long_title ?? row.LONG_TITLE ?? ""));
    map.set(code, { short: shortTitle, long: longTitle });
  }

  return map;
}

async function main() {
  const root =
    process.env.MIMIC_DIR ||
    path.resolve(process.cwd(), "../../data/mimic/mimic-iii-clinical-database-demo-1.4");

  const dictFile = process.env.MIMIC_DICT || path.join(root, "D_ICD_DIAGNOSES.csv");
  const dxFile = process.env.MIMIC_DX || path.join(root, "DIAGNOSES_ICD.csv");
  const limit = Number(process.env.MIMIC_DX_LIMIT || "0"); // 0 = no limit

  console.log("MIMIC root:", root);
  console.log("Dict:", dictFile);
  console.log("Dx:", dxFile);

  await ensurePgcrypto();

  console.log("Loading ICD dictionary...");
  const icdMap = await loadIcdDictionary(dictFile);
  console.log("ICD codes loaded:", icdMap.size);

  const input = fs.createReadStream(dxFile);
  const parser = parse({ columns: true, skip_empty_lines: true, relax_quotes: true });
  const stream = input.pipe(parser);

  let inserted = 0;
  let skipped = 0;

  for await (const row of stream as any) {
    if (limit > 0 && inserted >= limit) break;

    const rowId = String(row.row_id ?? row.ROW_ID ?? "").trim();
    const subjectId = String(row.subject_id ?? row.SUBJECT_ID ?? "").trim();
    const hadmId = String(row.hadm_id ?? row.HADM_ID ?? "").trim();
    const seqNum = String(row.seq_num ?? row.SEQ_NUM ?? "").trim();
    const code = String(row.icd9_code ?? row.ICD9_CODE ?? "").trim();
    if (!code) continue;

    const info = icdMap.get(code);
    const shortTitle = info?.short || "";
    const longTitle = info?.long || "";

    const title = `MIMIC Diagnosis (ICD9 ${code}): ${longTitle || shortTitle || "Unknown diagnosis"}`;
    const text =
      `ICD9_CODE=${code}\n` +
      `Diagnosis=${longTitle || shortTitle || "Unknown"}\n` +
      `subject_id=${subjectId} hadm_id=${hadmId} seq_num=${seqNum}`;

    const metadata = {
      dataset: "MIMIC-III-DEMO",
      table: "DIAGNOSES_ICD",
      rowId,
      subjectId,
      hadmId,
      seqNum,
      icd9_code: code,
      shortTitle,
      longTitle,
      pii_risk: true
    };

    const stableId = `mimic_dx_${rowId || `${subjectId}_${hadmId}_${seqNum}_${code}`}`;

    try {
      await pool.query(
        `INSERT INTO "Document"(id, source, title, text, metadata, "createdAt")
         VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [stableId, "MIMIC", title, text, JSON.stringify(metadata)]
      );
      inserted++;
      if (inserted % 400 === 0) console.log("Inserted", inserted, "-", clip(title, 120));
    } catch (e: any) {
      skipped++;
      // per debug: stampa il primo errore e poi continua
      if (skipped === 1) console.error("First insert error:", e?.message || e);
    }
  }

  console.log("Inserted:", inserted, "Skipped:", skipped);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
