-- CreateTable
CREATE TABLE "DailyScripture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sendTime" TEXT NOT NULL DEFAULT '08:00',
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSentDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyScripture_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DailyScripture_organizationId_idx" ON "DailyScripture"("organizationId");

-- CreateIndex
CREATE INDEX "DailyScripture_status_idx" ON "DailyScripture"("status");
