import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("FATAL: JWT_SECRET environment variable is not set. Set it before starting the server.");
    process.exit(1);
  }
  return secret;
}

const JWT_SECRET: string = getJwtSecret();

export interface AuthUser {
  id: string;
  organizationId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, organizationId: user.organizationId, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "24h" }
  );
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: { organization: { select: { isActive: true } } },
    });
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    if (!user.organization.isActive && user.role !== "superadmin") {
      res.status(403).json({ error: "Account suspended. Contact support." });
      return;
    }

    req.user = {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      role: user.role,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || (req.user.role !== "admin" && req.user.role !== "superadmin")) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== "superadmin") {
    res.status(403).json({ error: "Super admin access required" });
    return;
  }
  next();
}
