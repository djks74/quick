import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GuardError, requireAiApiKey } from "@/lib/guards";

function normalizeStoreSearchInput(query: string, locationContext?: string) {
  const raw = String(query || "").trim();
  const providedLocation = String(locationContext || "").trim();
  const normalized = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  let effectiveLocation = providedLocation;
  if (!effectiveLocation) {
    const locationMatch = normalized.match(/(?:sekitar|dekat|di area|area|nearby|near)\s+([a-z0-9\p{L}\s-]+)/iu);
    if (locationMatch?.[1]) effectiveLocation = locationMatch[1].trim();
  }
  const keyword = normalized
    .replace(/(?:\bapa ada\b|\badakah\b|\bada gak\b|\bada tak\b|\btolong\b|\bbisa\b|\bcari\b|\bfind\b|\bsearch\b|\bresto\b|\btoko\b|\bstore\b|\brestaurant\b|\bmakanan\b|\bkuliner\b|\bdi sekitar\b|\bsekitar\b|\bdekat\b|\bdi area\b|\barea\b|\bnearby\b|\bnear\b)/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { keyword, effectiveLocation };
}

function buildAssistantStoreEligibilityWhere(extra: Record<string, any> = {}) {
  return {
    isActive: true,
    shippingSenderAddress: { not: null },
    NOT: [{ shippingSenderAddress: "" }],
    products: { some: { category: { not: "System" } } },
    ...extra
  };
}

export async function POST(req: NextRequest) {
  try {
    requireAiApiKey(req.headers);
    const { query, location_context } = await req.json();
    if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });
    const { keyword, effectiveLocation } = normalizeStoreSearchInput(query, location_context);
    const keywordOr: any[] = keyword
      ? [
          { name: { contains: keyword, mode: "insensitive" } },
          { slug: { contains: keyword, mode: "insensitive" } },
          { categories: { some: { name: { contains: keyword, mode: "insensitive" } } } },
          { products: { some: { name: { contains: keyword, mode: "insensitive" } } } }
        ]
      : [];
    const locationOr: any[] = effectiveLocation
      ? [
          { shippingSenderAddress: { contains: effectiveLocation, mode: "insensitive" } },
          { shippingSenderPostalCode: { contains: effectiveLocation, mode: "insensitive" } },
          { name: { contains: effectiveLocation, mode: "insensitive" } },
          { slug: { contains: effectiveLocation, mode: "insensitive" } }
        ]
      : [];
    const baseWhere: any = buildAssistantStoreEligibilityWhere();
    const strictWhere: any = { ...baseWhere };
    if (keywordOr.length > 0) strictWhere.OR = keywordOr;
    if (locationOr.length > 0) strictWhere.AND = [{ OR: locationOr }];

    let stores = await prisma.store.findMany({
      where: strictWhere,
      select: {
        name: true,
        slug: true
      },
      take: 10
    });

    if (stores.length === 0 && locationOr.length > 0) {
      stores = await prisma.store.findMany({
        where: { ...baseWhere, OR: locationOr } as any,
        select: { name: true, slug: true },
        take: 10
      });
    }

    if (stores.length === 0 && keywordOr.length > 0) {
      stores = await prisma.store.findMany({
        where: { ...baseWhere, OR: keywordOr } as any,
        select: { name: true, slug: true },
        take: 10
      });
    }

    return NextResponse.json({ stores });
  } catch (error: any) {
    if (error instanceof GuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
