import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processPayment } from "@/lib/payment";

const AI_API_KEY = process.env.AI_API_KEY || "gercep_ai_secret_123";

async function validateRequest(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  return apiKey === AI_API_KEY;
}

export async function POST(req: NextRequest) {
  if (!(await validateRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { slug, customer_phone, amount, payment_method } = await req.json();
    if (!slug || !customer_phone || !amount || !payment_method) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    // Find or create "Tagihan Manual" product
    let product = await prisma.product.findFirst({
      where: { storeId: store.id, name: "Tagihan Manual" }
    });
    if (!product) {
      product = await prisma.product.create({
        data: {
          storeId: store.id,
          name: "Tagihan Manual",
          category: "System",
          price: 0,
          description: "Produk otomatis untuk tagihan manual AI",
          stock: 999999
        }
      });
    }

    // Apply Fee Logic (QRIS 1%, Bank 5000)
    let paymentFee = 0;
    const itemsAmount = Number(amount);
    if (payment_method === "qris") {
      paymentFee = itemsAmount * 0.01;
    } else if (payment_method === "bank_transfer") {
      paymentFee = 5000;
    }

    const finalTotal = itemsAmount + paymentFee;

    // Create Order
    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        customerPhone: customer_phone,
        totalAmount: finalTotal,
        paymentFee,
        status: "PENDING",
        orderType: "TAKEAWAY",
        paymentMethod: payment_method || null,
        notes: JSON.stringify({ kind: "MERCHANT_INVOICE", source: "AI_GEMINI" }),
        items: {
          create: {
            productId: product.id,
            quantity: 1,
            price: itemsAmount
          }
        }
      } as any
    });

    // Generate Payment Link via Midtrans
    const payment = await processPayment(
      order.id, 
      finalTotal, 
      customer_phone, 
      "midtrans", 
      store.id, 
      payment_method
    );

    return NextResponse.json({
      success: true,
      orderId: order.id,
      finalTotal,
      paymentFee,
      paymentUrl: (payment as any).paymentUrl || `https://gercep.click/checkout/pay/${order.id}`
    });

  } catch (error: any) {
    console.error("[AI_INVOICE_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
