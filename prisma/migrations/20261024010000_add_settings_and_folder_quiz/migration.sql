-- Per-user defaults for document creation, imports, KG extraction and quizzes.
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultEngine" TEXT NOT NULL DEFAULT 'ot',
    "pptxEngine" TEXT NOT NULL DEFAULT 'crdt',
    "kgDefault" BOOLEAN NOT NULL DEFAULT true,
    "quizQuestions" INTEGER NOT NULL DEFAULT 5,
    "quizIncludeSubfolders" BOOLEAN NOT NULL DEFAULT true,
    "quizCrossDoc" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- Cached quiz generated across a folder and its subfolders.
CREATE TABLE "FolderQuiz" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FolderQuiz_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FolderQuiz_folderId_key" ON "FolderQuiz"("folderId");

ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FolderQuiz" ADD CONSTRAINT "FolderQuiz_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
