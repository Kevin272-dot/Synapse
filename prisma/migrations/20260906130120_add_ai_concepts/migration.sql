-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "flashcards" JSONB,
ADD COLUMN     "quiz" JSONB,
ADD COLUMN     "summary" TEXT;

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentConcept" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DocumentConcept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptEdge" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "strength" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ConceptEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Concept_ownerId_name_key" ON "Concept"("ownerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentConcept_documentId_conceptId_key" ON "DocumentConcept"("documentId", "conceptId");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptEdge_fromId_toId_key" ON "ConceptEdge"("fromId", "toId");

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentConcept" ADD CONSTRAINT "DocumentConcept_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentConcept" ADD CONSTRAINT "DocumentConcept_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptEdge" ADD CONSTRAINT "ConceptEdge_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptEdge" ADD CONSTRAINT "ConceptEdge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptEdge" ADD CONSTRAINT "ConceptEdge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
