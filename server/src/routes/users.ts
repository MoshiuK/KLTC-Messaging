import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { createUserSchema, updateUserSchema } from "../lib/validation";
import { assertCanAddUser, LimitExceededError } from "../lib/limits";

const router = Router();

// All routes require auth + admin
router.use(requireAuth, requireAdmin);

// GET /api/users — list all users in the organization
router.get("/", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;

    const users = await prisma.user.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    res.json(users);
  } catch (err) {
    console.error("List users error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/users — create a new user in the organization
router.post("/", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const data = createUserSchema.parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      res.status(409).json({ error: "A user with this email already exists" });
      return;
    }

    await assertCanAddUser(orgId);

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    res.status(201).json(user);
  } catch (err) {
    if (err instanceof LimitExceededError) {
      res.status(err.status).json({ error: err.message, limitType: err.limitType, current: err.current, limit: err.limit });
      return;
    }
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Create user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/users/:id — update a user
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { id } = req.params;
    const data = updateUserSchema.parse(req.body);

    const user = await prisma.user.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Check if email is being changed and is already taken
    if (data.email && data.email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: data.email } });
      if (existing) {
        res.status(409).json({ error: "A user with this email already exists" });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    res.json(updated);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Update user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/users/:id — remove a user
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { id } = req.params;

    // Prevent self-deletion
    if (id === req.user!.id) {
      res.status(400).json({ error: "You cannot delete your own account" });
      return;
    }

    const user = await prisma.user.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await prisma.user.delete({ where: { id } });

    res.json({ message: "User deleted" });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
