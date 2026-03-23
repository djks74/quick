import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOrderNotification } from "@/lib/order-notifications";
import { acquireNotificationLock, resolvePaymentUrl, sendMerchantWhatsApp, buildOrderMerchantSummary } from "@/lib/merchant-alerts";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

function authorize(req: NextRequest) {
  const expected = process.env.INTERNAL_JOB_SECRET || process.env.CRON_SECRET || "";
  if (!expected) return process.env.NODE_ENV !== "production";
  const provided = req.headers.get("x-job-secret") || req.nextUrl.searchParams.get("secret") || "";
  return provided === expected;
}

async function processPendingPaymentReminders() {
  const now = new Date();
  const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const pendingOrders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      createdAt: { lte: twoMinutesAgo, gte: oneDayAgo }
    },
    orderBy: { createdAt: "asc" },
    take: 200
  });

  let customerReminders = 0;
  let merchantRiskAlerts = 0;

  for (const order of pendingOrders) {
    const customerLock = await acquireNotificationLock(`PENDING_2MIN_CUSTOMER_${order.id}`);
    if (customerLock) {
      const paymentUrl = resolvePaymentUrl(order.id, order.paymentUrl);
      await sendWhatsAppMessage(
        order.customerPhone,
        `⏳ Order #${order.id} masih *menunggu pembayaran* (pending).\nJumlah: Rp ${new Intl.NumberFormat("id-ID").format(order.totalAmount)}\n\n⏳ Link pembayaran bisa kedaluwarsa. Mohon selesaikan segera.\n\nMau lanjutkan bayar?\nBalas: "Lanjut ${order.id}" atau "Batal ${order.id}"`,
        order.storeId,
        { buttonText: "Lanjut Bayar", buttonUrl: paymentUrl }
      );
      customerReminders += 1;
    }

    const merchantLock = await acquireNotificationLock(`PENDING_2MIN_MERCHANT_${order.id}`);
    if (merchantLock) {
      const merchantMsg = await buildOrderMerchantSummary(order.id, "Reminder Order Pending");
      await sendMerchantWhatsApp(order.storeId, merchantMsg, order.id);
      await createOrderNotification({
        storeId: order.storeId,
        orderId: order.id,
        message: `Order #${order.id} sudah 30 menit belum dibayar (${order.customerPhone})`,
        type: "PAYMENT_REMINDER"
      }).catch(() => null);
      merchantRiskAlerts += 1;
    }
  }

  return { customerReminders, merchantRiskAlerts };
}

async function processOrderSlaAlerts() {
  const slaMinutes = Math.max(5, Number(process.env.ORDER_SLA_MINUTES || 12));
  const now = new Date();
  const slaAgo = new Date(now.getTime() - slaMinutes * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const paidOrders = await prisma.order.findMany({
    where: {
      status: "PAID",
      createdAt: { lte: slaAgo, gte: oneDayAgo }
    },
    orderBy: { createdAt: "asc" },
    take: 200
  });

  let slaAlerts = 0;
  for (const order of paidOrders) {
    const lock = await acquireNotificationLock(`SLA_NOT_ACCEPTED_${slaMinutes}M_${order.id}`);
    if (!lock) continue;
    await sendMerchantWhatsApp(
      order.storeId,
      `⏰ *Peringatan SLA*\nOrder #${order.id} sudah dibayar tapi belum diproses selama ${slaMinutes}+ menit.\nMohon segera ditindaklanjuti.`
    );
    await createOrderNotification({
      storeId: order.storeId,
      orderId: order.id,
      message: `Peringatan SLA: Order #${order.id} belum diproses selama ${slaMinutes}+ menit`,
      type: "SLA_ALERT"
    }).catch(() => null);
    slaAlerts += 1;
  }
  return { slaAlerts, slaMinutes };
}

async function processCancellationSpikeAlerts() {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const recentOrders = await prisma.order.findMany({
    where: { createdAt: { gte: oneHourAgo } },
    select: { id: true, storeId: true, status: true }
  });

  const aggregate = new Map<number, { total: number; bad: number; latestOrderId: number }>();
  recentOrders.forEach((order) => {
    const current = aggregate.get(order.storeId) || { total: 0, bad: 0, latestOrderId: order.id };
    current.total += 1;
    if (["CANCELLED", "REFUNDED", "FAILED"].includes(order.status)) current.bad += 1;
    if (order.id > current.latestOrderId) current.latestOrderId = order.id;
    aggregate.set(order.storeId, current);
  });

  const hourKey = now.toISOString().slice(0, 13);
  let spikeAlerts = 0;
  for (const [storeId, stat] of aggregate.entries()) {
    if (stat.total < 8) continue;
    const ratio = stat.bad / stat.total;
    if (stat.bad < 4 || ratio < 0.4) continue;
    const lock = await acquireNotificationLock(`CANCEL_SPIKE_${storeId}_${hourKey}`);
    if (!lock) continue;
    await sendMerchantWhatsApp(
      storeId,
      `🚨 *Anomali Operasional*\nTerjadi lonjakan pembatalan/refund dalam 60 menit terakhir.\nCancelled/Refunded/Failed: ${stat.bad}/${stat.total} (${Math.round(ratio * 100)}%).\nMohon cek channel pembayaran/operasional sekarang.`
    );
    await createOrderNotification({
      storeId,
      orderId: stat.latestOrderId,
      message: `Anomali Operasional: Lonjakan pembatalan (${stat.bad}/${stat.total} dalam 60 menit)`,
      type: "ANOMALY_ALERT"
    }).catch(() => null);
    spikeAlerts += 1;
  }

  return { spikeAlerts };
}

async function runAlerts() {
  const pending = await processPendingPaymentReminders();
  const sla = await processOrderSlaAlerts();
  const spike = await processCancellationSpikeAlerts();
  return { ...pending, ...sla, ...spike };
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runAlerts();
  return NextResponse.json({ success: true, ...result });
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runAlerts();
  return NextResponse.json({ success: true, ...result });
}
