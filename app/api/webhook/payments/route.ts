import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { applyWaTopup, grantBundleCredit } from '@/lib/wa-credit';
import { createOrderNotification } from '@/lib/order-notifications';
import { acquireNotificationLock, sendMerchantWhatsApp } from '@/lib/merchant-alerts';
import { ensureStoreSettingsSchema } from '@/lib/store-settings-schema';
import { createBiteshipOrderForPaidOrder } from '@/lib/shipping-biteship';

type IngredientUOM = 'gram' | 'kg' | 'pcs';

const normalizeUOM = (value?: string): IngredientUOM => {
  const v = (value || '').toLowerCase();
  if (v === 'gram' || v === 'gr' || v === 'g') return 'gram';
  if (v === 'kg' || v === 'kilogram') return 'kg';
  return 'pcs';
};

const toBaseQuantity = (quantity: number, quantityUnit: IngredientUOM, baseUnit: IngredientUOM, conversionFactor: number) => {
  const gramsPerPcs = Math.max(0.000001, Number.isFinite(conversionFactor) ? conversionFactor : 1);
  const qty = Number.isFinite(quantity) ? quantity : 0;
  const grams = quantityUnit === 'gram' ? qty : quantityUnit === 'kg' ? qty * 1000 : qty * gramsPerPcs;
  const baseQty = baseUnit === 'gram' ? grams : baseUnit === 'kg' ? grams / 1000 : grams / gramsPerPcs;
  return Number(baseQty.toFixed(6));
};

export async function POST(req: NextRequest) {
  try {
    await ensureStoreSettingsSchema();
    const body = await req.json();
    console.log('PAYMENT_WEBHOOK:', JSON.stringify(body, null, 2));

    const orderRef = body.order_id || body.external_id || body.externalId;
    const transactionStatusRaw = body.transaction_status || body.status || body.transactionStatus;
    const gross_amount = body.gross_amount || body.amount;
    if (!orderRef) {
      return NextResponse.json({ error: 'Missing order reference' }, { status: 400 });
    }

    // Extract Order ID from "ORDER-123-171..." or "SUB-123-171..."
    const orderIdParts = orderRef.split('-');
    const type = orderIdParts[0]; // 'ORDER' or 'SUB'
    const id = parseInt(orderIdParts[1]);

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid Order ID' }, { status: 400 });
    }

    let status = 'PENDING';
    const normalizedStatus = String(transactionStatusRaw || '').toLowerCase();
    if (normalizedStatus === 'capture' || normalizedStatus === 'settlement' || normalizedStatus === 'paid') {
      status = 'PAID';
    } else if (normalizedStatus === 'deny' || normalizedStatus === 'cancel' || normalizedStatus === 'expire' || normalizedStatus === 'failed') {
      status = 'CANCELLED';
    } else if (normalizedStatus === 'pending') {
      status = 'PENDING';
    }

    if (type === 'SUB') {
        // Handle Subscription Upgrade
        if (status === 'PAID') {
            await prisma.store.update({
                where: { id },
                data: { subscriptionPlan: 'ENTERPRISE' }
            });
            await grantBundleCredit(id, orderRef);
            console.log(`[SUBSCRIPTION] Store ${id} upgraded to ENTERPRISE`);
        }
        return NextResponse.json({ success: true });
    }

    if (type === "TOPUP") {
      if (status === "PAID") {
        await applyWaTopup(
          id,
          Number(gross_amount || 0),
          orderRef,
          `Top-up via payment gateway (${orderRef})`
        );
      }
      return NextResponse.json({ success: true });
    }

    // Update Order
    let order = await prisma.order.update({
      where: { id },
      data: { status }
    });

    if (status === 'CANCELLED') {
      const shouldNotifyMerchant = await acquireNotificationLock(`PAYMENT_FAILED_${order.id}_${normalizedStatus || "cancelled"}`);
      if (shouldNotifyMerchant) {
        await sendMerchantWhatsApp(
          order.storeId,
          `⚠️ *Pembayaran Gagal / Dibatalkan*\nOrder #${order.id} masih belum dibayar.\nCustomer: ${order.customerPhone}\nAlasan: ${normalizedStatus || "cancelled"}\n\nSilakan follow up customer atau kirim ulang link pembayaran.`
        );
      }
      await createOrderNotification({
        storeId: order.storeId,
        orderId: order.id,
        source: "PAYMENT_FAILURE",
        title: `Pembayaran gagal untuk order #${order.id}`,
        body: `${order.customerPhone} • ${normalizedStatus || "cancelled"}`,
        metadata: { status: normalizedStatus || "cancelled" }
      }).catch(() => null);
    }

    if (status === 'PENDING') {
      const shouldNotifyMerchant = await acquireNotificationLock(`PAYMENT_PENDING_${order.id}_${normalizedStatus || "pending"}`);
      if (shouldNotifyMerchant) {
        await sendMerchantWhatsApp(
          order.storeId,
          `🕒 *Pembayaran Pending*\nOrder #${order.id} masih menunggu pembayaran.\nCustomer: ${order.customerPhone}\nStatus Gateway: ${normalizedStatus || "pending"}\n\nSilakan monitor pembayaran di dashboard.`
        ).catch(() => null);
      }
      await createOrderNotification({
        storeId: order.storeId,
        orderId: order.id,
        source: "PAYMENT_PENDING",
        title: `Pembayaran pending untuk order #${order.id}`,
        body: `${order.customerPhone} • ${normalizedStatus || "pending"}`,
        metadata: { status: normalizedStatus || "pending" }
      }).catch(() => null);
    }

    // Send WhatsApp Notification if PAID
    if (status === 'PAID') {
      // Update Store Balance (Net Amount)
      const netAmount = order.totalAmount - (order.paymentFee || 0) - (order.transactionFee || 0);
      await prisma.store.update({
        where: { id: order.storeId },
        data: { balance: { increment: netAmount } }
      });

      const store = await prisma.store.findUnique({
        where: { id: order.storeId },
        include: { owner: true }
      });

      const itemsForShipping = await prisma.orderItem.findMany({
        where: { orderId: order.id },
        include: { product: true }
      });

      const providerCode = String(order.shippingProvider || "").toUpperCase();
      const isProviderBookable = providerCode === "JNE" || providerCode === "GOSEND" || providerCode === "GOJEK";

      const canContinueDraft = ["draft_created", "courier_selected"].includes(String(order.shippingStatus || "").toLowerCase());
      if (
        store &&
        order.orderType === "TAKEAWAY" &&
        isProviderBookable &&
        !!order.shippingAddress &&
        (!order.biteshipOrderId || canContinueDraft)
      ) {
        const booking = await createBiteshipOrderForPaidOrder({
          store,
          order,
          items: itemsForShipping.map((item) => ({
            name: item.product?.name,
            quantity: item.quantity,
            price: item.price
          }))
        });

        if (booking.ok) {
          const booked = booking as any;
          order = await prisma.order.update({
            where: { id: order.id },
            data: {
              biteshipOrderId: booked.biteshipOrderId || undefined,
              shippingTrackingNo: booked.trackingNo || order.shippingTrackingNo || null,
              shippingStatus: booked.shippingStatus || order.shippingStatus || "confirmed"
            }
          });
        } else {
          console.error("BITESHIP_BOOKING_FAILED", {
            orderId: order.id,
            provider: order.shippingProvider,
            error: booking.error,
            code: (booking as any).code,
            detail: (booking as any).detail
          });
          await sendMerchantWhatsApp(
            order.storeId,
            `⚠️ *Booking Pengiriman Gagal*\nOrder #${order.id}\nAlasan: ${booking.error || "unknown"}\n\nCek konfigurasi alamat pengirim dan API Biteship.`
          );
        }
      } else if (store && order.orderType === "TAKEAWAY" && !order.biteshipOrderId) {
        console.log("BITESHIP_BOOKING_SKIPPED", {
          orderId: order.id,
          provider: order.shippingProvider,
          hasAddress: !!order.shippingAddress,
          isProviderBookable
        });
      }

      // 1. Notify Customer
      await sendWhatsAppMessage(
        order.customerPhone,
        `✅ Pembayaran Diterima! \n\nOrder #${order.id} sudah berhasil dibayar.\nJumlah: Rp ${new Intl.NumberFormat('id-ID').format(order.totalAmount)}\n` +
          `${order.orderType === 'TAKEAWAY' ? `\nTipe: Takeaway / Delivery\nKurir: ${order.shippingProvider || '-'} ${order.shippingService || ''}\nOngkir: Rp ${new Intl.NumberFormat('id-ID').format(order.shippingCost || 0)}\nEstimasi: ${order.shippingEta || '-'}\nAlamat: ${order.shippingAddress || '-'}` : `\nTipe: Dine In`}` +
          `${order.biteshipOrderId ? `\nBiteship ID: ${order.biteshipOrderId}` : ``}` +
          `${order.shippingTrackingNo ? `\nResi: ${order.shippingTrackingNo}` : ``}` +
          `\n\nTerima kasih! Pesanan sedang kami siapkan.`,
        order.storeId
      );

      // 2. Notify Merchant
      if (store) {
          const items = await prisma.orderItem.findMany({
              where: { orderId: order.id },
              include: { 
                product: {
                  include: {
                    ingredients: true
                  }
                }
              }
          });

          const ingredientUsage = new Map<number, number>();
          const lowStockAlerts: Array<{ name: string; stock: number; minStock: number; unit: string }> = [];
          const outOfStockAlerts: Array<{ name: string; unit: string }> = [];

          // Reduce Inventory for each item
          for (const item of items) {
              // 1. Reduce finished product stock if managed
              if (item.product.stock > 0) {
                  await prisma.product.update({
                      where: { id: item.productId },
                      data: { stock: { decrement: item.quantity } }
                  });
              }

              // 2. Reduce raw ingredients stock if recipe exists
              if (item.product.ingredients && item.product.ingredients.length > 0) {
                  for (const ingredient of item.product.ingredients) {
                      const baseUnit = normalizeUOM((ingredient as any).baseUnit);
                      const quantityUnit = normalizeUOM((ingredient as any).quantityUnit || baseUnit);
                      const conversionFactor = Math.max(0.000001, Number((ingredient as any).conversionFactor) || 1);
                      const recipeBaseQty = toBaseQuantity(Number(ingredient.quantity) || 0, quantityUnit, baseUnit, conversionFactor);
                      const decrementAmount = Number((recipeBaseQty * item.quantity).toFixed(6));
                      const current = ingredientUsage.get(ingredient.inventoryItemId) || 0;
                      ingredientUsage.set(ingredient.inventoryItemId, Number((current + decrementAmount).toFixed(6)));
                  }
              }
          }

          for (const [inventoryItemId, decrementAmount] of ingredientUsage.entries()) {
              const before = await prisma.inventoryItem.findUnique({
                  where: { id: inventoryItemId },
                  select: { id: true, name: true, stock: true, minStock: true, unit: true }
              });
              if (!before) continue;
              const after = await prisma.inventoryItem.update({
                  where: { id: inventoryItemId },
                  data: { stock: { decrement: decrementAmount } },
                  select: { stock: true, minStock: true, name: true, unit: true }
              });
              const wasLow = Number(before.stock) <= Number(before.minStock);
              const isLow = Number(after.stock) <= Number(after.minStock);
              const becameOutOfStock = Number(before.stock) > 0 && Number(after.stock) <= 0;
              if (!wasLow && isLow) {
                  lowStockAlerts.push({
                      name: after.name,
                      stock: Number(after.stock),
                      minStock: Number(after.minStock),
                      unit: after.unit || "pcs"
                  });
              }
              if (becameOutOfStock) {
                  outOfStockAlerts.push({
                    name: after.name,
                    unit: after.unit || "pcs"
                  });
              }
          }

          // Notify Merchant
          let msg = `💰 *Pembayaran Masuk untuk Order #${order.id}*\n`;
          if (order.tableNumber) msg += `📍 Table: *${order.tableNumber}*\n`;
          msg += `👤 Customer: ${order.customerPhone}\n`;
          msg += `💵 Jumlah: Rp ${new Intl.NumberFormat('id-ID').format(order.totalAmount)}\n\n`;
          msg += `🧾 Tipe: ${order.orderType === 'TAKEAWAY' ? 'Takeaway / Delivery' : 'Dine In'}\n`;
          if (order.orderType === 'TAKEAWAY') {
            msg += `🚚 Kurir: ${order.shippingProvider || '-'} ${order.shippingService || ''}\n`;
            msg += `📦 Ongkir: Rp ${new Intl.NumberFormat('id-ID').format(order.shippingCost || 0)}\n`;
            msg += `⏱️ ETA: ${order.shippingEta || '-'}\n`;
            msg += `📍 Alamat: ${order.shippingAddress || '-'}\n`;
            if (order.biteshipOrderId) {
              msg += `🆔 Biteship: ${order.biteshipOrderId}\n`;
            }
            if (order.shippingTrackingNo) {
              msg += `🔎 Resi: ${order.shippingTrackingNo}\n`;
            }
            if (order.shippingStatus) {
              msg += `📮 Status: ${order.shippingStatus}\n`;
            }
            msg += `\n`;
          }
          msg += `*Item:*\n`;
          
          items.forEach(item => {
              msg += `${item.quantity}x ${item.product.name}\n`;
          });
          
          msg += `\n⚠️ Mohon segera proses pesanan ini!`;

          await sendMerchantWhatsApp(order.storeId, msg).catch(() => null);

          if (lowStockAlerts.length > 0) {
              let lowMsg = `⚠️ *Peringatan Stok Menipis*\n\n`;
              lowStockAlerts.forEach((it) => {
                  const safeStock = Math.max(0, Number(it.stock));
                  lowMsg += `- ${it.name}: ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(safeStock)} ${it.unit} (min ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(it.minStock)} ${it.unit})\n`;
              });
              lowMsg += `\nSegera restock agar tidak kehabisan.`;
              await sendMerchantWhatsApp(order.storeId, lowMsg).catch(() => null);
          }

          if (outOfStockAlerts.length > 0) {
              let outMsg = `🚨 *Stok Habis (Kritis)*\n\n`;
              outOfStockAlerts.forEach((it) => {
                outMsg += `- ${it.name} (${it.unit})\n`;
              });
              outMsg += `\nMohon restock secepatnya.`;
              await sendMerchantWhatsApp(order.storeId, outMsg).catch(() => null);
          }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Payment Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
