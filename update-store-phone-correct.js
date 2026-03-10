const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateStore() {
  const correctPhoneId = '1054564384400254'; // From your screenshot
  console.log(`Updating Demo Store with CORRECT Phone ID: ${correctPhoneId}`);

  try {
    const store = await prisma.store.update({
      where: { slug: 'demo' },
      data: {
        whatsappPhoneId: correctPhoneId,
        // Updating the display number too (optional but good for reference)
        whatsapp: '628816120803' 
      }
    });
    console.log('✅ Store Updated Successfully:', store.name);
  } catch (e) {
    console.error('Error updating store:', e);
  }
}

updateStore()
  .finally(() => prisma.$disconnect());
