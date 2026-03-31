import { Router, Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

// POST /api/groups/:id/invite — create an invite link for a group
router.post("/:id/invite", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const userId = req.user!.id;
    const role = req.user!.role;

    if (role !== "admin" && role !== "leader") {
      res.status(403).json({ error: "Only admins and leaders can create invites" });
      return;
    }

    const group = await prisma.contactGroup.findFirst({
      where: { id: req.params.id, organizationId: orgId },
    });

    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 days

    const invite = await prisma.invite.create({
      data: {
        organizationId: orgId,
        groupId: group.id,
        token,
        createdByUserId: userId,
        expiresAt,
      },
    });

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const inviteLink = `${baseUrl}/join/${token}`;

    res.json({ token, inviteLink, expiresAt: invite.expiresAt });
  } catch (err) {
    console.error("Create invite error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/invites/:token/join — accept an invite (adds user's contact to the group)
router.post("/:token/join", requireAuth, async (req: Request, res: Response) => {
  try {
    const invite = await prisma.invite.findUnique({
      where: { token: req.params.token },
    });

    if (!invite) {
      res.status(404).json({ error: "Invite not found" });
      return;
    }

    if (invite.expiresAt < new Date()) {
      res.status(410).json({ error: "Invite has expired" });
      return;
    }

    const group = await prisma.contactGroup.findUnique({
      where: { id: invite.groupId },
    });

    if (!group) {
      res.status(404).json({ error: "Group no longer exists" });
      return;
    }

    res.json({ success: true, group: { id: group.id, name: group.name } });
  } catch (err) {
    console.error("Join invite error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
