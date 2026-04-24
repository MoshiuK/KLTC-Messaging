/*
  Warnings:

  - You are about to drop the `TwilioConfig` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `twilioSid` on the `ContactStatusEvent` table. All the data in the column will be lost.
  - You are about to drop the column `twilioSid` on the `Message` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "TwilioConfig_phoneNumber_idx";

-- DropIndex
DROP INDEX "TwilioConfig_organizationId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TwilioConfig";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "TelnyxConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "messagingProfileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TelnyxConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ContactStatusEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "detail" TEXT,
    "telnyxId" TEXT,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactStatusEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ContactStatusEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ContactStatusEvent" ("contactId", "createdAt", "detail", "errorCode", "eventType", "id", "organizationId", "source") SELECT "contactId", "createdAt", "detail", "errorCode", "eventType", "id", "organizationId", "source" FROM "ContactStatusEvent";
DROP TABLE "ContactStatusEvent";
ALTER TABLE "new_ContactStatusEvent" RENAME TO "ContactStatusEvent";
CREATE INDEX "ContactStatusEvent_organizationId_idx" ON "ContactStatusEvent"("organizationId");
CREATE INDEX "ContactStatusEvent_contactId_idx" ON "ContactStatusEvent"("contactId");
CREATE INDEX "ContactStatusEvent_telnyxId_idx" ON "ContactStatusEvent"("telnyxId");
CREATE INDEX "ContactStatusEvent_createdAt_idx" ON "ContactStatusEvent"("createdAt");
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'sms',
    "status" TEXT,
    "telnyxId" TEXT,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "callDuration" INTEGER,
    "callStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("body", "callDuration", "callStatus", "conversationId", "createdAt", "direction", "errorCode", "errorMessage", "fromNumber", "id", "mediaUrl", "status", "toNumber", "type", "updatedAt") SELECT "body", "callDuration", "callStatus", "conversationId", "createdAt", "direction", "errorCode", "errorMessage", "fromNumber", "id", "mediaUrl", "status", "toNumber", "type", "updatedAt" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE UNIQUE INDEX "Message_telnyxId_key" ON "Message"("telnyxId");
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");
CREATE INDEX "Message_telnyxId_idx" ON "Message"("telnyxId");
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TelnyxConfig_organizationId_idx" ON "TelnyxConfig"("organizationId");

-- CreateIndex
CREATE INDEX "TelnyxConfig_phoneNumber_idx" ON "TelnyxConfig"("phoneNumber");
