import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma as prismaReal } from "../db/prisma";
import { chat as ollamaChatReal } from "../llm/ollama";

const ClinicalNoteSchema = z.object({
  chatId: z.string().min(1),
});

// ✅ stable response schema
const ClinicalNoteOutSchema = z.object({
  note: z.object({
    chief_complaint: z.string(),
    timeline: z.string(),
    triage_and_red_flags: z.string(),
    suggested_specialty: z.string(),
    open_questions: z.string(),
    when_to_escalate: z.string(),
  }),
});

type AiDeps = {
  prisma: any;
  ollamaChat: (system: string, user: string, opts?: any) => Promise<string>;
};

function getDefaultDeps(): AiDeps {
  return { prisma: prismaReal, ollamaChat: ollamaChatReal };
}

function tryParseJsonStrict(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function hardClamp(s: string, max = 4000) {
  const t = String(s || "").trim();
  return t.length <= max ? t : t.slice(0, max).trim();
}

/**
 * ✅ If model fails JSON, try to parse the "heading" text deterministically.
 * Accepts either:
 *  - "CHIEF COMPLAINT: ...." blocks
 *  - "CHIEF COMPLAINT:\n...." blocks
 */
function parseHeadingsFallback(raw: string) {
  const text = String(raw || "").replace(/\r/g, "").trim();
  const keys = [
    "CHIEF COMPLAINT",
    "TIMELINE",
    "TRIAGE & RED FLAGS",
    "SUGGESTED SPECIALTY",
    "OPEN QUESTIONS",
    "WHEN TO ESCALATE",
  ] as const;

  const normalizeKey = (k: string) =>
    k
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();

  const out: Record<string, string> = {};
  for (const k of keys) out[normalizeKey(k)] = "";

  // Find all heading positions
  const positions: Array<{ key: string; idx: number }> = [];
  for (const k of keys) {
    const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b\\s*:?`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      positions.push({ key: normalizeKey(k), idx: m.index });
    }
  }
  positions.sort((a, b) => a.idx - b.idx);

  if (!positions.length) {
    return {
      chief_complaint: "",
      timeline: "",
      triage_and_red_flags: "",
      suggested_specialty: "",
      open_questions: "",
      when_to_escalate: hardClamp(text, 1200) || "Failed to generate a clinical note.",
    };
  }

  // Slice between headings
  for (let i = 0; i < positions.length; i++) {
    const cur = positions[i];
    const next = positions[i + 1];
    const start = cur.idx;

    // extract from start heading to next heading
    const block = text.slice(start, next ? next.idx : text.length).trim();

    // Remove the heading label itself
    const labelRe = new RegExp(`^${cur.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:?\\s*`, "i");
    const body = block.replace(labelRe, "").trim();

    out[cur.key] = body;
  }

  return {
    chief_complaint: hardClamp(out["CHIEF COMPLAINT"]),
    timeline: hardClamp(out["TIMELINE"]),
    triage_and_red_flags: hardClamp(out["TRIAGE & RED FLAGS"]),
    suggested_specialty: hardClamp(out["SUGGESTED SPECIALTY"]),
    open_questions: hardClamp(out["OPEN QUESTIONS"]),
    when_to_escalate: hardClamp(out["WHEN TO ESCALATE"]),
  };
}

/**
 * ✅ safe call: try format=json, if Ollama build doesn't support it, retry without
 */
async function callOllamaJsonSafe(
  deps: AiDeps,
  system: string,
  user: string,
  opts: any
): Promise<string> {
  try {
    return await deps.ollamaChat(system, user, opts);
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (
      opts?.format === "json" &&
      (msg.includes("format") || msg.includes("unknown field") || msg.includes("unrecognized"))
    ) {
      const { format, ...rest } = opts;
      return await deps.ollamaChat(system, user, rest);
    }
    throw e;
  }
}

export async function aiRoutes(app: FastifyInstance, depsOverride?: Partial<AiDeps>) {
  const deps: AiDeps = { ...getDefaultDeps(), ...(depsOverride || {}) };

  app.post("/ai/clinical-note", async (req, reply) => {
    const body = ClinicalNoteSchema.parse(req.body);

    const chat = await deps.prisma.chat.findUnique({ where: { id: body.chatId } });
    if (!chat) return reply.code(404).send({ error: "Chat not found" });

    const rows = await deps.prisma.message.findMany({
      where: { chatId: body.chatId },
      orderBy: { createdAt: "asc" },
      take: 40,
    });

    if (!rows?.length) return reply.code(404).send({ error: "No messages for this chat" });

    const transcript = rows
      .map((m: any) => `${String(m.role || "").toUpperCase()}: ${String(m.content || "")}`)
      .join("\n\n");

    const system =
      `You write a structured clinical note for a clinician from a patient chat transcript.\n` +
      `Always write in English.\n` +
      `Do NOT diagnose.\n` +
      `Do NOT invent tests, vitals, meds, allergies, or history not stated.\n` +
      `Be concise, medically neutral, and clinically useful.\n` +
      `Return ONLY valid JSON exactly in this schema:\n` +
      `{\n` +
      `  "note": {\n` +
      `    "chief_complaint": "...",\n` +
      `    "timeline": "...",\n` +
      `    "triage_and_red_flags": "...",\n` +
      `    "suggested_specialty": "...",\n` +
      `    "open_questions": "...",\n` +
      `    "when_to_escalate": "..."\n` +
      `  }\n` +
      `}\n` +
      `Rules:\n` +
      `- Each field must be a string (can be empty, but avoid empty if possible).\n` +
      `- Use information ONLY from the transcript.\n` +
      `- Keep each field short (1–3 sentences, or bullets in one string).\n`;

    const user = `Chat transcript:\n${transcript}\n\nReturn the JSON now.`;

    const raw = await callOllamaJsonSafe(deps, system, user, {
      temperature: 0.2,
      num_predict: 900,
      format: "json",
      stop: ["\n\nUSER:", "\n\nASSISTANT:"],
    });

    // 1) strict JSON parse
    const parsed = tryParseJsonStrict(raw);

    // 2) validate shape; if invalid, fallback parse headings from raw text
    const validated = ClinicalNoteOutSchema.safeParse(parsed);
    if (validated.success) {
      return reply.send(validated.data);
    }

    // Fallback: try to parse headings if model returned text
    const fallback = parseHeadingsFallback(raw);

    return reply.send({
      note: {
        chief_complaint: fallback.chief_complaint || "",
        timeline: fallback.timeline || "",
        triage_and_red_flags: fallback.triage_and_red_flags || "",
        suggested_specialty: fallback.suggested_specialty || "",
        open_questions: fallback.open_questions || "",
        when_to_escalate: fallback.when_to_escalate || "Failed to generate a clinical note.",
      },
    });
  });
}