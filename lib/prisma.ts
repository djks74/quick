
import { PrismaClient } from '@prisma/client';
import path from 'path';

const globalForPrisma = global as unknown as {
  prismaV2: PrismaClient | undefined;
};

// Ensure DATABASE_URL is available
if (!process.env.DATABASE_URL) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    console.log('Loading .env from:', envPath);
    const result = require('dotenv').config({ path: envPath });
    
    if (result.error) {
      console.error('Failed to load .env file:', result.error);
    } else {
      console.log('✅ Loaded environment variables from .env via dotenv');
    }
  } catch (e) {
    console.error('Failed to load .env file:', e);
  }
}

const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/trader_db";
console.log('Using Database URL:', dbUrl);

const prismaClientOptions = {
  log: ['query', 'error', 'warn'] as any[],
  datasources: {
    db: {
      url: dbUrl,
    },
  },
};

export const prisma =
  globalForPrisma.prismaV2 ??
  new PrismaClient(prismaClientOptions);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaV2 = prisma;
