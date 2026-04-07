import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/scheduled-messages — list all scheduled messages
router.get("/", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const messages = await prisma.scheduledMessage.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
    res.json(messages);
  } catch (err) {
    console.error("List scheduled messages error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/scheduled-messages/upload — upload birthday CSV to create scheduled messages
router.post("/upload", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { rows, messageTemplate } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "No rows provided. Please upload a file with at least one entry." });
      return;
    }

    if (!messageTemplate || typeof messageTemplate !== "string" || !messageTemplate.trim()) {
      res.status(400).json({ error: "A message template is required." });
      return;
    }

    const results: Array<{ name: string; birthday: string; status: "created" | "skipped" | "error"; reason?: string }> = [];

    for (const row of rows) {
      const name = (row.name || "").trim();
      const birthdayRaw = (row.birthday || "").trim();

      if (!name) {
        results.push({ name: name || "(empty)", birthday: birthdayRaw, status: "skipped", reason: "Missing name" });
        continue;
      }

      if (!birthdayRaw) {
        results.push({ name, birthday: birthdayRaw, status: "skipped", reason: "Missing birthday" });
        continue;
      }

      // Parse birthday into MM-DD format
      const mmdd = parseBirthdayToMMDD(birthdayRaw);
      if (!mmdd) {
        results.push({ name, birthday: birthdayRaw, status: "skipped", reason: "Invalid date format. Use MM/DD, MM-DD, or YYYY-MM-DD." });
        continue;
      }

      try {
        await prisma.scheduledMessage.create({
          data: {
            organizationId: orgId,
            contactName: name,
            phoneNumber: row.phone || "",
            birthday: mmdd,
            messageTemplate: messageTemplate.trim(),
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
    const { isActive, messageTemplate } = req.body;

    const msg = await prisma.scheduledMessage.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!msg) {
      res.status(404).json({ error: "Scheduled message not found" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (typeof isActive === "boolean") data.isActive = isActive;
    if (typeof messageTemplate === "string" && messageTemplate.trim()) data.messageTemplate = messageTemplate.trim();

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

/**
 * Parse various birthday formats into MM-DD:
 * - MM/DD, MM-DD
 * - MM/DD/YYYY, MM-DD-YYYY
 * - YYYY-MM-DD, YYYY/MM/DD
 * - M/D, M-D (single digit month/day)
 */
function parseBirthdayToMMDD(raw: string): string | null {
  // Try YYYY-MM-DD or YYYY/MM/DD
  let match = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (match) {
    const mm = match[2].padStart(2, "0");
    const dd = match[3].padStart(2, "0");
    if (isValidMMDD(mm, dd)) return `${mm}-${dd}`;
  }

  // Try MM/DD/YYYY or MM-DD-YYYY
  match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    const mm = match[1].padStart(2, "0");
    const dd = match[2].padStart(2, "0");
    if (isValidMMDD(mm, dd)) return `${mm}-${dd}`;
  }

  // Try MM/DD or MM-DD
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
