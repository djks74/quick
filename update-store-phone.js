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
        whatsapp: '62882003961609' // Updating to real Gercep number
      }
    });
    console.log('✅ Store Updated:', store.name);
  } catch (e) {
    console.error('Error updating store:', e);
  }
}

updateStore()
  .finally(() => prisma.$disconnect());
