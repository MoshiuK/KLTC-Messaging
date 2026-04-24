-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "monthlyMessageLimit" INTEGER;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "contactLimit" INTEGER;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "userLimit" INTEGER;
