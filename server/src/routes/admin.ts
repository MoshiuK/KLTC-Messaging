import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireAuth, requireSuperAdmin } from "../middleware/auth";
import { createOrganizationSchema, updateOrganizationSchema } from "../lib/validation";
import { getMonthlyMessageCount } from "../lib/limits";

const router = Router();

router.use(requireAuth, requireSuperAdmin);

// GET /api/admin/organizations — list every tenant with usage + limits
router.get("/organizations", async (_req: Request, res: Response) => {
  try {
    const orgs = await prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        monthlyMessageLimit: true,
        contactLimit: true,
        userLimit: true,
        createdAt: true,
        _count: { select: { users: true, contacts: true } },
      },
    });

    const withUsage = await Promise.all(
      orgs.map(async (o) => ({
        ...o,
        usage: {
          users: o._count.users,
          contacts: o._count.contacts,
          messagesThisMonth: await getMonthlyMessageCount(o.id),
        },
      }))
    );

    res.json(withUsage);
  } catch (err) {
    console.error("List orgs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/organizations — create an org + its first admin user + optional limits
router.post("/organizations", async (req: Request, res: Response) => {
  try {
    const data = createOrganizationSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({ where: { email: data.adminEmail } });
    if (existingUser) {
      res.status(409).json({ error: "A user with that admin email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(data.adminPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: data.organizationName,
          monthlyMessageLimit: data.monthlyMessageLimit ?? null,
          contactLimit: data.contactLimit ?? null,
          userLimit: data.userLimit ?? null,
        },
      });
      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          email: data.adminEmail,
          passwordHash,
          firstName: data.adminFirstName,
          lastName: data.adminLastName,
          role: "admin",
        },
      });
      return { org, user };
    });

    res.status(201).json({
      organization: result.org,
      admin: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Create org error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/organizations/:id — update limits, name, or suspend/resume
router.patch("/organizations/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = updateOrganizationSchema.parse(req.body);

    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const updated = await prisma.organization.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        isActive: true,
        monthlyMessageLimit: true,
        contactLimit: true,
        userLimit: true,
      },
    });

    res.json(updated);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Update org error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
