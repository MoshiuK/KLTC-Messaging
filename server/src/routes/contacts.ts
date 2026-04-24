import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { contactCreateSchema, contactUpdateSchema } from "../lib/validation";
import { assertCanAddContacts, LimitExceededError } from "../lib/limits";

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

// POST /api/contacts/upload — bulk import contacts from CSV
router.post("/upload", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { rows } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "No rows provided. Please upload a file with at least one entry." });
      return;
    }

    await assertCanAddContacts(orgId, rows.length);

    const results: Array<{ name: string; phone: string; status: "created" | "skipped" | "error"; reason?: string }> = [];

    for (const row of rows) {
      const firstName = (row.firstName || "").trim();
      const lastName = (row.lastName || "").trim();
      let phone = (row.phoneNumber || row.phone || "").trim();
      const email = (row.email || "").trim() || null;
      const birthdayRaw = (row.birthday || "").trim();
      const birthday = birthdayRaw ? normalizeBirthdayToISO(birthdayRaw) : null;

      if (!firstName) {
        results.push({ name: `${firstName} ${lastName}`.trim() || "(empty)", phone, status: "skipped", reason: "Missing first name" });
        continue;
      }
      if (!lastName) {
        results.push({ name: firstName, phone, status: "skipped", reason: "Missing last name" });
        continue;
      }
      if (!phone) {
        results.push({ name: `${firstName} ${lastName}`, phone, status: "skipped", reason: "Missing phone number" });
        continue;
      }

      // Auto-format phone: if it starts with a digit and is 10 digits, prepend +1
      if (/^\d{10}$/.test(phone)) {
        phone = `+1${phone}`;
      } else if (/^1\d{10}$/.test(phone)) {
        phone = `+${phone}`;
      }

      // Validate E.164
      if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
        results.push({ name: `${firstName} ${lastName}`, phone, status: "skipped", reason: "Invalid phone format. Must be E.164 (e.g. +15551234567)." });
        continue;
      }

      const fullName = `${firstName} ${lastName}`;

      try {
        // Check for existing contact
        const existing = await prisma.contact.findUnique({
          where: { organizationId_phoneNumber: { organizationId: orgId, phoneNumber: phone } },
        });

        if (existing) {
          results.push({ name: fullName, phone, status: "skipped", reason: "Phone number already exists" });
          continue;
        }

        await prisma.contact.create({
          data: {
            organizationId: orgId,
            firstName,
            lastName,
            fullName,
            phoneNumber: phone,
            email,
            birthday,
          },
        });
        results.push({ name: fullName, phone, status: "created" });
      } catch (err) {
        results.push({ name: fullName, phone, status: "error", reason: "Database error" });
      }
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
    };

    res.status(201).json({ summary, results });
  } catch (err) {
    if (err instanceof LimitExceededError) {
      res.status(err.status).json({ error: err.message, limitType: err.limitType, current: err.current, limit: err.limit });
      return;
    }
    console.error("Upload contacts error:", err);
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

    await assertCanAddContacts(orgId, 1);

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
    if (err instanceof LimitExceededError) {
      res.status(err.status).json({ error: err.message, limitType: err.limitType, current: err.current, limit: err.limit });
      return;
    }
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

/**
 * Normalize various birthday formats to YYYY-MM-DD for consistency with the rest of the API.
 * Accepts: MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD, YYYY/MM/DD, MM/DD, MM-DD
 * Returns YYYY-MM-DD string or null if unparseable.
 */
function normalizeBirthdayToISO(raw: string): string | null {
  // YYYY-MM-DD or YYYY/MM/DD
  let match = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (match) {
    const [, yyyy, mm, dd] = match;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  // MM/DD/YYYY or MM-DD-YYYY
  match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    const [, mm, dd, yyyy] = match;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  // MM/DD/YY or MM-DD-YY (assume 1900s for >50, 2000s for <=50)
  match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (match) {
    const [, mm, dd, yy] = match;
    const year = parseInt(yy, 10) > 50 ? `19${yy}` : `20${yy}`;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  // MM/DD or MM-DD (no year — use placeholder year 2000)
  match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (match) {
    const [, mm, dd] = match;
    return `2000-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  // Already matches YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  return null;
}

export default router;
