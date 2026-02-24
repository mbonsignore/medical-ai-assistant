import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { DateTime } from "luxon";

const TZ = "Europe/Rome";

const DoctorCreateSchema = z.object({
  name: z.string().min(1),
  specialty: z.string().min(1),
  bio: z.string().optional()
});

const DoctorUpdateSchema = DoctorCreateSchema.partial();

const AvailabilityCreateSchema = z.object({
  weekday: z.number().int().min(1).max(7), // 1=Mon ... 7=Sun
  startTime: z.string().regex(/^\d{2}:\d{2}$/), // "09:00"
  endTime: z.string().regex(/^\d{2}:\d{2}$/),   // "17:00"
  slotMinutes: z.number().int().min(5).max(240).default(30)
});

function parseTimeToMinutes(t: string) {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}

function weekdayMon1Sun7(dt: DateTime) {
  // luxon: weekday 1=Mon..7=Sun already
  return dt.weekday;
}

export async function doctorsRoutes(app: FastifyInstance) {
  // CREATE
  app.post("/doctors", async (req, reply) => {
    const body = DoctorCreateSchema.parse(req.body);
    const doctor = await prisma.doctor.create({ data: body });
    return reply.code(201).send(doctor);
  });

  // READ ALL (con filtro specialty opzionale)
  app.get("/doctors", async (req) => {
    const { specialty } = req.query as { specialty?: string };
    return prisma.doctor.findMany({
      where: specialty ? { specialty } : undefined,
      orderBy: { createdAt: "desc" }
    });
  });

  // READ ONE (include availability)
  app.get("/doctors/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const doctor = await prisma.doctor.findUnique({
      where: { id },
      include: { availability: true }
    });
    if (!doctor) return reply.code(404).send({ error: "Doctor not found" });
    return doctor;
  });

  // UPDATE
  app.put("/doctors/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = DoctorUpdateSchema.parse(req.body);
    try {
      return await prisma.doctor.update({ where: { id }, data: body });
    } catch {
      return reply.code(404).send({ error: "Doctor not found" });
    }
  });

  // DELETE
  app.delete("/doctors/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await prisma.doctor.delete({ where: { id } });
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "Doctor not found" });
    }
  });

  // ADD AVAILABILITY
  app.post("/doctors/:id/availability", async (req, reply) => {
    const { id: doctorId } = req.params as { id: string };
    const body = AvailabilityCreateSchema.parse(req.body);

    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) return reply.code(404).send({ error: "Doctor not found" });

    const startM = parseTimeToMinutes(body.startTime);
    const endM = parseTimeToMinutes(body.endTime);
    if (endM <= startM) {
      return reply.code(400).send({ error: "endTime must be after startTime" });
    }

    const created = await prisma.doctorAvailability.create({
      data: {
        doctorId,
        weekday: body.weekday,
        startTime: body.startTime,
        endTime: body.endTime,
        slotMinutes: body.slotMinutes
      }
    });

    return reply.code(201).send(created);
  });

  // GET FREE SLOTS (Europe/Rome)
  app.get("/doctors/:id/slots", async (req, reply) => {
    const { id: doctorId } = req.params as { id: string };
    const { from, to } = req.query as { from?: string; to?: string };

    if (!from || !to) {
      return reply.code(400).send({ error: "Query params 'from' and 'to' are required (YYYY-MM-DD)" });
    }

    const fromDt = DateTime.fromISO(from, { zone: TZ }).startOf("day");
    const toDt = DateTime.fromISO(to, { zone: TZ }).startOf("day");
    if (!fromDt.isValid || !toDt.isValid) {
      return reply.code(400).send({ error: "Invalid date format. Use YYYY-MM-DD" });
    }
    if (toDt < fromDt) {
      return reply.code(400).send({ error: "'to' must be >= 'from'" });
    }

    const doctor = await prisma.doctor.findUnique({
      where: { id: doctorId },
      include: { availability: true }
    });
    if (!doctor) return reply.code(404).send({ error: "Doctor not found" });

    const rangeStart = fromDt.toJSDate();
    const rangeEnd = toDt.endOf("day").toJSDate();

    // ✅ Correct overlap query: (start < rangeEnd) AND (end > rangeStart)
    const booked = await prisma.appointment.findMany({
      where: {
        doctorId,
        status: "BOOKED",
        startTs: { lt: rangeEnd },
        endTs: { gt: rangeStart }
      },
      select: { startTs: true, endTs: true }
    });

    const bookedIntervals = booked.map(b => [b.startTs.getTime(), b.endTs.getTime()] as const);

    const slots: Array<{
      startTs: string;
      endTs: string;
      dateLocal: string;
      startLocal: string;
      endLocal: string;
      timeZone: string;
    }> = [];

    for (let d = fromDt; d <= toDt; d = d.plus({ days: 1 })) {
      const wd = weekdayMon1Sun7(d);
      const avails = doctor.availability.filter(a => a.weekday === wd);

      for (const a of avails) {
        const startM = parseTimeToMinutes(a.startTime);
        const endM = parseTimeToMinutes(a.endTime);

        for (let m = startM; m + a.slotMinutes <= endM; m += a.slotMinutes) {
          const slotStartLocal = d.plus({ minutes: m }); // in Europe/Rome
          const slotEndLocal = slotStartLocal.plus({ minutes: a.slotMinutes });

          const s = slotStartLocal.toMillis();
          const e = slotEndLocal.toMillis();

          const overlapsBooked = bookedIntervals.some(([bs, be]) => !(e <= bs || s >= be));
          if (!overlapsBooked) {
            slots.push({
              startTs: slotStartLocal.toUTC().toISO()!,
              endTs: slotEndLocal.toUTC().toISO()!,
              dateLocal: slotStartLocal.toFormat("yyyy-LL-dd"),
              startLocal: slotStartLocal.toFormat("HH:mm"),
              endLocal: slotEndLocal.toFormat("HH:mm"),
              timeZone: TZ
            });
          }
        }
      }
    }

    return { doctorId, from, to, slots };
  });
}
