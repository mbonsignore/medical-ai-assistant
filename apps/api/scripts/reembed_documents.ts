import { pool } from "../src/rag/pg";
import pLimit from "p-limit";
import { embed } from "../src/llm/ollama";

function toPgVectorLiteral(vec: number[]) {
  const safe = vec.map((x) => {
    if (!Number.isFinite(x)) return 0;
    return Number(x.toFixed(6));
  });
  return `[${safe.join(",")}]`;
}

function truncateForEmbedding(text: string) {
  const maxChars = Number(process.env.EMBED_MAX_CHARS || "6000");
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

async function main() {
  const batchSize = Number(process.env.REEMBED_BATCH || "100");
  const concurrency = Number(process.env.REEMBED_CONCURRENCY || "2");
  const limit = pLimit(concurrency);

  let totalUpdated = 0;

  while (true) {
    const res = await pool.query(
      `SELECT id, title, text
       FROM "Document"
       WHERE embedding IS NULL
       ORDER BY "createdAt" ASC
       LIMIT $1`,
      [batchSize]
    );

    const rows = res.rows as Array<{ id: string; title: string | null; text: string }>;
    if (rows.length === 0) break;

    console.log(`Batch size=${rows.length} (updated so far: ${totalUpdated})`);

    const tasks = rows.map((r) =>
      limit(async () => {
        const raw = `${r.title ?? ""}\n\n${r.text}`;
        const content = truncateForEmbedding(raw);

        const v = await embed(content);

        await pool.query(`UPDATE "Document" SET embedding = $1::vector WHERE id = $2`, [
          toPgVectorLiteral(v),
          r.id
        ]);
      })
    );

    await Promise.all(tasks);
    totalUpdated += rows.length;
  }

  console.log("Done. Total updated:", totalUpdated);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
