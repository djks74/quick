const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function checkUser() {
  console.log('Checking for user demo@mythoz.com...');
  const user = await prisma.user.findUnique({
    where: { email: 'demo@mythoz.com' }
  });

  if (user) {
    console.log('✅ User FOUND:', user.email);
    console.log('Role:', user.role);
    
    // Verify Password
    const passwordToTest = 'amazon74';
    const isValid = await bcrypt.compare(passwordToTest, user.password);
    console.log(`Testing password '${passwordToTest}':`, isValid ? '✅ MATCH' : '❌ INVALID');
    
    if (!isValid) {
        console.log('Updating password to ensure it matches...');
        const newHash = await bcrypt.hash(passwordToTest, 10);
        await prisma.user.update({
            where: { email: 'demo@mythoz.com' },
            data: { password: newHash }
        });
        console.log('Password updated successfully.');
    }

  } else {
    console.log('❌ User NOT FOUND');
  }
}

checkUser()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
