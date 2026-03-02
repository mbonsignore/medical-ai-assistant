const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || "mistral";

type EmbeddingResponse = { embedding: number[] };

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ollama embeddings failed: ${res.status} ${t}`);
  }

  const data = (await res.json()) as EmbeddingResponse;
  return data.embedding;
}

export type ChatOptions = {
  temperature?: number;
  top_p?: number;
  num_predict?: number;
  seed?: number;

  stop?: string[];

  // If supported by your Ollama build/model, can force JSON output.
  // If unsupported, the server may ignore it or error; we handle fallback in chats.ts.
  format?: "json";
};

function numFromEnv(name: string, fallback: number) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

export async function chat(system: string, user: string, opts: ChatOptions = {}): Promise<string> {
  const temperature =
    typeof opts.temperature === "number" ? opts.temperature : numFromEnv("OLLAMA_TEMPERATURE", 0.35);

  const top_p = typeof opts.top_p === "number" ? opts.top_p : numFromEnv("OLLAMA_TOP_P", 0.9);

  const num_predict =
    typeof opts.num_predict === "number" ? opts.num_predict : numFromEnv("OLLAMA_NUM_PREDICT", 768);

  const payload: any = {
    model: CHAT_MODEL,
    prompt: user,
    system,
    stream: false,
    options: {
      temperature,
      top_p,
      num_predict,
      ...(Array.isArray(opts.stop) ? { stop: opts.stop } : {}),
      ...(typeof opts.seed === "number" ? { seed: opts.seed } : {}),
    },
  };

  if (opts.format) payload.format = opts.format;

  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // Some Ollama builds may fail on `format:"json"`. Caller can retry without format.
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ollama chat failed: ${res.status} ${t}`);
  }

  const data = (await res.json()) as { response: string };
  return data.response;
}