import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { directSmsSchema, groupSendSchema } from "../lib/validation";
import { sendSms } from "../services/twilio";

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

// POST /api/sms/send — direct send to a single number
router.post("/send", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const data = directSmsSchema.parse(req.body);

    // Send SMS/MMS
    const result = await sendSms(orgId, data.to, data.body, {
      mediaUrl: data.mediaUrl,
    });

    // Store message in a transaction (conversation + message atomically)
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
          body: data.body,
          status: result.success ? "queued" : "failed",
          twilioSid: result.twilioSid || null,
          fromNumber: "org",
          toNumber: data.to,
          mediaUrl: data.mediaUrl || null,
          errorCode: result.errorCode || null,
          errorMessage: result.error || null,
        },
      });
    });

    if (!result.success) {
      res.status(502).json({ error: result.error, message });
      return;
    }

    res.json({ message, twilioSid: result.twilioSid });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Send SMS error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/sms/send-group — send to all active contacts in a group
router.post("/send-group", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const data = groupSendSchema.parse(req.body);

    // Verify group belongs to org
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

    type SendResultItem = {
      contactId: string;
      contactName: string;
      phoneNumber: string;
      status: "sent" | "skipped" | "failed";
      reason?: string;
      twilioSid?: string;
    };

    // Separate skippable from sendable contacts
    const skipped: SendResultItem[] = [];
    const toSend: typeof group.members = [];

    for (const member of group.members) {
      const contact = member.contact;
      if (!contact.isActive) {
        skipped.push({ contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "skipped", reason: "inactive" });
      } else if (contact.isOptedOut) {
        skipped.push({ contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "skipped", reason: "opted_out" });
      } else if (contact.isBlockedSuspected) {
        skipped.push({ contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "skipped", reason: "blocked_suspected" });
      } else {
        toSend.push(member);
      }
    }

    // Send in batches with concurrency limit
    const sendResults = await processBatch(toSend, BATCH_CONCURRENCY, async (member) => {
      const contact = member.contact;
      const sendResult = await sendSms(orgId, contact.phoneNumber, data.body, {
        mediaUrl: data.mediaUrl,
      });

      // Store in conversation history atomically
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
            body: data.body,
            status: sendResult.success ? "queued" : "failed",
            twilioSid: sendResult.twilioSid || null,
            fromNumber: "org",
            toNumber: contact.phoneNumber,
            mediaUrl: data.mediaUrl || null,
            errorCode: sendResult.errorCode || null,
            errorMessage: sendResult.error || null,
          },
        });
      });

      const item: SendResultItem = sendResult.success
        ? { contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "sent", twilioSid: sendResult.twilioSid }
        : { contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "failed", reason: sendResult.error };

      return item;
    });

    const results = [...skipped, ...sendResults];

    const summary = {
      total: results.length,
      sent: results.filter((r) => r.status === "sent").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
    };

    res.json({ summary, results });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Group send error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/sms/send-birthday — send birthday announcement to a group (everyone gets the message)
router.post("/send-birthday", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { groupId, body, contactName, mediaUrl } = req.body;

    if (!groupId || !body) {
      res.status(400).json({ error: "groupId and body are required" });
      return;
    }

    // Verify group belongs to org
    const group = await prisma.contactGroup.findFirst({
      where: { id: groupId, organizationId: orgId },
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

    type SendResultItem = {
      contactId: string;
      contactName: string;
      phoneNumber: string;
      status: "sent" | "skipped" | "failed";
      reason?: string;
      twilioSid?: string;
    };

    const skipped: SendResultItem[] = [];
    const toSend: typeof group.members = [];

    for (const member of group.members) {
      const contact = member.contact;
      if (!contact.isActive) {
        skipped.push({ contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "skipped", reason: "inactive" });
      } else if (contact.isOptedOut) {
        skipped.push({ contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "skipped", reason: "opted_out" });
      } else if (contact.isBlockedSuspected) {
        skipped.push({ contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "skipped", reason: "blocked_suspected" });
      } else {
        toSend.push(member);
      }
    }

    const sendResults = await processBatch(toSend, BATCH_CONCURRENCY, async (member) => {
      const contact = member.contact;
      const sendResult = await sendSms(orgId, contact.phoneNumber, body, {
        mediaUrl: mediaUrl || undefined,
      });

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
            body,
            status: sendResult.success ? "queued" : "failed",
            twilioSid: sendResult.twilioSid || null,
            fromNumber: "org",
            toNumber: contact.phoneNumber,
            mediaUrl: mediaUrl || null,
            errorCode: sendResult.errorCode || null,
            errorMessage: sendResult.error || null,
          },
        });
      });

      const item: SendResultItem = sendResult.success
        ? { contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "sent", twilioSid: sendResult.twilioSid }
        : { contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "failed", reason: sendResult.error };

      return item;
    });

    const results = [...skipped, ...sendResults];

    const summary = {
      total: results.length,
      sent: results.filter((r) => r.status === "sent").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
    };

    res.json({ summary, results });
  } catch (err) {
    console.error("Birthday send error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/sms/inbound — Twilio inbound webhook
router.post("/inbound", async (req: Request, res: Response) => {
  try {
    const { From, To, Body, MessageSid } = req.body;

    if (!From || !To || !Body) {
      res.status(200).type("text/xml").send("<Response></Response>");
      return;
    }

    // Idempotency: check if we already processed this MessageSid
    if (MessageSid) {
      const existing = await prisma.message.findUnique({ where: { twilioSid: MessageSid } });
      if (existing) {
        res.status(200).type("text/xml").send("<Response></Response>");
        return;
      }
    }

    // Find the org by the To number (our Twilio number)
    const twilioConfig = await prisma.twilioConfig.findFirst({
      where: { phoneNumber: To },
    });

    let resolvedOrgId = twilioConfig?.organizationId;

    if (!resolvedOrgId) {
      // Fallback: find org by env twilio number match
      if (process.env.TWILIO_PHONE_NUMBER === To) {
        const firstOrg = await prisma.organization.findFirst();
        resolvedOrgId = firstOrg?.id;
      }
    }

    if (!resolvedOrgId) {
      res.status(200).type("text/xml").send("<Response></Response>");
      return;
    }

    // Find contact by from phone in this org
    const contact = await prisma.contact.findUnique({
      where: {
        organizationId_phoneNumber: {
          organizationId: resolvedOrgId,
          phoneNumber: From,
        },
      },
    });

    const bodyUpper = Body.trim().toUpperCase();

    // Check for opt-out / opt-in keywords
    const optOutKeywords = ["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
    const optInKeywords = ["START", "UNSTOP"];

    // Process opt-out/opt-in and store message atomically
    await prisma.$transaction(async (tx) => {
      if (contact) {
        if (optOutKeywords.includes(bodyUpper)) {
          await tx.contact.update({
            where: { id: contact.id },
            data: { isOptedOut: true },
          });
          await tx.contactStatusEvent.create({
            data: {
              organizationId: resolvedOrgId!,
              contactId: contact.id,
              eventType: "opted_out",
              source: "inbound_keyword",
              detail: `Keyword: ${bodyUpper}`,
              twilioSid: MessageSid || null,
            },
          });
        } else if (optInKeywords.includes(bodyUpper)) {
          await tx.contact.update({
            where: { id: contact.id },
            data: { isOptedOut: false },
          });
          await tx.contactStatusEvent.create({
            data: {
              organizationId: resolvedOrgId!,
              contactId: contact.id,
              eventType: "opted_in",
              source: "inbound_keyword",
              detail: `Keyword: ${bodyUpper}`,
              twilioSid: MessageSid || null,
            },
          });
        }
      }

      // Store inbound message in conversation history
      const conversation = await tx.conversation.upsert({
        where: {
          organizationId_phoneNumber: {
            organizationId: resolvedOrgId!,
            phoneNumber: From,
          },
        },
        create: { organizationId: resolvedOrgId!, phoneNumber: From },
        update: {},
      });

      await tx.message.create({
        data: {
          conversationId: conversation.id,
          direction: "inbound",
          body: Body,
          status: "received",
          twilioSid: MessageSid || null,
          fromNumber: From,
          toNumber: To,
        },
      });
    });

    res.status(200).type("text/xml").send("<Response></Response>");
  } catch (err) {
    console.error("Inbound webhook error:", err);
    // Never crash the webhook
    res.status(200).type("text/xml").send("<Response></Response>");
  }
});

// POST /api/sms/status — Twilio status callback webhook
router.post("/status", async (req: Request, res: Response) => {
  try {
    const { MessageSid, MessageStatus, ErrorCode, To } = req.body;

    if (!MessageSid) {
      res.status(200).send("OK");
      return;
    }

    // Find the message by twilioSid
    const message = await prisma.message.findUnique({
      where: { twilioSid: MessageSid },
      include: { conversation: true },
    });

    if (!message) {
      // Unknown message, just acknowledge
      res.status(200).send("OK");
      return;
    }

    // Update message status
    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: MessageStatus || message.status,
        errorCode: ErrorCode || message.errorCode,
      },
    });

    const orgId = message.conversation.organizationId;

    // Handle failed/undelivered statuses
    if (MessageStatus === "failed" || MessageStatus === "undelivered") {
      // Find the contact by phone number in this org
      const contact = await prisma.contact.findUnique({
        where: {
          organizationId_phoneNumber: {
            organizationId: orgId,
            phoneNumber: To || message.toNumber,
          },
        },
      });

      if (contact) {
        // Known error codes that suggest blocking
        const blockIndicatorCodes = ["21610", "21611", "21612", "30004", "30005", "30006", "30007"];
        const isBlockSuspected = ErrorCode && blockIndicatorCodes.includes(ErrorCode);

        const eventType = isBlockSuspected
          ? "blocked_suspected"
          : MessageStatus === "undelivered"
            ? "undelivered"
            : "failed";

        // Idempotent: check if we already have an event for this twilioSid + eventType
        const existingEvent = await prisma.contactStatusEvent.findFirst({
          where: { twilioSid: MessageSid, eventType },
        });

        if (!existingEvent) {
          await prisma.$transaction(async (tx) => {
            await tx.contact.update({
              where: { id: contact.id },
              data: {
                isBlockedSuspected: isBlockSuspected || contact.isBlockedSuspected,
                blockedReason: isBlockSuspected
                  ? `Error code ${ErrorCode}: ${getErrorDescription(ErrorCode)}`
                  : contact.blockedReason,
              },
            });

            await tx.contactStatusEvent.create({
              data: {
                organizationId: orgId,
                contactId: contact.id,
                eventType,
                source: "status_callback",
                detail: `Status: ${MessageStatus}`,
                twilioSid: MessageSid,
                errorCode: ErrorCode || null,
              },
            });
          });
        }
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Status callback error:", err);
    // Never crash the webhook
    res.status(200).send("OK");
  }
});

function getErrorDescription(code: string): string {
  const descriptions: Record<string, string> = {
    "21610": "Message blocked by opt-out",
    "21611": "Invalid To phone number",
    "21612": "Unreachable To phone number",
    "30004": "Message blocked",
    "30005": "Unknown destination handset",
    "30006": "Landline or unreachable carrier",
    "30007": "Message filtered by carrier",
  };
  return descriptions[code] || "Unknown error";
}

export default router;
