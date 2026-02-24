import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { chat as ollamaChat } from "../llm/ollama";

const ReqSchema = z.object({
  query: z.string().min(1)
});

const SlotsReqSchema = z.object({
  query: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  perDoctor: z.number().int().min(1).max(20).default(5)
});

function tryParseJson(s: string): any | null {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = s.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

async function triageSpecialty(query: string) {
  const system =
    `You are a healthcare triage assistant.\n` +
    `Always respond in English.\n` +
    `Return ONLY valid JSON with keys: recommended_specialty (string), triage_level (LOW|MEDIUM|HIGH), red_flags (array of strings).\n` +
    `Do not diagnose.\n`;

  const user = `User message:\n${query}\n\nReturn the JSON now.`;

  const raw = await ollamaChat(system, user);
  const parsed = tryParseJson(raw);

  const recommended_specialty =
    parsed?.recommended_specialty && typeof parsed.recommended_specialty === "string"
      ? parsed.recommended_specialty
      : "General Practice";

  return {
    triage_level: parsed?.triage_level ?? "MEDIUM",
    red_flags: Array.isArray(parsed?.red_flags) ? parsed.red_flags : [],
    recommended_specialty
  };
}

export async function recommendRoutes(app: FastifyInstance) {
  app.post("/recommend/doctor", async (req, reply) => {
    const { query } = ReqSchema.parse(req.body);

    const triage = await triageSpecialty(query);

    const doctors = await prisma.doctor.findMany({
      where: { specialty: triage.recommended_specialty },
      orderBy: { createdAt: "asc" }
    });

    return reply.send({ query, ...triage, doctors });
  });

  // doctors + next slots
  app.post("/recommend/doctor-slots", async (req, reply) => {
    const body = SlotsReqSchema.parse(req.body);

    const triage = await triageSpecialty(body.query);

    const doctors = await prisma.doctor.findMany({
      where: { specialty: triage.recommended_specialty },
      orderBy: { createdAt: "asc" }
    });

    const baseUrl = `http://localhost:${Number(process.env.PORT || 3001)}`;

    const doctorsWithSlots = [];
    for (const d of doctors) {
      const res = await fetch(
        `${baseUrl}/doctors/${d.id}/slots?from=${encodeURIComponent(body.from)}&to=${encodeURIComponent(body.to)}`
      );
      const data = await res.json();
      const slots = Array.isArray(data?.slots) ? data.slots.slice(0, body.perDoctor) : [];
      doctorsWithSlots.push({ ...d, slots });
    }

    return reply.send({
      query: body.query,
      from: body.from,
      to: body.to,
      perDoctor: body.perDoctor,
      ...triage,
      doctors: doctorsWithSlots
    });
  });
}
