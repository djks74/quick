'use server';

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
      include: { owner: true, _count: { select: { orders: true, products: true } } },
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
              paymentGatewaySecret: null,
              paymentGatewayClientKey: null,
              bankAccount: Prisma.DbNull
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
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
}) {
  await requireSuperAdmin();
  const updated = await prisma.platformSettings.upsert({
    where: { key: "default" },
    update: {
      whatsappToken: data.whatsappToken || null,
      whatsappPhoneId: data.whatsappPhoneId || null,
      midtransServerKey: data.midtransServerKey || null,
      midtransClientKey: data.midtransClientKey || null,
      xenditSecretKey: data.xenditSecretKey || null,
      bankName: data.bankName || null,
      bankAccountNumber: data.bankAccountNumber || null,
      bankAccountName: data.bankAccountName || null
    },
    create: {
      key: "default",
      whatsappToken: data.whatsappToken || null,
      whatsappPhoneId: data.whatsappPhoneId || null,
      midtransServerKey: data.midtransServerKey || null,
      midtransClientKey: data.midtransClientKey || null,
      xenditSecretKey: data.xenditSecretKey || null,
      bankName: data.bankName || null,
      bankAccountNumber: data.bankAccountNumber || null,
      bankAccountName: data.bankAccountName || null
    }
  });
  return { success: true, data: updated };
}
