const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || "mistral";

type EmbeddingResponse = { embedding: number[] };

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text })
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ollama embeddings failed: ${res.status} ${t}`);
  }

  const data = (await res.json()) as EmbeddingResponse;
  return data.embedding;
}

export async function chat(system: string, user: string): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_MODEL,
      prompt: user,
      system,
      stream: false
    })
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ollama chat failed: ${res.status} ${t}`);
  }

  const data = (await res.json()) as { response: string };
  return data.response;
}
