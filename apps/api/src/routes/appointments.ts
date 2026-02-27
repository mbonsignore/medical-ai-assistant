import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma";

const AppointmentCreateSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  startTs: z.string().datetime(),
  endTs: z.string().datetime(),
});

const AppointmentUpdateSchema = z.object({
  status: z.enum(["BOOKED", "CANCELLED"]).optional(),
  startTs: z.string().datetime().optional(),
  endTs: z.string().datetime().optional(),
});

async function createAppointment(body: z.infer<typeof AppointmentCreateSchema>, reply: any) {
  const start = new Date(body.startTs);
  const end = new Date(body.endTs);
  if (end <= start) return reply.code(400).send({ error: "endTs must be after startTs" });

  const result = await prisma.$transaction(async (tx) => {
    const overlap = await tx.appointment.findFirst({
      where: {
        doctorId: body.doctorId,
        status: "BOOKED",
        OR: [{ startTs: { lt: end }, endTs: { gt: start } }],
      },
    });

    if (overlap) return { ok: false as const, error: "Slot already booked" };

    const appt = await tx.appointment.create({
      data: {
        patientId: body.patientId,
        doctorId: body.doctorId,
        startTs: start,
        endTs: end,
        status: "BOOKED",
      },
    });

    return { ok: true as const, appt };
  });

  if (!result.ok) return reply.code(409).send({ error: result.error });
  return reply.code(201).send(result.appt);
}

export async function appointmentsRoutes(app: FastifyInstance) {
  // BOOK
  app.post("/appointments", async (req, reply) => {
    const body = AppointmentCreateSchema.parse(req.body);
    return createAppointment(body, reply);
  });

  // Alias for demo/readability
  app.post("/bookings", async (req, reply) => {
    const body = AppointmentCreateSchema.parse(req.body);
    return createAppointment(body, reply);
  });

  // LIST by patient
  app.get("/patients/:id/appointments", async (req) => {
    const { id: patientId } = req.params as { id: string };
    return prisma.appointment.findMany({
      where: { patientId },
      orderBy: { startTs: "asc" },
      include: { doctor: true },
    });
  });

  // GET one appointment (for modal / details)
  app.get("/appointments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const appt = await prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, name: true, email: true } },
        doctor: { select: { id: true, name: true, specialty: true } },
      },
    });

    if (!appt) return reply.code(404).send({ error: "Appointment not found" });
    return appt;
  });

  // PATCH appointment (cancel / reschedule)
  app.patch("/appointments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = AppointmentUpdateSchema.parse(req.body);

    const current = await prisma.appointment.findUnique({ where: { id } });
    if (!current) return reply.code(404).send({ error: "Appointment not found" });

    // Optional reschedule validation
    let start: Date | undefined;
    let end: Date | undefined;

    if (body.startTs) start = new Date(body.startTs);
    if (body.endTs) end = new Date(body.endTs);

    if ((start && !end) || (!start && end)) {
      return reply.code(400).send({ error: "Provide both startTs and endTs to reschedule" });
    }
    if (start && end && end <= start) {
      return reply.code(400).send({ error: "endTs must be after startTs" });
    }

    // Prevent overlap if rescheduling
    if (start && end) {
      const overlap = await prisma.appointment.findFirst({
        where: {
          id: { not: id },
          doctorId: current.doctorId,
          status: "BOOKED",
          startTs: { lt: end },
          endTs: { gt: start },
        },
      });
      if (overlap) return reply.code(409).send({ error: "Slot already booked" });
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status: body.status,
        startTs: start,
        endTs: end,
      },
      include: {
        patient: { select: { id: true, name: true, email: true } },
        doctor: { select: { id: true, name: true, specialty: true } },
      },
    });

    return updated;
  });
}