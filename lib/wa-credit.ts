import { prisma } from "@/lib/prisma";

export const WA_LOW_CREDIT_THRESHOLD = 10000;
export const WA_BUNDLE_PLATFORM_FEE = 150000;
export const WA_PLATFORM_COST_PER_MESSAGE = 150;

let ensuredWaCreditSchemaV2: Promise<void> | null = null;

export async function ensureWaCreditSchema() {
  if (!ensuredWaCreditSchemaV2) {
    ensuredWaCreditSchemaV2 = (async () => {
      console.log("[DB_PATCH] Running WaCredit schema check...");
      
      const commands = [
        `ALTER TABLE "Store"
         ADD COLUMN IF NOT EXISTS "waBalance" DOUBLE PRECISION NOT NULL DEFAULT 50000,
         ADD COLUMN IF NOT EXISTS "waPricePerMessage" DOUBLE PRECISION NOT NULL DEFAULT 350,
         ADD COLUMN IF NOT EXISTS "waLowCreditAlertSentAt" TIMESTAMPTZ,
         ADD COLUMN IF NOT EXISTS "waCriticalCreditAlertSentAt" TIMESTAMPTZ,
         ADD COLUMN IF NOT EXISTS "corporateName" TEXT`,

        `ALTER TABLE "Store" ALTER COLUMN "waBalance" SET DEFAULT 50000`,

        `CREATE TABLE IF NOT EXISTS "WaUsageLog" (
          "id" SERIAL PRIMARY KEY,
          "storeId" INTEGER NOT NULL REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          "type" TEXT NOT NULL,
          "amount" DOUBLE PRECISION NOT NULL,
          "category" TEXT DEFAULT 'utility',
          "estimatedMetaCost" DOUBLE PRECISION DEFAULT ${WA_PLATFORM_COST_PER_MESSAGE},
          "description" TEXT NOT NULL,
          "balanceAfter" DOUBLE PRECISION NOT NULL,
          "externalRef" TEXT,
          "messageId" TEXT,
          "messageStatus" TEXT,
          "refundedAt" TIMESTAMPTZ,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,

        `ALTER TABLE "WaUsageLog" 
         ADD COLUMN IF NOT EXISTS "category" TEXT DEFAULT 'utility',
         ADD COLUMN IF NOT EXISTS "estimatedMetaCost" DOUBLE PRECISION DEFAULT ${WA_PLATFORM_COST_PER_MESSAGE}`,

        `CREATE INDEX IF NOT EXISTS "WaUsageLog_storeId_createdAt_idx" ON "WaUsageLog" ("storeId", "createdAt")`,
        `CREATE INDEX IF NOT EXISTS "WaUsageLog_externalRef_idx" ON "WaUsageLog" ("externalRef")`,
        `CREATE INDEX IF NOT EXISTS "WaUsageLog_messageId_idx" ON "WaUsageLog" ("messageId")`,

        `CREATE TABLE IF NOT EXISTS "PlatformWaUsageLog" (
          "id" SERIAL PRIMARY KEY,
          "type" TEXT NOT NULL,
          "toPhone" TEXT NOT NULL,
          "relatedStoreId" INTEGER,
          "description" TEXT NOT NULL,
          "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT ${WA_PLATFORM_COST_PER_MESSAGE},
          "metadata" JSONB,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,

        `CREATE INDEX IF NOT EXISTS "PlatformWaUsageLog_createdAt_idx" ON "PlatformWaUsageLog" ("createdAt")`,
        `CREATE INDEX IF NOT EXISTS "PlatformWaUsageLog_relatedStoreId_idx" ON "PlatformWaUsageLog" ("relatedStoreId")`
      ];

      for (const cmd of commands) {
        await prisma.$executeRawUnsafe(cmd).catch(err => {
          if (!err.message.includes("already exists")) throw err;
        });
      }

      // Initialize welcome credits for stores that haven't received them yet
      const eligibleStores = await prisma.store.findMany({
        where: {
          waBalance: { lte: 0 },
          waUsageLogs: { none: {} }
        },
        select: { id: true, subscriptionPlan: true }
      }).catch(() => []);

      if (eligibleStores.length > 0) {
        for (const store of eligibleStores) {
          await prisma.$transaction(async (tx) => {
            let welcomeCredit = 0;
            const plan = store.subscriptionPlan;
            if (plan === 'PRO') welcomeCredit = 10000;
            else if (plan === 'ENTERPRISE') welcomeCredit = 25000;
            else if (plan === 'SOVEREIGN') welcomeCredit = 50000;

            if (welcomeCredit > 0) {
              await tx.store.update({
                where: { id: store.id },
                data: { waBalance: welcomeCredit }
              });
              await tx.waUsageLog.create({
                data: {
                  storeId: store.id,
                  type: 'TOPUP',
                  amount: welcomeCredit,
                  description: `Welcome credit for ${plan} plan`,
                  balanceAfter: welcomeCredit
                }
              });
            }
          });
        }
      }
      console.log("[DB_PATCH] WaCredit schema patched successfully ✅");
    })().catch((err) => {
      console.error("[DB_PATCH_ERROR] WaCredit schema patch failed ❌", err);
      ensuredWaCreditSchemaV2 = null; // Allow retry on failure
    });
  }

  await ensuredWaCreditSchemaV2;
}

export async function reserveWaCreditForMessage(storeId: number, description: string, externalRef: string, options?: { amount?: number; category?: string; metaCost?: number }) {
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

    const resolvedAmount = options?.amount ?? store.waPricePerMessage ?? 350;
    const cost = Math.max(1, Number(resolvedAmount.toFixed(2)));
    
    // Resolve Meta cost based on category and platform settings
    let metaCost = options?.metaCost;
    if (metaCost === undefined) {
      const platform = await tx.platformSettings.findUnique({ where: { key: "default" } }).catch(() => null);
      const category = options?.category || "utility";
      if (category === "marketing") metaCost = platform?.waRateMarketing ?? 2000;
      else if (category === "authentication") metaCost = platform?.waRateAuthentication ?? 300;
      else if (category === "service") metaCost = platform?.waRateService ?? 0;
      else metaCost = platform?.waRateUtility ?? 350;
    }
    
    const changed = await tx.store.updateMany({
      where: { id: storeId, waBalance: { gte: cost } },
      data: { waBalance: { decrement: cost } }
    });
    if (!changed.count) {
      const criticalLastAlert = store.waCriticalCreditAlertSentAt;
      const shouldCriticalAlert = !criticalLastAlert || now.getTime() - new Date(criticalLastAlert).getTime() > 2 * 60 * 60 * 1000;
      if (shouldCriticalAlert) {
        await tx.store.update({
          where: { id: storeId },
          data: { waCriticalCreditAlertSentAt: now }
        });
      }
      return {
        ok: false as const,
        reason: "INSUFFICIENT_BALANCE",
        balance: store.waBalance,
        cost,
        shouldAlert: shouldCriticalAlert,
        alertLevel: "CRITICAL" as const,
        alertPhone: store.whatsapp || store.owner?.phoneNumber || null,
        storeSlug: store.slug
      };
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
        category: options?.category || "utility",
        estimatedMetaCost: metaCost,
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

export async function logPlatformWaUsage(input: {
  type: string;
  toPhone: string;
  description: string;
  relatedStoreId?: number | null;
  category?: string;
  estimatedCost?: number;
  metadata?: any;
}) {
  await ensureWaCreditSchema();
  const normalizedTo = String(input.toPhone || "").replace(/\D/g, "");
  if (!normalizedTo) return;
  
  let cost = input.estimatedCost;
  if (cost === undefined) {
    const platform = await prisma.platformSettings.findUnique({ where: { key: "default" } }).catch(() => null);
    const category = input.category || "utility";
    if (category === "marketing") cost = platform?.waRateMarketing ?? 2000;
    else if (category === "authentication") cost = platform?.waRateAuthentication ?? 300;
    else if (category === "service") cost = platform?.waRateService ?? 0;
    else cost = platform?.waRateUtility ?? 350;
  }

  const payload = input.metadata ? JSON.stringify(input.metadata) : null;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "PlatformWaUsageLog" ("type","toPhone","relatedStoreId","description","estimatedCost","metadata") VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    input.type,
    normalizedTo,
    input.relatedStoreId ?? null,
    input.description,
    Number(cost),
    payload
  ).catch(() => null);
}

export async function getPlatformWaUsageSummary(days: number = 30) {
  await ensureWaCreditSchema();
  const safeDays = Math.max(1, Math.floor(days || 30));
  const rows = await prisma.$queryRawUnsafe<Array<{ count: number; cost: number }>>(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM("estimatedCost"), 0)::float AS cost
     FROM "PlatformWaUsageLog"
     WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 day')`,
    safeDays
  ).catch(() => []);
  const row = rows?.[0] || { count: 0, cost: 0 };
  return { count: Number(row.count || 0), cost: Number(row.cost || 0), days: safeDays };
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

export const grantBundleCredit = async (storeId: number, externalRef: string, plan?: string) => {
  await ensureWaCreditSchema();
  const targetPlan = (plan || 'ENTERPRISE').toUpperCase();
  
  let creditAmount = 25000; // Default ENTERPRISE
  if (targetPlan === 'PRO') creditAmount = 10000;
  if (targetPlan === 'SOVEREIGN') creditAmount = 50000;
  if (targetPlan === 'CORPORATE') creditAmount = 100000;

  return prisma.$transaction(async (tx) => {
    const already = await tx.waUsageLog.findFirst({
      where: { externalRef, type: "BUNDLE_CREDIT" }
    });
    if (already) return true;

    const updated = await tx.store.update({
      where: { id: storeId },
      data: {
        waBalance: { increment: creditAmount },
        waPricePerMessage: 350
      },
      select: { waBalance: true }
    });

    await tx.waUsageLog.create({
      data: {
        storeId,
        type: "BUNDLE_CREDIT",
        amount: creditAmount,
        description: `${targetPlan} Plan included WhatsApp credit`,
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
    lowCreditThreshold: WA_LOW_CREDIT_THRESHOLD,
    recentLogs
  };
}

export async function getGlobalWaUsage() {
  await ensureWaCreditSchema();
  const [totalBalance, totalUsageCount, totalTopup, metaCostStats] = await Promise.all([
    prisma.store.aggregate({ _sum: { waBalance: true } }),
    prisma.waUsageLog.count({ where: { type: "DEDUCTION" } }),
    prisma.waUsageLog.aggregate({ _sum: { amount: true }, where: { type: "TOPUP" } }),
    prisma.waUsageLog.aggregate({ _sum: { estimatedMetaCost: true }, where: { type: "DEDUCTION" } })
  ]);

  const recentLogs = await prisma.waUsageLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { store: { select: { name: true, slug: true, corporateName: true } } }
  });

  const estimatedCost = metaCostStats._sum.estimatedMetaCost || (totalUsageCount * 150);

  return {
    totalBalance: totalBalance._sum.waBalance || 0,
    totalUsageCount,
    totalTopup: totalTopup._sum.amount || 0,
    estimatedCost,
    recentLogs
  };
}

export async function getDetailedWaUsageByStore() {
  await ensureWaCreditSchema();
  const stores = await prisma.store.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      corporateName: true,
      waBalance: true,
      waUsageLogs: {
        where: { type: "DEDUCTION" },
        select: {
          amount: true,
          estimatedMetaCost: true
        }
      }
    }
  });

  return stores.map(store => {
    const usageCount = store.waUsageLogs.length;
    const totalRevenue = store.waUsageLogs.reduce((acc, log) => acc + Math.abs(log.amount), 0);
    const totalMetaCost = store.waUsageLogs.reduce((acc, log) => acc + (log.estimatedMetaCost || 150), 0);
    const profit = totalRevenue - totalMetaCost;

    return {
      id: store.id,
      name: store.name,
      slug: store.slug,
      corporateName: store.corporateName || "Independent",
      balance: store.waBalance,
      usageCount,
      totalRevenue,
      totalMetaCost,
      profit
    };
  });
}
