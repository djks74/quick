import { prisma } from "@/lib/prisma";

let ensuredOrderNotificationsSchemaV3: Promise<void> | null = null;

export async function ensureOrderNotificationsSchema() {
  if (!ensuredOrderNotificationsSchemaV3) {
    ensuredOrderNotificationsSchemaV3 = (async () => {
      console.log("[DB_PATCH] Running OrderNotification schema check V3...");
      
      const commands = [
        `CREATE TABLE IF NOT EXISTS "OrderNotification" (
          "id" SERIAL PRIMARY KEY,
          "storeId" INTEGER NOT NULL REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          "orderId" INTEGER NOT NULL REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          "message" TEXT NOT NULL DEFAULT '',
          "type" TEXT NOT NULL DEFAULT 'NEW_ORDER',
          "isRead" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
        `ALTER TABLE "OrderNotification" ADD COLUMN IF NOT EXISTS "message" TEXT NOT NULL DEFAULT ''`,
        `ALTER TABLE "OrderNotification" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'NEW_ORDER'`,
        `ALTER TABLE "OrderNotification" ADD COLUMN IF NOT EXISTS "isRead" BOOLEAN NOT NULL DEFAULT false`,
        `CREATE INDEX IF NOT EXISTS "OrderNotification_storeId_isRead_idx" ON "OrderNotification" ("storeId", "isRead")`,
        `CREATE INDEX IF NOT EXISTS "OrderNotification_orderId_idx" ON "OrderNotification" ("orderId")`
      ];

      for (const cmd of commands) {
        await prisma.$executeRawUnsafe(cmd).catch(err => {
          if (!err.message.includes("already exists")) {
            console.error("[DB_PATCH_ERROR] Failed command:", cmd, err);
          }
        });
      }

      console.log("[DB_PATCH] OrderNotification schema patched successfully ✅");
    })().catch((err) => {
      console.error("[DB_PATCH_ERROR] OrderNotification schema patch failed ❌", err);
      ensuredOrderNotificationsSchemaV2 = null;
    });
  }
  await ensuredOrderNotificationsSchemaV2;
}

export async function createOrderNotification(input: {
  storeId: number;
  orderId: number;
  message: string;
  type?: string;
}) {
  await ensureOrderNotificationsSchema();
  return await prisma.orderNotification.create({
    data: {
      storeId: input.storeId,
      orderId: input.orderId,
      message: input.message,
      type: input.type ?? "NEW_ORDER"
    }
  });
}

