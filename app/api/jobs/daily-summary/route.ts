import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireNotificationLock, sendMerchantWhatsApp } from "@/lib/merchant-alerts";

function authorize(req: NextRequest) {
  const expected = process.env.INTERNAL_JOB_SECRET || process.env.CRON_SECRET || "";
  if (!expected) return process.env.NODE_ENV !== "production";
  const provided = req.headers.get("x-job-secret") || req.nextUrl.searchParams.get("secret") || "";
  return provided === expected;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(Number(value || 0));
}

async function sendDailySummary() {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dayKey = now.toISOString().slice(0, 10);

  const stores = await prisma.store.findMany({
    select: { id: true, name: true }
  });

  let sent = 0;
  for (const store of stores) {
    const lock = await acquireNotificationLock(`DAILY_SUMMARY_${store.id}_${dayKey}`);
    if (!lock) continue;

    const orders = await prisma.order.findMany({
      where: {
        storeId: store.id,
        createdAt: { gte: from, lte: now }
      },
      select: { id: true, status: true, totalAmount: true }
    });

    const totalOrders = orders.length;
    const paidOrders = orders.filter((o) => o.status === "PAID" || o.status === "COMPLETED");
    const cancelledOrders = orders.filter((o) => ["CANCELLED", "REFUNDED", "FAILED"].includes(o.status));
    const sales = paidOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

    const orderIds = orders.map((o) => o.id);
    const itemRows = orderIds.length
      ? await prisma.orderItem.findMany({
          where: { orderId: { in: orderIds } },
          include: { product: { select: { name: true } } }
        })
      : [];

    const topMap = new Map<string, number>();
    itemRows.forEach((row) => {
      const name = row.product?.name || "Unknown";
      topMap.set(name, (topMap.get(name) || 0) + Number(row.quantity || 0));
    });
    const topItems = Array.from(topMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const inventoryItems = await prisma.inventoryItem.findMany({
      where: { storeId: store.id },
      orderBy: { stock: "asc" },
      take: 50
    });
    const lowStockItems = inventoryItems.filter((it) => Number(it.stock) <= Number(it.minStock)).slice(0, 5);

    let msg = `📊 *Daily Summary (Last 24h)*\nStore: ${store.name}\n\n`;
    msg += `Orders: ${formatNumber(totalOrders)}\n`;
    msg += `Paid/Completed: ${formatNumber(paidOrders.length)}\n`;
    msg += `Cancelled/Refunded/Failed: ${formatNumber(cancelledOrders.length)}\n`;
    msg += `Sales: Rp ${formatNumber(sales)}\n`;

    if (topItems.length > 0) {
      msg += `\nTop items:\n`;
      topItems.forEach(([name, qty]) => {
        msg += `- ${name}: ${formatNumber(qty)}\n`;
      });
    } else {
      msg += `\nTop items: no sales yet\n`;
    }

    if (lowStockItems.length > 0) {
      msg += `\nLow-stock items:\n`;
      lowStockItems.forEach((it) => {
        msg += `- ${it.name}: ${formatNumber(it.stock)} ${it.unit} (min ${formatNumber(it.minStock)})\n`;
      });
    } else {
      msg += `\nLow-stock items: none\n`;
    }

    const ok = await sendMerchantWhatsApp(store.id, msg);
    if (ok) sent += 1;
  }

  return { sent, stores: stores.length };
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await sendDailySummary();
  return NextResponse.json({ success: true, ...result });
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await sendDailySummary();
  return NextResponse.json({ success: true, ...result });
}
