import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import midtransClient from "midtrans-client";
import { GuardError, requireSessionUser } from "@/lib/guards";

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await requireSessionUser();
    const body = await req.json();
    const { storeId, email, plan = 'ENTERPRISE' } = body;

    if (!storeId) {
      return NextResponse.json({ error: 'Store ID is required' }, { status: 400 });
    }

    const plans: Record<string, { amount: number, name: string }> = {
      'PRO': { amount: 99000, name: 'QuickMenu Pro Monthly Subscription' },
      'ENTERPRISE': { amount: 299000, name: 'QuickMenu Enterprise Monthly Subscription' },
      'SOVEREIGN': { amount: 999000, name: 'QuickMenu Sovereign Monthly Subscription' },
    };

    const selectedPlan = plans[plan.toUpperCase()] || plans['ENTERPRISE'];
    const amount = selectedPlan.amount;
    const planName = selectedPlan.name;

    const store = await prisma.store.findUnique({
      where: { id: parseInt(storeId) },
      include: { owner: true }
    });

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }
    const userId = Number(sessionUser?.id);
    const userStoreId = Number(sessionUser?.storeId);
    const isSuperAdmin = sessionUser?.role === "SUPER_ADMIN";
    const isOwner = userId === store.ownerId;
    const isStoreUser = userStoreId === store.id;
    if (!isSuperAdmin && !isOwner && !isStoreUser) {
      return NextResponse.json({ error: 'Unauthorized store access' }, { status: 403 });
    }

    // Get Midtrans Keys from Platform Settings specifically for Subscriptions
    let platform = null;
    try {
      platform = await prisma.platformSettings.findUnique({ where: { key: "default" } });
    } catch (e: any) {
      console.warn(`[SUBSCRIPTION] Could not fetch PlatformSettings (table might be missing): ${e.message}`);
    }
    
    const serverKey = platform?.subscriptionServerKey || process.env.SUBSCRIPTION_SERVER_KEY;
    const clientKey = platform?.subscriptionClientKey || process.env.SUBSCRIPTION_CLIENT_KEY;

    console.log(`[Subscription] Store: ${storeId}, Plan: ${plan}, Keys Found: Server=${!!serverKey}, Client=${!!clientKey}`);

    if (!serverKey || !clientKey) {
      console.error("Subscription keys missing in PlatformSettings. Check Super Admin Settings.");
      return NextResponse.json({ error: 'Subscription payment gateway not configured' }, { status: 500 });
    }

    const isProduction = !serverKey.startsWith("SB-");

    const snap = new midtransClient.Snap({
      isProduction: isProduction,
      serverKey: serverKey,
      clientKey: clientKey
    });

    const orderId = `SUB-${store.id}-${plan}-${Date.now()}`;

    const parameter: any = {
      transaction_details: {
        order_id: orderId,
        gross_amount: amount
      },
      customer_details: {
        email: email || store.owner.email,
        first_name: store.owner.name || store.name,
      },
      item_details: [{
        id: `${plan}_MONTHLY`,
        price: amount,
        quantity: 1,
        name: planName
      }]
    };

    const transaction = await snap.createTransaction(parameter);

    return NextResponse.json({ 
      success: true, 
      paymentUrl: transaction.redirect_url,
      token: transaction.token
    });

  } catch (error: any) {
    if (error instanceof GuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Subscription Checkout Error:', error);
    return NextResponse.json({ error: error.message || 'Subscription failed' }, { status: 500 });
  }
}
