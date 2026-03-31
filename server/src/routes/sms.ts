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
          messageSid: result.messageSid || null,
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

    res.json({ message, messageSid: result.messageSid });
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
      messageSid?: string;
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
            messageSid: sendResult.messageSid || null,
            fromNumber: "org",
            toNumber: contact.phoneNumber,
            mediaUrl: data.mediaUrl || null,
            errorCode: sendResult.errorCode || null,
            errorMessage: sendResult.error || null,
          },
        });
      });

      const item: SendResultItem = sendResult.success
        ? { contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "sent", messageSid: sendResult.messageSid }
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
      messageSid?: string;
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
            messageSid: sendResult.messageSid || null,
            fromNumber: "org",
            toNumber: contact.phoneNumber,
            mediaUrl: mediaUrl || null,
            errorCode: sendResult.errorCode || null,
            errorMessage: sendResult.error || null,
          },
        });
      });

      const item: SendResultItem = sendResult.success
        ? { contactId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, status: "sent", messageSid: sendResult.messageSid }
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

// POST /api/sms/inbound — Telnyx inbound webhook
router.post("/inbound", async (req: Request, res: Response) => {
  try {
    // Telnyx sends webhook events with data.event_type and data.payload
    const event = req.body?.data;
    const eventType = event?.event_type;

    // Handle Telnyx message received events
    if (eventType !== "message.received") {
      res.status(200).json({ status: "ignored" });
      return;
    }

    const payload = event?.payload;
    const from = payload?.from?.phone_number || "";
    const to = payload?.to?.[0]?.phone_number || "";
    const body = payload?.text || "";
    const messageSid = payload?.id || "";

    if (!from || !to || !body) {
      res.status(200).json({ status: "ok" });
      return;
    }

    // Idempotency: check if we already processed this message
    if (messageSid) {
      const existing = await prisma.message.findUnique({ where: { messageSid } });
      if (existing) {
        res.status(200).json({ status: "duplicate" });
        return;
      }
    }

    // Find the org by the To number (our Telnyx number)
    const telnyxConfig = await prisma.telnyxConfig.findFirst({
      where: { phoneNumber: to },
    });

    let resolvedOrgId = telnyxConfig?.organizationId;

    if (!resolvedOrgId) {
      // Fallback: find org by env telnyx number match
      if (process.env.TELNYX_PHONE_NUMBER === to) {
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
          phoneNumber: from,
        },
      },
    });

    const bodyUpper = body.trim().toUpperCase();

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
              messageSid: messageSid || null,
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
              messageSid: messageSid || null,
            },
          });
        }
      }

      // Store inbound message in conversation history
      const conversation = await tx.conversation.upsert({
        where: {
          organizationId_phoneNumber: {
            organizationId: resolvedOrgId!,
            phoneNumber: from,
          },
        },
        create: { organizationId: resolvedOrgId!, phoneNumber: from },
        update: {},
      });

      await tx.message.create({
        data: {
          conversationId: conversation.id,
          direction: "inbound",
          body,
          status: "received",
          messageSid: messageSid || null,
          fromNumber: from,
          toNumber: to,
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

// POST /api/sms/status — Telnyx delivery status webhook
router.post("/status", async (req: Request, res: Response) => {
  try {
    const event = req.body?.data;
    const eventType = event?.event_type;

    // Handle Telnyx message status events
    if (!eventType || !eventType.startsWith("message.")) {
      res.status(200).json({ status: "ignored" });
      return;
    }

    const payload = event?.payload;
    const messageSid = payload?.id;
    const to = payload?.to?.[0]?.phone_number || payload?.to?.phone_number || "";

    if (!messageSid) {
      res.status(200).json({ status: "ok" });
      return;
    }

    // Map Telnyx event types to our status
    let messageStatus: string | null = null;
    switch (eventType) {
      case "message.sent": messageStatus = "sent"; break;
      case "message.delivered": messageStatus = "delivered"; break;
      case "message.failed": messageStatus = "failed"; break;
      case "message.finalized":
        messageStatus = payload?.finalized_status || "finalized";
        break;
      default: messageStatus = eventType.replace("message.", ""); break;
    }

    // Find the message by messageSid
    const message = await prisma.message.findUnique({
      where: { messageSid },
      include: { conversation: true },
    });

    if (!message) {
      res.status(200).json({ status: "unknown_message" });
      return;
    }

    // Update message status
    const errorCodes = payload?.errors?.map((e: any) => e.code).join(",") || null;
    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: messageStatus || message.status,
        errorCode: errorCodes || message.errorCode,
      },
    });

    const orgId = message.conversation.organizationId;

    // Handle failed/undelivered statuses
    if (messageStatus === "failed" || messageStatus === "undelivered") {
      const contact = await prisma.contact.findUnique({
        where: {
          organizationId_phoneNumber: {
            organizationId: orgId,
            phoneNumber: to || message.toNumber,
          },
        },
      });

      if (contact) {
        const errorCode = errorCodes || "";
        // Telnyx error codes that suggest blocking
        const blockIndicatorCodes = ["40300", "40310", "40400"];
        const isBlockSuspected = blockIndicatorCodes.some((c) => errorCode.includes(c));

        const evtType = isBlockSuspected
          ? "blocked_suspected"
          : messageStatus === "undelivered"
            ? "undelivered"
            : "failed";

        // Idempotent check
        const existingEvent = await prisma.contactStatusEvent.findFirst({
          where: { messageSid, eventType: evtType },
        });

        if (!existingEvent) {
          await prisma.$transaction(async (tx) => {
            await tx.contact.update({
              where: { id: contact.id },
              data: {
                isBlockedSuspected: isBlockSuspected || contact.isBlockedSuspected,
                blockedReason: isBlockSuspected
                  ? `Telnyx error: ${errorCode}`
                  : contact.blockedReason,
              },
            });

            await tx.contactStatusEvent.create({
              data: {
                organizationId: orgId,
                contactId: contact.id,
                eventType: evtType,
                source: "status_callback",
                detail: `Status: ${messageStatus}`,
                messageSid,
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
    res.status(200).json({ status: "error" });
  }
});

export default router;
