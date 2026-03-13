import { prisma } from "@/lib/prisma";

let ensuredStoreSettingsSchema: Promise<void> | null = null;

export async function ensureStoreSettingsSchema() {
  if (!ensuredStoreSettingsSchema) {
    ensuredStoreSettingsSchema = (async () => {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "posPaymentMethods" JSONB NOT NULL DEFAULT '[]'::jsonb;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Order"
        ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
      `);
    })().catch(() => {});
  }
  await ensuredStoreSettingsSchema;
}
