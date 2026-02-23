-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to Document
-- Dimension: scegliamo 1536 perché è comune per molti embedding model.
-- Se userai un embedding di dimensione diversa, lo cambiamo.
ALTER TABLE "Document"
ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- Indice per similarity search (cosine)
CREATE INDEX IF NOT EXISTS "Document_embedding_cosine_idx"
ON "Document"
USING ivfflat ("embedding" vector_cosine_ops)
WITH (lists = 100);