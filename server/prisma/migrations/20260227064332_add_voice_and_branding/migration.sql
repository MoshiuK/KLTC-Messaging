-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "accentColor" TEXT;
ALTER TABLE "Organization" ADD COLUMN "appName" TEXT;
ALTER TABLE "Organization" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Organization" ADD COLUMN "primaryColor" TEXT;
ALTER TABLE "Organization" ADD COLUMN "secondaryColor" TEXT;

-- CreateTable
CREATE TABLE "VoiceCallTwiml" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "voiceName" TEXT NOT NULL DEFAULT 'alice',
    "voiceLanguage" TEXT NOT NULL DEFAULT 'en-US',
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceCallTwiml_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'sms',
    "status" TEXT,
    "twilioSid" TEXT,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "callDuration" INTEGER,
    "callStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("body", "conversationId", "createdAt", "direction", "errorCode", "errorMessage", "fromNumber", "id", "status", "toNumber", "twilioSid", "updatedAt") SELECT "body", "conversationId", "createdAt", "direction", "errorCode", "errorMessage", "fromNumber", "id", "status", "toNumber", "twilioSid", "updatedAt" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE UNIQUE INDEX "Message_twilioSid_key" ON "Message"("twilioSid");
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");
CREATE INDEX "Message_twilioSid_idx" ON "Message"("twilioSid");
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "VoiceCallTwiml_organizationId_idx" ON "VoiceCallTwiml"("organizationId");
