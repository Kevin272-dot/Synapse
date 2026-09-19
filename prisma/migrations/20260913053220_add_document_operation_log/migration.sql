-- CreateTable
CREATE TABLE "DocumentOperation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "op" JSONB NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentOperation_documentId_createdAt_idx" ON "DocumentOperation"("documentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentOperation_documentId_version_key" ON "DocumentOperation"("documentId", "version");

-- AddForeignKey
ALTER TABLE "DocumentOperation" ADD CONSTRAINT "DocumentOperation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
