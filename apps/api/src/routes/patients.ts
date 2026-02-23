import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma";

const PatientCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional()
});

const PatientUpdateSchema = PatientCreateSchema.partial();

export async function patientsRoutes(app: FastifyInstance) {
  // CREATE
  app.post("/patients", async (req, reply) => {
    const body = PatientCreateSchema.parse(req.body);
    const patient = await prisma.patient.create({ data: body });
    return reply.code(201).send(patient);
  });

  // READ ALL
  app.get("/patients", async () => {
    return prisma.patient.findMany({ orderBy: { createdAt: "desc" } });
  });

  // READ ONE
  app.get("/patients/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const patient = await prisma.patient.findUnique({ where: { id } });
    if (!patient) return reply.code(404).send({ error: "Patient not found" });
    return patient;
  });

  // UPDATE
  app.put("/patients/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = PatientUpdateSchema.parse(req.body);

    try {
      const patient = await prisma.patient.update({ where: { id }, data: body });
      return patient;
    } catch {
      return reply.code(404).send({ error: "Patient not found" });
    }
  });

  // DELETE
  app.delete("/patients/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await prisma.patient.delete({ where: { id } });
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "Patient not found" });
    }
  });
}
