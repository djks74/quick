import { prisma } from "@/lib/prisma";

let ensuredOrderNotificationsSchema: Promise<void> | null = null;

export async function ensureOrderNotificationsSchema() {
  if (!ensuredOrderNotificationsSchema) {
    ensuredOrderNotificationsSchema = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "OrderNotification" (
          "id" SERIAL PRIMARY KEY,
          "storeId" INTEGER NOT NULL REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          "orderId" INTEGER NOT NULL REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          "message" TEXT NOT NULL,
          "type" TEXT NOT NULL DEFAULT 'NEW_ORDER',
          "isRead" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "OrderNotification_storeId_isRead_idx" ON "OrderNotification" ("storeId", "isRead");
        CREATE INDEX IF NOT EXISTS "OrderNotification_orderId_idx" ON "OrderNotification" ("orderId");
      `);
    })().catch((err) => {
      console.error("ensureOrderNotificationsSchema error:", err);
      ensuredOrderNotificationsSchema = null;
    });
  }
  await ensuredOrderNotificationsSchema;
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

