import { prisma } from "@/lib/prisma";

let ensuredStoreSettingsSchemaV5: Promise<void> | null = null;

export async function ensureStoreSettingsSchema() {
  if (!ensuredStoreSettingsSchemaV5) {
    ensuredStoreSettingsSchemaV5 = (async () => {
      console.log("[DB_PATCH] Running StoreSettings schema check V5...");
      
      const commands = [
        `ALTER TABLE "Store"
         ADD COLUMN IF NOT EXISTS "posPaymentMethods" JSONB NOT NULL DEFAULT '[]'::jsonb,
         ADD COLUMN IF NOT EXISTS "biteshipApiKey" TEXT,
         ADD COLUMN IF NOT EXISTS "biteshipOriginAreaId" TEXT,
         ADD COLUMN IF NOT EXISTS "biteshipOriginLat" DOUBLE PRECISION,
         ADD COLUMN IF NOT EXISTS "biteshipOriginLng" DOUBLE PRECISION,
         ADD COLUMN IF NOT EXISTS "shippingEnableJne" BOOLEAN NOT NULL DEFAULT false,
         ADD COLUMN IF NOT EXISTS "shippingEnableGosend" BOOLEAN NOT NULL DEFAULT false,
         ADD COLUMN IF NOT EXISTS "shippingJneOnly" BOOLEAN NOT NULL DEFAULT false,
         ADD COLUMN IF NOT EXISTS "shippingEnableStoreCourier" BOOLEAN NOT NULL DEFAULT false,
         ADD COLUMN IF NOT EXISTS "shippingStoreCourierFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
         ADD COLUMN IF NOT EXISTS "enableTakeawayDelivery" BOOLEAN NOT NULL DEFAULT true,
         ADD COLUMN IF NOT EXISTS "shippingSenderName" TEXT,
         ADD COLUMN IF NOT EXISTS "shippingSenderPhone" TEXT,
         ADD COLUMN IF NOT EXISTS "shippingSenderAddress" TEXT,
         ADD COLUMN IF NOT EXISTS "shippingSenderPostalCode" TEXT,
         ADD COLUMN IF NOT EXISTS "waLowCreditAlertSentAt" TIMESTAMP(3),
         ADD COLUMN IF NOT EXISTS "waCriticalCreditAlertSentAt" TIMESTAMP(3),
         ADD COLUMN IF NOT EXISTS "webhookUrl" TEXT,
         ADD COLUMN IF NOT EXISTS "lastSyncAt" TIMESTAMP(3),
         ADD COLUMN IF NOT EXISTS "customGeminiKey" TEXT,
         ADD COLUMN IF NOT EXISTS "apiKey" TEXT,
         ADD COLUMN IF NOT EXISTS "corporateName" TEXT,
         ADD COLUMN IF NOT EXISTS "enableAiChatWidget" BOOLEAN NOT NULL DEFAULT true`,

        `CREATE UNIQUE INDEX IF NOT EXISTS "Store_apiKey_key" ON "Store"("apiKey")`,

        `ALTER TABLE "Order"
         ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
         ADD COLUMN IF NOT EXISTS "orderType" TEXT NOT NULL DEFAULT 'DINE_IN',
         ADD COLUMN IF NOT EXISTS "biteshipOrderId" TEXT,
         ADD COLUMN IF NOT EXISTS "shippingProvider" TEXT,
         ADD COLUMN IF NOT EXISTS "shippingService" TEXT,
         ADD COLUMN IF NOT EXISTS "shippingStatus" TEXT,
         ADD COLUMN IF NOT EXISTS "shippingTrackingNo" TEXT,
         ADD COLUMN IF NOT EXISTS "shippingAddress" TEXT,
         ADD COLUMN IF NOT EXISTS "shippingCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
         ADD COLUMN IF NOT EXISTS "shippingEta" TEXT,
         ADD COLUMN IF NOT EXISTS "notes" TEXT,
         ADD COLUMN IF NOT EXISTS "destinationLat" DOUBLE PRECISION,
         ADD COLUMN IF NOT EXISTS "destinationLng" DOUBLE PRECISION`,

        `ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "metadata" JSONB`,

        `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "externalId" TEXT`,

        `DROP INDEX IF EXISTS "Product_externalId_key"`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "Product_storeId_externalId_key" ON "Product"("storeId", "externalId")`,

        `CREATE INDEX IF NOT EXISTS "Order_storeId_createdAt_idx" ON "Order"("storeId", "createdAt")`,
        `CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status")`,
        `CREATE INDEX IF NOT EXISTS "Product_storeId_idx" ON "Product"("storeId")`,
        `CREATE INDEX IF NOT EXISTS "Product_category_idx" ON "Product"("category")`
      ];

      for (const cmd of commands) {
        await prisma.$executeRawUnsafe(cmd).catch(err => {
          if (!err.message.includes("already exists")) throw err;
        });
      }

      console.log("[DB_PATCH] StoreSettings schema patched successfully ✅");
    })().catch((error) => {
      console.error("[DB_PATCH_ERROR] StoreSettings schema patch failed ❌", error);
      ensuredStoreSettingsSchemaV5 = null;
    });
  }
  await ensuredStoreSettingsSchemaV5;
}
