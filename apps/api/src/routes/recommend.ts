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

function normalizeSpecialty(raw?: string) {
  const s = (raw || "").trim().toLowerCase();

  if (!s) return "General Practice";

  if (s.includes("emergency")) return "EMERGENCY";
  if (s.includes("general practitioner")) return "General Practice";
  if (s.includes("general practice")) return "General Practice";
  if (s.includes("general medicine")) return "General Practice";
  if (s.includes("family medicine")) return "General Practice";
  if (s.includes("primary care")) return "General Practice";

  if (s.includes("dermatolog")) return "Dermatology";
  if (s.includes("cardiolog")) return "Cardiology";
  if (s.includes("gastro")) return "Gastroenterology";
  if (s.includes("neurolog")) return "Neurology";
  if (s.includes("orthopedic")) return "Orthopedics";
  if (s.includes("orthopaedic")) return "Orthopedics";

  return raw!;
}

async function triageSpecialty(query: string) {
  const system =
    `You are a healthcare triage assistant.\n` +
    `Always respond in English.\n` +
    `Do not diagnose.\n` +
    `Calibrate urgency carefully:\n` +
    `- HIGH only for clear emergency or severe red-flag situations.\n` +
    `- MEDIUM for non-emergency symptoms that still deserve evaluation.\n` +
    `- LOW for mild isolated symptoms without red flags.\n` +
    `For mild common symptoms, prefer General Practice rather than specialist referral unless specific red flags strongly indicate a specialty.\n` +
    `Do not over-triage symptoms such as mild headache, mild nausea, mild abdominal discomfort, fatigue, or stress-related complaints unless strong red flags are explicitly present.\n` +
    `- For broad, common digestive symptoms such as nausea, stomach pain, indigestion, bloating, or mild post-meal discomfort without major red flags, prefer General Practice.\n` +
    `- Do not recommend Gastroenterology unless the symptom pattern clearly suggests a persistent or specialty-level digestive issue.\n` +
    `- Do not use rare diseases to justify urgency or specialist referral for common mild symptoms.\n` +
    `Return ONLY valid JSON with keys: recommended_specialty (string), triage_level (LOW|MEDIUM|HIGH), red_flags (array of strings).\n`;

  const user = `User message:\n${query}\n\nReturn the JSON now.`;

  const raw = await ollamaChat(system, user);
  const parsed = tryParseJson(raw);

  return {
    triage_level: parsed?.triage_level ?? "MEDIUM",
    red_flags: Array.isArray(parsed?.red_flags) ? parsed.red_flags : [],
    recommended_specialty: normalizeSpecialty(parsed?.recommended_specialty ?? "General Practice")
  };
}

export async function recommendRoutes(app: FastifyInstance) {
  app.post("/recommend/doctor", async (req, reply) => {
    const { query } = ReqSchema.parse(req.body);
    const triage = await triageSpecialty(query);

    if (triage.triage_level === "HIGH" || triage.recommended_specialty === "EMERGENCY") {
      return reply.send({
        query,
        ...triage,
        doctors: [],
        emergency: true
      });
    }

    const doctors = await prisma.doctor.findMany({
      where: { specialty: triage.recommended_specialty },
      orderBy: { createdAt: "asc" }
    });

    return reply.send({ query, ...triage, doctors, emergency: false });
  });

  app.post("/recommend/doctor-slots", async (req, reply) => {
    const body = SlotsReqSchema.parse(req.body);
    const triage = await triageSpecialty(body.query);

    if (triage.triage_level === "HIGH" || triage.recommended_specialty === "EMERGENCY") {
      return reply.send({
        query: body.query,
        from: body.from,
        to: body.to,
        perDoctor: body.perDoctor,
        ...triage,
        doctors: [],
        emergency: true
      });
    }

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
      doctors: doctorsWithSlots,
      emergency: false
    });
  });
}