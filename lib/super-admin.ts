'use server';

import { prisma } from "@/lib/prisma";

export async function getAllStores() {
  try {
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
    const updated = await prisma.store.update({
      where: { id: storeId },
      data: { subscriptionPlan: plan, transactionFeePercent: fee }
    });
    return { success: true, data: updated };
  } catch (error) {
    console.error('Error updating store plan:', error);
    return { success: false, error: 'Failed to update plan' };
  }
}

export async function getAllUsers() {
  try {
    return await prisma.user.findMany({
      include: { stores: true },
      orderBy: { createdAt: 'desc' }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
}
