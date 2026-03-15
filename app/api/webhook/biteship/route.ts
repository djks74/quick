import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { acquireNotificationLock, sendMerchantWhatsApp } from "@/lib/merchant-alerts";
import { normalizeBiteshipStatus } from "@/lib/shipping-biteship";

function extractBiteshipEvent(payload: any) {
  const orderId =
    payload?.id ||
    payload?.order_id ||
    payload?.order?.id ||
    payload?.data?.id ||
    payload?.data?.order_id ||
    null;
  const statusRaw =
    payload?.status ||
    payload?.order?.status ||
    payload?.data?.status ||
    payload?.tracking?.status ||
    null;
  const trackingNo =
    payload?.courier?.tracking_id ||
    payload?.courier?.waybill_id ||
    payload?.courier?.courier_waybill_id ||
    payload?.order?.courier?.tracking_id ||
    payload?.order?.courier?.waybill_id ||
    payload?.data?.courier?.tracking_id ||
    payload?.data?.courier?.waybill_id ||
    null;
  return { orderId, statusRaw, trackingNo };
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const { orderId, statusRaw, trackingNo } = extractBiteshipEvent(payload);
    if (!orderId) {
      return NextResponse.json({ success: false, reason: "ORDER_ID_MISSING" }, { status: 400 });
    }

    const status = normalizeBiteshipStatus(statusRaw || "confirmed");
    const order = await prisma.order.findFirst({
      where: { biteshipOrderId: String(orderId) }
    });

    if (!order) {
      return NextResponse.json({ success: true, ignored: true });
    }

    const prevStatus = normalizeBiteshipStatus(order.shippingStatus || "");
    const nextData: any = {
      shippingStatus: status
    };
    if (trackingNo) {
      nextData.shippingTrackingNo = String(trackingNo);
    }

    await prisma.order.update({
      where: { id: order.id },
      data: nextData
    });

    if (prevStatus !== status) {
      const notifyKey = `BITESHIP_STATUS_${order.id}_${status}`;
      const shouldNotify = await acquireNotificationLock(notifyKey);
      if (shouldNotify) {
        await sendWhatsAppMessage(
          order.customerPhone,
          `📮 Update Pengiriman\nOrder #${order.id}\nStatus: ${status}\nKurir: ${order.shippingProvider || "-"} ${order.shippingService || ""}\n${trackingNo ? `Resi: ${trackingNo}` : ""}`,
          order.storeId
        );
        await sendMerchantWhatsApp(
          order.storeId,
          `📮 *Update Status Pengiriman*\nOrder #${order.id}\nStatus: ${status}\nKurir: ${order.shippingProvider || "-"} ${order.shippingService || ""}\n${trackingNo ? `Resi: ${trackingNo}` : ""}`
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Biteship webhook error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
