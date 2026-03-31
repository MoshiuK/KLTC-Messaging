import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { updateBrandingSchema } from "../lib/validation";
import { clearTelnyxConfigCache } from "../services/telnyx";

const router = Router();

// GET /api/org/branding — get org branding config
router.get("/branding", requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        appName: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
      },
    });

    res.json({
      appName: org?.appName || "KLTC Messaging",
      logoUrl: org?.logoUrl || null,
      primaryColor: org?.primaryColor || "#1a1a2e",
      secondaryColor: org?.secondaryColor || "#3498db",
      accentColor: org?.accentColor || "#f39c12",
    });
  } catch (err) {
    console.error("Get branding error:", err);
    res.status(500).json({ error: "Failed to fetch branding" });
  }
});

// PATCH /api/org/branding — update org branding (admin only)
router.patch("/branding", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const data = updateBrandingSchema.parse(req.body);

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(data.appName !== undefined && { appName: data.appName }),
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
        ...(data.primaryColor !== undefined && { primaryColor: data.primaryColor }),
        ...(data.secondaryColor !== undefined && { secondaryColor: data.secondaryColor }),
        ...(data.accentColor !== undefined && { accentColor: data.accentColor }),
      },
      select: {
        appName: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
      },
    });

    res.json({
      appName: updated.appName || "KLTC Messaging",
      logoUrl: updated.logoUrl || null,
      primaryColor: updated.primaryColor || "#1a1a2e",
      secondaryColor: updated.secondaryColor || "#3498db",
      accentColor: updated.accentColor || "#f39c12",
    });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Update branding error:", err);
    res.status(500).json({ error: "Failed to update branding" });
  }
});

// GET /api/org/telnyx — get Telnyx config (admin only, masked)
router.get("/telnyx", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const config = await prisma.telnyxConfig.findFirst({
      where: { organizationId: orgId },
    });

    if (!config) {
      res.json({ configured: false });
      return;
    }

    res.json({
      configured: true,
      phoneNumber: config.phoneNumber,
      apiKeyMasked: config.apiKey.slice(0, 8) + "..." + config.apiKey.slice(-4),
      messagingProfileId: config.messagingProfileId || null,
    });
  } catch (err) {
    console.error("Get Telnyx config error:", err);
    res.status(500).json({ error: "Failed to fetch Telnyx config" });
  }
});

// PUT /api/org/telnyx — set Telnyx config (admin only)
router.put("/telnyx", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { apiKey, phoneNumber, messagingProfileId } = req.body;

    if (!apiKey || !phoneNumber) {
      res.status(400).json({ error: "apiKey and phoneNumber are required" });
      return;
    }

    // Upsert: delete existing and create new
    await prisma.telnyxConfig.deleteMany({ where: { organizationId: orgId } });

    const config = await prisma.telnyxConfig.create({
      data: {
        organizationId: orgId,
        apiKey,
        phoneNumber,
        messagingProfileId: messagingProfileId || null,
      },
    });

    clearTelnyxConfigCache(orgId);

    res.json({
      configured: true,
      phoneNumber: config.phoneNumber,
      apiKeyMasked: config.apiKey.slice(0, 8) + "..." + config.apiKey.slice(-4),
      messagingProfileId: config.messagingProfileId || null,
    });
  } catch (err) {
    console.error("Set Telnyx config error:", err);
    res.status(500).json({ error: "Failed to save Telnyx config" });
  }
});

export default router;
