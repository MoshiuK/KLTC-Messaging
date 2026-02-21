import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

// GET /api/notifications — list ContactStatusEvent feed
router.get("/", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { limit, offset, eventType } = req.query;

    const take = Math.min(parseInt(limit as string) || 50, 200);
    const skip = parseInt(offset as string) || 0;

    const where: Record<string, unknown> = { organizationId: orgId };
    if (eventType && typeof eventType === "string") {
      where.eventType = eventType;
    }

    const [events, total] = await Promise.all([
      prisma.contactStatusEvent.findMany({
        where: where as any,
        orderBy: { createdAt: "desc" },
        take,
        skip,
        include: {
          contact: {
            select: { id: true, fullName: true, phoneNumber: true },
          },
        },
      }),
      prisma.contactStatusEvent.count({ where: where as any }),
    ]);

    res.json({ events, total, limit: take, offset: skip });
  } catch (err) {
    console.error("Notifications error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
