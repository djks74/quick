import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createBiteshipOrderForPaidOrder } from "@/lib/shipping-biteship";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendMerchantWhatsApp } from "@/lib/merchant-alerts";

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureStoreSettingsSchema();
    const session = (await getServerSession(authOptions)) as any;
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const orderId = Number(id);
    if (!orderId) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });

    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } }
    });
    if (!existing) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    if (["PAID", "COMPLETED", "CANCELLED"].includes(String(existing.status).toUpperCase())) {
      return NextResponse.json({ error: `Order already ${existing.status}` }, { status: 400 });
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status: "PAID" }
    });

    const store = await prisma.store.findUnique({
      where: { id: order.storeId },
      include: { owner: true }
    });

    // Notify Customer
    await sendWhatsAppMessage(
      order.customerPhone,
      `✅ *Pembayaran Terverifikasi*\n` +
      `Order #${order.id} telah ditandai sebagai PAID oleh Admin.\n` +
      `Pesanan akan segera diproses.`,
      order.storeId
    ).catch(() => null);

    // Notify Merchant
    await sendMerchantWhatsApp(
      order.storeId,
      `✅ *Order #${order.id} Ditandai PAID oleh Admin*\n` +
      `Customer: ${order.customerPhone}\n` +
      `Total: Rp ${new Intl.NumberFormat('id-ID').format(order.totalAmount)}\n\n` +
      `Mohon segera diproses.`
    ).catch(() => null);

    const providerCode = String(order.shippingProvider || "").toUpperCase();
    const isProviderBookable = providerCode === "JNE" || providerCode === "GOSEND" || providerCode === "GOJEK";

    if (
      store &&
      order.orderType === "TAKEAWAY" &&
      isProviderBookable &&
      !!order.shippingAddress &&
      !order.biteshipOrderId
    ) {
      const booking = await createBiteshipOrderForPaidOrder({
        store,
        order,
        items: existing.items.map((item) => ({
          name: item.product?.name,
          quantity: item.quantity,
          price: item.price
        }))
      });

      if (booking.ok) {
        const updated = await prisma.order.update({
          where: { id: order.id },
          data: {
            biteshipOrderId: booking.biteshipOrderId || undefined,
            shippingTrackingNo: booking.trackingNo || order.shippingTrackingNo || null,
            shippingStatus: booking.shippingStatus || order.shippingStatus || "confirmed"
          }
        });

        return NextResponse.json({
          success: true,
          order: {
            id: updated.id,
            status: updated.status,
            biteshipOrderId: updated.biteshipOrderId,
            shippingTrackingNo: updated.shippingTrackingNo,
            shippingStatus: updated.shippingStatus
          }
        });
      }

      return NextResponse.json(
        { error: booking.error || "Failed to book shipment", code: (booking as any).code || null },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        status: order.status,
        biteshipOrderId: order.biteshipOrderId,
        shippingTrackingNo: order.shippingTrackingNo,
        shippingStatus: order.shippingStatus
      }
    });
  } catch (error: any) {
    console.error("MARK_PAID_ERROR", error);
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}
