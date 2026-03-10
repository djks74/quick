const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateStore() {
  const phoneId = '1035325529660403'; // From your logs
  console.log(`Updating Demo Store with Phone ID: ${phoneId}`);

  try {
    const store = await prisma.store.update({
      where: { slug: 'demo' },
      data: {
        whatsappPhoneId: phoneId,
        whatsapp: '6287768201551' // Updating to your testing number just in case
      }
    });
    console.log('✅ Store Updated:', store.name);
  } catch (e) {
    console.error('Error updating store:', e);
  }
}

updateStore()
  .finally(() => prisma.$disconnect());
