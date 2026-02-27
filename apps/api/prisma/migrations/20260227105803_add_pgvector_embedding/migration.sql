CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Document"
ADD COLUMN IF NOT EXISTS "embedding" vector(768);

CREATE INDEX IF NOT EXISTS "Document_embedding_cosine_idx"
ON "Document"
USING ivfflat ("embedding" vector_cosine_ops)
WITH (lists = 100);