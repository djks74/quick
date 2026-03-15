import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cancelBiteshipOrder } from "@/lib/shipping-biteship";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendMerchantWhatsApp } from "@/lib/merchant-alerts";

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureStoreSettingsSchema();
    const session = (await getServerSession(authOptions)) as any;
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    // Allow Merchant Owner or Super Admin to cancel
    const { id } = await params;
    const orderId = Number(id);
    if (!orderId) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });

    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: true }
    });
    if (!existing) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const isOwner = session.user.role === "MERCHANT" && existing.store.ownerId === session.user.id;
    const isSuperAdmin = session.user.role === "SUPER_ADMIN";

    if (!isOwner && !isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (existing.status === "CANCELLED") {
      return NextResponse.json({ error: "Order already cancelled" }, { status: 400 });
    }

    // 1. Update status in DB
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED" }
    });

    // 2. Sync with Biteship if there's a biteship order
    if (order.biteshipOrderId) {
      const biteshipRes = await cancelBiteshipOrder(existing.store, order.biteshipOrderId);
      if (!biteshipRes.ok) {
        console.warn(`[BITESHIP_CANCEL_FAILED] Order #${order.id}:`, biteshipRes.error);
        // We don't block the cancellation if Biteship fails (maybe it was already cancelled or picked up)
      }
    }

    // 3. Notify Customer
    await sendWhatsAppMessage(
      order.customerPhone,
      `⚠️ *Pesanan Dibatalkan*\n` +
      `Order #${order.id} telah dibatalkan oleh ${isSuperAdmin ? 'Admin' : 'Toko'}.\n` +
      `Silakan hubungi kami jika ada pertanyaan.`,
      order.storeId
    ).catch(() => null);

    // 4. Notify Merchant (if cancelled by Super Admin)
    if (isSuperAdmin) {
      await sendMerchantWhatsApp(
        order.storeId,
        `⚠️ *Order #${order.id} Dibatalkan oleh Super Admin*\n` +
        `Customer: ${order.customerPhone}\n` +
        `Status telah diubah menjadi CANCELLED.`
      ).catch(() => null);
    }

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        status: order.status
      }
    });
  } catch (error: any) {
    console.error("CANCEL_ORDER_ERROR", error);
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}
