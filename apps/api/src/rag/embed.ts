// Embedding finto deterministico (solo per test pipeline RAG senza provider esterno).
// Produce un vettore di dimensione 1536 coerente con la colonna vector(1536).
export function fakeEmbed1536(text: string): number[] {
  const dim = 1536;
  const v = new Array(dim).fill(0);

  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  // riempiamo con una sequenza pseudo-random deterministica
  let x = h >>> 0;
  for (let i = 0; i < dim; i++) {
    x = (Math.imul(1664525, x) + 1013904223) >>> 0;
    v[i] = (x / 0xffffffff) * 2 - 1; // [-1, 1]
  }
  return v;
}
