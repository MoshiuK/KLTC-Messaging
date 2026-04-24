import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { directSmsSchema, groupSendSchema } from "../lib/validation";
import { sendSms } from "../services/messaging";
import { assertCanSendMessages, LimitExceededError } from "../lib/limits";

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

// GET /api/sms/history — message history for the org
router.get("/history", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const phoneNumber = req.query.phoneNumber as string | undefined;

    const where: Record<string, unknown> = {
      conversation: { organizationId: orgId },
    };

    if (phoneNumber) {
      where.conversation = { organizationId: orgId, phoneNumber };
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          conversation: { select: { phoneNumber: true, organizationId: true } },
        },
      }),
      prisma.message.count({ where }),
    ]);

    res.json({ messages, total, limit, offset });
  } catch (err) {
    console.error("Message history error:", err);
    const detail = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Internal server error", detail });
  }
});

// POST /api/sms/send — direct send to a single number
router.post("/send", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const data = directSmsSchema.parse(req.body);

    await assertCanSendMessages(orgId, 1);

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
          providerId: result.providerId || null,
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

    res.json({ message, providerId: result.providerId });
  } catch (err) {
    if (err instanceof LimitExceededError) {
      res.status(err.status).json({ error: err.message, limitType: err.limitType, current: err.current, limit: err.limit });
      return;
    }
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Send SMS error:", err);
    const detail = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Internal server error", detail });
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
      providerId?: string;
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

    await assertCanSendMessages(orgId, toSend.length);

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
            providerId: sendResult.providerId || null,
            fromNumber: "org",
            toNumber: contact.phoneNumber,
            mediaUrl: data.mediaUrl || null,
            errorCode: sendResult.errorCode || null,
            errorMessage: sendResult.error || null,
          },
        });
      });

      const item: SendResultItem = sendResult.success
        ? { contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "sent", providerId: sendResult.providerId }
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
    if (err instanceof LimitExceededError) {
      res.status(err.status).json({ error: err.message, limitType: err.limitType, current: err.current, limit: err.limit });
      return;
    }
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Group send error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Internal server error", detail: message });
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
      providerId?: string;
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

    await assertCanSendMessages(orgId, toSend.length);

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
            providerId: sendResult.providerId || null,
            fromNumber: "org",
            toNumber: contact.phoneNumber,
            mediaUrl: mediaUrl || null,
            errorCode: sendResult.errorCode || null,
            errorMessage: sendResult.error || null,
          },
        });
      });

      const item: SendResultItem = sendResult.success
        ? { contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "sent", providerId: sendResult.providerId }
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
    if (err instanceof LimitExceededError) {
      res.status(err.status).json({ error: err.message, limitType: err.limitType, current: err.current, limit: err.limit });
      return;
    }
    console.error("Birthday send error:", err);
    const detail = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Internal server error", detail });
  }
});

// POST /api/sms/inbound — inbound message webhook (Twilio or Telnyx)
router.post("/inbound", async (req: Request, res: Response) => {
  try {
    // Detect provider: Telnyx wraps in data.payload, Twilio sends flat fields
    const isTelnyx = !!req.body?.data?.event_type;
    let From: string, To: string, Body: string, MessageId: string | null;

    if (isTelnyx) {
      const eventType = req.body.data.event_type;
      if (eventType !== "message.received") {
        res.status(200).json({ status: "ignored" });
        return;
      }
      const payload = req.body.data.payload;
      if (!payload) { res.status(200).json({ status: "no_payload" }); return; }
      From = payload.from?.phone_number;
      To = payload.to?.[0]?.phone_number;
      Body = payload.text;
      MessageId = payload.id;
    } else {
      // Twilio format
      From = req.body.From;
      To = req.body.To;
      Body = req.body.Body;
      MessageId = req.body.MessageSid || null;
    }

    if (!From || !To || !Body) {
      res.status(200).json({ status: "incomplete" });
      return;
    }

    // Idempotency: check if we already processed this message
    if (MessageId) {
      const existing = await prisma.message.findUnique({ where: { providerId: MessageId } });
      if (existing) {
        res.status(200).json({ status: "duplicate" });
        return;
      }
    }

    // Find the org by the To number (check both providers)
    let resolvedOrgId: string | undefined;

    const telnyxConfig = await prisma.telnyxConfig.findFirst({ where: { phoneNumber: To } });
    if (telnyxConfig) resolvedOrgId = telnyxConfig.organizationId;

    if (!resolvedOrgId) {
      const twilioConfig = await prisma.twilioConfig.findFirst({ where: { phoneNumber: To } });
      if (twilioConfig) resolvedOrgId = twilioConfig.organizationId;
    }

    if (!resolvedOrgId) {
      // Fallback: find org by env number match
      if (process.env.TELNYX_PHONE_NUMBER === To || process.env.TWILIO_PHONE_NUMBER === To) {
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
              providerId: MessageId || null,
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
              providerId: MessageId || null,
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
          providerId: MessageId || null,
          fromNumber: From,
          toNumber: To,
        },
      });
    });

    if (isTelnyx) {
      res.status(200).json({ status: "ok" });
    } else {
      res.status(200).type("text/xml").send("<Response></Response>");
    }
  } catch (err) {
    console.error("Inbound webhook error:", err);
    // Never crash the webhook
    if (req.body?.data?.event_type) {
      res.status(200).json({ status: "error" });
    } else {
      res.status(200).type("text/xml").send("<Response></Response>");
    }
  }
});

// POST /api/sms/status — message status webhook (Twilio or Telnyx)
router.post("/status", async (req: Request, res: Response) => {
  try {
    const isTelnyx = !!req.body?.data?.event_type;
    let messageId: string | null = null;
    let mappedStatus: string;
    let toNumber: string | null = null;
    let errorCode: string | null = null;
    let errorDetail: string | null = null;

    if (isTelnyx) {
      const eventType = req.body.data.event_type;
      const statusEvents = ["message.sent", "message.delivered", "message.failed", "message.finalized"];
      if (!statusEvents.includes(eventType)) {
        res.status(200).json({ status: "ignored" });
        return;
      }
      const payload = req.body.data.payload;
      if (!payload) { res.status(200).json({ status: "no_payload" }); return; }

      messageId = payload.id;
      toNumber = payload.to?.[0]?.phone_number || payload.to;
      const statusMap: Record<string, string> = {
        "message.sent": "sent", "message.delivered": "delivered",
        "message.failed": "failed", "message.finalized": "delivered",
      };
      mappedStatus = statusMap[eventType] || "queued";
      const errors = payload.errors || [];
      errorCode = errors[0]?.code || null;
      errorDetail = errors[0]?.detail || errors[0]?.title || null;
    } else {
      // Twilio format
      messageId = req.body.MessageSid;
      mappedStatus = req.body.MessageStatus || "queued";
      toNumber = req.body.To;
      errorCode = req.body.ErrorCode || null;
    }

    if (!messageId) {
      res.status(200).send("OK");
      return;
    }

    const message = await prisma.message.findUnique({
      where: { providerId: messageId },
      include: { conversation: true },
    });

    if (!message) {
      res.status(200).send("OK");
      return;
    }

    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: mappedStatus,
        errorCode: errorCode || message.errorCode,
        errorMessage: errorDetail || message.errorMessage,
      },
    });

    const orgId = message.conversation.organizationId;

    if (mappedStatus === "failed" || mappedStatus === "undelivered") {
      const resolvedTo = toNumber || message.toNumber;
      const contact = await prisma.contact.findUnique({
        where: {
          organizationId_phoneNumber: { organizationId: orgId, phoneNumber: resolvedTo },
        },
      });

      if (contact) {
        const telnyxBlockCodes = ["40300", "40303", "40310", "40311", "40400", "40401"];
        const twilioBlockCodes = ["21610", "21611", "21612", "30004", "30005", "30006", "30007"];
        const blockCodes = [...telnyxBlockCodes, ...twilioBlockCodes];
        const isBlockSuspected = errorCode && blockCodes.includes(errorCode);
        const contactEventType = isBlockSuspected ? "blocked_suspected" : mappedStatus;

        const existingEvent = await prisma.contactStatusEvent.findFirst({
          where: { providerId: messageId, eventType: contactEventType },
        });

        if (!existingEvent) {
          await prisma.$transaction(async (tx) => {
            await tx.contact.update({
              where: { id: contact.id },
              data: {
                isBlockedSuspected: isBlockSuspected || contact.isBlockedSuspected,
                blockedReason: isBlockSuspected
                  ? `Error code ${errorCode}: ${getErrorDescription(errorCode!)}`
                  : contact.blockedReason,
              },
            });
            await tx.contactStatusEvent.create({
              data: {
                organizationId: orgId, contactId: contact.id,
                eventType: contactEventType, source: "status_callback",
                detail: `Status: ${mappedStatus}`, providerId: messageId,
                errorCode: errorCode || null,
              },
            });
          });
        }
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Status callback error:", err);
    res.status(200).send("OK");
  }
});

function getErrorDescription(code: string): string {
  const descriptions: Record<string, string> = {
    // Telnyx
    "40300": "Message blocked - opt-out or consent issue",
    "40303": "Number not provisioned for messaging",
    "40310": "Message filtered by carrier",
    "40311": "Message rejected by carrier",
    "40400": "Destination number unreachable",
    "40401": "Destination number is not a valid mobile number",
    // Twilio
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
