import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";
import { trackShipmentWithBiteship } from "@/lib/shipping-biteship";

export async function GET(req: NextRequest) {
  try {
    await ensureStoreSettingsSchema();
    const searchParams = req.nextUrl.searchParams;
    const storeId = Number(searchParams.get("storeId"));
    const trackingNo = String(searchParams.get("trackingNo") || "").trim();
    const courier = searchParams.get("courier") || undefined;

    if (!storeId || !trackingNo) {
      return NextResponse.json({ error: "storeId and trackingNo are required" }, { status: 400 });
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const tracking = await trackShipmentWithBiteship(store, trackingNo, courier || undefined);
    if (!tracking) {
      return NextResponse.json({ success: false, message: "Tracking data unavailable" }, { status: 200 });
    }
    return NextResponse.json({ success: true, tracking });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to track shipment" }, { status: 500 });
  }
}
