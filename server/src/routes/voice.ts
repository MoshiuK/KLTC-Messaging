import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { voiceCallSchema, groupVoiceCallSchema } from "../lib/validation";
import { makeVoiceCall, generateTwimlSay } from "../services/telnyx";

const router = Router();

// Concurrency limiter for batch operations
const BATCH_CONCURRENCY = 5;

async function processBatch<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// POST /api/voice/call — make a voice call to a single contact
router.post("/call", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const data = voiceCallSchema.parse(req.body);

    // Create TwiML record first
    const twiml = await prisma.voiceCallTwiml.create({
      data: {
        organizationId: orgId,
        messageText: data.message,
        voiceName: data.voice,
        voiceLanguage: data.language,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const baseUrl = process.env.BASE_URL || "http://localhost:3001";
    const twimlUrl = `${baseUrl}/api/voice/twiml/${twiml.id}`;
    const statusUrl = `${baseUrl}/api/voice/status`;

    const result = await makeVoiceCall(orgId, data.to, twimlUrl, statusUrl);

    // Store message atomically
    const message = await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.upsert({
        where: { organizationId_phoneNumber: { organizationId: orgId, phoneNumber: data.to } },
        create: { organizationId: orgId, phoneNumber: data.to },
        update: {},
      });

      return tx.message.create({
        data: {
          conversationId: conversation.id,
          direction: "outbound",
          body: data.message,
          type: "voice",
          status: result.success ? (result.status || "queued") : "failed",
          messageSid: result.callSid || null,
          fromNumber: "org",
          toNumber: data.to,
          callStatus: result.status || null,
          errorCode: result.errorCode || null,
          errorMessage: result.error || null,
        },
      });
    });

    if (!result.success) {
      res.status(502).json({ error: result.error, message });
      return;
    }

    res.json({ message, callSid: result.callSid });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Voice call error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/voice/call-group — call all active contacts in a group
router.post("/call-group", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const data = groupVoiceCallSchema.parse(req.body);

    const group = await prisma.contactGroup.findFirst({
      where: { id: data.groupId, organizationId: orgId },
      include: {
        members: {
          include: { contact: true },
        },
      },
    });

    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    const twiml = await prisma.voiceCallTwiml.create({
      data: {
        organizationId: orgId,
        messageText: data.message,
        voiceName: data.voice,
        voiceLanguage: data.language,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const baseUrl = process.env.BASE_URL || "http://localhost:3001";
    const twimlUrl = `${baseUrl}/api/voice/twiml/${twiml.id}`;
    const statusUrl = `${baseUrl}/api/voice/status`;

    type CallResultItem = {
      contactId: string;
      contactName: string;
      phoneNumber: string;
      status: "called" | "skipped" | "failed";
      reason?: string;
      callSid?: string;
    };

    const skipped: CallResultItem[] = [];
    const toCall: typeof group.members = [];

    for (const member of group.members) {
      const contact = member.contact;
      if (!contact.isActive) {
        skipped.push({ contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "skipped", reason: "inactive" });
      } else if (contact.isOptedOut) {
        skipped.push({ contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "skipped", reason: "opted_out" });
      } else if (contact.isBlockedSuspected) {
        skipped.push({ contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "skipped", reason: "blocked_suspected" });
      } else {
        toCall.push(member);
      }
    }

    const callResults = await processBatch(toCall, BATCH_CONCURRENCY, async (member) => {
      const contact = member.contact;
      const callResult = await makeVoiceCall(orgId, contact.phoneNumber, twimlUrl, statusUrl);

      await prisma.$transaction(async (tx) => {
        const conversation = await tx.conversation.upsert({
          where: {
            organizationId_phoneNumber: {
              organizationId: orgId,
              phoneNumber: contact.phoneNumber,
            },
          },
          create: { organizationId: orgId, phoneNumber: contact.phoneNumber },
          update: {},
        });

        await tx.message.create({
          data: {
            conversationId: conversation.id,
            direction: "outbound",
            body: data.message,
            type: "voice",
            status: callResult.success ? (callResult.status || "queued") : "failed",
            messageSid: callResult.callSid || null,
            fromNumber: "org",
            toNumber: contact.phoneNumber,
            callStatus: callResult.status || null,
            errorCode: callResult.errorCode || null,
            errorMessage: callResult.error || null,
          },
        });
      });

      const item: CallResultItem = callResult.success
        ? { contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "called", callSid: callResult.callSid }
        : { contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "failed", reason: callResult.error };

      return item;
    });

    const results = [...skipped, ...callResults];

    const summary = {
      total: results.length,
      called: results.filter((r) => r.status === "called").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
    };

    res.json({ summary, results });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Group voice call error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/voice/twiml/:twimlId — webhook to get TwiML (no auth)
router.post("/twiml/:twimlId", async (req: Request, res: Response) => {
  try {
    const { twimlId } = req.params;

    const twimlRecord = await prisma.voiceCallTwiml.findUnique({
      where: { id: twimlId },
    });

    if (!twimlRecord || twimlRecord.expiresAt < new Date()) {
      res.type("application/xml").send(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, this message is no longer available.</Say>
  <Hangup/>
</Response>`
      );
      return;
    }

    try {
      await prisma.voiceCallTwiml.update({
        where: { id: twimlId },
        data: { used: true },
      });
    } catch {
      console.error("Failed to mark TwiML as used:", twimlId);
    }

    const xml = generateTwimlSay(
      twimlRecord.messageText,
      twimlRecord.voiceName,
      twimlRecord.voiceLanguage
    );

    res.type("application/xml").send(xml);
  } catch (err) {
    console.error("TwiML webhook error:", err);
    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred. Goodbye.</Say>
  <Hangup/>
</Response>`
    );
  }
});

// POST /api/voice/status — Telnyx call status callback (no auth)
router.post("/status", async (req: Request, res: Response) => {
  try {
    const event = req.body?.data;
    const payload = event?.payload;
    const callControlId = payload?.call_control_id || payload?.call_leg_id;
    const callState = payload?.state;

    if (!callControlId) {
      res.status(200).json({ status: "ok" });
      return;
    }

    const message = await prisma.message.findUnique({
      where: { messageSid: callControlId },
    });

    if (message) {
      await prisma.message.update({
        where: { id: message.id },
        data: {
          status: callState || message.status,
          callStatus: callState || message.callStatus,
          callDuration: payload?.duration_secs ? parseInt(payload.duration_secs, 10) : message.callDuration,
        },
      });
    }

    res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Voice status callback error:", err);
    res.status(200).json({ status: "error" });
  }
});

export default router;
