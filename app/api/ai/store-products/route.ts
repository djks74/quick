import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GuardError, requireAiStoreAccessBySlug } from "@/lib/guards";

export async function POST(req: NextRequest) {
  try {
    const { slug } = await req.json();
    const storeAccess = await requireAiStoreAccessBySlug(req.headers, slug);

    const store = await prisma.store.findUnique({
      where: { id: storeAccess.id },
      select: {
        products: {
          where: { category: { not: "System" } },
          select: {
            id: true,
            name: true,
            price: true,
            category: true,
            description: true,
            stock: true
          }
        }
      }
    });
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    return NextResponse.json({ products: store.products });
  } catch (error: any) {
    if (error instanceof GuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
