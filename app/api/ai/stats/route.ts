import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GuardError, requireAiStoreAccessBySlug } from "@/lib/guards";

export async function POST(req: NextRequest) {
  try {
    const { slug } = await req.json();
    const store = await requireAiStoreAccessBySlug(req.headers, slug);

    const paidOrders = await prisma.order.findMany({
      where: { storeId: store.id, status: "PAID" },
      select: { totalAmount: true }
    });

    const totalSales = paidOrders.reduce((sum, o) => sum + o.totalAmount, 0);
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
    if (error instanceof GuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
