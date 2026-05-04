import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.create({
    data: { name: "Faith Memorials" },
  });

  const passwordHash = await bcrypt.hash("admin123", 10);
  await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "admin@faithmemorials.com",
      passwordHash,
      firstName: "Admin",
      lastName: "User",
      role: "admin",
    },
  });

  console.log("Seed complete!");
  console.log(`  Admin login: admin@faithmemorials.com / admin123`);
  console.log(`  Organization: ${org.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
