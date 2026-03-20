const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const storeSlug = 'pasar-segar'; // Based on the URL
  
  const store = await prisma.store.findUnique({
    where: { slug: storeSlug },
    include: { products: { where: { name: { contains: 'daun salam', mode: 'insensitive' } } } }
  });

  if (!store) {
    console.log(`Store "${storeSlug}" not found. Trying to find by name "Pasar Segar Grogol"...`);
    const storeByName = await prisma.store.findFirst({
        where: { name: 'Pasar Segar Grogol' },
        include: { products: { where: { name: { contains: 'daun salam', mode: 'insensitive' } } } }
    });
    if (!storeByName) return;
    store = storeByName;
  }

  console.log(`Store: ${store.name} (ID: ${store.id}, Slug: ${store.slug})`);
  console.log(`Webhook URL: "${store.webhookUrl}"`);
  console.log(`API Key: ${store.apiKey ? 'Set' : 'Not set'}`);

  if (store.products.length === 0) {
    console.log('Product "daun salam" not found in this store.');
    return;
  }

  const product = store.products[0];
  console.log(`Product: "${product.name}"`);
  console.log(`Price: ${product.price}`);
  console.log(`Stock: ${product.stock}`);
  console.log(`External ID: "${product.externalId}"`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
