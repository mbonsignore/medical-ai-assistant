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

const AvailabilityUpdateSchema = AvailabilityCreateSchema.partial();

function parseTimeToMinutes(t: string) {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}

function weekdayMon1Sun7(dt: DateTime) {
  return dt.weekday; // luxon: 1..7
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  // overlap if (aStart < bEnd) && (aEnd > bStart)
  return aStart < bEnd && aEnd > bStart;
}

export async function doctorsRoutes(app: FastifyInstance) {
  // CREATE
  app.post("/doctors", async (req, reply) => {
    const body = DoctorCreateSchema.parse(req.body);
    const doctor = await prisma.doctor.create({ data: body });
    return reply.code(201).send(doctor);
  });

  // READ ALL (optional specialty filter)
  app.get("/doctors", async (req) => {
    const { specialty } = req.query as { specialty?: string };
    return prisma.doctor.findMany({
      where: specialty ? { specialty } : undefined,
      orderBy: { createdAt: "desc" }
    });
  });

  // READ ONE (include availability ordered)
  app.get("/doctors/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const doctor = await prisma.doctor.findUnique({
      where: { id },
      include: {
        availability: {
          orderBy: [{ weekday: "asc" }, { startTime: "asc" }]
        }
      }
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

  // ADD AVAILABILITY (with duplicate + overlap guard)
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

    // Load existing availability for same weekday
    const existing = await prisma.doctorAvailability.findMany({
      where: { doctorId, weekday: body.weekday },
      orderBy: { startTime: "asc" }
    });

    // exact duplicate
    const isDuplicate = existing.some(a =>
      a.startTime === body.startTime &&
      a.endTime === body.endTime &&
      a.slotMinutes === body.slotMinutes
    );
    if (isDuplicate) {
      return reply.code(409).send({ error: "Availability already exists" });
    }

    // overlap check (ignore slotMinutes: rule intervals cannot overlap)
    const hasOverlap = existing.some(a => {
      const aStart = parseTimeToMinutes(a.startTime);
      const aEnd = parseTimeToMinutes(a.endTime);
      return overlaps(startM, endM, aStart, aEnd);
    });
    if (hasOverlap) {
      return reply.code(409).send({ error: "Availability overlaps an existing rule" });
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
          const slotStartLocal = d.plus({ minutes: m });
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

  // LIST APPOINTMENTS for doctor (optional from/to YYYY-MM-DD)
  app.get("/doctors/:id/appointments", async (req, reply) => {
    const { id: doctorId } = req.params as { id: string };
    const { from, to } = req.query as { from?: string; to?: string };

    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) return reply.code(404).send({ error: "Doctor not found" });

    let start: Date | undefined;
    let end: Date | undefined;

    if (from) {
      const d = DateTime.fromISO(from, { zone: TZ }).startOf("day");
      if (!d.isValid) return reply.code(400).send({ error: "Invalid 'from' date. Use YYYY-MM-DD" });
      start = d.toJSDate();
    }
    if (to) {
      const d = DateTime.fromISO(to, { zone: TZ }).endOf("day");
      if (!d.isValid) return reply.code(400).send({ error: "Invalid 'to' date. Use YYYY-MM-DD" });
      end = d.toJSDate();
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        ...(start || end
          ? {
              startTs: {
                ...(start ? { gte: start } : {}),
                ...(end ? { lte: end } : {}),
              },
            }
          : {}),
      },
      orderBy: { startTs: "asc" },
      include: {
        patient: { select: { id: true, name: true, email: true } },
        doctor: { select: { id: true, name: true, specialty: true } },
      },
    });

    return { doctorId, from: from ?? null, to: to ?? null, appointments };
  });

  // DELETE AVAILABILITY
  app.delete("/doctors/:doctorId/availability/:availabilityId", async (req, reply) => {
    const { doctorId, availabilityId } = req.params as {
      doctorId: string;
      availabilityId: string;
    };

    const avail = await prisma.doctorAvailability.findUnique({
      where: { id: availabilityId },
    });

    if (!avail) return reply.code(404).send({ error: "Availability not found" });
    if (avail.doctorId !== doctorId) {
      return reply.code(403).send({ error: "Availability does not belong to this doctor" });
    }

    await prisma.doctorAvailability.delete({ where: { id: availabilityId } });
    return reply.code(204).send();
  });

  // UPDATE AVAILABILITY
  app.put("/doctors/:doctorId/availability/:availabilityId", async (req, reply) => {
    const { doctorId, availabilityId } = req.params as {
      doctorId: string;
      availabilityId: string;
    };
    const body = AvailabilityUpdateSchema.parse(req.body);

    const avail = await prisma.doctorAvailability.findUnique({
      where: { id: availabilityId },
    });

    if (!avail) return reply.code(404).send({ error: "Availability not found" });
    if (avail.doctorId !== doctorId) {
      return reply.code(403).send({ error: "Availability does not belong to this doctor" });
    }

    const nextStart = body.startTime ?? avail.startTime;
    const nextEnd = body.endTime ?? avail.endTime;
    const startM = parseTimeToMinutes(nextStart);
    const endM = parseTimeToMinutes(nextEnd);
    if (endM <= startM) {
      return reply.code(400).send({ error: "endTime must be after startTime" });
    }

    const updated = await prisma.doctorAvailability.update({
      where: { id: availabilityId },
      data: body,
    });

    return updated;
  });
}