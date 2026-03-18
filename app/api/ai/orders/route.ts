import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    const { slug } = await req.json();
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    const orders = await prisma.order.findMany({
      where: { storeId: store.id },
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        customerPhone: true,
        totalAmount: true,
        status: true,
        paymentMethod: true,
        createdAt: true
      }
    });

    return NextResponse.json({ orders });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
