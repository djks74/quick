
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  try {
    const stores = await prisma.store.findMany({
      select: {
        id: true,
        balance: true,
      }
    });
    console.log('Success: balance field is accessible');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();
