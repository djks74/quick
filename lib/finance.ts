'use server';

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

async function requireMerchant(storeId: number) {
  const session = await getServerSession(authOptions);
  const user = (session as any)?.user;
  if (!session) throw new Error("Unauthorized");

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { ownerId: true }
  });

  const userId = Number(user?.id);
  const userStoreId = Number(user?.storeId);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isStoreOwner = store?.ownerId === userId;
  const isStoreUser = userStoreId === storeId;

  if (!store || (!isSuperAdmin && !isStoreOwner && !isStoreUser)) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requestWithdrawal(data: {
  storeId: number;
  amount: number;
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
}) {
  try {
    await requireMerchant(data.storeId);
    
    // Check balance
    const store = await prisma.store.findUnique({
      where: { id: data.storeId },
      select: { balance: true }
    });

    if (!store || store.balance < data.amount) {
      return { success: false, error: "Insufficient balance" };
    }

    // Create withdrawal and deduct balance
    const result = await prisma.$transaction([
      prisma.withdrawal.create({
        data: {
          storeId: data.storeId,
          amount: data.amount,
          bankName: data.bankName,
          bankAccountNumber: data.bankAccountNumber,
          bankAccountName: data.bankAccountName,
          status: 'PENDING'
        }
      }),
      prisma.store.update({
        where: { id: data.storeId },
        data: { balance: { decrement: data.amount } }
      })
    ]);

    return { success: true, data: result[0] };
  } catch (error) {
    console.error('Error requesting withdrawal:', error);
    return { success: false, error: 'Failed to request withdrawal' };
  }
}

export async function getStoreWithdrawals(storeId: number) {
  try {
    await requireMerchant(storeId);
    return await prisma.withdrawal.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' }
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    return [];
  }
}

export async function getStoreLedger(storeId: number) {
  try {
    await requireMerchant(storeId);
    return await prisma.order.findMany({
      where: { 
        storeId,
        status: { in: ['PAID', 'COMPLETED', 'paid', 'completed'] }
      },
      orderBy: { updatedAt: 'desc' }
    });
  } catch (error) {
    console.error('Error fetching ledger:', error);
    return [];
  }
}
