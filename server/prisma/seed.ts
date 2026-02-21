import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create a demo organization
  const org = await prisma.organization.create({
    data: { name: "KLTC Demo Org" },
  });

  // Create admin user (password: admin123)
  const passwordHash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "admin@kltc.com",
      passwordHash,
      firstName: "Admin",
      lastName: "User",
      role: "admin",
    },
  });

  // Create some contacts
  const contacts = await Promise.all([
    prisma.contact.create({
      data: {
        organizationId: org.id,
        firstName: "John",
        lastName: "Doe",
        fullName: "John Doe",
        phoneNumber: "+15551001001",
        email: "john@example.com",
      },
    }),
    prisma.contact.create({
      data: {
        organizationId: org.id,
        firstName: "Jane",
        lastName: "Smith",
        fullName: "Jane Smith",
        phoneNumber: "+15551001002",
        email: "jane@example.com",
      },
    }),
    prisma.contact.create({
      data: {
        organizationId: org.id,
        firstName: "Bob",
        lastName: "Johnson",
        fullName: "Bob Johnson",
        phoneNumber: "+15551001003",
        email: "bob@example.com",
      },
    }),
    prisma.contact.create({
      data: {
        organizationId: org.id,
        firstName: "Alice",
        lastName: "Williams",
        fullName: "Alice Williams",
        phoneNumber: "+15551001004",
        email: "alice@example.com",
        isOptedOut: true,
      },
    }),
    prisma.contact.create({
      data: {
        organizationId: org.id,
        firstName: "Charlie",
        lastName: "Brown",
        fullName: "Charlie Brown",
        phoneNumber: "+15551001005",
        isBlockedSuspected: true,
        blockedReason: "Error code 30007: Message filtered by carrier",
      },
    }),
  ]);

  // Create a group
  const group = await prisma.contactGroup.create({
    data: {
      organizationId: org.id,
      name: "All Staff",
      description: "All staff members",
      createdByUserId: admin.id,
    },
  });

  // Add contacts to group
  await Promise.all(
    contacts.map((c) =>
      prisma.contactGroupMember.create({
        data: { groupId: group.id, contactId: c.id },
      })
    )
  );

  // Create some status events
  await prisma.contactStatusEvent.create({
    data: {
      organizationId: org.id,
      contactId: contacts[3].id,
      eventType: "opted_out",
      source: "inbound_keyword",
      detail: "Keyword: STOP",
    },
  });

  await prisma.contactStatusEvent.create({
    data: {
      organizationId: org.id,
      contactId: contacts[4].id,
      eventType: "blocked_suspected",
      source: "status_callback",
      detail: "Status: undelivered",
      errorCode: "30007",
    },
  });

  console.log("Seed complete!");
  console.log(`  Admin login: admin@kltc.com / admin123`);
  console.log(`  Organization: ${org.name}`);
  console.log(`  Contacts: ${contacts.length}`);
  console.log(`  Group: ${group.name} (${contacts.length} members)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
