import { prisma } from "@/lib/prisma";

export const WA_LOW_CREDIT_THRESHOLD = 10000;
export const WA_BUNDLE_PLATFORM_FEE = 150000;
export const WA_DEFAULT_WELCOME_CREDIT = 50000;
export const WA_BUNDLE_INCLUDED_CREDIT = WA_DEFAULT_WELCOME_CREDIT;

let ensuredWaCreditSchema: Promise<void> | null = null;

export async function ensureWaCreditSchema() {
  if (!ensuredWaCreditSchema) {
    ensuredWaCreditSchema = (async () => {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "waBalance" DOUBLE PRECISION NOT NULL DEFAULT 50000;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ALTER COLUMN "waBalance" SET DEFAULT 50000;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "waPricePerMessage" DOUBLE PRECISION NOT NULL DEFAULT 350;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "waLowCreditAlertSentAt" TIMESTAMPTZ;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Store"
        ADD COLUMN IF NOT EXISTS "waCriticalCreditAlertSentAt" TIMESTAMPTZ;
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "WaUsageLog" (
          "id" SERIAL PRIMARY KEY,
          "storeId" INTEGER NOT NULL REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          "type" TEXT NOT NULL,
          "amount" DOUBLE PRECISION NOT NULL,
          "description" TEXT NOT NULL,
          "balanceAfter" DOUBLE PRECISION NOT NULL,
          "externalRef" TEXT,
          "messageId" TEXT,
          "messageStatus" TEXT,
          "refundedAt" TIMESTAMPTZ,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "WaUsageLog_storeId_createdAt_idx"
        ON "WaUsageLog" ("storeId", "createdAt");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "WaUsageLog_externalRef_idx"
        ON "WaUsageLog" ("externalRef");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "WaUsageLog_messageId_idx"
        ON "WaUsageLog" ("messageId");
      `);

      const eligibleStores = await prisma.store.findMany({
        where: {
          waBalance: { lte: 0 },
          waUsageLogs: {
            none: {}
          }
        },
        select: {
          id: true
        }
      }).catch(() => []);

      for (const store of eligibleStores) {
        await prisma.$transaction(async (tx) => {
          const updated = await tx.store.update({
            where: { id: store.id },
            data: { waBalance: WA_DEFAULT_WELCOME_CREDIT },
            select: { waBalance: true }
          });

          await tx.waUsageLog.create({
            data: {
              storeId: store.id,
              type: "WELCOME_CREDIT",
              amount: WA_DEFAULT_WELCOME_CREDIT,
              description: "Default WhatsApp credit",
              balanceAfter: Number((updated.waBalance || 0).toFixed(2)),
              externalRef: `WELCOME-${store.id}`
            }
          });
        }).catch(() => null);
      }
    })().catch(() => {});
  }
  await ensuredWaCreditSchema;
}

export async function reserveWaCreditForMessage(storeId: number, description: string, externalRef: string, amount?: number) {
  await ensureWaCreditSchema();
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const store = await tx.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        slug: true,
        waBalance: true,
        waPricePerMessage: true,
        waLowCreditAlertSentAt: true,
        waCriticalCreditAlertSentAt: true,
        whatsapp: true,
        owner: { select: { phoneNumber: true } }
      }
    });
    if (!store) return { ok: false as const, reason: "STORE_NOT_FOUND" };

    const resolvedAmount = amount ?? store.waPricePerMessage ?? 350;
    const cost = Math.max(1, Number(resolvedAmount.toFixed(2)));
    const changed = await tx.store.updateMany({
      where: { id: storeId, waBalance: { gte: cost } },
      data: { waBalance: { decrement: cost } }
    });
    if (!changed.count) {
      return { ok: false as const, reason: "INSUFFICIENT_BALANCE", balance: store.waBalance, cost };
    }

    const updated = await tx.store.findUnique({
      where: { id: storeId },
      select: { waBalance: true, waLowCreditAlertSentAt: true, waCriticalCreditAlertSentAt: true, whatsapp: true, owner: { select: { phoneNumber: true } } }
    });
    const balanceAfter = Number((updated?.waBalance || 0).toFixed(2));
    const log = await tx.waUsageLog.create({
      data: {
        storeId,
        type: "DEDUCTION",
        amount: -cost,
        description,
        balanceAfter,
        externalRef,
        messageStatus: "pending"
      }
    });

    const criticalThreshold = cost * 5;
    const lowLastAlert = updated?.waLowCreditAlertSentAt;
    const criticalLastAlert = updated?.waCriticalCreditAlertSentAt;
    const shouldCriticalAlert = balanceAfter <= criticalThreshold && (!criticalLastAlert || now.getTime() - new Date(criticalLastAlert).getTime() > 2 * 60 * 60 * 1000);
    const shouldLowAlert = balanceAfter <= WA_LOW_CREDIT_THRESHOLD && (!lowLastAlert || now.getTime() - new Date(lowLastAlert).getTime() > 6 * 60 * 60 * 1000);
    const shouldAlert = shouldCriticalAlert || shouldLowAlert;
    if (shouldAlert) {
      await tx.store.update({
        where: { id: storeId },
        data: {
          waLowCreditAlertSentAt: shouldLowAlert ? now : updated?.waLowCreditAlertSentAt,
          waCriticalCreditAlertSentAt: shouldCriticalAlert ? now : updated?.waCriticalCreditAlertSentAt
        }
      });
    }

    return {
      ok: true as const,
      logId: log.id,
      cost,
      balanceAfter,
      shouldAlert,
      alertLevel: shouldCriticalAlert ? "CRITICAL" as const : shouldLowAlert ? "LOW" as const : null,
      alertPhone: updated?.whatsapp || updated?.owner?.phoneNumber || null,
      storeSlug: store.slug
    };
  });
}

export async function finalizeWaMessageLog(logId: number, messageId: string | null, status: string) {
  await ensureWaCreditSchema();
  await prisma.waUsageLog.update({
    where: { id: logId },
    data: {
      messageId: messageId || undefined,
      messageStatus: status
    }
  }).catch(() => null);
}

export async function refundWaUsageByMessageId(messageId: string, status: string) {
  await ensureWaCreditSchema();
  return prisma.$transaction(async (tx) => {
    const log = await tx.waUsageLog.findFirst({
      where: { messageId, type: "DEDUCTION", refundedAt: null },
      orderBy: { id: "desc" }
    });
    if (!log) return false;

    const refundAmount = Math.abs(log.amount);
    const updatedStore = await tx.store.update({
      where: { id: log.storeId },
      data: { waBalance: { increment: refundAmount } },
      select: { waBalance: true }
    });

    await tx.waUsageLog.update({
      where: { id: log.id },
      data: {
        refundedAt: new Date(),
        messageStatus: status
      }
    });

    await tx.waUsageLog.create({
      data: {
        storeId: log.storeId,
        type: "REFUND",
        amount: refundAmount,
        description: `Refund for undelivered message (${status})`,
        balanceAfter: Number((updatedStore.waBalance || 0).toFixed(2)),
        externalRef: log.externalRef,
        messageId: log.messageId,
        messageStatus: status
      }
    });

    return true;
  });
}

export async function applyWaTopup(storeId: number, amount: number, externalRef: string, description: string) {
  await ensureWaCreditSchema();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.waUsageLog.findFirst({
      where: { externalRef, type: "TOPUP" }
    });
    if (existing) return { duplicate: true, balanceAfter: existing.balanceAfter };

    const updated = await tx.store.update({
      where: { id: storeId },
      data: { waBalance: { increment: amount } },
      select: { waBalance: true }
    });

    await tx.waUsageLog.create({
      data: {
        storeId,
        type: "TOPUP",
        amount,
        description,
        balanceAfter: Number((updated.waBalance || 0).toFixed(2)),
        externalRef,
        messageStatus: "settlement"
      }
    });

    return { duplicate: false, balanceAfter: updated.waBalance };
  });
}

export async function grantBundleCredit(storeId: number, externalRef: string) {
  await ensureWaCreditSchema();
  return prisma.$transaction(async (tx) => {
    const already = await tx.waUsageLog.findFirst({
      where: { externalRef, type: "BUNDLE_CREDIT" }
    });
    if (already) return true;

    const updated = await tx.store.update({
      where: { id: storeId },
      data: {
        waBalance: { increment: WA_BUNDLE_INCLUDED_CREDIT },
        waPricePerMessage: 350
      },
      select: { waBalance: true }
    });

    await tx.waUsageLog.create({
      data: {
        storeId,
        type: "BUNDLE_PLATFORM_FEE",
        amount: -WA_BUNDLE_PLATFORM_FEE,
        description: "SME Bundle platform fee",
        balanceAfter: Number((updated.waBalance || 0).toFixed(2)),
        externalRef
      }
    });

    await tx.waUsageLog.create({
      data: {
        storeId,
        type: "BUNDLE_CREDIT",
        amount: WA_BUNDLE_INCLUDED_CREDIT,
        description: "SME Bundle included WhatsApp credit",
        balanceAfter: Number((updated.waBalance || 0).toFixed(2)),
        externalRef
      }
    });
    return true;
  });
}

export async function getWaUsageDashboard(storeId: number) {
  await ensureWaCreditSchema();
  const [store, recentLogs] = await Promise.all([
    prisma.store.findUnique({
      where: { id: storeId },
      select: { waBalance: true, waPricePerMessage: true }
    }),
    prisma.waUsageLog.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 20
    })
  ]);
  const pricePerMessage = Number((store?.waPricePerMessage || 350).toFixed(2));
  const balance = Number((store?.waBalance || 0).toFixed(2));
  const remainingMessages = Math.floor(balance / Math.max(1, pricePerMessage));
  return {
    balance,
    pricePerMessage,
    remainingMessages,
    defaultIncludedCredit: WA_DEFAULT_WELCOME_CREDIT,
    lowCreditThreshold: WA_LOW_CREDIT_THRESHOLD,
    recentLogs
  };
}
