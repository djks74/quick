import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as {
  prismaV2: PrismaClient | undefined;
};

const rawDatabaseUrl = process.env.DATABASE_URL;
const databaseUrl =
  rawDatabaseUrl && !rawDatabaseUrl.includes("connection_limit=")
    ? `${rawDatabaseUrl}${rawDatabaseUrl.includes("?") ? "&" : "?"}connection_limit=1`
    : rawDatabaseUrl;

export const prisma =
  globalForPrisma.prismaV2 ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["query", "error", "warn"],
    datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined
  });

globalForPrisma.prismaV2 = prisma;
