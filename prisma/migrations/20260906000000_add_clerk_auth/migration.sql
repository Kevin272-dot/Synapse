-- AlterTable: replace password auth with Clerk identity
-- The User table is empty in development, so we can add a non-null column safely.
ALTER TABLE "User" DROP COLUMN "password";
ALTER TABLE "User" ADD COLUMN     "clerkId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");
