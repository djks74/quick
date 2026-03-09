import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as {
  prismaV2: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prismaV2 ??
  new PrismaClient({
    log: ['query', 'error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaV2 = prisma;
