'use server';

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

let ensuredPlatformSettingsSchema: Promise<void> | null = null;

async function ensurePlatformSettingsSchema() {
  if (!ensuredPlatformSettingsSchema) {
    ensuredPlatformSettingsSchema = (async () => {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "PlatformSettings"
        ADD COLUMN IF NOT EXISTS "biteshipApiKey" TEXT;
      `);
    })().catch((error) => {
      console.error("ensurePlatformSettingsSchema error:", error);
    });
  }
  await ensuredPlatformSettingsSchema;
}

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);
  const user = (session as any)?.user;
  if (!session || user?.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function getAllStores() {
  try {
    await requireSuperAdmin();
    const stores = await prisma.store.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        isOpen: true,
        subscriptionPlan: true,
        balance: true,
        createdAt: true,
        owner: {
          select: {
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            orders: true,
            products: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return stores;
  } catch (error) {
    console.error('Error fetching all stores:', error);
    return [];
  }
}

export async function updateStorePlan(storeId: number, plan: string, fee: number) {
  try {
    await requireSuperAdmin();
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { slug: true } });
    const updated = await prisma.store.update({
      where: { id: storeId },
      data: {
        subscriptionPlan: plan,
        transactionFeePercent: fee,
        ...(plan !== "ENTERPRISE" || store?.slug === "demo"
          ? {
              whatsappToken: null,
              whatsappPhoneId: null,
              // Do NOT clear payment keys for non-enterprise, as we now want them to have keys
              // But wait, if they downgrade to FREE (Registered), do we want to clear them?
              // The user said "remove pro totally", so now we have ENTERPRISE (default) and FREE.
              // If they are FREE, they should probably still use platform keys, which means their local keys should be null?
              // YES. If plan is NOT Enterprise, we clear local keys so they fallback to platform.
              // BUT we just implemented "Copy Platform Keys to Store" logic for new stores.
              // So if we clear them here, we break that logic.
              // So we should NOT clear them anymore.
              // Let's remove this block entirely or just clear whatsapp if needed.
              // actually, for safety, let's just NOT clear anything when changing plans for now, 
              // to prevent accidental data loss of keys.
            }
          : {})
      }
    });
    return { success: true, data: updated };
  } catch (error) {
    console.error('Error updating store plan:', error);
    return { success: false, error: 'Failed to update plan' };
  }
}

export async function getAllUsers() {
  try {
    await requireSuperAdmin();
    return await prisma.user.findMany({
      include: { stores: true },
      orderBy: { createdAt: 'desc' }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
}

export async function getPlatformSettings() {
  try {
    await requireSuperAdmin();
    await ensurePlatformSettingsSchema();
    return await prisma.platformSettings.findUnique({ where: { key: "default" } });
  } catch (error) {
    console.error("Error fetching platform settings:", error);
    return null;
  }
}

export async function updatePlatformSettings(data: {
  whatsappToken?: string;
  whatsappPhoneId?: string;
  midtransServerKey?: string;
  midtransClientKey?: string;
  xenditSecretKey?: string;
  biteshipApiKey?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  subscriptionServerKey?: string;
  subscriptionClientKey?: string;
}) {
  try {
    await requireSuperAdmin();
    await ensurePlatformSettingsSchema();
    
    const updated = await prisma.platformSettings.upsert({
      where: { key: "default" },
      update: {
        whatsappToken: data.whatsappToken || null,
        whatsappPhoneId: data.whatsappPhoneId || null,
        midtransServerKey: data.midtransServerKey || null,
        midtransClientKey: data.midtransClientKey || null,
        xenditSecretKey: data.xenditSecretKey || null,
        biteshipApiKey: data.biteshipApiKey || null,
        bankName: data.bankName || null,
        bankAccountNumber: data.bankAccountNumber || null,
        bankAccountName: data.bankAccountName || null,
        subscriptionServerKey: data.subscriptionServerKey || null,
        subscriptionClientKey: data.subscriptionClientKey || null
      },
      create: {
        key: "default",
        whatsappToken: data.whatsappToken || null,
        whatsappPhoneId: data.whatsappPhoneId || null,
        midtransServerKey: data.midtransServerKey || null,
        midtransClientKey: data.midtransClientKey || null,
        xenditSecretKey: data.xenditSecretKey || null,
        biteshipApiKey: data.biteshipApiKey || null,
        bankName: data.bankName || null,
        bankAccountNumber: data.bankAccountNumber || null,
        bankAccountName: data.bankAccountName || null,
        subscriptionServerKey: data.subscriptionServerKey || null,
        subscriptionClientKey: data.subscriptionClientKey || null
      }
    });
    return { success: true, data: updated };
  } catch (error) {
    console.error('[PLATFORM_SETTINGS_ERROR]', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update settings' };
  }
}

export async function deleteStore(storeId: number) {
  try {
    await requireSuperAdmin();
    await prisma.store.delete({ where: { id: storeId } });
    return { success: true };
  } catch (error) {
    console.error('Error deleting store:', error);
    return { success: false, error: 'Failed to delete store' };
  }
}

export async function getAllWithdrawals() {
  try {
    await requireSuperAdmin();
    return await prisma.withdrawal.findMany({
      include: { store: true },
      orderBy: { createdAt: 'desc' }
    });
  } catch (error) {
    console.error('Error fetching all withdrawals:', error);
    return [];
  }
}

export async function updateWithdrawalStatus(id: number, status: string) {
  try {
    await requireSuperAdmin();
    
    if (status === 'REJECTED') {
      // Return balance to store
      const withdrawal = await prisma.withdrawal.findUnique({ where: { id } });
      if (withdrawal) {
        await prisma.store.update({
          where: { id: withdrawal.storeId },
          data: { balance: { increment: withdrawal.amount } }
        });
      }
    }

    const updated = await prisma.withdrawal.update({
      where: { id },
      data: { status }
    });
    return { success: true, data: updated };
  } catch (error) {
    console.error('Error updating withdrawal status:', error);
    return { success: false, error: 'Failed to update status' };
  }
}
