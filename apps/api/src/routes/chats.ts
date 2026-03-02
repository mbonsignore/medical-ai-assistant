import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma as prismaReal } from "../db/prisma";
import { retrieve as retrieveReal } from "../rag/retriever";
import { chat as ollamaChatReal } from "../llm/ollama";

const ChatCreateSchema = z.object({
  patientId: z.string().min(1),
});

const MessageCreateSchema = z.object({
  content: z.string().min(1),
});

type ChatDeps = {
  prisma: any;
  retrieve: (query: string, k?: number) => Promise<any[]>;
  ollamaChat: (system: string, user: string, opts?: any) => Promise<string>;
};

function getDefaultDeps(): ChatDeps {
  return {
    prisma: prismaReal,
    retrieve: retrieveReal,
    ollamaChat: ollamaChatReal,
  };
}

/**
 * JSON parsing helpers
 */
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

function tryParseJsonStrict(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function normalizeSources(raw: any): any | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return null;
  return tryParseJsonStrict(raw) ?? tryParseJson(raw);
}

function normalizeMessageRow(m: any) {
  return { ...m, sources: normalizeSources(m.sources) };
}

function todayIsoDateUtc() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Specialty normalization
 */
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
  if (s.includes("orthopedic") || s.includes("orthopaedic")) return "Orthopedics";

  if (s.includes("pulmon") || s.includes("pulmonary") || s.includes("respir")) return "General Practice";
  if (s.includes("ent") || s.includes("otolaryng")) return "General Practice";
  if (s.includes("urolog")) return "General Practice";
  if (s.includes("gyne") || s.includes("obgyn")) return "General Practice";
  if (s.includes("psychiatr") || s.includes("psycholog") || s.includes("mental")) return "General Practice";

  return "General Practice";
}

/**
 * Context building: short snippets (no "external dataset" line, model kept repeating it)
 */
function clipText(s: string, maxChars = 800) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars).trim() + "…";
}

function buildContext(docs: Array<{ title: string | null; source: string; text: string }>) {
  if (!docs?.length) return "";
  return docs
    .map((d, i) => {
      const title = d.title ?? "Untitled";
      const snippet = clipText(d.text, 800);
      return (
        `SOURCE ${i + 1}\n` +
        `Title: ${title}\n` +
        `Dataset: ${d.source}\n` +
        `Snippet:\n${snippet}\n`
      );
    })
    .join("\n---\n");
}

function firstSentence(s: string) {
  const m = s.match(/^.*?[.!?](\s|$)/);
  return m ? m[0].trim() : s.trim();
}

function hardClampNoEllipsis(s: string, maxLen: number) {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * ✅ ADMIN detector (deterministico)
 * Se matcha, bypassiamo completamente triage/retrieve/llm answer.
 */
function isAdminRequest(message: string): boolean {
  const m = (message || "").toLowerCase();

  // appointment management
  const appt =
    /\b(cancel|cancell|reschedul|reschedule|move|change|modify|edit)\b/.test(m) &&
    /\b(appointment|visit|booking|booked|slot|reservation|meeting)\b/.test(m);

  // direct “cancel my appointment” variants
  const direct =
    /\b(cancel|cancell)\b.*\b(appointment|booking|visit|slot)\b/.test(m) ||
    /\b(reschedul|reschedule)\b.*\b(appointment|booking|visit|slot)\b/.test(m);

  // booking actions
  const bookAction =
    /\b(book|booking|schedule|make an appointment|set up an appointment)\b/.test(m) &&
    /\b(doctor|appointment|visit|slot)\b/.test(m);

  // account/payment/support
  const account =
    /\b(account|login|password|email|billing|payment|refund|subscription|plan|support|customer service)\b/.test(m);

  // “can you cancel my appointment for tomorrow?” (no second keyword sometimes)
  const tomorrowCancel = /\b(cancel|cancell)\b.*\b(tomorrow|today|next week|next monday|next tuesday)\b/.test(m);

  return appt || direct || bookAction || account || tomorrowCancel;
}

function adminStandardAnswer() {
  return (
    "I can’t perform administrative actions like cancelling or rescheduling appointments from chat. " +
    "Please use the app’s booking section to manage your appointments directly."
  );
}

/**
 * Minimal emergency guardrail (negation + obvious emergencies)
 */
function containsAny(text: string, patterns: string[]) {
  const t = text.toLowerCase();
  return patterns.some((p) => t.includes(p));
}

function hasNegationNear(text: string, phrase: string) {
  const t = text.toLowerCase().replace(/\s+/g, " ");
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const negCues = ["no", "not", "don't", "do not", "denies", "deny", "without", "never", "neither", "nor"];
  const re = new RegExp(`\\b(${negCues.join("|")})\\b.{0,30}\\b${escaped}\\b`, "i");
  if (re.test(t)) return true;
  const reNeither = new RegExp(`\\bneither\\b[\\s\\S]{0,80}\\b${escaped}\\b`, "i");
  if (reNeither.test(t)) return true;
  return false;
}

function applyUrgencyGuardrails(
  message: string,
  triage: {
    triage_level: string;
    recommended_specialty: string;
    red_flags: string[];
    follow_up_questions: string[];
    short_summary: string;
  }
) {
  const msg = message.toLowerCase();

  const mentionsChestPain = msg.includes("chest pain");
  const mentionsSOB = msg.includes("shortness of breath");

  const chestPainNegated = mentionsChestPain && hasNegationNear(message, "chest pain");
  const sobNegated = mentionsSOB && hasNegationNear(message, "shortness of breath");

  const strongChestPain =
    mentionsChestPain &&
    !chestPainNegated &&
    containsAny(msg, ["strong chest pain", "severe chest pain", "crushing chest pain", "tightness", "pressure"]);

  const highEmergency =
    (mentionsChestPain && mentionsSOB && !chestPainNegated && !sobNegated) ||
    strongChestPain ||
    containsAny(msg, ["i can't breathe", "cant breathe", "cannot breathe"]) ||
    containsAny(msg, ["see the bone", "bone under", "open fracture", "compound fracture"]);

  if (highEmergency) return { ...triage, triage_level: "HIGH", recommended_specialty: "EMERGENCY" };
  return triage;
}

/**
 * Router + Triage schema
 */
type RouterDecision = {
  turn_type: "NEW_ISSUE" | "FOLLOWUP" | "MORE_DETAIL" | "CLARIFICATION" | "ADMIN";
  issue_changed: boolean;
  issue_label: string;
  evidence: string[];

  should_retriage: boolean;
  should_recommend: boolean;
  should_refresh_followups: boolean;
  should_update_summary: boolean;

  rewritten_query: string;

  triage_level: "LOW" | "MEDIUM" | "HIGH";
  recommended_specialty: string;
  red_flags: string[];
  follow_up_questions: string[];
  short_summary: string;
};

function defaultDecision(message: string): RouterDecision {
  return {
    turn_type: "NEW_ISSUE",
    issue_changed: true,
    issue_label: "general",
    evidence: [],

    should_retriage: true,
    should_recommend: true,
    should_refresh_followups: true,
    should_update_summary: true,

    rewritten_query: message,

    triage_level: "MEDIUM",
    recommended_specialty: "General Practice",
    red_flags: [],
    follow_up_questions: [
      "How long have you had these symptoms?",
      "Have you noticed any worsening or additional symptoms?",
      "Have you already tried any treatment or had any tests for this?",
    ],
    short_summary: "",
  };
}

function heuristicRouterFallback(params: { message: string; hasPrevTriage: boolean; prevFollowUps: string[] }): RouterDecision {
  const msg = params.message.trim();
  const short = msg.length < 220;
  const looksLikeAnswer =
    short &&
    (msg.toLowerCase().startsWith("yes") ||
      msg.toLowerCase().startsWith("no") ||
      msg.toLowerCase().includes("since ") ||
      msg.toLowerCase().includes("days") ||
      msg.toLowerCase().includes("weeks") ||
      msg.toLowerCase().match(/\b\d+(\.\d+)?\s*(c|°c|celsius)\b/) !== null);

  const likelyFollowup = params.hasPrevTriage && (looksLikeAnswer || params.prevFollowUps.length > 0);

  if (likelyFollowup) {
    const d = defaultDecision(msg);
    return {
      ...d,
      turn_type: "FOLLOWUP",
      issue_changed: false,
      should_retriage: false,
      should_recommend: false,
      should_refresh_followups: false,
      should_update_summary: false,
      rewritten_query: msg,
    };
  }

  return defaultDecision(msg);
}

function safeStr(x: any) {
  return typeof x === "string" ? x.trim() : "";
}

function safeArrStr(x: any, max = 3): string[] {
  if (!Array.isArray(x)) return [];
  return x.map((v) => String(v)).map((s) => s.trim()).filter(Boolean).slice(0, max);
}

function evidenceMatchesMessage(evidence: string[], msg: string) {
  if (!evidence?.length) return false;
  const m = msg.toLowerCase();
  return evidence.some((e) => e && m.includes(String(e).toLowerCase()));
}

async function callOllamaJsonSafe(deps: ChatDeps, system: string, user: string, opts: any): Promise<string> {
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

async function runRouterAndTriageLLM(params: {
  deps: ChatDeps;
  newMessage: string;
  recentMessages: Array<{ role: string; content: string }>;
  prevTriage: any | null;
  prevIssueLabel: string | null;
  prevFollowUps: string[];
  forceEmptyContext?: boolean;
}): Promise<RouterDecision> {
  const { deps, newMessage, recentMessages, prevTriage, prevIssueLabel, prevFollowUps, forceEmptyContext } = params;

  const transcript = forceEmptyContext
    ? ""
    : recentMessages
        .slice(-10)
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n");

  const system =
    `You are the ROUTER + TRIAGE module for a medical chat application.\n` +
    `Always respond in English. Do NOT diagnose.\n` +
    `Your job has two parts:\n` +
    `A) Router: classify the NEW user message as one of:\n` +
    `   - NEW_ISSUE: different medical topic than before\n` +
    `   - FOLLOWUP: answering or continuing the same issue\n` +
    `   - MORE_DETAIL: adds details to the same issue\n` +
    `   - CLARIFICATION: asks meaning/seriousness about the same issue\n` +
    `   - ADMIN: appointment/account/payment/support actions (NOT medical)\n` +
    `B) Triage (ONLY if not ADMIN): urgency + specialty + red flags + 3 follow-up questions.\n` +
    `\n` +
    `IMPORTANT RULES:\n` +
    `- Triage must be based ONLY on the user's message (never on retrieved documents).\n` +
    `- Red flags are WARNING SIGNS to watch for; NOT confirmed facts.\n` +
    `- If the user negates a symptom ("no chest pain"), treat it as ABSENT.\n` +
    `- Temperature: if user uses Celsius, reason in Celsius; if Fahrenheit, reason in Fahrenheit.\n` +
    `- Specialty options available: General Practice, Cardiology, Dermatology, Gastroenterology, Neurology, Orthopedics, EMERGENCY.\n` +
    `  If unsure, use "General Practice".\n` +
    `\n` +
    `URGENCY CALIBRATION (strict):\n` +
    `LOW = mild/stable, no red flags; self-care + monitor is reasonable.\n` +
    `MEDIUM = not emergency, but evaluation soon or close monitoring (persistent/worsening, moderate pain, uncertainty/risk factors).\n` +
    `HIGH = emergency happening NOW; urgent in-person evaluation / emergency services.\n` +
    `\n` +
    `HIGH => triage_level="HIGH" AND recommended_specialty="EMERGENCY" when:\n` +
    `- "I can't breathe" / severe trouble breathing now.\n` +
    `- severe/strong/crushing chest pain or chest pressure happening now.\n` +
    `- chest pain + shortness of breath happening now.\n` +
    `- confusion + stiff neck (especially if fever/acute illness is mentioned) => treat as HIGH/EMERGENCY.\n` +
    `- stroke signs, severe bleeding, open fracture.\n` +
    `\n` +
    `Chest pain guidance (avoid under-triage):\n` +
    `- Chest pain ONLY during exertion (e.g., running) or recurring chest pain (even if not now) => usually MEDIUM (NOT HIGH if not happening now and no severe symptoms).\n` +
    `\n` +
    `Atrial fibrillation / anticoagulation guidance:\n` +
    `- Mentions of "atrial fibrillation", "AFib", arrhythmia, palpitations, blood thinners/anticoagulants => usually Cardiology.\n` +
    `- If asking what AF means or treatment questions (e.g., blood thinners) and no emergency symptoms now => usually MEDIUM (not LOW).\n` +
    `\n` +
    `Fever guidance (avoid over-triage):\n` +
    `- ~38°C (100.4°F) for a few hours with no other red flags => usually LOW.\n` +
    `- >=39°C (102.2°F), persistent >48h, or concerning context => MEDIUM.\n` +
    `- Fever + severe red flags (confusion, stiff neck, severe breathing issues) => MEDIUM/HIGH.\n` +
    `- 36–36.7°C is normal.\n` +
    `- 35°C is NOT normal. If user feels fine and no cold exposure, treat as possible measurement error: ask to re-check; if confirmed low or symptoms present => at least MEDIUM.\n` +
    `\n` +
    `ADMIN handling:\n` +
    `- If ADMIN: turn_type="ADMIN" and set triage fields to neutral values:\n` +
    `  triage_level="LOW", recommended_specialty="General Practice", red_flags=[], follow_up_questions=[]\n` +
    `  and set all should_* = false.\n` +
    `\n` +
    `Topic-shift rule (very important):\n` +
    `- If the new message is about a different body system or a different complaint than the prior issue, it MUST be NEW_ISSUE.\n` +
    `- If the new message is a follow up to the prior issue, it MUST be FOLLOWUP, NOT NEW_ISSUE.\n` +
    `- Examples of NEW_ISSUE topic shift:\n` +
    `* Prior: atrial fibrillation; New: "I hit my left leg against a wall and it hurts" => NEW_ISSUE.\n` +
    `* Prior: atrial fibrillation; New: "itchy rash after new detergent" => NEW_ISSUE.\n` +
    `- For NEW_ISSUE:\n` +
    `* issue_changed MUST be true\n` +
    `* issue_label MUST be based on the NEW message (do not reuse the previous label)\n` +
    `* should_retriage, should_refresh_followups, should_recommend, should_update_summary MUST be true\n` +
    `* triage fields MUST be computed ONLY from the NEW message (ignore prior issue).\n` +
    `\n` +
    `Output must be ONLY valid JSON. No extra text.\n`;

  const user =
    `Return a JSON object with keys:\n` +
    `turn_type (NEW_ISSUE|FOLLOWUP|MORE_DETAIL|CLARIFICATION|ADMIN)\n` +
    `issue_changed (boolean)\n` +
    `issue_label (2-5 words)\n` +
    `evidence (2-3 short strings copied from the NEW user message)\n` +
    `should_retriage, should_recommend, should_refresh_followups, should_update_summary (booleans)\n` +
    `rewritten_query (string optimized for retrieval)\n` +
    `triage_level (LOW|MEDIUM|HIGH)\n` +
    `recommended_specialty (General Practice|Cardiology|Dermatology|Gastroenterology|Neurology|Orthopedics|EMERGENCY)\n` +
    `red_flags (array of strings; WARNING SIGNS only that the user has to pay attention to regarding their current condition)\n` +
    `follow_up_questions (array of 3 strings; OR empty array for ADMIN)\n` +
    `short_summary (1 sentence)\n\n` +
    `Router examples:\n` +
    `- Prior: "atrial fibrillation" New: "Should I be on blood thinners?" => FOLLOWUP\n` +
    `- Prior: "fever" New: "38°C since this morning" => FOLLOWUP\n` +
    `- Prior: "atrial fibrillation" New: "I hit my leg and it hurts" => NEW_ISSUE\n` +
    `- New: "Can you cancel my appointment?" => ADMIN\n` +
    `- Prior: "right lower lobe consolidation" New: "Is that serious?" => CLARIFICATION\n\n` +
    `MUST rules:\n` +
    `- If the new user message describes a different symptom/injury than the prior issue, you MUST output turn_type=NEW_ISSUE.\n` +
    `- If turn_type=NEW_ISSUE, issue_label MUST change to match the new complaint.\n` +
    `Triage examples:\n` +
    `- "My discharge summary mentions atrial fibrillation. What does that mean?" => MEDIUM, Cardiology\n` +
    `- "Should I be on blood thinners?" (in AF context) => MEDIUM, Cardiology\n` +
    `- "I have chest pain sometimes, but not right now. No shortness of breath." => MEDIUM (NOT HIGH)\n` +
    `- "It happens only when I run." (chest pain on exertion) => MEDIUM\n` +
    `- "I have 38°C since this morning, no other symptoms" => LOW, General Practice\n` +
    `- "Now I have confusion and a stiff neck." => HIGH, EMERGENCY\n` +
    `- "I can't breathe" => HIGH, EMERGENCY\n` +
    `- "Strong crushing chest pain and sweating right now" => HIGH, EMERGENCY\n` +
    `- "35°C but I feel fine and I was not in the cold" => LOW/MEDIUM with re-check instruction, not 'normal'\n\n` +
    `Boolean rules:\n` +
    `- NEW_ISSUE => should_retriage=true, should_refresh_followups=true, should_recommend=true, should_update_summary=true.\n` +
    `- FOLLOWUP/MORE_DETAIL/CLARIFICATION => usually should_retriage=false unless major worsening.\n` +
    `- ADMIN => all should_* = false.\n\n` +
    `rewritten_query rules:\n` +
    `- NEW_ISSUE: ONLY the new message.\n` +
    `- FOLLOWUP/MORE_DETAIL/CLARIFICATION: include issue_label + new message.\n` +
    `- ADMIN: raw message.\n\n` +
    `Recent conversation (most recent last):\n${transcript || "(empty)"}\n\n` +
    `Previous issue_label:\n${prevIssueLabel || "none"}\n\n` +
    `Previous triage:\n${prevTriage ? JSON.stringify(prevTriage) : "null"}\n\n` +
    `Previous follow-up questions:\n${prevFollowUps.length ? prevFollowUps.join(" | ") : "none"}\n\n` +
    `New user message:\n${newMessage}\n`;

  const raw = await callOllamaJsonSafe(deps, system, user, {
    temperature: 0.15,
    num_predict: 520,
    format: "json",
    stop: ["\n\nUSER:", "\n\nASSISTANT:"],
  });

  const parsed = tryParseJsonStrict(raw) ?? tryParseJson(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("Router+Triage JSON parse failed");

  const tt = String(parsed.turn_type || "NEW_ISSUE").toUpperCase();
  const okTurn = tt === "NEW_ISSUE" || tt === "FOLLOWUP" || tt === "MORE_DETAIL" || tt === "CLARIFICATION" || tt === "ADMIN";

  const triage_level = String(parsed.triage_level || "MEDIUM").toUpperCase();
  const okTriage = triage_level === "LOW" || triage_level === "MEDIUM" || triage_level === "HIGH";

  const followups =
    Array.isArray(parsed.follow_up_questions)
      ? parsed.follow_up_questions.map((x: any) => String(x)).slice(0, 3)
      : [
          "How long have you had these symptoms?",
          "Have you noticed any worsening or additional symptoms?",
          "Have you already tried any treatment or had any tests for this?",
        ];

  const issueLabel = safeStr(parsed.issue_label) || safeStr(prevIssueLabel) || "general";
  const evidence = safeArrStr(parsed.evidence, 3);

  let rewritten = safeStr(parsed.rewritten_query) || newMessage;
  if (okTurn && tt === "NEW_ISSUE") rewritten = newMessage.trim();
  if (okTurn && (tt === "FOLLOWUP" || tt === "MORE_DETAIL")) rewritten = `${issueLabel}. Follow-up: ${newMessage}`.trim();
  if (okTurn && tt === "ADMIN") rewritten = newMessage.trim();

  const issueChanged =
    okTurn && tt === "NEW_ISSUE"
      ? true
      : okTurn && (tt === "FOLLOWUP" || tt === "MORE_DETAIL")
        ? false
        : Boolean(parsed.issue_changed);

  const should_retriage = tt === "NEW_ISSUE" ? true : Boolean(parsed.should_retriage);
  const should_recommend = tt === "NEW_ISSUE" ? true : Boolean(parsed.should_recommend);
  const should_refresh_followups = tt === "NEW_ISSUE" ? true : Boolean(parsed.should_refresh_followups);
  const should_update_summary = tt === "NEW_ISSUE" ? true : Boolean(parsed.should_update_summary);

  return {
    turn_type: (okTurn ? (tt as any) : "NEW_ISSUE"),
    issue_changed: issueChanged,
    issue_label: issueLabel,
    evidence,

    should_retriage,
    should_recommend,
    should_refresh_followups,
    should_update_summary,

    rewritten_query: rewritten,

    triage_level: (okTriage ? (triage_level as any) : "MEDIUM"),
    recommended_specialty: normalizeSpecialty(parsed.recommended_specialty),
    red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags.map((x: any) => String(x)) : [],
    follow_up_questions: followups,
    short_summary: safeStr(parsed.short_summary),
  };
}

/**
 * Answer generation (JSON preferred but never hard-fail)
 */
function fallbackAnswerFromRaw(raw: string) {
  const t = String(raw || "").trim();
  if (!t) return "I can provide general information, but I could not generate a structured answer. Please try again.";
  return t;
}

async function runAnswerWithContext(params: {
  deps: ChatDeps;
  message: string;
  conversationSnippet: string;
  context: string;
  triage_level: string;
  recommended_specialty: string;
  red_flags: string[];
}) {
  const system =
    `You are a virtual assistant for the healthcare domain.\n` +
    `Always respond in English.\n` +
    `Provide general educational information only.\n` +
    `Do NOT diagnose.\n` +
    `Do NOT prescribe.\n` +
    `For common symptoms (fever, cough, sore throat, headache, nausea, mild pain), avoid naming rare diseases.\n` +
    `Prefer common explanations + practical monitoring + safe next steps.\n` +
    `Treat red_flags as WARNING SIGNS to watch for, NOT confirmed facts.\n` +
    `Do NOT restate red_flags as if they are present.\n` +
    `Retrieved context (if present) is ONLY background and may describe OTHER cases.\n` +
    `Never say "the reports you provided" or imply retrieved notes are the user's record.\n` +
    `Do NOT mention datasets/sources/external datasets unless the user explicitly asks.\n` +
    `If the user asks an administrative question (appointments, billing), answer with a short standard message telling them to use the app.\n` +
    `Return ONLY valid JSON: {"answer":"..."}.\n`;

  const user =
    `Conversation so far:\n${params.conversationSnippet}\n\n` +
    `New user message:\n${params.message}\n\n` +
    `Known triage:\n` +
    `- urgency: ${params.triage_level}\n` +
    `- recommended_specialty: ${params.recommended_specialty}\n` +
    `- red_flags (warnings only): ${params.red_flags.join("; ") || "none"}\n\n` +
    (params.context ? `Retrieved context (background only):\n${params.context}\n\n` : "") +
    `Return the JSON now.`;

  const raw = await callOllamaJsonSafe(params.deps, system, user, {
    temperature: 0.35,
    num_predict: 1100,
    format: "json",
    stop: ["\n\nUSER:", "\n\nASSISTANT:"],
  });

  const parsed = tryParseJsonStrict(raw) ?? tryParseJson(raw);
  if (parsed && typeof parsed.answer === "string" && parsed.answer.trim()) {
    return { answer: parsed.answer.trim() };
  }
  return { answer: fallbackAnswerFromRaw(raw) };
}

/**
 * Recommendations
 */
async function computeDoctorsWithSlots(params: {
  deps: ChatDeps;
  specialty: string;
  fromIso: string;
  toIso: string;
  perDoctor: number;
}): Promise<any[]> {
  const { deps, specialty, fromIso, toIso, perDoctor } = params;

  const doctors = await deps.prisma.doctor.findMany({
    where: { specialty },
    orderBy: { createdAt: "asc" },
  });

  const baseUrl = `http://localhost:${Number(process.env.PORT || 3001)}`;
  const out: any[] = [];
  for (const d of doctors) {
    const res = await fetch(`${baseUrl}/doctors/${d.id}/slots?from=${fromIso}&to=${toIso}`);
    const data = await res.json();
    const slots = Array.isArray(data?.slots) ? data.slots.slice(0, perDoctor) : [];
    out.push({ ...d, slots });
  }
  return out;
}

/**
 * Summary
 */
function fallbackSummaryCurrentPrior(recentMessages: Array<{ role: string; content: string }>) {
  const userMsgs = recentMessages.filter((m) => m.role === "user").map((m) => m.content);
  const last = userMsgs[userMsgs.length - 1] || "";
  const prior = userMsgs.length >= 2 ? userMsgs[0] : "";
  const cur = clipText(last, 120);
  const pri = clipText(prior, 90);
  if (pri) return `Current: ${cur}; Prior: ${pri}.`;
  return clipText(cur, 180);
}

async function buildInternalChatSummary(deps: ChatDeps, chatId: string, isNewIssue: boolean): Promise<string> {
  const rows = await deps.prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: "asc" },
    take: 12,
  });

  const recentMessages = rows.map((m: any) => ({ role: m.role, content: m.content }));
  const transcript = recentMessages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");

  const system =
    `You create short internal clinical chat summaries for clinicians.\n` +
    `Always write in English.\n` +
    `Output exactly ONE sentence.\n` +
    `Prefer <= 180 characters.\n` +
    `Do NOT address the patient directly.\n` +
    `Do NOT include advice language (no "should", "recommend").\n` +
    `Do NOT mention rare diseases.\n` +
    `The summary is for the doctor, it must be concise and clinically relevant.\n` +
    `Do NOT explain any disease, just summarize the chat content to let the doctor know what is happening in the conversation.\n` +
    `If the most recent user message introduces a NEW unrelated issue, you MUST format exactly:\n` +
    `"Current: <new issue>; Prior: <prior main issue>."\n` +
    `If the issue is the same, summarize the ongoing issue + latest update in one sentence.\n` +
    `Examples:\n` +
    `- Same issue: "Fever since this morning; now 36.5°C after earlier 38°C."\n` +
    `- New issue: "Current: Left ankle pain after twisting; Prior: Atrial fibrillation questions."\n`;

  const user =
    `Conversation:\n${transcript}\n\n` +
    (isNewIssue ? `A new unrelated issue appeared in the most recent user message.\n` : "") +
    `Write the summary now.`;

  const raw = await callOllamaJsonSafe(deps, system, user, {
    temperature: 0.2,
    num_predict: 220,
    stop: ["\n\nUSER:", "\n\nASSISTANT:"],
  });

  let summary = raw.trim().replace(/\s+/g, " ");
  summary = firstSentence(summary);
  summary = hardClampNoEllipsis(summary, 200);

  if (isNewIssue && (!summary.toLowerCase().includes("current:") || !summary.toLowerCase().includes("prior:"))) {
    return hardClampNoEllipsis(fallbackSummaryCurrentPrior(recentMessages), 200);
  }
  return summary;
}

function shouldUpdateSummaryEveryN(userMsgCount: number, n: number) {
  if (n <= 0) return false;
  return userMsgCount % n === 0;
}

function triageSnapshot(t: any) {
  return {
    triage_level: t?.triage_level || "",
    specialty: t?.recommended_specialty || "",
    red_flags: Array.isArray(t?.red_flags) ? t.red_flags.join("|") : "",
  };
}

/**
 * Routes
 */
export async function chatsRoutes(app: FastifyInstance, depsOverride?: Partial<ChatDeps>) {
  const deps: ChatDeps = { ...getDefaultDeps(), ...(depsOverride || {}) };
  const SUMMARY_EVERY_N_USER_MSG = Number(process.env.SUMMARY_EVERY_N_USER_MSG || "4");

  app.post("/chats", async (req, reply) => {
    const body = ChatCreateSchema.parse(req.body);
    const patient = await deps.prisma.patient.findUnique({ where: { id: body.patientId } });
    if (!patient) return reply.code(404).send({ error: "Patient not found" });

    const chat = await deps.prisma.chat.create({ data: { patientId: body.patientId } });
    return reply.code(201).send(chat);
  });

  app.get("/patients/:id/chats", async (req) => {
    const { id: patientId } = req.params as { id: string };
    return deps.prisma.chat.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
    });
  });

  app.get("/chats/:id/messages", async (req, reply) => {
    const { id: chatId } = req.params as { id: string };
    const chat = await deps.prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) return reply.code(404).send({ error: "Chat not found" });

    const rows = await deps.prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
    });

    return rows.map(normalizeMessageRow);
  });

  app.post("/chats/:id/message", async (req, reply) => {
    const { id: chatId } = req.params as { id: string };
    const body = MessageCreateSchema.parse(req.body);

    const chatRow = await deps.prisma.chat.findUnique({ where: { id: chatId } });
    if (!chatRow) return reply.code(404).send({ error: "Chat not found" });

    // Save user message first (always)
    const userMsg = await deps.prisma.message.create({
      data: { chatId, role: "user", content: body.content },
    });

    // ✅ ADMIN HARD BYPASS (deterministic)
    if (isAdminRequest(body.content)) {
      const assistantMsg = await deps.prisma.message.create({
        data: {
          chatId,
          role: "assistant",
          content: adminStandardAnswer(),
          sources: {
            docs: [],
            triage: null,
            recommendation: null,
            meta: {
              newIssueDetected: false,
              turnType: "ADMIN",
              issueChanged: false,
              issueLabel: "admin",
              routerEvidence: [],
            },
            ui: {
              emergency: false,
              issueNote: null,
              emergencyActions: null,
              showTriageCard: false,
              showFollowUps: false,
              showRecommendation: false,
              showIssueNote: false,
            },
          },
        },
      });

      return reply.code(201).send({
        userMsg: normalizeMessageRow(userMsg),
        assistantMsg: normalizeMessageRow(assistantMsg),
      });
    }

    // Load recent messages for router + previous state (after saving user msg is ok; we still want prior assistant)
    const recentRows = await deps.prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
      take: 30,
    });

    const normalizedRecent = recentRows.map(normalizeMessageRow);

    const prevUserCount = normalizedRecent.filter((m: any) => m.role === "user").length - 1; // exclude just-saved one
    const isFirstUserMessage = prevUserCount <= 0;

    const lastAssistant = [...normalizedRecent].reverse().find((m: any) => m.role === "assistant");
    const prevSources = lastAssistant?.sources || null;
    const prevTriage = prevSources?.triage || null;
    const prevRecommendation = prevSources?.recommendation || null;
    const prevFollowUps: string[] = Array.isArray(prevTriage?.follow_up_questions) ? prevTriage.follow_up_questions : [];
    const prevIssueLabel: string | null = typeof prevSources?.meta?.issueLabel === "string" ? prevSources.meta.issueLabel : null;

    // Router+Triage
    let router: RouterDecision;
    try {
      router = await runRouterAndTriageLLM({
        deps,
        newMessage: body.content,
        recentMessages: normalizedRecent.map((m: any) => ({ role: m.role, content: m.content })),
        prevTriage,
        prevIssueLabel,
        prevFollowUps,
      });

      if (
        !isFirstUserMessage &&
        router.turn_type === "NEW_ISSUE" &&
        prevIssueLabel &&
        (router.issue_label.toLowerCase().includes(prevIssueLabel.toLowerCase()) ||
          !evidenceMatchesMessage(router.evidence, body.content))
      ) {
        router = await runRouterAndTriageLLM({
          deps,
          newMessage: body.content,
          recentMessages: [],
          prevTriage: null,
          prevIssueLabel: null,
          prevFollowUps: [],
          forceEmptyContext: true,
        });
      }
    } catch (e) {
      console.error("Router+Triage failed:", e);
      router = heuristicRouterFallback({
        message: body.content,
        hasPrevTriage: Boolean(prevTriage),
        prevFollowUps,
      });
    }

    // First message: behave like NEW_ISSUE, but don't show "new issue detected"
    if (isFirstUserMessage) {
      router = {
        ...router,
        turn_type: "NEW_ISSUE",
        issue_changed: false,
        should_retriage: true,
        should_recommend: true,
        should_refresh_followups: true,
        should_update_summary: true,
        rewritten_query: body.content,
      };
    }

    const isNewIssue = router.turn_type === "NEW_ISSUE" && !isFirstUserMessage;

    // Triage (reuse previous only if router says follow-up)
    let triage = {
      triage_level: router.triage_level || "MEDIUM",
      recommended_specialty: normalizeSpecialty(router.recommended_specialty),
      red_flags: Array.isArray(router.red_flags) ? router.red_flags : [],
      follow_up_questions:
        Array.isArray(router.follow_up_questions) && router.follow_up_questions.length >= 3
          ? router.follow_up_questions.slice(0, 3)
          : [
              "How long have you had these symptoms?",
              "Have you noticed any worsening or additional symptoms?",
              "Have you already tried any treatment or had any tests for this?",
            ],
      short_summary: router.short_summary || "",
    };

    if (!router.should_retriage && prevTriage) {
      triage = {
        triage_level: prevTriage.triage_level ?? triage.triage_level,
        recommended_specialty: normalizeSpecialty(prevTriage.recommended_specialty ?? triage.recommended_specialty),
        red_flags: Array.isArray(prevTriage.red_flags) ? prevTriage.red_flags : triage.red_flags,
        follow_up_questions:
          Array.isArray(prevTriage.follow_up_questions) && prevTriage.follow_up_questions.length >= 3
            ? prevTriage.follow_up_questions.slice(0, 3)
            : triage.follow_up_questions,
        short_summary: typeof prevTriage.short_summary === "string" ? prevTriage.short_summary : triage.short_summary,
      };
    }

    triage = applyUrgencyGuardrails(body.content, triage);

    if (!router.should_refresh_followups && prevFollowUps.length >= 3) {
      triage.follow_up_questions = prevFollowUps.slice(0, 3);
    }

    const normalizedSpecialty = normalizeSpecialty(triage.recommended_specialty);
    const emergency = triage.triage_level === "HIGH" || normalizedSpecialty === "EMERGENCY";
    const shouldOfferBooking = !emergency;

    // Retrieve
    let docs: any[] = [];
    try {
      docs = await deps.retrieve(router.rewritten_query || body.content, 5);
    } catch (e) {
      console.error("retrieve() failed:", e);
      docs = [];
    }

    const docsSources = docs.map((d) => ({
      id: d.id,
      source: d.source,
      title: d.title,
      score: d.score,
    }));

    const context = buildContext(docs);

    const conversationSnippet = [...normalizedRecent]
      .slice(-6)
      .map((m: any) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    // Answer
    let answerText = "";
    try {
      if (triage.triage_level === "HIGH") {
        answerText =
          `This may represent a medical emergency and requires urgent in-person evaluation now. ` +
          `Seek immediate medical attention or call emergency services right away.`;
      } else {
        const answerParsed = await runAnswerWithContext({
          deps,
          message: body.content,
          conversationSnippet,
          context,
          triage_level: triage.triage_level,
          recommended_specialty: normalizedSpecialty,
          red_flags: triage.red_flags,
        });
        answerText = (answerParsed?.answer || "").trim();
        if (!answerText) {
          answerText = "I can provide general information, but I could not generate a structured answer. Please try again.";
        }
      }
    } catch (e) {
      console.error("Answer generation failed:", e);
      answerText = "I can only provide general information and this does not replace medical advice. Please try again.";
    }

    // Recommendation
    let recommendation: any = null;
    if (shouldOfferBooking) {
      const from = todayIsoDateUtc();
      const to = (() => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() + 7);
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      })();

      const wantRecommendNow = router.should_recommend || !prevRecommendation || router.turn_type === "NEW_ISSUE";

      if (!wantRecommendNow && prevRecommendation) {
        recommendation = prevRecommendation;
      } else {
        const doctorsWithSlots = await computeDoctorsWithSlots({
          deps,
          specialty: normalizedSpecialty,
          fromIso: from,
          toIso: to,
          perDoctor: 5,
        });
        recommendation = { doctors: doctorsWithSlots };
      }
    }

    // UI flags
    const prevSnap = triageSnapshot(prevTriage);
    const curSnap = triageSnapshot(triage);
    const triageChanged = JSON.stringify(prevSnap) !== JSON.stringify(curSnap);

    let showTriageCard = router.turn_type !== "FOLLOWUP" || router.should_retriage || triageChanged;
    let showFollowUps =
      (router.turn_type === "NEW_ISSUE" || router.turn_type === "CLARIFICATION" || router.should_refresh_followups) && !emergency;
    let showRecommendation = router.turn_type === "NEW_ISSUE" && shouldOfferBooking;

    if (isFirstUserMessage) {
      showTriageCard = true;
      showFollowUps = !emergency;
      showRecommendation = shouldOfferBooking;
    }

    // Save assistant message
    const assistantMsg = await deps.prisma.message.create({
      data: {
        chatId,
        role: "assistant",
        content: answerText,
        sources: {
          docs: docsSources,
          triage: { ...triage, recommended_specialty: normalizedSpecialty },
          recommendation,
          meta: {
            newIssueDetected: isNewIssue,
            turnType: router.turn_type,
            issueChanged: router.issue_changed,
            issueLabel: router.issue_label,
            routerEvidence: router.evidence,
          },
          ui: {
            emergency,
            issueNote: isNewIssue
              ? "This message appears to describe a different medical issue from earlier messages in this chat. Consider starting a new chat for a separate concern."
              : null,
            emergencyActions: emergency
              ? [
                  "Seek urgent in-person medical evaluation now.",
                  "Call emergency services or go to the nearest emergency department.",
                  "Do not wait for a routine appointment.",
                ]
              : null,
            showTriageCard,
            showFollowUps,
            showRecommendation,
            showIssueNote: isNewIssue,
          },
        },
      },
    });

    // Summary
    try {
      const userCount = await deps.prisma.message.count?.({
        where: { chatId, role: "user" },
      });

      const shouldSummary =
        router.should_update_summary ||
        isNewIssue ||
        (typeof userCount === "number" && shouldUpdateSummaryEveryN(userCount, SUMMARY_EVERY_N_USER_MSG));

      if (shouldSummary) {
        const updatedSummary = await buildInternalChatSummary(deps, chatId, isNewIssue);
        if (updatedSummary) {
          await deps.prisma.chat.update({
            where: { id: chatId },
            data: { summary: updatedSummary },
          });
        }
      }
    } catch (e) {
      console.error("Failed to update chat summary", e);
    }

    return reply.code(201).send({
      userMsg: normalizeMessageRow(userMsg),
      assistantMsg: normalizeMessageRow(assistantMsg),
    });
  });
}