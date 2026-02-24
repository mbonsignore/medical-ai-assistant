import { FastifyInstance } from "fastify";
import { z } from "zod";
import { retrieve, seedRagDocs } from "../rag/retriever";

const QuerySchema = z.object({
  query: z.string().min(1)
});

// Route RAG "dev/admin" (minime)
export async function ragRoutes(app: FastifyInstance) {
  // Seed documenti (per ora seed; poi ingestion vera da script)
  app.post("/rag/seed", async (_req, reply) => {
    await seedRagDocs();
    return reply.code(201).send({ ok: true });
  });

  // Query endpoint (utile per debug/dimostrazione)
  app.post("/rag/query", async (req) => {
    const { query } = QuerySchema.parse(req.body);
    const docs = await retrieve(query, 5);
    return { query, docs };
  });
}
