-- AlterTable
ALTER TABLE "ScheduledMessage" ADD COLUMN "lastSentYear" INTEGER;

-- CreateTable
CREATE TABLE "BirthdayConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "groupId" TEXT,
    "template1" TEXT NOT NULL DEFAULT 'Happy Birthday, {name}! Wishing you a wonderful day!',
    "template2" TEXT NOT NULL DEFAULT 'It''s {name}''s birthday today! Let''s wish them a great one!',
    "template3" TEXT NOT NULL DEFAULT 'Happy Birthday to {name}! Hope your day is amazing!',
    "template4" TEXT NOT NULL DEFAULT 'Wishing the happiest of birthdays to {name}! Enjoy your special day!',
    "template5" TEXT NOT NULL DEFAULT 'Birthday shoutout to {name}! Have an incredible birthday!',
    "rotationIndex" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduledTime" TEXT NOT NULL DEFAULT '08:05',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BirthdayConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BirthdayConfig_organizationId_key" ON "BirthdayConfig"("organizationId");
