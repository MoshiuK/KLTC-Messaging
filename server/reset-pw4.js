const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('KLTCAdmin2024!', 10);
  
  // Update both users
  await prisma.user.update({
    where: { email: 'moshiu@kltconnect.com' },
    data: { passwordHash: hash }
  });
  console.log('Password updated for moshiu@kltconnect.com');
  
  await prisma.user.update({
    where: { email: 'tomeka@knoxmediagroupinc.org' },
    data: { passwordHash: hash }
  });
  console.log('Password updated for tomeka@knoxmediagroupinc.org');
}

main().catch(console.error).finally(() => prisma.$disconnect());
