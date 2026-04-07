-- CreateTable
CREATE TABLE "ScheduledMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "birthday" TEXT NOT NULL,
    "messageTemplate" TEXT NOT NULL,
    "scheduledTime" TEXT NOT NULL DEFAULT '08:05',
    "recurrence" TEXT NOT NULL DEFAULT 'annual',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScheduledMessage_organizationId_idx" ON "ScheduledMessage"("organizationId");

-- CreateIndex
CREATE INDEX "ScheduledMessage_birthday_idx" ON "ScheduledMessage"("birthday");
