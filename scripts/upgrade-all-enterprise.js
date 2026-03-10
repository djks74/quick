const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Upgrading ALL stores to ENTERPRISE plan...");
  
  try {
    const result = await prisma.store.updateMany({
        where: {}, // Update ALL stores
        data: {
            subscriptionPlan: 'ENTERPRISE'
        }
    });
    
    console.log(`✅ Updated ${result.count} stores to ENTERPRISE.`);
    
    // Also, ensure any store with missing keys gets the platform keys injected if possible?
    // We can't do that easily in bulk update without reading first.
    // But since we removed the plan restriction in payment.ts, just upgrading to ENTERPRISE is enough to unlock the UI.
    
  } catch (e) {
    console.error("❌ Error updating stores:", e);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
