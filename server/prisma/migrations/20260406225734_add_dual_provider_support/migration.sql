/*
  Warnings:

  - You are about to drop the column `telnyxId` on the `ContactStatusEvent` table. All the data in the column will be lost.
  - You are about to drop the column `telnyxId` on the `Message` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "TwilioConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "accountSid" TEXT NOT NULL,
    "authToken" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TwilioConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
    "providerId" TEXT,
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
CREATE INDEX "ContactStatusEvent_providerId_idx" ON "ContactStatusEvent"("providerId");
CREATE INDEX "ContactStatusEvent_createdAt_idx" ON "ContactStatusEvent"("createdAt");
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'sms',
    "status" TEXT,
    "providerId" TEXT,
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
CREATE UNIQUE INDEX "Message_providerId_key" ON "Message"("providerId");
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");
CREATE INDEX "Message_providerId_idx" ON "Message"("providerId");
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");
CREATE TABLE "new_Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "appName" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "smsProvider" TEXT NOT NULL DEFAULT 'telnyx',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Organization" ("accentColor", "appName", "createdAt", "id", "logoUrl", "name", "primaryColor", "secondaryColor", "updatedAt") SELECT "accentColor", "appName", "createdAt", "id", "logoUrl", "name", "primaryColor", "secondaryColor", "updatedAt" FROM "Organization";
DROP TABLE "Organization";
ALTER TABLE "new_Organization" RENAME TO "Organization";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TwilioConfig_organizationId_idx" ON "TwilioConfig"("organizationId");

-- CreateIndex
CREATE INDEX "TwilioConfig_phoneNumber_idx" ON "TwilioConfig"("phoneNumber");
