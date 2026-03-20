import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { applyWaTopup, grantBundleCredit } from '@/lib/wa-credit';
import { createOrderNotification } from '@/lib/order-notifications';
import { acquireNotificationLock, sendMerchantWhatsApp, buildOrderMerchantSummary } from '@/lib/merchant-alerts';
import { ensureStoreSettingsSchema } from '@/lib/store-settings-schema';
import { createBiteshipOrderForPaidOrder, getBiteshipOrderStatus } from '@/lib/shipping-biteship';
import { triggerPartnerWebhook } from '@/lib/webhook-partner';

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
            const plan = orderIdParts[2] || 'ENTERPRISE'; // SUB-storeId-PLAN-timestamp
            await prisma.store.update({
                where: { id },
                data: { subscriptionPlan: plan.toUpperCase() }
            });
            await grantBundleCredit(id, orderRef, plan);
            console.log(`[SUBSCRIPTION] Store ${id} upgraded to ${plan}`);
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
    let profit = 0;
    if (status === 'PAID') {
      const paymentType = String(body.payment_type || body.paymentType || '').toLowerCase();
      // Calculate Platform Profit (Gercep Profit)
      if (paymentType.includes('qris')) {
        // QRIS: 1% fee added, 0.7% Midtrans, 0.3% Gercep profit
        profit = Math.floor(Number(gross_amount || 0) * 0.003);
      } else if (paymentType.includes('bank_transfer') || paymentType.includes('va')) {
        // Bank: Rp 5.000 fee added, Rp 4.000 Midtrans, Rp 1.000 Gercep profit
        profit = 1000;
      }
    }

    let order = await prisma.order.update({
      where: { id },
      data: { 
        status,
        transactionFee: profit > 0 ? profit : undefined 
      }
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
      // Manual Transfer is removed, so we don't need this pending alert from gateway anymore
      // as the initial checkout alert already notified the merchant.
      /*
      const shouldNotifyMerchant = await acquireNotificationLock(`PAYMENT_PENDING_${order.id}_${normalizedStatus || "pending"}`);
      if (shouldNotifyMerchant) {
        await sendMerchantWhatsApp(
          order.storeId,
          `🕒 *Pembayaran Pending*\nOrder #${order.id} masih menunggu pembayaran.\nCustomer: ${order.customerPhone}\nStatus Gateway: ${normalizedStatus || "pending"}\n\nSilakan monitor pembayaran di dashboard.`
        ).catch(() => null);
      }
      */
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
      const parseMeta = () => {
        const raw = String((order as any).notes || "").trim();
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch {
        }
        return null;
      };
      const orderMeta = parseMeta();
      const isShipment = orderMeta?.kind === "MERCHANT_SHIPMENT";
      const isInvoice = orderMeta?.kind === "MERCHANT_INVOICE";

      // Update Store Balance (Net Amount)
      const netAmount = order.totalAmount - (order.paymentFee || 0) - (order.transactionFee || 0);
      if (!isShipment) {
        await prisma.store.update({
          where: { id: order.storeId },
          data: { balance: { increment: netAmount } }
        });
      }

      const store = await prisma.store.findUnique({
        where: { id: order.storeId },
        include: { owner: true }
      });

      const itemsForShipping = await prisma.orderItem.findMany({
        where: { orderId: order.id },
        include: { product: true }
      });
      const shippingItems =
        itemsForShipping.length > 0
          ? itemsForShipping.map((item) => ({
              name: item.product?.name,
              quantity: item.quantity,
              price: item.price
            }))
          : isShipment
            ? [
                {
                  name: String(orderMeta?.itemName || "Barang"),
                  quantity: 1,
                  price: 0,
                  weight: Number(orderMeta?.weightGrams || 1000)
                }
              ]
            : [{ name: "Order Item", quantity: 1, price: 0, weight: 200 }];

      const providerCode = String(order.shippingProvider || "").toUpperCase();
      const isProviderBookable = providerCode === "JNE" || providerCode === "GOSEND" || providerCode === "GOJEK";

      const shippingStatus = String(order.shippingStatus || "").toLowerCase();
      const finalShippingStates = ["confirmed", "allocated", "picking_up", "on_going", "delivered", "cancelled"];
      const shouldAttemptBooking = !order.biteshipOrderId || !finalShippingStates.includes(shippingStatus);
      if (
        store &&
        order.orderType === "TAKEAWAY" &&
        isProviderBookable &&
        !!order.shippingAddress &&
        shouldAttemptBooking
      ) {
        const booking = await createBiteshipOrderForPaidOrder({
          store,
          order,
          items: shippingItems
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
          }) as any;
        } else {
          const bookingFailed = booking as any;
          console.error("BITESHIP_BOOKING_FAILED", {
            orderId: order.id,
            provider: order.shippingProvider,
            error: bookingFailed.error,
            code: bookingFailed.code,
            detail: bookingFailed.detail
          });
          await sendMerchantWhatsApp(
            order.storeId,
            `⚠️ *Booking Pengiriman Gagal*\nOrder #${order.id}\nAlasan: ${bookingFailed.error || "unknown"}\n\nCek konfigurasi alamat pengirim dan API Biteship.`
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

      const bookedDetails = await (async () => {
        if (!order?.biteshipOrderId || !store) return null;
        const b = await getBiteshipOrderStatus(store, String(order.biteshipOrderId)).catch(() => null);
        const courier = (b as any)?.courier || (b as any)?.order?.courier || {};
        const driverName = courier?.driver_name || courier?.courier_name || courier?.name || null;
        const driverPhone = courier?.driver_phone || courier?.courier_phone || courier?.phone || null;
        const vehicleNumber = courier?.vehicle_number || courier?.plate_number || null;
        return {
          driverName: driverName ? String(driverName) : null,
          driverPhone: driverPhone ? String(driverPhone) : null,
          vehicleNumber: vehicleNumber ? String(vehicleNumber) : null
        };
      })();

      // 1. Notify Recipient / Customer
      if (isShipment || isInvoice) {
        const title = isShipment ? "Pengiriman" : "Tagihan";
        await sendWhatsAppMessage(
          order.customerPhone,
          `📦 ${title} dibuat!\n\n` +
            `Order #${order.id}\n` +
            (isShipment ? `Kurir: ${order.shippingProvider || '-'} ${order.shippingService || ''}\n` : "") +
            `${order.shippingTrackingNo ? `Resi: ${order.shippingTrackingNo}\n` : ``}` +
            `${order.shippingStatus ? `Status: ${order.shippingStatus}\n` : ``}` +
            `\nBalas "Cek Resi ${order.id}" untuk lihat status terbaru.`,
          order.storeId
        );
      } else {
        const orderItems = await prisma.orderItem.findMany({
          where: { orderId: order.id },
          include: { product: true }
        });
        let itemsList = "";
        orderItems.forEach(it => {
          itemsList += `- ${it.product.name} x${it.quantity}\n`;
        });

        await sendWhatsAppMessage(
          order.customerPhone,
          `✅ Pembayaran Diterima! \n\nOrder #${order.id} sudah berhasil dibayar.\n` +
            `Jumlah: Rp ${new Intl.NumberFormat('id-ID').format(order.totalAmount)}\n` +
            `Bayar: ${order.paymentMethod === 'qris' ? 'QRIS' : (order.paymentMethod === 'bank_transfer' ? 'Bank Transfer' : (order.paymentMethod || '-'))}\n\n` +
            `*Pesanan:*\n${itemsList}\n` +
            `${order.orderType === 'TAKEAWAY' || order.orderType === 'DELIVERY' 
              ? `Tipe: ${order.orderType === 'TAKEAWAY' ? 'Takeaway' : 'Delivery'}\nKurir: ${order.shippingProvider === 'STORE_COURIER' ? 'Kurir Toko' : (order.shippingProvider === 'GOSEND' ? 'Gosend' : (order.shippingProvider || '-'))}${order.shippingService ? ` ${order.shippingService}` : ''}\nOngkir: Rp ${new Intl.NumberFormat('id-ID').format(order.shippingCost || 0)}\nEstimasi: ${order.shippingEta || '-'}\nAlamat: ${order.shippingAddress || '-'}` 
              : `Tipe: Dine In`}` +
            `${order.biteshipOrderId ? `\nBiteship ID: ${order.biteshipOrderId}` : ``}` +
            `${order.shippingTrackingNo ? `\nResi: ${order.shippingTrackingNo}` : ``}` +
            `\n\nTerima kasih! Pesanan sedang kami siapkan.`,
          order.storeId
        );
      }

      // 2. Notify Merchant (IMMEDIATELY)
      if (store) {
          const merchantMsg = await buildOrderMerchantSummary(order.id, isShipment ? "Pengiriman" : (isInvoice ? "Tagihan Lunas" : "Order Baru"));
          sendMerchantWhatsApp(order.storeId, merchantMsg, order.id).catch((e) => console.error("MERCHANT_NOTIF_FAILED", e));

          // 2.5 Notify Admin Dashboard & POS
          await createOrderNotification({
            storeId: order.storeId,
            orderId: order.id,
            source: isShipment ? "MERCHANT_SHIPMENT" : (isInvoice ? "MERCHANT_INVOICE" : "PAYMENT_SUCCESS"),
            title: isShipment ? `Pengiriman baru #${order.id}` : (isInvoice ? `Tagihan lunas #${order.id}` : `Order baru #${order.id} (Lunas)`),
            body: `${order.customerPhone} • Rp ${new Intl.NumberFormat('id-ID').format(order.totalAmount)}`,
            metadata: {
              orderType: order.orderType,
              totalAmount: order.totalAmount,
              tableNumber: order.tableNumber
            }
          }).catch(() => null);

          // 2.6 Trigger Partner Webhook
          triggerPartnerWebhook(order.id).catch((e) => console.error("PARTNER_WEBHOOK_FAILED", e));

          // 3. Update Inventory (Async / Non-blocking for notification)
          try {
             const itemsWithIngredients = await prisma.orderItem.findMany({
                  where: { orderId: order.id },
                  include: { 
                    product: {
                      include: { ingredients: true }
                    }
                  }
              });

              const ingredientUsage = new Map<number, number>();
              const lowStockAlerts: Array<{ name: string; stock: number; minStock: number; unit: string }> = [];
              const outOfStockAlerts: Array<{ name: string; unit: string }> = [];

              for (const item of itemsWithIngredients) {
                  // Reduce finished product stock
                  if (item.product.stock > 0) {
                      await prisma.product.update({
                          where: { id: item.productId },
                          data: { stock: { decrement: item.quantity } }
                      });
                  }
                  // Reduce raw ingredients
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

              if (lowStockAlerts.length > 0) {
                  let lowMsg = `⚠️ *Peringatan Stok Menipis*\n\n`;
                  lowStockAlerts.forEach((it) => {
                      const safeStock = Math.max(0, Number(it.stock));
                      lowMsg += `- ${it.name}: ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(safeStock)} ${it.unit} (min ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(it.minStock)} ${it.unit})\n`;
                  });
                  lowMsg += `\nSegera restock agar tidak kehabisan.`;
                  sendMerchantWhatsApp(order.storeId, lowMsg).catch(() => null);
              }

              if (outOfStockAlerts.length > 0) {
                  let outMsg = `🚨 *Stok Habis (Kritis)*\n\n`;
                  outOfStockAlerts.forEach((it) => {
                    outMsg += `- ${it.name} (${it.unit})\n`;
                  });
                  outMsg += `\nMohon restock secepatnya.`;
                  sendMerchantWhatsApp(order.storeId, outMsg).catch(() => null);
              }
          } catch (invError) {
             console.error("INVENTORY_UPDATE_ERROR", invError);
             // Don't fail the webhook, just log it.
          }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Payment Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
