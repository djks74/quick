import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";
import { getShippingQuoteFromBiteship } from "@/lib/shipping-biteship";

export async function POST(req: NextRequest) {
  try {
    await ensureStoreSettingsSchema();
    const body = await req.json();
    const storeId = Number(body?.storeId);
    const destinationAddress = String(body?.destinationAddress || "").trim();
    const destinationPostalCode = body?.destinationPostalCode ? String(body.destinationPostalCode) : undefined;
    const weightGrams = Number(body?.weightGrams || 1000);

    if (!storeId || !destinationAddress) {
      return NextResponse.json({ error: "storeId and destinationAddress are required" }, { status: 400 });
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const options = await getShippingQuoteFromBiteship({
      store,
      destinationAddress,
      destinationPostalCode,
      weightGrams
    });

    return NextResponse.json({ success: true, options });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to fetch shipping quote" }, { status: 500 });
  }
}
