const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  // List all users first
  const users = await prisma.user.findMany({ select: { email: true, role: true } });
  console.log('Users:', JSON.stringify(users));
  
  // Reset admin password
  const hash = await bcrypt.hash('KLTCAdmin2024!', 10);
  await prisma.user.update({
    where: { email: 'admin@kltc.com' },
    data: { passwordHash: hash }
  });
  console.log('Password updated for admin@kltc.com');
}

main().catch(console.error).finally(() => prisma.$disconnect());
