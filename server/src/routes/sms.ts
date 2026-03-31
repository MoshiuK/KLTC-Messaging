import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { directSmsSchema, groupSendSchema } from "../lib/validation";
import { sendSms } from "../services/telnyx";

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
          telnyxId: result.telnyxId || null,
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

    res.json({ message, telnyxId: result.telnyxId });
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
      telnyxId?: string;
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
            telnyxId: sendResult.telnyxId || null,
            fromNumber: "org",
            toNumber: contact.phoneNumber,
            mediaUrl: data.mediaUrl || null,
            errorCode: sendResult.errorCode || null,
            errorMessage: sendResult.error || null,
          },
        });
      });

      const item: SendResultItem = sendResult.success
        ? { contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "sent", telnyxId: sendResult.telnyxId }
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
      telnyxId?: string;
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
            telnyxId: sendResult.telnyxId || null,
            fromNumber: "org",
            toNumber: contact.phoneNumber,
            mediaUrl: mediaUrl || null,
            errorCode: sendResult.errorCode || null,
            errorMessage: sendResult.error || null,
          },
        });
      });

      const item: SendResultItem = sendResult.success
        ? { contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "sent", telnyxId: sendResult.telnyxId }
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

// POST /api/sms/inbound — Telnyx inbound message webhook
router.post("/inbound", async (req: Request, res: Response) => {
  try {
    // Telnyx wraps webhook data in data.payload (or data.event_type at top level)
    const eventType = req.body?.data?.event_type;

    // Only process inbound messages
    if (eventType !== "message.received") {
      res.status(200).json({ status: "ignored" });
      return;
    }

    const payload = req.body?.data?.payload;
    if (!payload) {
      res.status(200).json({ status: "no_payload" });
      return;
    }

    const From = payload.from?.phone_number;
    const To = payload.to?.[0]?.phone_number;
    const Body = payload.text;
    const MessageId = payload.id;

    if (!From || !To || !Body) {
      res.status(200).json({ status: "incomplete" });
      return;
    }

    // Idempotency: check if we already processed this message
    if (MessageId) {
      const existing = await prisma.message.findUnique({ where: { telnyxId: MessageId } });
      if (existing) {
        res.status(200).json({ status: "duplicate" });
        return;
      }
    }

    // Find the org by the To number (our Telnyx number)
    const telnyxConfig = await prisma.telnyxConfig.findFirst({
      where: { phoneNumber: To },
    });

    let resolvedOrgId = telnyxConfig?.organizationId;

    if (!resolvedOrgId) {
      // Fallback: find org by env telnyx number match
      if (process.env.TELNYX_PHONE_NUMBER === To) {
        const firstOrg = await prisma.organization.findFirst();
        resolvedOrgId = firstOrg?.id;
      }
    }

    if (!resolvedOrgId) {
      res.status(200).json({ status: "no_org" });
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
              telnyxId: MessageId || null,
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
              telnyxId: MessageId || null,
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
          telnyxId: MessageId || null,
          fromNumber: From,
          toNumber: To,
        },
      });
    });

    res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Inbound webhook error:", err);
    // Never crash the webhook
    res.status(200).json({ status: "error" });
  }
});

// POST /api/sms/status — Telnyx message status webhook
router.post("/status", async (req: Request, res: Response) => {
  try {
    const eventType = req.body?.data?.event_type;

    // Telnyx sends message.sent, message.delivered, message.failed, etc.
    const statusEvents = ["message.sent", "message.delivered", "message.failed", "message.finalized"];
    if (!eventType || !statusEvents.includes(eventType)) {
      res.status(200).json({ status: "ignored" });
      return;
    }

    const payload = req.body?.data?.payload;
    if (!payload) {
      res.status(200).json({ status: "no_payload" });
      return;
    }

    const messageId = payload.id;
    const toNumber = payload.to?.[0]?.phone_number || payload.to;

    if (!messageId) {
      res.status(200).json({ status: "no_id" });
      return;
    }

    // Map Telnyx event types to our status values
    const statusMap: Record<string, string> = {
      "message.sent": "sent",
      "message.delivered": "delivered",
      "message.failed": "failed",
      "message.finalized": "delivered",
    };
    const mappedStatus = statusMap[eventType] || "queued";

    // Find the message by telnyxId
    const message = await prisma.message.findUnique({
      where: { telnyxId: messageId },
      include: { conversation: true },
    });

    if (!message) {
      res.status(200).json({ status: "unknown_message" });
      return;
    }

    // Extract error info from Telnyx payload
    const errors = payload.errors || [];
    const errorCode = errors[0]?.code || null;
    const errorDetail = errors[0]?.detail || errors[0]?.title || null;

    // Update message status
    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: mappedStatus,
        errorCode: errorCode || message.errorCode,
        errorMessage: errorDetail || message.errorMessage,
      },
    });

    const orgId = message.conversation.organizationId;

    // Handle failed statuses
    if (mappedStatus === "failed") {
      const resolvedTo = toNumber || message.toNumber;

      const contact = await prisma.contact.findUnique({
        where: {
          organizationId_phoneNumber: {
            organizationId: orgId,
            phoneNumber: resolvedTo,
          },
        },
      });

      if (contact) {
        // Telnyx error codes that suggest blocking/unreachable
        const blockIndicatorCodes = ["40300", "40303", "40310", "40311", "40400", "40401"];
        const isBlockSuspected = errorCode && blockIndicatorCodes.includes(errorCode);

        const contactEventType = isBlockSuspected ? "blocked_suspected" : "failed";

        // Idempotent: check if we already have an event for this telnyxId + eventType
        const existingEvent = await prisma.contactStatusEvent.findFirst({
          where: { telnyxId: messageId, eventType: contactEventType },
        });

        if (!existingEvent) {
          await prisma.$transaction(async (tx) => {
            await tx.contact.update({
              where: { id: contact.id },
              data: {
                isBlockedSuspected: isBlockSuspected || contact.isBlockedSuspected,
                blockedReason: isBlockSuspected
                  ? `Error code ${errorCode}: ${errorDetail || getErrorDescription(errorCode)}`
                  : contact.blockedReason,
              },
            });

            await tx.contactStatusEvent.create({
              data: {
                organizationId: orgId,
                contactId: contact.id,
                eventType: contactEventType,
                source: "status_callback",
                detail: `Status: ${mappedStatus}`,
                telnyxId: messageId,
                errorCode: errorCode || null,
              },
            });
          });
        }
      }
    }

    res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Status callback error:", err);
    // Never crash the webhook
    res.status(200).json({ status: "error" });
  }
});

function getErrorDescription(code: string): string {
  const descriptions: Record<string, string> = {
    "40300": "Message blocked - opt-out or consent issue",
    "40303": "Number not provisioned for messaging",
    "40310": "Message filtered by carrier",
    "40311": "Message rejected by carrier",
    "40400": "Destination number unreachable",
    "40401": "Destination number is not a valid mobile number",
  };
  return descriptions[code] || "Unknown error";
}

export default router;
