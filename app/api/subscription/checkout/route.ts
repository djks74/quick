import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import midtransClient from "midtrans-client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { storeId, email } = body;

    if (!storeId) {
      return NextResponse.json({ error: 'Store ID is required' }, { status: 400 });
    }

    const store = await prisma.store.findUnique({
      where: { id: parseInt(storeId) },
      include: { owner: true }
    });

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Get Midtrans Keys from Platform Settings specifically for Subscriptions
    const platform = await prisma.platformSettings.findUnique({ where: { key: "default" } });
    const serverKey = platform?.subscriptionServerKey || process.env.SUBSCRIPTION_SERVER_KEY;
    const clientKey = platform?.subscriptionClientKey || process.env.SUBSCRIPTION_CLIENT_KEY;

    console.log(`[Subscription] Store: ${storeId}, Keys Found: Server=${!!serverKey}, Client=${!!clientKey}`);

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

    const amount = 299000;
    const orderId = `SUB-${store.id}-${Date.now()}`;

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
        id: 'ENTERPRISE_MONTHLY',
        price: amount,
        quantity: 1,
        name: 'QuickMenu Enterprise Monthly Subscription'
      }]
    };

    const transaction = await snap.createTransaction(parameter);

    return NextResponse.json({ 
      success: true, 
      paymentUrl: transaction.redirect_url,
      token: transaction.token
    });

  } catch (error: any) {
    console.error('Subscription Checkout Error:', error);
    return NextResponse.json({ error: error.message || 'Subscription failed' }, { status: 500 });
  }
}
