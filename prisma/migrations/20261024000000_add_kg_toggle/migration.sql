-- Knowledge graph extraction becomes a per-document, owner-controlled setting.
ALTER TABLE "Document" ADD COLUMN "kgEnabled" BOOLEAN NOT NULL DEFAULT true;
