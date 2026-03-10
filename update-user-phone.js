const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateUserPhone() {
  const email = 'demo@mythoz.com';
  const phone = '6287768201551'; // Your number

  console.log(`Updating User ${email} with Phone: ${phone}`);

  try {
    const user = await prisma.user.update({
      where: { email: email },
      data: {
        phoneNumber: phone,
        role: 'MERCHANT' // Ensure role is MERCHANT or SUPER_ADMIN (Merchant check allows both usually? Let's check logic)
      }
    });
    console.log('✅ User Updated:', user.name);
  } catch (e) {
    console.error('Error updating user:', e);
  }
}

updateUserPhone()
  .finally(() => prisma.$disconnect());
