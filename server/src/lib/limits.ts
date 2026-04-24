import { prisma } from "./prisma";

export class LimitExceededError extends Error {
  status = 402;
  constructor(public limitType: string, public current: number, public limit: number) {
    super(`${limitType} limit reached (${current}/${limit})`);
    this.name = "LimitExceededError";
  }
}

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function assertCanSendMessages(orgId: string, count = 1): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { isActive: true, monthlyMessageLimit: true },
  });
  if (!org || !org.isActive) {
    throw new LimitExceededError("account", 0, 0);
  }
  if (org.monthlyMessageLimit == null) return;

  const sentThisMonth = await prisma.message.count({
    where: {
      direction: "outbound",
      conversation: { organizationId: orgId },
      createdAt: { gte: startOfCurrentMonth() },
    },
  });
  if (sentThisMonth + count > org.monthlyMessageLimit) {
    throw new LimitExceededError("monthly message", sentThisMonth, org.monthlyMessageLimit);
  }
}

export async function assertCanAddUser(orgId: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { userLimit: true },
  });
  if (!org || org.userLimit == null) return;
  const count = await prisma.user.count({ where: { organizationId: orgId } });
  if (count + 1 > org.userLimit) {
    throw new LimitExceededError("user", count, org.userLimit);
  }
}

export async function assertCanAddContacts(orgId: string, adding = 1): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { contactLimit: true },
  });
  if (!org || org.contactLimit == null) return;
  const count = await prisma.contact.count({
    where: { organizationId: orgId, isActive: true },
  });
  if (count + adding > org.contactLimit) {
    throw new LimitExceededError("contact", count, org.contactLimit);
  }
}

export async function getMonthlyMessageCount(orgId: string): Promise<number> {
  return prisma.message.count({
    where: {
      direction: "outbound",
      conversation: { organizationId: orgId },
      createdAt: { gte: startOfCurrentMonth() },
    },
  });
}
