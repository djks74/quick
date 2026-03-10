import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('amazon74', 10);

  // 1. Create Super Admin User (demo@mythoz.com)
  const superAdmin = await prisma.user.upsert({
    where: { email: 'demo@mythoz.com' },
    update: {
      password: password,
      role: 'SUPER_ADMIN',
      name: 'Super Admin'
    },
    create: {
      email: 'demo@mythoz.com',
      password: password,
      name: 'Super Admin',
      role: 'SUPER_ADMIN'
    }
  });

  console.log('Created/Updated Super Admin:', superAdmin.email);

  // 2. Create Demo Store
  // We'll assign the Super Admin as the owner of the Demo Store for simplicity
  const store = await prisma.store.upsert({
    where: { slug: 'demo' },
    update: {
      ownerId: superAdmin.id,
      name: 'LCP Demo Store',
      enableWhatsApp: true,
      enableMidtrans: true,
      enableManualTransfer: true,
      subscriptionPlan: 'PRO'
    },
    create: {
      name: 'LCP Demo Store',
      slug: 'demo',
      ownerId: superAdmin.id,
      whatsapp: '628123456789',
      enableWhatsApp: true,
      enableMidtrans: true,
      enableManualTransfer: true,
      subscriptionPlan: 'PRO',
      themeColor: '#000000'
    }
  });

  console.log('Created/Updated Store:', store.slug);

  // 3. Create Basic Categories
  const categories = [
    { name: 'Hardware & Licence', slug: 'hardware-licence' },
    { name: 'Custom Tunes', slug: 'custom-tunes' },
    { name: 'Maintenance', slug: 'maintenance' }
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: {
        storeId_slug: {
          storeId: store.id,
          slug: cat.slug
        }
      },
      update: {},
      create: {
        name: cat.name,
        slug: cat.slug,
        storeId: store.id
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
