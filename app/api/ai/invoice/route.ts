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
    let fee = 0;
    let finalAmount = Number(amount);
    if (payment_method === "qris") {
      fee = Math.ceil(finalAmount * 0.01);
      finalAmount += fee;
    } else if (payment_method === "bank_transfer") {
      fee = 5000;
      finalAmount += fee;
    }

    // Create Order
    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        customerPhone: customer_phone,
        totalAmount: finalAmount,
        paymentFee: fee,
        status: "PENDING",
        orderType: "TAKEAWAY",
        notes: JSON.stringify({ kind: "MERCHANT_INVOICE", source: "AI_GEMINI" }),
        items: {
          create: {
            productId: product.id,
            quantity: 1,
            price: finalAmount
          }
        }
      } as any
    });

    // Generate Payment Link via Midtrans
    const payment = await processPayment(
      order.id, 
      finalAmount, 
      customer_phone, 
      "midtrans", 
      store.id, 
      payment_method
    );

    return NextResponse.json({
      success: true,
      orderId: order.id,
      finalAmount,
      fee,
      paymentUrl: (payment as any).paymentUrl || `https://gercep.click/checkout/pay/${order.id}`
    });

  } catch (error: any) {
    console.error("[AI_INVOICE_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
