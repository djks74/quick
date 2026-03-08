const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const hashedPasswordAdmin = await bcrypt.hash('admin', 10);
  const hashedPasswordDemo = await bcrypt.hash('demo', 10);

  // 1. Create Super Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@lcp.com' },
    update: { password: hashedPasswordAdmin },
    create: {
      email: 'admin@lcp.com',
      password: hashedPasswordAdmin,
      name: 'Super Admin',
      role: 'SUPER_ADMIN'
    }
  });

  // 2. Create Merchant
  const merchant = await prisma.user.upsert({
    where: { email: 'demo@lcp.com' },
    update: { password: hashedPasswordDemo },
    create: {
      email: 'demo@lcp.com',
      password: hashedPasswordDemo,
      name: 'Demo Merchant',
      role: 'MERCHANT'
    }
  });

  // 3. Create Store
  const store = await prisma.store.upsert({
    where: { slug: 'demo' },
    update: { ownerId: merchant.id },
    create: {
      name: 'LCP Demo Store',
      slug: 'demo',
      ownerId: merchant.id,
      whatsapp: '628123456789',
      enableWhatsApp: true,
      enableMidtrans: true,
      enableManualTransfer: true,
      subscriptionPlan: 'PRO'
    }
  });

  // 4. Create Categories
  try {
    const catFood = await prisma.category.upsert({
      where: { storeId_slug: { storeId: store.id, slug: 'food' } },
      update: {},
      create: {
        name: 'Food',
        slug: 'food',
        storeId: store.id
      }
    });
  } catch (e) {
    // Ignore unique constraint if schema differs slightly in dev
    console.log('Category seed skipped or failed (might already exist)');
  }

  // 5. Create Products
  const count = await prisma.product.count({ where: { storeId: store.id } });
  if (count === 0) {
    await prisma.product.create({
      data: {
        name: 'Nasi Goreng',
        price: 25000,
        storeId: store.id,
        category: 'Food',
        description: 'Delicious fried rice',
        stock: 100
      }
    });
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
