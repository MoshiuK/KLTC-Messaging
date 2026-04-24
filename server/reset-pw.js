const bcrypt = require('bcryptjs');
const { execFileSync } = require('child_process');

bcrypt.hash('KLTCAdmin2024!', 10).then(h => {
  const sql = "UPDATE User SET passwordHash='" + h + "' WHERE email='admin@kltc.com';";
  execFileSync('sqlite3', ['/opt/KLTC-Messaging/server/prisma/dev.db', sql]);
  
  // Verify
  const result = execFileSync('sqlite3', ['/opt/KLTC-Messaging/server/prisma/dev.db', "SELECT email FROM User WHERE email='admin@kltc.com';"]).toString();
  console.log('Done! User:', result.trim());
}).catch(e => console.error('Error:', e));
