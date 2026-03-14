import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOrderNotification } from "@/lib/order-notifications";
import { acquireNotificationLock, resolvePaymentUrl, sendMerchantWhatsApp } from "@/lib/merchant-alerts";
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
        `⏳ Reminder for Order #${order.id}\nAmount: Rp ${new Intl.NumberFormat("id-ID").format(order.totalAmount)}\n\nDo you want to continue this order?\nReply: "Continue ${order.id}" or "Cancel ${order.id}"`,
        order.storeId,
        { buttonText: "Continue Payment", buttonUrl: paymentUrl }
      );
      customerReminders += 1;
    }

    const merchantLock = await acquireNotificationLock(`PENDING_2MIN_MERCHANT_${order.id}`);
    if (merchantLock) {
      await sendMerchantWhatsApp(
        order.storeId,
        `⚠️ *Unpaid Order Risk*\nOrder #${order.id} is still pending payment (>2 minutes).\nCustomer: ${order.customerPhone}\nAmount: Rp ${new Intl.NumberFormat("id-ID").format(order.totalAmount)}`
      );
      await createOrderNotification({
        storeId: order.storeId,
        orderId: order.id,
        source: "UNPAID_RISK",
        title: `Order #${order.id} unpaid for >2 minutes`,
        body: `${order.customerPhone} • Rp ${new Intl.NumberFormat("id-ID").format(order.totalAmount)}`,
        metadata: { ageMinutes: Math.floor((now.getTime() - order.createdAt.getTime()) / 60000) }
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
      `⏰ *SLA Alert*\nOrder #${order.id} is paid but not processed for ${slaMinutes}+ minutes.\nPlease review and handle immediately.`
    );
    await createOrderNotification({
      storeId: order.storeId,
      orderId: order.id,
      source: "SLA_ALERT",
      title: `Order #${order.id} not processed within SLA`,
      body: `Paid order pending action for ${slaMinutes}+ minutes`,
      metadata: { slaMinutes }
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
      `🚨 *Operational Anomaly*\nHigh cancellation/refund spike detected in the last 60 minutes.\nCancelled/Refunded/Failed: ${stat.bad}/${stat.total} (${Math.round(ratio * 100)}%).\nPlease check payment/channel issues immediately.`
    );
    await createOrderNotification({
      storeId,
      orderId: stat.latestOrderId,
      source: "ANOMALY_ALERT",
      title: "High cancellation/refund spike detected",
      body: `${stat.bad}/${stat.total} in last 60 minutes`,
      metadata: { bad: stat.bad, total: stat.total, ratio }
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
