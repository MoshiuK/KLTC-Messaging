import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// ─── Birthday Config ─────────────────────────────────────────

// GET /api/scheduled-messages/config — get birthday announcement config
router.get("/config", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    let config = await prisma.birthdayConfig.findUnique({
      where: { organizationId: orgId },
    });

    if (!config) {
      // Return defaults without creating
      res.json({
        groupId: null,
        template1: "Happy Birthday, {name}! Wishing you a wonderful day!",
        template2: "It's {name}'s birthday today! Let's wish them a great one!",
        template3: "Happy Birthday to {name}! Hope your day is amazing!",
        template4: "Wishing the happiest of birthdays to {name}! Enjoy your special day!",
        template5: "Birthday shoutout to {name}! Have an incredible birthday!",
        rotationIndex: 0,
        isEnabled: false,
        scheduledTime: "08:05",
      });
      return;
    }

    res.json(config);
  } catch (err) {
    console.error("Get birthday config error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/scheduled-messages/config — update birthday announcement config
router.put("/config", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { groupId, template1, template2, template3, template4, template5, isEnabled } = req.body;

    // Validate templates contain {name}
    const templates = [template1, template2, template3, template4, template5];
    for (let i = 0; i < templates.length; i++) {
      if (typeof templates[i] !== "string" || !templates[i].trim()) {
        res.status(400).json({ error: `Message template ${i + 1} is required.` });
        return;
      }
      if (!templates[i].toLowerCase().includes("{name}")) {
        res.status(400).json({ error: `Message template ${i + 1} must include {name} placeholder.` });
        return;
      }
    }

    const config = await prisma.birthdayConfig.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        groupId: groupId || null,
        template1: template1.trim(),
        template2: template2.trim(),
        template3: template3.trim(),
        template4: template4.trim(),
        template5: template5.trim(),
        isEnabled: !!isEnabled,
      },
      update: {
        groupId: groupId || null,
        template1: template1.trim(),
        template2: template2.trim(),
        template3: template3.trim(),
        template4: template4.trim(),
        template5: template5.trim(),
        isEnabled: !!isEnabled,
      },
    });

    res.json(config);
  } catch (err) {
    console.error("Update birthday config error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Scheduled Messages CRUD ──────────────────────────────────

// POST /api/scheduled-messages/sync — auto-create birthday entries from existing contacts
router.post("/sync", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;

    // Get all active contacts that have a birthday set
    const contacts = await prisma.contact.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        birthday: { not: null },
      },
    });

    if (contacts.length === 0) {
      res.json({ summary: { total: 0, created: 0, skipped: 0 }, results: [] });
      return;
    }

    const results: Array<{ name: string; birthday: string; status: "created" | "skipped"; reason?: string }> = [];

    for (const contact of contacts) {
      if (!contact.birthday) continue;

      // Convert YYYY-MM-DD to MM-DD
      const mmdd = contact.birthday.length === 10 ? contact.birthday.slice(5) : contact.birthday;

      // Check for existing entry
      const existing = await prisma.scheduledMessage.findFirst({
        where: { organizationId: orgId, contactName: contact.fullName, birthday: mmdd },
      });

      if (existing) {
        results.push({ name: contact.fullName, birthday: mmdd, status: "skipped", reason: "Already exists" });
        continue;
      }

      await prisma.scheduledMessage.create({
        data: {
          organizationId: orgId,
          contactName: contact.fullName,
          phoneNumber: contact.phoneNumber,
          birthday: mmdd,
          messageTemplate: "",
          scheduledTime: "08:05",
          recurrence: "annual",
        },
      });
      results.push({ name: contact.fullName, birthday: mmdd, status: "created" });
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      skipped: results.filter((r) => r.status === "skipped").length,
    };

    res.status(201).json({ summary, results });
  } catch (err) {
    console.error("Sync birthdays from contacts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/scheduled-messages — list all scheduled birthday entries
router.get("/", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const messages = await prisma.scheduledMessage.findMany({
      where: { organizationId: orgId },
      orderBy: { birthday: "asc" },
    });
    res.json(messages);
  } catch (err) {
    console.error("List scheduled messages error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/scheduled-messages/upload — upload birthday CSV
router.post("/upload", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { rows } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "No rows provided. Please upload a file with at least one entry." });
      return;
    }

    const results: Array<{ name: string; birthday: string; status: "created" | "skipped" | "error"; reason?: string }> = [];

    for (const row of rows) {
      const name = (row.name || "").trim();
      const birthdayRaw = (row.birthday || "").trim();
      const phone = (row.phone || "").trim();

      if (!name) {
        results.push({ name: name || "(empty)", birthday: birthdayRaw, status: "skipped", reason: "Missing name" });
        continue;
      }

      if (!birthdayRaw) {
        results.push({ name, birthday: birthdayRaw, status: "skipped", reason: "Missing birthday" });
        continue;
      }

      const mmdd = parseBirthdayToMMDD(birthdayRaw);
      if (!mmdd) {
        results.push({ name, birthday: birthdayRaw, status: "skipped", reason: "Invalid date format. Use MM/DD, MM-DD, or YYYY-MM-DD." });
        continue;
      }

      try {
        // Check for duplicate (same org, same name, same birthday)
        const existing = await prisma.scheduledMessage.findFirst({
          where: { organizationId: orgId, contactName: name, birthday: mmdd },
        });

        if (existing) {
          results.push({ name, birthday: mmdd, status: "skipped", reason: "Already exists" });
          continue;
        }

        await prisma.scheduledMessage.create({
          data: {
            organizationId: orgId,
            contactName: name,
            phoneNumber: phone,
            birthday: mmdd,
            messageTemplate: "", // Templates now come from BirthdayConfig
            scheduledTime: "08:05",
            recurrence: "annual",
          },
        });
        results.push({ name, birthday: mmdd, status: "created" });
      } catch (err) {
        results.push({ name, birthday: mmdd, status: "error", reason: "Database error" });
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
    console.error("Upload birthday CSV error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/scheduled-messages/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { id } = req.params;

    const msg = await prisma.scheduledMessage.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!msg) {
      res.status(404).json({ error: "Scheduled message not found" });
      return;
    }

    await prisma.scheduledMessage.delete({ where: { id } });
    res.json({ message: "Scheduled message deleted" });
  } catch (err) {
    console.error("Delete scheduled message error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/scheduled-messages/:id — toggle active
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { id } = req.params;
    const { isActive } = req.body;

    const msg = await prisma.scheduledMessage.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!msg) {
      res.status(404).json({ error: "Scheduled message not found" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (typeof isActive === "boolean") data.isActive = isActive;

    const updated = await prisma.scheduledMessage.update({
      where: { id },
      data,
    });

    res.json(updated);
  } catch (err) {
    console.error("Update scheduled message error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Helpers ──────────────────────────────────────────────────

function parseBirthdayToMMDD(raw: string): string | null {
  let match = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (match) {
    const mm = match[2].padStart(2, "0");
    const dd = match[3].padStart(2, "0");
    if (isValidMMDD(mm, dd)) return `${mm}-${dd}`;
  }

  match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    const mm = match[1].padStart(2, "0");
    const dd = match[2].padStart(2, "0");
    if (isValidMMDD(mm, dd)) return `${mm}-${dd}`;
  }

  match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (match) {
    const mm = match[1].padStart(2, "0");
    const dd = match[2].padStart(2, "0");
    if (isValidMMDD(mm, dd)) return `${mm}-${dd}`;
  }

  return null;
}

function isValidMMDD(mm: string, dd: string): boolean {
  const m = parseInt(mm, 10);
  const d = parseInt(dd, 10);
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

export default router;
