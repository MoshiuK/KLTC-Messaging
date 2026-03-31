import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { contactCreateSchema, contactUpdateSchema } from "../lib/validation";

const router = Router();

// All routes require auth
router.use(requireAuth);

// GET /api/contacts/birthdays — get contacts with birthdays today or upcoming
router.get("/birthdays", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const today = new Date();
    const monthDay = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    // Get all contacts with birthdays set
    const contacts = await prisma.contact.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        birthday: { not: null },
      },
      orderBy: { birthday: "asc" },
    });

    // Filter for today's birthdays and upcoming (next 30 days)
    const todayBirthdays = contacts.filter((c) => {
      if (!c.birthday) return false;
      return c.birthday.slice(5) === monthDay;
    });

    const upcoming = contacts.filter((c) => {
      if (!c.birthday) return false;
      const bday = c.birthday.slice(5); // MM-DD
      if (bday === monthDay) return false; // exclude today
      // Check if within next 30 days
      const bdayDate = new Date(today.getFullYear(), parseInt(bday.split("-")[0]) - 1, parseInt(bday.split("-")[1]));
      if (bdayDate < today) bdayDate.setFullYear(bdayDate.getFullYear() + 1);
      const diff = (bdayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      return diff > 0 && diff <= 30;
    });

    res.json({ today: todayBirthdays, upcoming });
  } catch (err) {
    console.error("Birthday lookup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/contacts
router.get("/", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { search, active, optedOut } = req.query;

    const where: Record<string, unknown> = { organizationId: orgId };

    if (active !== undefined) {
      where.isActive = active === "true";
    }
    if (optedOut !== undefined) {
      where.isOptedOut = optedOut === "true";
    }
    if (search && typeof search === "string") {
      where.OR = [
        { fullName: { contains: search } },
        { phoneNumber: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const contacts = await prisma.contact.findMany({
      where: where as any,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { groupMemberships: true } },
      },
    });

    res.json(contacts);
  } catch (err) {
    console.error("List contacts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/contacts
router.post("/", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const data = contactCreateSchema.parse(req.body);

    const fullName = `${data.firstName} ${data.lastName}`;

    const existing = await prisma.contact.findUnique({
      where: { organizationId_phoneNumber: { organizationId: orgId, phoneNumber: data.phoneNumber } },
    });

    if (existing) {
      res.status(409).json({ error: "A contact with this phone number already exists" });
      return;
    }

    const contact = await prisma.contact.create({
      data: {
        organizationId: orgId,
        firstName: data.firstName,
        lastName: data.lastName,
        fullName,
        phoneNumber: data.phoneNumber,
        email: data.email || null,
        birthday: data.birthday || null,
      },
    });

    res.status(201).json(contact);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Create contact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/contacts/:id
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { id } = req.params;
    const data = contactUpdateSchema.parse(req.body);

    const contact = await prisma.contact.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    const firstName = data.firstName ?? contact.firstName;
    const lastName = data.lastName ?? contact.lastName;
    const fullName = `${firstName} ${lastName}`;

    const updated = await prisma.contact.update({
      where: { id },
      data: {
        ...data,
        fullName,
        email: data.email !== undefined ? data.email || null : undefined,
        birthday: data.birthday !== undefined ? data.birthday || null : undefined,
      },
    });

    res.json(updated);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Update contact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/contacts/:id (soft delete)
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { id } = req.params;

    const contact = await prisma.contact.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    await prisma.contact.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({ message: "Contact deactivated" });
  } catch (err) {
    console.error("Delete contact error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
