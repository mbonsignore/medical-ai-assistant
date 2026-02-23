/*
  Warnings:

  - You are about to drop the column `embedding` on the `Document` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Document_embedding_cosine_idx";

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "embedding";
