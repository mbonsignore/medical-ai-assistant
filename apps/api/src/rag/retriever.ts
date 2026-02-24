import { pool } from "./pg";
import { embed } from "../llm/ollama";

export type RagDoc = {
  id: string;
  source: string;
  title: string | null;
  text: string;
  score: number;
};

function toPgVectorLiteral(vec: number[]) {
  const safe = vec.map((x) => {
    if (!Number.isFinite(x)) return 0;
    return Number(x.toFixed(6));
  });
  return `[${safe.join(",")}]`;
}

export async function seedRagDocs() {
  // Seed minimale (senza embedding). Dopo, esegui pnpm reembed per popolare embedding.
  const docs = [
    {
      id: "seed_1",
      source: "MedQuAD",
      title: "Skin cancer warning signs (ABCDE)",
      text: "If a mole changes in Asymmetry, Border, Color, Diameter, or Evolving, consider medical evaluation. Seek a dermatologist for assessment."
    }
  ];

  for (const d of docs) {
    await pool.query(
      `INSERT INTO "Document"(id, source, title, text, metadata, "createdAt")
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [d.id, d.source, d.title, d.text, JSON.stringify({ seeded: true })]
    );
  }
}

export async function retrieve(query: string, k = 5): Promise<RagDoc[]> {
  // 1) embedding query via Ollama
  const qEmb = await embed(`query: ${query}`);
  const qv = toPgVectorLiteral(qEmb);

  // 2) ivfflat recall tuning (se indice ivfflat esiste)
  // Con ~18k doc, probes 50 è un buon compromesso
  await pool.query("SET ivfflat.probes = 50");

  // 3) similarity search
  const res = await pool.query(
    `SELECT id, source, title, text, (embedding <=> $1::vector) AS score
     FROM "Document"
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [qv, k]
  );

  return res.rows as RagDoc[];
}
