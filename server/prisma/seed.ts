import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create the KLTC organization
  const org = await prisma.organization.create({
    data: { name: "KLT Connect", appName: "KLT Connect" },
  });

  // Create admin user
  const passwordHash = await bcrypt.hash(
    process.env.ADMIN_PASSWORD || "ChangeMeNow123!",
    10
  );
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@kltconnect.com").toLowerCase();

  const admin = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: adminEmail,
      passwordHash,
      firstName: "Church",
      lastName: "Admin",
      role: "admin",
    },
  });

  // Create some sample contacts
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
  ]);

  // Create a group
  const group = await prisma.contactGroup.create({
    data: {
      organizationId: org.id,
      name: "Whole Church",
      description: "All church members",
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

  console.log("Seed complete!");
  console.log(`  Admin login: ${adminEmail} / ${process.env.ADMIN_PASSWORD || "ChangeMeNow123!"}`);
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
