import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma";

const AppointmentCreateSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  startTs: z.string().datetime(),
  endTs: z.string().datetime()
});

export async function appointmentsRoutes(app: FastifyInstance) {
  // BOOK
  app.post("/appointments", async (req, reply) => {
    const body = AppointmentCreateSchema.parse(req.body);

    const start = new Date(body.startTs);
    const end = new Date(body.endTs);
    if (end <= start) return reply.code(400).send({ error: "endTs must be after startTs" });

    // transaction: avoid double booking
    const result = await prisma.$transaction(async (tx) => {
      const overlap = await tx.appointment.findFirst({
        where: {
          doctorId: body.doctorId,
          status: "BOOKED",
          OR: [
            { startTs: { lt: end }, endTs: { gt: start } } // overlap condition
          ]
        }
      });

      if (overlap) {
        return { ok: false as const, error: "Slot already booked" };
      }

      const appt = await tx.appointment.create({
        data: {
          patientId: body.patientId,
          doctorId: body.doctorId,
          startTs: start,
          endTs: end,
          status: "BOOKED"
        }
      });

      return { ok: true as const, appt };
    });

    if (!result.ok) return reply.code(409).send({ error: result.error });
    return reply.code(201).send(result.appt);
  });

  // LIST by patient
  app.get("/patients/:id/appointments", async (req) => {
    const { id: patientId } = req.params as { id: string };
    return prisma.appointment.findMany({
      where: { patientId },
      orderBy: { startTs: "asc" },
      include: { doctor: true }
    });
  });
}
