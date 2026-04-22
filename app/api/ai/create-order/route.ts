import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processPayment } from "@/lib/payment";
import { GuardError, requireAiStoreAccessBySlug } from "@/lib/guards";

export async function POST(req: NextRequest) {
  try {
    const { slug, customer_phone, items, order_type, address, shippingFee, payment_method } = await req.json();

    if (!slug || !customer_phone || !items || !order_type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const store = await requireAiStoreAccessBySlug(req.headers, slug);

    // 1. Calculate Items Total
    let itemsAmount = 0;
    const orderItemsData = [];

    for (const item of items) {
      const product = await prisma.product.findFirst({
        where: { 
          id: item.productId, 
          storeId: store.id,
          category: { not: "_ARCHIVED_" }
        }
      });
      if (!product) {
        return NextResponse.json({ error: `Product ID ${item.productId} not found or archived for this store` }, { status: 400 });
      }
      itemsAmount += product.price * item.quantity;
      orderItemsData.push({
        productId: product.id,
        quantity: item.quantity,
        price: product.price
      });
    }

    // 2. Calculate Taxes and Fees
    const taxAmount = itemsAmount * (store.taxPercent / 100);
    const serviceCharge = itemsAmount * (store.serviceChargePercent / 100);
    const shippingCost = Number(shippingFee) || 0;
    
    let paymentFee = 0;
    const subtotal = itemsAmount + taxAmount + serviceCharge + shippingCost;
    if (payment_method === "qris") {
      paymentFee = subtotal * 0.01;
    } else if (payment_method === "bank_transfer") {
      paymentFee = 5000;
    }

    const finalTotal = subtotal + paymentFee;

    // 3. Create Order
    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        customerPhone: customer_phone,
        totalAmount: finalTotal,
        taxAmount,
        serviceCharge,
        paymentFee,
        status: "PENDING",
        orderType: order_type, // DINE_IN or TAKEAWAY
        paymentMethod: payment_method || null,
        shippingAddress: address || null,
        shippingCost,
        notes: JSON.stringify({ source: "AI_CHATBOT_USER_ORDER" }),
        items: {
          create: orderItemsData
        }
      } as any
    });

    // 4. Generate Payment Link
    let paymentUrl = `https://gercep.click/checkout/pay/${order.id}`;
    try {
      const payment = await processPayment(
        order.id,
        finalTotal,
        customer_phone,
        "midtrans",
        store.id,
        payment_method
      );
      if ((payment as any).paymentUrl) {
        paymentUrl = (payment as any).paymentUrl;
      }
    } catch (e) {
      console.error("[AI_ORDER_PAYMENT_ERROR]", e);
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
      totalAmount: finalTotal,
      taxAmount,
      serviceCharge,
      paymentFee,
      shippingCost,
      paymentUrl
    });

  } catch (error: any) {
    if (error instanceof GuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[AI_CREATE_ORDER_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
