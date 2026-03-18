import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const AI_API_KEY = process.env.AI_API_KEY || "gercep_ai_secret_123";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey !== AI_API_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { slug } = await req.json();
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const store = await prisma.store.findUnique({
      where: { slug },
      include: {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
