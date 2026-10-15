-- AlterTable
ALTER TABLE "Concept" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'Concept';

-- AlterTable
ALTER TABLE "ConceptEdge" ADD COLUMN     "relation" TEXT NOT NULL DEFAULT 'relates to';
