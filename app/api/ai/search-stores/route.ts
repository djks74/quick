import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const AI_API_KEY = process.env.AI_API_KEY || "gercep_ai_secret_123";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey !== AI_API_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { query } = await req.json();
    if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

    const stores = await prisma.store.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
          { categories: { some: { name: { contains: query, mode: "insensitive" } } } }
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
