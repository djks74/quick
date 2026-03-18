import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processPayment } from "@/lib/payment";

const AI_API_KEY = process.env.AI_API_KEY || "gercep_ai_secret_123";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey !== AI_API_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { slug, customer_phone, items, order_type, address } = await req.json();

    if (!slug || !customer_phone || !items || !order_type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    // 1. Calculate Total Amount
    let totalAmount = 0;
    const orderItemsData = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId, storeId: store.id }
      });
      if (!product) {
        return NextResponse.json({ error: `Product ID ${item.productId} not found for this store` }, { status: 400 });
      }
      totalAmount += product.price * item.quantity;
      orderItemsData.push({
        productId: product.id,
        quantity: item.quantity,
        price: product.price
      });
    }

    // 2. Create Order
    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        customerPhone: customer_phone,
        totalAmount: totalAmount,
        status: "PENDING",
        orderType: order_type, // DINE_IN or TAKEAWAY
        shippingAddress: address || null,
        notes: JSON.stringify({ source: "AI_GEMINI_USER_ORDER" }),
        items: {
          create: orderItemsData
        }
      } as any
    });

    // 3. Generate Payment Link (Default to Midtrans if enabled)
    let paymentUrl = `https://gercep.click/checkout/pay/${order.id}`;
    if (store.enableMidtrans) {
      try {
        const payment = await processPayment(
          order.id,
          totalAmount,
          customer_phone,
          "midtrans",
          store.id
        );
        if ((payment as any).paymentUrl) {
          paymentUrl = (payment as any).paymentUrl;
        }
      } catch (e) {
        console.error("[AI_ORDER_PAYMENT_ERROR]", e);
      }
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
      totalAmount,
      paymentUrl
    });

  } catch (error: any) {
    console.error("[AI_CREATE_ORDER_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
