import { prisma } from "@/lib/prisma";

let ensuredOrderNotifications: Promise<void> | null = null;

export async function ensureOrderNotificationsSchema() {
  if (!ensuredOrderNotifications) {
    ensuredOrderNotifications = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "OrderNotification" (
          "id" SERIAL PRIMARY KEY,
          "storeId" INTEGER NOT NULL REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          "orderId" INTEGER NOT NULL REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          "source" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "body" TEXT NOT NULL,
          "readAt" TIMESTAMPTZ,
          "metadata" JSONB,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "OrderNotification_storeId_createdAt_idx"
        ON "OrderNotification" ("storeId", "createdAt");
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "OrderNotification_storeId_readAt_idx"
        ON "OrderNotification" ("storeId", "readAt");
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "OrderNotification_orderId_idx"
        ON "OrderNotification" ("orderId");
      `);
    })().catch(() => {});
  }

  await ensuredOrderNotifications;
}

export async function createOrderNotification(input: {
  storeId: number;
  orderId: number;
  source: string;
  title: string;
  body: string;
  metadata?: any;
}) {
  await ensureOrderNotificationsSchema();
  return await prisma.orderNotification.create({
    data: {
      storeId: input.storeId,
      orderId: input.orderId,
      source: input.source,
      title: input.title,
      body: input.body,
      metadata: input.metadata ?? undefined
    }
  });
}

