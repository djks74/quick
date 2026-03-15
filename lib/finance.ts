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

export async function getStoreAvailableBalance(storeId: number) {
  try {
    await requireMerchant(storeId);
    const [orders, withdrawals] = await Promise.all([
      prisma.order.findMany({
        where: {
          storeId,
          status: { in: ['PAID', 'COMPLETED', 'paid', 'completed'] }
        },
        select: {
          totalAmount: true,
          paymentFee: true,
          transactionFee: true
        }
      }),
      prisma.withdrawal.findMany({
        where: {
          storeId,
          status: { in: ['PENDING', 'COMPLETED'] }
        },
        select: {
          amount: true
        }
      })
    ]);

    const grossNet = orders.reduce((sum, item) => {
      return sum + (item.totalAmount - (item.paymentFee || 0) - (item.transactionFee || 0));
    }, 0);
    const withdrawn = withdrawals.reduce((sum, item) => sum + item.amount, 0);
    const balance = Math.max(0, grossNet - withdrawn);

    await prisma.store.update({
      where: { id: storeId },
      data: { balance }
    });

    return balance;
  } catch (error) {
    console.error('Error calculating available balance:', error);
    return 0;
  }
}

type IngredientUOM = "gram" | "kg" | "pcs";

const normalizeUOM = (value?: string): IngredientUOM => {
  const v = (value || "").toLowerCase();
  if (v === "gram" || v === "gr" || v === "g") return "gram";
  if (v === "kg" || v === "kilogram") return "kg";
  return "pcs";
};

const toBaseQuantity = (quantity: number, quantityUnit: IngredientUOM, baseUnit: IngredientUOM, conversionFactor: number) => {
  const gramsPerPcs = Math.max(0.000001, Number.isFinite(conversionFactor) ? conversionFactor : 1);
  const qty = Number.isFinite(quantity) ? quantity : 0;
  const grams = quantityUnit === "gram" ? qty : quantityUnit === "kg" ? qty * 1000 : qty * gramsPerPcs;
  const baseQty = baseUnit === "gram" ? grams : baseUnit === "kg" ? grams / 1000 : grams / gramsPerPcs;
  return Number(baseQty.toFixed(6));
};

const roundTwo = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));

export async function getStoreProfitAnalytics(storeId: number) {
  try {
    await requireMerchant(storeId);

    const orders = await prisma.order.findMany({
      where: {
        storeId,
        status: { in: ['PAID', 'COMPLETED', 'paid', 'completed'] }
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        items: {
          select: {
            quantity: true,
            price: true,
            product: {
              select: {
                id: true,
                name: true,
                ingredients: {
                  select: {
                    quantity: true,
                    quantityUnit: true,
                    baseUnit: true,
                    conversionFactor: true,
                    inventoryItem: {
                      select: {
                        costPrice: true,
                        unit: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const productMap = new Map<number, {
      productId: number;
      productName: string;
      quantitySold: number;
      revenue: number;
      estimatedCogs: number;
      estimatedProfit: number;
      estimatedMargin: number;
    }>();

    let grossRevenue = 0;
    let totalFees = 0;
    let estimatedCogs = 0;
    let totalItemsSold = 0;

    for (const order of orders) {
      grossRevenue += Number(order.totalAmount || 0);
      totalFees += Number(order.paymentFee || 0) + Number(order.transactionFee || 0);

      for (const item of order.items) {
        const itemQty = Number(item.quantity || 0);
        const itemRevenue = Number(item.price || 0) * itemQty;
        totalItemsSold += itemQty;

        const productCostPerUnit = (item.product?.ingredients || []).reduce((sum, ingredient) => {
          const inventoryUnit = normalizeUOM(ingredient.inventoryItem?.unit);
          const baseUnit = normalizeUOM(ingredient.baseUnit || inventoryUnit);
          const quantityUnit = normalizeUOM(ingredient.quantityUnit || baseUnit);
          const conversionFactor = Math.max(0.000001, Number(ingredient.conversionFactor) || 1);
          const baseQty = toBaseQuantity(Number(ingredient.quantity) || 0, quantityUnit, baseUnit, conversionFactor);
          const ingredientCost = (Number(ingredient.inventoryItem?.costPrice) || 0) * baseQty;
          return sum + ingredientCost;
        }, 0);

        const itemCogs = productCostPerUnit * itemQty;
        estimatedCogs += itemCogs;

        const existing = productMap.get(item.product.id) || {
          productId: item.product.id,
          productName: item.product.name,
          quantitySold: 0,
          revenue: 0,
          estimatedCogs: 0,
          estimatedProfit: 0,
          estimatedMargin: 0
        };

        existing.quantitySold += itemQty;
        existing.revenue += itemRevenue;
        existing.estimatedCogs += itemCogs;
        existing.estimatedProfit = existing.revenue - existing.estimatedCogs;
        existing.estimatedMargin = existing.revenue > 0 ? (existing.estimatedProfit / existing.revenue) * 100 : 0;
        productMap.set(item.product.id, existing);
      }
    }

    const netAfterFees = grossRevenue - totalFees;
    const estimatedNetProfit = netAfterFees - estimatedCogs;
    const estimatedMargin = grossRevenue > 0 ? (estimatedNetProfit / grossRevenue) * 100 : 0;
    const avgOrderValue = orders.length > 0 ? grossRevenue / orders.length : 0;

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((item) => ({
        ...item,
        revenue: roundTwo(item.revenue),
        estimatedCogs: roundTwo(item.estimatedCogs),
        estimatedProfit: roundTwo(item.estimatedProfit),
        estimatedMargin: roundTwo(item.estimatedMargin)
      }));

    return {
      totalOrders: orders.length,
      totalItemsSold,
      grossRevenue: roundTwo(grossRevenue),
      totalFees: roundTwo(totalFees),
      netAfterFees: roundTwo(netAfterFees),
      estimatedCogs: roundTwo(estimatedCogs),
      estimatedNetProfit: roundTwo(estimatedNetProfit),
      estimatedMargin: roundTwo(estimatedMargin),
      avgOrderValue: roundTwo(avgOrderValue),
      topProducts,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching profit analytics:', error);
    return {
      totalOrders: 0,
      totalItemsSold: 0,
      grossRevenue: 0,
      totalFees: 0,
      netAfterFees: 0,
      estimatedCogs: 0,
      estimatedNetProfit: 0,
      estimatedMargin: 0,
      avgOrderValue: 0,
      topProducts: [],
      generatedAt: new Date().toISOString()
    };
  }
}
