import { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma";

export async function documentsRoutes(app: FastifyInstance) {
  app.get("/documents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const doc = await prisma.document.findUnique({
      where: { id }
    });

    if (!doc) {
      return reply.code(404).send({ error: "Document not found" });
    }

    return {
      id: doc.id,
      source: doc.source,
      title: doc.title,
      text: doc.text,
      metadata: doc.metadata,
      createdAt: doc.createdAt
    };
  });
}