const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const slug = 'pasar-segar'; // Assuming this is the slug based on the screenshot/context
  
  console.log(`Checking store with slug: ${slug}`);
  
  let store = await prisma.store.findUnique({
    where: { slug: slug }
  });

  if (!store) {
    console.log(`Store '${slug}' not found. Trying to find by name 'Pasar Segar'...`);
    const storeByName = await prisma.store.findFirst({
        where: { name: 'Pasar Segar' }
    });
    
    if (!storeByName) {
        console.error("Store not found!");
        return;
    }
    store = storeByName;
    console.log(`Found store by name: ${store.name} (ID: ${store.id}, Slug: ${store.slug})`);
  } else {
    console.log(`Found store: ${store.name} (ID: ${store.id})`);
    console.log(`Current Settings: enableMidtrans=${store.enableMidtrans}, Plan=${store.subscriptionPlan}`);
  }

  await updateStore(store.id);
}

async function updateStore(id) {
    console.log("Updating store settings...");
    try {
        const updated = await prisma.store.update({
            where: { id: id },
            data: {
                enableMidtrans: true,
                // If it's enterprise but keys are missing, we might want to switch to FREE/PRO to use platform keys?
                // Or just ensure we don't block on empty keys if we want to use platform keys.
                // For now, just enabling Midtrans should trigger the logic in payment.ts
            }
        });
        console.log("✅ Store updated successfully!");
        console.log(`New Settings: enableMidtrans=${updated.enableMidtrans}`);
    } catch (e) {
        console.error("Error updating store:", e);
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
