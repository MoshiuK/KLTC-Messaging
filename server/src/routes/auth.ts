import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { generateToken, requireAuth } from "../middleware/auth";
import { loginSchema, registerSchema, forgotPasswordSchema, resetPasswordSchema } from "../lib/validation";

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: data.organizationName },
      });

      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          role: "admin",
        },
      });

      return { org, user };
    });

    const token = generateToken({
      id: result.user.id,
      organizationId: result.user.organizationId,
      email: result.user.email,
      role: result.user.role,
    });

    res.status(201).json({
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role,
        organizationId: result.user.organizationId,
        organizationName: result.org.name,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { organization: true },
    });

    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = generateToken({
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { organization: true },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: user.organization.name,
    });
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/forgot-password — request a password reset
router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const data = forgotPasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    // Always return success to avoid leaking whether email exists
    if (!user) {
      res.json({ message: "If that email exists, a reset link has been generated." });
      return;
    }

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate any existing unused tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Create new reset token
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // Return the reset token/link (in production, you'd email this instead)
    const resetLink = `/reset-password?token=${token}`;

    console.log(`Password reset requested for ${data.email}. Reset link: ${resetLink}`);

    res.json({
      message: "If that email exists, a reset link has been generated.",
      // Include reset link in response so admin can share it
      resetLink,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/reset-password — reset password with token
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const data = resetPasswordSchema.parse(req.body);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: data.token },
      include: { user: true },
    });

    if (!resetToken) {
      res.status(400).json({ error: "Invalid or expired reset link" });
      return;
    }

    if (resetToken.usedAt) {
      res.status(400).json({ error: "This reset link has already been used" });
      return;
    }

    if (resetToken.expiresAt < new Date()) {
      res.status(400).json({ error: "This reset link has expired" });
      return;
    }

    // Hash new password and update user
    const passwordHash = await bcrypt.hash(data.password, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    res.json({ message: "Password has been reset successfully. You can now log in." });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
