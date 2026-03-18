import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const AI_API_KEY = process.env.AI_API_KEY || "gercep_ai_secret_123";

async function validateRequest(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey !== AI_API_KEY) {
    return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  if (!(await validateRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { slug } = await req.json();
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const store = await prisma.store.findUnique({
      where: { slug },
      include: {
        orders: {
          where: { status: "PAID" },
          select: { totalAmount: true }
        }
      }
    });

    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    const totalSales = store.orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const pendingOrders = await prisma.order.count({
      where: { storeId: store.id, status: "PENDING" }
    });

    return NextResponse.json({
      storeName: store.name,
      totalSales,
      pendingOrders,
      walletBalance: store.balance,
      waBalance: store.waBalance
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
