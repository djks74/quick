import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GuardError, requireAiStoreAccessBySlug } from "@/lib/guards";

export async function POST(req: NextRequest) {
  try {
    const { slug } = await req.json();
    const store = await requireAiStoreAccessBySlug(req.headers, slug);

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
    if (error instanceof GuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
