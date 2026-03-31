import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

// GET /api/threads — list user's threads
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const threads = await prisma.thread.findMany({
      where: {
        OR: [{ memberAId: userId }, { memberBId: userId }],
      },
      include: {
        memberA: { select: { id: true, firstName: true, lastName: true, email: true } },
        memberB: { select: { id: true, firstName: true, lastName: true, email: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, createdAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = threads.map((t) => ({
      id: t.id,
      peer: t.memberAId === userId ? t.memberB : t.memberA,
      lastMessage: t.messages[0] || null,
      createdAt: t.createdAt,
    }));

    res.json(result);
  } catch (err) {
    console.error("List threads error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/threads — create or get a thread with another user
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { peerUserId } = req.body;

    if (!peerUserId || peerUserId === userId) {
      res.status(400).json({ error: "Valid peerUserId required" });
      return;
    }

    const peer = await prisma.user.findUnique({ where: { id: peerUserId } });
    if (!peer) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Ensure consistent ordering for the unique constraint
    const [memberAId, memberBId] = [userId, peerUserId].sort();

    let thread = await prisma.thread.findUnique({
      where: { memberAId_memberBId: { memberAId, memberBId } },
    });

    if (!thread) {
      thread = await prisma.thread.create({
        data: { memberAId, memberBId },
      });
    }

    res.json(thread);
  } catch (err) {
    console.error("Create thread error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/threads/:id/messages — get messages in a thread
router.get("/:id/messages", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const thread = await prisma.thread.findUnique({ where: { id: req.params.id } });

    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }

    if (thread.memberAId !== userId && thread.memberBId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const messages = await prisma.threadMessage.findMany({
      where: { threadId: thread.id },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json(messages);
  } catch (err) {
    console.error("Thread messages error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/threads/:id/messages — send a message in a thread
router.post("/:id/messages", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const thread = await prisma.thread.findUnique({ where: { id: req.params.id } });

    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }

    if (thread.memberAId !== userId && thread.memberBId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const body = String(req.body.body || "").trim();
    if (!body) {
      res.status(400).json({ error: "body is required" });
      return;
    }

    const message = await prisma.threadMessage.create({
      data: {
        threadId: thread.id,
        senderUserId: userId,
        body,
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.json(message);
  } catch (err) {
    console.error("Send thread message error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
