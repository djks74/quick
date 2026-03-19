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
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "biteshipApiKey" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "biteshipOriginAreaId" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "biteshipOriginLat" DOUBLE PRECISION;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "biteshipOriginLng" DOUBLE PRECISION;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "shippingEnableJne" BOOLEAN NOT NULL DEFAULT false;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "shippingEnableGosend" BOOLEAN NOT NULL DEFAULT false;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "shippingJneOnly" BOOLEAN NOT NULL DEFAULT false;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "shippingEnableStoreCourier" BOOLEAN NOT NULL DEFAULT false;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "shippingStoreCourierFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "enableTakeawayDelivery" BOOLEAN NOT NULL DEFAULT true;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "shippingSenderName" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "shippingSenderPhone" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "shippingSenderAddress" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "shippingSenderPostalCode" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "waLowCreditAlertSentAt" TIMESTAMP(3);
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "waCriticalCreditAlertSentAt" TIMESTAMP(3);
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Order"
        ADD COLUMN IF NOT EXISTS "orderType" TEXT NOT NULL DEFAULT 'DINE_IN';
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Order"
        ADD COLUMN IF NOT EXISTS "biteshipOrderId" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Order"
        ADD COLUMN IF NOT EXISTS "shippingProvider" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Order"
        ADD COLUMN IF NOT EXISTS "shippingService" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Order"
        ADD COLUMN IF NOT EXISTS "shippingStatus" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Order"
        ADD COLUMN IF NOT EXISTS "shippingTrackingNo" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Order"
        ADD COLUMN IF NOT EXISTS "shippingAddress" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Order"
        ADD COLUMN IF NOT EXISTS "shippingCost" DOUBLE PRECISION NOT NULL DEFAULT 0;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Order"
        ADD COLUMN IF NOT EXISTS "shippingEta" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "WhatsAppSession"
        ADD COLUMN IF NOT EXISTS "metadata" JSONB;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Order"
        ADD COLUMN IF NOT EXISTS "notes" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "webhookUrl" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "customGeminiKey" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "apiKey" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "Store_apiKey_key" ON "Store"("apiKey");
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Product"
        ADD COLUMN IF NOT EXISTS "externalId" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "Product_externalId_key" ON "Product"("externalId");
      `);
    })().catch((error) => {
      console.error("ensureStoreSettingsSchema error:", error);
    });
  }
  await ensuredStoreSettingsSchema;
}
