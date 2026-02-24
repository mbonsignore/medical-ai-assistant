import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import { XMLParser } from "fast-xml-parser";
import { pool } from "../src/rag/pg";

function normalizeText(s: string) {
  return s.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

function clip(s: string, n = 120) {
  const t = normalizeText(s);
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

function extractText(node: any): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "object") {
    if (typeof node["#text"] === "string") return node["#text"];
    if (typeof node["#text"] === "number") return String(node["#text"]);
  }
  return "";
}

function chunkText(text: string, chunkSize: number, overlap: number) {
  const chunks: string[] = [];
  if (text.length <= chunkSize) return [text];

  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

async function ensurePgcrypto() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
}

function baseId(sourceFolder: string, docId: string | null, pid: string | null) {
  // include sourceFolder per evitare collisioni tra cartelle diverse
  return `medquad_${sourceFolder}_${docId ?? "noid"}_${pid ?? "nopid"}`;
}

async function main() {
  const root = process.env.MEDQUAD_DIR || path.resolve(process.cwd(), "../../data/medquad");
  const limit = Number(process.env.MEDQUAD_LIMIT || "0");

  const chunkSize = Number(process.env.MEDQUAD_CHUNK_SIZE || "6000");
  const overlap = Number(process.env.MEDQUAD_CHUNK_OVERLAP || "600");
  const chunkThreshold = Number(process.env.MEDQUAD_CHUNK_THRESHOLD || "8000");

  console.log("MedQuAD root:", root);
  console.log("Chunking:", { chunkSize, overlap, chunkThreshold });

  const files = await glob("**/*.xml", { cwd: root, nodir: true, absolute: true });
  console.log("XML files found:", files.length);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    isArray: (name) => ["QAPair"].includes(name)
  });

  await ensurePgcrypto();

  let inserted = 0;
  let skipped = 0;

  for (const file of files) {
    if (limit > 0 && inserted >= limit) break;

    const xml = await fs.readFile(file, "utf-8");
    const obj = parser.parse(xml);
    const doc = obj?.Document;
    if (!doc) continue;

    const docId = doc?.["@_id"] ?? null;
    const url = doc?.["@_url"] ?? null;
    const focus = normalizeText(extractText(doc?.Focus));
    const sourceFolder = path.basename(path.dirname(file));

    const qaPairs = doc?.QAPairs?.QAPair ?? [];
    if (!Array.isArray(qaPairs) || qaPairs.length === 0) continue;

    for (const qa of qaPairs) {
      if (limit > 0 && inserted >= limit) break;

      const pid = qa?.["@_pid"] ?? null;

      const qNode = qa?.Question;
      const aNode = qa?.Answer;

      const qid = qNode?.["@_qid"] ?? null;
      const qtype = qNode?.["@_qtype"] ?? null;

      const q = normalizeText(extractText(qNode));
      const a = normalizeText(extractText(aNode));
      if (!q || !a) continue;

      const titleBase = [focus || null, qtype ? `(${qtype})` : null, clip(q, 80)]
        .filter(Boolean)
        .join(" ");

      const fullText = `Question: ${q}\n\nAnswer: ${a}`;
      const chunks = fullText.length > chunkThreshold ? chunkText(fullText, chunkSize, overlap) : [fullText];

      const parent = baseId(sourceFolder, docId, pid);

      for (let ci = 0; ci < chunks.length; ci++) {
        const stableId = chunks.length === 1 ? parent : `${parent}_c${ci}`;
        const title = chunks.length === 1 ? titleBase : `${titleBase} (chunk ${ci + 1}/${chunks.length})`;

        const metadata = {
          dataset: "MedQuAD",
          sourceFolder,
          file: path.basename(file),
          docId,
          pid,
          qid,
          qtype,
          url,
          focus,
          chunked: chunks.length > 1,
          chunk_index: ci,
          chunk_total: chunks.length,
          parent_id: parent
        };

        try {
          await pool.query(
            `INSERT INTO "Document"(id, source, title, text, metadata, "createdAt")
             VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
             ON CONFLICT (id) DO NOTHING`,
            [stableId, "MedQuAD", title, chunks[ci], JSON.stringify(metadata)]
          );
          inserted++;
        } catch {
          skipped++;
        }
      }
    }
  }

  console.log("Inserted:", inserted, "Skipped:", skipped);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
