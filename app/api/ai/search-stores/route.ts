import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GuardError, requireAiApiKey } from "@/lib/guards";

export async function POST(req: NextRequest) {
  try {
    requireAiApiKey(req.headers);
    const { query } = await req.json();
    if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

    const stores = await prisma.store.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
          { categories: { some: { name: { contains: query, mode: "insensitive" } } } },
          { products: { some: { name: { contains: query, mode: "insensitive" } } } }
        ]
      },
      select: {
        name: true,
        slug: true
      },
      take: 10
    });

    return NextResponse.json({ stores });
  } catch (error: any) {
    if (error instanceof GuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
