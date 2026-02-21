import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { groupCreateSchema, groupUpdateSchema, addMembersSchema } from "../lib/validation";

const router = Router();

router.use(requireAuth);

// GET /api/groups
router.get("/", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;

    const groups = await prisma.contactGroup.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        _count: { select: { members: true } },
      },
    });

    res.json(groups);
  } catch (err) {
    console.error("List groups error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/groups
router.post("/", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const userId = req.user!.id;
    const data = groupCreateSchema.parse(req.body);

    const group = await prisma.contactGroup.create({
      data: {
        organizationId: orgId,
        name: data.name,
        description: data.description || null,
        createdByUserId: userId,
      },
      include: {
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        _count: { select: { members: true } },
      },
    });

    res.status(201).json(group);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Create group error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/groups/:id
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { id } = req.params;
    const data = groupUpdateSchema.parse(req.body);

    const group = await prisma.contactGroup.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    const updated = await prisma.contactGroup.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        _count: { select: { members: true } },
      },
    });

    res.json(updated);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Update group error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/groups/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { id } = req.params;

    const group = await prisma.contactGroup.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    await prisma.contactGroup.delete({ where: { id } });

    res.json({ message: "Group deleted" });
  } catch (err) {
    console.error("Delete group error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/groups/:id/members
router.get("/:id/members", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { id } = req.params;

    const group = await prisma.contactGroup.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    const members = await prisma.contactGroupMember.findMany({
      where: { groupId: id },
      include: {
        contact: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(members);
  } catch (err) {
    console.error("List members error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/groups/:id/members
router.post("/:id/members", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { id } = req.params;
    const data = addMembersSchema.parse(req.body);

    const group = await prisma.contactGroup.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    // Verify all contacts belong to org
    const contacts = await prisma.contact.findMany({
      where: { id: { in: data.contactIds }, organizationId: orgId },
    });

    if (contacts.length !== data.contactIds.length) {
      res.status(400).json({ error: "Some contact IDs are invalid or not in your organization" });
      return;
    }

    // Upsert members (skip duplicates)
    const results = await Promise.allSettled(
      data.contactIds.map((contactId) =>
        prisma.contactGroupMember.upsert({
          where: { groupId_contactId: { groupId: id, contactId } },
          create: { groupId: id, contactId },
          update: {},
          include: { contact: true },
        })
      )
    );

    const added = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
      .map((r) => r.value);

    res.status(201).json({ added: added.length, members: added });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      res.status(400).json({ error: "Validation error", details: err });
      return;
    }
    console.error("Add members error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/groups/:id/members/:contactId
router.delete("/:id/members/:contactId", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const { id, contactId } = req.params;

    const group = await prisma.contactGroup.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    const member = await prisma.contactGroupMember.findUnique({
      where: { groupId_contactId: { groupId: id, contactId } },
    });

    if (!member) {
      res.status(404).json({ error: "Member not found in group" });
      return;
    }

    await prisma.contactGroupMember.delete({
      where: { id: member.id },
    });

    res.json({ message: "Member removed from group" });
  } catch (err) {
    console.error("Remove member error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
