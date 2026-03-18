import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import midtransClient from "midtrans-client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureWaCreditSchema } from "@/lib/wa-credit";

export async function POST(req: NextRequest) {
  try {
    await ensureWaCreditSchema();
    const session = await getServerSession(authOptions);
    const user = (session as any)?.user;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const storeId = Number(body?.storeId);
    const amount = Number(body?.amount);
    if (!storeId || !amount || amount < 10000) {
      return NextResponse.json({ error: "Invalid top-up amount" }, { status: 400 });
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: { owner: true }
    });
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    const isSuperAdmin = user?.role === "SUPER_ADMIN";
    const isOwner = Number(user?.id) === store.ownerId;
    const isStoreUser = Number(user?.storeId) === store.id;
    if (!isSuperAdmin && !isOwner && !isStoreUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const platform = await prisma.platformSettings.findUnique({ where: { key: "default" } }).catch(() => null);
    const topupRef = `TOPUP-${store.id}-${Date.now()}`;

    const midtransServerKey = store.paymentGatewaySecret || platform?.midtransServerKey || process.env.PAYMENT_GATEWAY_SECRET || process.env.MIDTRANS_SERVER_KEY;
    const midtransClientKey = store.paymentGatewayClientKey || platform?.midtransClientKey || process.env.PAYMENT_GATEWAY_CLIENT_KEY || process.env.MIDTRANS_CLIENT_KEY;
    if (!midtransServerKey || !midtransClientKey) {
      return NextResponse.json({ error: "Payment gateway not configured" }, { status: 500 });
    }

    const snap = new midtransClient.Snap({
      isProduction: !midtransServerKey.startsWith("SB-"),
      serverKey: midtransServerKey,
      clientKey: midtransClientKey
    });

    const transaction = await snap.createTransaction({
      transaction_details: {
        order_id: topupRef,
        gross_amount: amount
      },
      customer_details: {
        email: store.owner.email || "merchant@example.com",
        first_name: store.owner.name || store.name
      },
      item_details: [{
        id: "WA_TOPUP",
        price: amount,
        quantity: 1,
        name: "WhatsApp Credit Top-up"
      }],
      enabled_payments: ["gopay", "qris", "shopeepay", "other_qris"]
    } as any);

    return NextResponse.json({
      success: true,
      provider: "midtrans",
      reference: topupRef,
      checkoutUrl: transaction.redirect_url,
      token: transaction.token
    });
  } catch (error: any) {
    console.error("[WA_TOPUP_API]", error);
    return NextResponse.json({ error: error.message || "Failed to create top-up payment" }, { status: 500 });
  }
}
