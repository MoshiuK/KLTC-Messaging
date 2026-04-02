import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { sendSms } from "../services/telnyx";
import { z } from "zod";

const router = Router();

const createScheduledMessageSchema = z.object({
  groupId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  body: z.string().min(1).max(1600),
  mediaUrl: z.string().url().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  scheduledAt: z.string().min(1, "Scheduled date/time is required"),
  recurrence: z.enum(["none", "daily", "weekly", "monthly", "yearly"]).optional().default("none"),
  type: z.enum(["group", "direct", "birthday"]).optional().default("group"),
});

// GET /api/scheduled — list scheduled messages for the org
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const status = req.query.status as string | undefined;

    const where: Record<string, unknown> = { organizationId: orgId };
    if (status) {
      where.status = status;
    }

    const messages = await prisma.scheduledMessage.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
    });

    res.json(messages);
  } catch (err) {
    console.error("List scheduled messages error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/scheduled — create a scheduled message
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const userId = req.user!.id;
    const data = createScheduledMessageSchema.parse(req.body);

    if (!data.groupId && !data.contactId) {
      res.status(400).json({ error: "Either groupId or contactId is required" });
      return;
    }

    // Verify group/contact belongs to org
    if (data.groupId) {
      const group = await prisma.contactGroup.findFirst({
        where: { id: data.groupId, organizationId: orgId },
      });
      if (!group) {
        res.status(404).json({ error: "Group not found" });
        return;
      }
    }

    if (data.contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: data.contactId, organizationId: orgId },
      });
      if (!contact) {
        res.status(404).json({ error: "Contact not found" });
        return;
      }
    }

    const scheduledAt = new Date(data.scheduledAt);
    if (isNaN(scheduledAt.getTime())) {
      res.status(400).json({ error: "Invalid date/time" });
      return;
    }

    const message = await prisma.scheduledMessage.create({
      data: {
        organizationId: orgId,
        createdByUserId: userId,
        groupId: data.groupId || null,
        contactId: data.contactId || null,
        body: data.body,
        mediaUrl: data.mediaUrl || null,
        scheduledAt,
        recurrence: data.recurrence || "none",
        type: data.type || "group",
        status: "pending",
      },
    });

    res.status(201).json(message);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Create scheduled message error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/scheduled/:id — cancel a scheduled message
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { id } = req.params;

    const message = await prisma.scheduledMessage.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!message) {
      res.status(404).json({ error: "Scheduled message not found" });
      return;
    }

    if (message.status !== "pending") {
      res.status(400).json({ error: "Can only cancel pending messages" });
      return;
    }

    await prisma.scheduledMessage.update({
      where: { id },
      data: { status: "cancelled" },
    });

    res.json({ message: "Scheduled message cancelled" });
  } catch (err) {
    console.error("Cancel scheduled message error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

// --- Background Scheduler ---
// Runs every 60 seconds, checks for pending messages that are due

const SCHEDULER_INTERVAL = 60 * 1000; // 1 minute

async function processScheduledMessages() {
  try {
    const now = new Date();

    // Find all pending messages that are due
    const dueMessages = await prisma.scheduledMessage.findMany({
      where: {
        status: "pending",
        scheduledAt: { lte: now },
      },
    });

    for (const scheduled of dueMessages) {
      try {
        if (scheduled.type === "group" || scheduled.type === "birthday") {
          await sendGroupScheduled(scheduled);
        } else if (scheduled.type === "direct") {
          await sendDirectScheduled(scheduled);
        }

        // Handle recurrence
        if (scheduled.recurrence && scheduled.recurrence !== "none") {
          const nextDate = getNextRecurrence(scheduled.scheduledAt, scheduled.recurrence);
          await prisma.scheduledMessage.create({
            data: {
              organizationId: scheduled.organizationId,
              createdByUserId: scheduled.createdByUserId,
              groupId: scheduled.groupId,
              contactId: scheduled.contactId,
              body: scheduled.body,
              mediaUrl: scheduled.mediaUrl,
              scheduledAt: nextDate,
              recurrence: scheduled.recurrence,
              type: scheduled.type,
              status: "pending",
            },
          });
        }

        await prisma.scheduledMessage.update({
          where: { id: scheduled.id },
          data: { status: "sent", sentAt: now },
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(`Failed to send scheduled message ${scheduled.id}:`, err);
        await prisma.scheduledMessage.update({
          where: { id: scheduled.id },
          data: { status: "failed", errorMessage: errorMsg },
        });
      }
    }
  } catch (err) {
    console.error("Scheduler error:", err);
  }
}

async function sendGroupScheduled(scheduled: any) {
  const group = await prisma.contactGroup.findFirst({
    where: { id: scheduled.groupId!, organizationId: scheduled.organizationId },
    include: { members: { include: { contact: true } } },
  });

  if (!group) throw new Error("Group not found");

  const BATCH_CONCURRENCY = 5;
  const activeMembers = group.members.filter(
    (m) => m.contact.isActive && !m.contact.isOptedOut && !m.contact.isBlockedSuspected
  );

  for (let i = 0; i < activeMembers.length; i += BATCH_CONCURRENCY) {
    const batch = activeMembers.slice(i, i + BATCH_CONCURRENCY);
    await Promise.all(
      batch.map(async (member) => {
        const result = await sendSms(scheduled.organizationId, member.contact.phoneNumber, scheduled.body, {
          mediaUrl: scheduled.mediaUrl || undefined,
        });

        await prisma.$transaction(async (tx) => {
          const conversation = await tx.conversation.upsert({
            where: {
              organizationId_phoneNumber: {
                organizationId: scheduled.organizationId,
                phoneNumber: member.contact.phoneNumber,
              },
            },
            create: { organizationId: scheduled.organizationId, phoneNumber: member.contact.phoneNumber },
            update: {},
          });

          await tx.message.create({
            data: {
              conversationId: conversation.id,
              direction: "outbound",
              body: scheduled.body,
              status: result.success ? "queued" : "failed",
              telnyxId: result.telnyxId || null,
              fromNumber: "org",
              toNumber: member.contact.phoneNumber,
              mediaUrl: scheduled.mediaUrl || null,
              errorCode: result.errorCode || null,
              errorMessage: result.error || null,
            },
          });
        });
      })
    );
  }
}

async function sendDirectScheduled(scheduled: any) {
  const contact = await prisma.contact.findFirst({
    where: { id: scheduled.contactId!, organizationId: scheduled.organizationId },
  });

  if (!contact) throw new Error("Contact not found");
  if (!contact.isActive || contact.isOptedOut || contact.isBlockedSuspected) {
    throw new Error("Contact is inactive, opted out, or blocked");
  }

  const result = await sendSms(scheduled.organizationId, contact.phoneNumber, scheduled.body, {
    mediaUrl: scheduled.mediaUrl || undefined,
  });

  await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.upsert({
      where: {
        organizationId_phoneNumber: {
          organizationId: scheduled.organizationId,
          phoneNumber: contact.phoneNumber,
        },
      },
      create: { organizationId: scheduled.organizationId, phoneNumber: contact.phoneNumber },
      update: {},
    });

    await tx.message.create({
      data: {
        conversationId: conversation.id,
        direction: "outbound",
        body: scheduled.body,
        status: result.success ? "queued" : "failed",
        telnyxId: result.telnyxId || null,
        fromNumber: "org",
        toNumber: contact.phoneNumber,
        mediaUrl: scheduled.mediaUrl || null,
        errorCode: result.errorCode || null,
        errorMessage: result.error || null,
      },
    });
  });
}

function getNextRecurrence(current: Date, recurrence: string): Date {
  const next = new Date(current);
  switch (recurrence) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

// Export the scheduler starter
export function startScheduler() {
  console.log("Message scheduler started (checking every 60 seconds)");
  setInterval(processScheduledMessages, SCHEDULER_INTERVAL);
  // Run once immediately on startup
  processScheduledMessages();
}
