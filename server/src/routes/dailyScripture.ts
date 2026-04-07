import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/daily-scripture — list all daily scripture schedules
router.get("/", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const scriptures = await prisma.dailyScripture.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
    res.json(scriptures);
  } catch (err) {
    console.error("List daily scriptures error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/daily-scripture — create a new daily scripture schedule
router.post("/", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { groupId, body, sendTime, startDate, endDate } = req.body;

    if (!groupId || typeof groupId !== "string") {
      res.status(400).json({ error: "Please select a group." });
      return;
    }
    if (!body || typeof body !== "string" || !body.trim()) {
      res.status(400).json({ error: "Message text is required." });
      return;
    }
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      res.status(400).json({ error: "Start date is required (YYYY-MM-DD)." });
      return;
    }
    if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      res.status(400).json({ error: "End date is required (YYYY-MM-DD)." });
      return;
    }
    if (endDate < startDate) {
      res.status(400).json({ error: "End date must be on or after start date." });
      return;
    }

    const time = sendTime && /^\d{2}:\d{2}$/.test(sendTime) ? sendTime : "08:00";

    // Verify group belongs to org
    const group = await prisma.contactGroup.findFirst({
      where: { id: groupId, organizationId: orgId },
    });
    if (!group) {
      res.status(404).json({ error: "Group not found." });
      return;
    }

    const scripture = await prisma.dailyScripture.create({
      data: {
        organizationId: orgId,
        groupId,
        body: body.trim(),
        sendTime: time,
        startDate,
        endDate,
      },
    });

    res.status(201).json(scripture);
  } catch (err) {
    console.error("Create daily scripture error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/daily-scripture/:id — cancel a schedule
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { id } = req.params;
    const { status } = req.body;

    const scripture = await prisma.dailyScripture.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!scripture) {
      res.status(404).json({ error: "Schedule not found." });
      return;
    }

    if (status === "cancelled" || status === "active") {
      const updated = await prisma.dailyScripture.update({
        where: { id },
        data: { status },
      });
      res.json(updated);
    } else {
      res.status(400).json({ error: "Invalid status." });
    }
  } catch (err) {
    console.error("Update daily scripture error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/daily-scripture/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { id } = req.params;

    const scripture = await prisma.dailyScripture.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!scripture) {
      res.status(404).json({ error: "Schedule not found." });
      return;
    }

    await prisma.dailyScripture.delete({ where: { id } });
    res.json({ message: "Schedule deleted." });
  } catch (err) {
    console.error("Delete daily scripture error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
