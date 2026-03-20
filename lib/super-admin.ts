'use server';

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ensureWaCreditSchema } from "@/lib/wa-credit";
import bcrypt from "bcryptjs";

import { revalidatePath } from 'next/cache';

let ensuredPlatformSettingsSchema: Promise<void> | null = null;

async function ensurePlatformSettingsSchema() {
  if (!ensuredPlatformSettingsSchema) {
    ensuredPlatformSettingsSchema = (async () => {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "PlatformSettings"
        ADD COLUMN IF NOT EXISTS "biteshipApiKey" TEXT,
        ADD COLUMN IF NOT EXISTS "geminiApiKey" TEXT;
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

export async function getAllStores(limit: number = 200) {
  try {
    await requireSuperAdmin();
    await ensureWaCreditSchema();
    const stores = await prisma.store.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        isOpen: true,
        subscriptionPlan: true,
        balance: true,
        waBalance: true,
        waPricePerMessage: true,
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
      orderBy: { createdAt: 'desc' },
      take: limit > 0 ? limit : undefined
    });
    return stores;
  } catch (error) {
    console.error('Error fetching all stores:', error);
    return [];
  }
}

export async function setStoreWaBalance(storeId: number, newBalance: number, reason?: string) {
  try {
    const user = await requireSuperAdmin();
    await ensureWaCreditSchema();

    const nextBalance = Number(newBalance);
    if (!Number.isFinite(nextBalance) || nextBalance < 0) {
      return { success: false as const, error: "Invalid balance" };
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, waBalance: true }
    });
    if (!store) return { success: false as const, error: "Store not found" };

    const prevBalance = Number(store.waBalance || 0);
    const delta = Number((nextBalance - prevBalance).toFixed(2));

    const externalRef = `ADMIN-WA-SET-${storeId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const description = String(reason || "").trim()
      ? `Admin set WA balance: ${reason}`
      : "Admin set WA balance";

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.store.update({
        where: { id: storeId },
        data: { waBalance: nextBalance },
        select: { waBalance: true }
      });
      await tx.waUsageLog.create({
        data: {
          storeId,
          type: "ADMIN_SET",
          amount: delta,
          description,
          balanceAfter: Number((s.waBalance || 0).toFixed(2)),
          externalRef,
          messageStatus: `by:${String(user?.email || user?.name || "super_admin")}`
        }
      });
      return s;
    });

    return { success: true as const, data: { waBalance: updated.waBalance } };
  } catch (error) {
    console.error("Error setting WA balance:", error);
    return { success: false as const, error: "Failed to update WA balance" };
  }
}

export async function updateStorePlan(storeId: number, plan: string, fee: number) {
  try {
    await requireSuperAdmin();
    console.log(`[SUPER_ADMIN] Updating store ${storeId} to plan ${plan} with fee ${fee}`);
    
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { slug: true } });
    
    const updated = await prisma.store.update({
      where: { id: storeId },
      data: {
        subscriptionPlan: plan,
        transactionFeePercent: Number.isFinite(fee) ? fee : 0,
        ...(plan !== "ENTERPRISE" && plan !== "SOVEREIGN" || store?.slug === "demo"
          ? {
              whatsappToken: null,
              whatsappPhoneId: null,
            }
          : {})
      }
    });
    
    console.log(`[SUPER_ADMIN] Successfully updated store ${storeId} to plan ${plan}`);
    
    revalidatePath('/super-admin');
    revalidatePath(`/${updated.slug}`);
    revalidatePath('/');
    
    return { success: true, data: JSON.parse(JSON.stringify(updated)) };
  } catch (error) {
    console.error('Error updating store plan:', error);
    return { success: false, error: 'Failed to update plan' };
  }
}

export async function getAllUsers(limit: number = 200) {
  try {
    await requireSuperAdmin();
    return await prisma.user.findMany({
      include: { 
        stores: true,
        workedAt: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit > 0 ? limit : undefined
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
}

export async function updateUser(userId: number, data: { name?: string, email?: string, role?: string, workedAtId?: number | null }) {
  try {
    await requireSuperAdmin();
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        email: data.email,
        role: data.role as any,
        workedAtId: data.workedAtId
      }
    });
    revalidatePath('/super-admin/users');
    return { success: true, data: updated };
  } catch (error) {
    console.error('Error updating user:', error);
    return { success: false, error: 'Failed to update user' };
  }
}

export async function resetUserPassword(userId: number, newPassword: string) {
  try {
    await requireSuperAdmin();
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });
    return { success: true };
  } catch (error) {
    console.error('Error resetting password:', error);
    return { success: false, error: 'Failed to reset password' };
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
  biteshipApiKey?: string;
  geminiApiKey?: string;
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
        biteshipApiKey: data.biteshipApiKey || null,
        geminiApiKey: data.geminiApiKey || null,
        subscriptionServerKey: data.subscriptionServerKey || null,
        subscriptionClientKey: data.subscriptionClientKey || null
      } as any,
      create: {
        key: "default",
        whatsappToken: data.whatsappToken || null,
        whatsappPhoneId: data.whatsappPhoneId || null,
        midtransServerKey: data.midtransServerKey || null,
        midtransClientKey: data.midtransClientKey || null,
        biteshipApiKey: data.biteshipApiKey || null,
        geminiApiKey: data.geminiApiKey || null,
        subscriptionServerKey: data.subscriptionServerKey || null,
        subscriptionClientKey: data.subscriptionClientKey || null
      } as any
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
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.$transaction(
          async (tx) => {
            await tx.orderNotification.deleteMany({ where: { storeId } });
            await tx.orderItem.deleteMany({ where: { order: { storeId } } });
            await tx.order.deleteMany({ where: { storeId } });
            await tx.productIngredient.deleteMany({
              where: {
                OR: [{ product: { storeId } }, { inventoryItem: { storeId } }]
              }
            });
            await tx.inventoryItem.deleteMany({ where: { storeId } });
            await tx.product.deleteMany({ where: { storeId } });
            await tx.category.deleteMany({ where: { storeId } });
            await tx.table.deleteMany({ where: { storeId } });
            await tx.withdrawal.deleteMany({ where: { storeId } });
            await tx.waUsageLog.deleteMany({ where: { storeId } });
            await tx.whatsAppSession.deleteMany({ where: { storeId } });
            await tx.store.delete({ where: { id: storeId } });
          },
          { maxWait: 15000, timeout: 120000 }
        );
        return { success: true };
      } catch (error: any) {
        lastError = error;
        if (error?.code === "P2028" && attempt < 2) {
          await wait(1000 * (attempt + 1));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  } catch (error) {
    console.error('Error deleting store:', error);
    return { success: false, error: 'Failed to delete store' };
  }
}

export async function getAllWithdrawals(limit: number = 200) {
  try {
    await requireSuperAdmin();
    return await prisma.withdrawal.findMany({
      include: { store: true },
      orderBy: { createdAt: 'desc' },
      take: limit > 0 ? limit : undefined
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
