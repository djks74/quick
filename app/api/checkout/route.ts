import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processPayment } from '@/lib/payment';
import { createOrderNotification } from '@/lib/order-notifications';
import { ensureStoreSettingsSchema } from '@/lib/store-settings-schema';
import { createBiteshipDraftForPendingOrder } from '@/lib/shipping-biteship';
import { acquireNotificationLock, resolvePaymentUrl, sendMerchantWhatsApp, buildOrderMerchantSummary } from '@/lib/merchant-alerts';
import { sendWhatsAppMessage } from '@/lib/whatsapp';


export async function POST(req: NextRequest) {
  try {
    await ensureStoreSettingsSchema();
    const body = await req.json();
    const { storeId, items, total, customerInfo, paymentMethod, specificType, orderType: providedOrderType } = body;

    if (!storeId) {
      return NextResponse.json({ error: 'Store ID is required' }, { status: 400 });
    }
    const numericStoreId = Number.parseInt(String(storeId), 10);
    if (!Number.isFinite(numericStoreId)) {
      return NextResponse.json({ error: 'Invalid Store ID' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Items are required' }, { status: 400 });
    }

    const productIds = Array.from(
      new Set(
        items
          .map((item: any) => Number.parseInt(String(item?.id), 10))
          .filter((id: number) => Number.isFinite(id))
      )
    );
    if (productIds.length === 0) {
      return NextResponse.json({ error: 'Invalid item products' }, { status: 400 });
    }
    const products = await prisma.product.findMany({
      where: { storeId: numericStoreId, id: { in: productIds } },
      select: { id: true, name: true, price: true, stock: true }
    });
    const productMap = new Map(products.map((p) => [p.id, p]));
    if (productMap.size !== productIds.length) {
      return NextResponse.json({ error: 'Some products are invalid for this store' }, { status: 400 });
    }
    for (const item of items) {
      const pid = Number.parseInt(String(item?.id), 10);
      const qty = Number.parseInt(String(item?.quantity), 10);
      const prod = productMap.get(pid);
      if (!prod || !Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json({ error: 'Invalid item quantity' }, { status: 400 });
      }
      if (prod.stock !== null && prod.stock !== undefined && prod.stock < qty) {
        return NextResponse.json({ error: 'Insufficient stock for one or more items' }, { status: 400 });
      }
    }
    const normalizedItems = items.map((item: any) => {
      const pid = Number.parseInt(String(item?.id), 10);
      const qty = Number.parseInt(String(item?.quantity), 10);
      const prod = productMap.get(pid)!;
      return { productId: pid, quantity: qty, price: Number(prod.price) || 0, name: String((prod as any).name || "") };
    });

    const shippingProvider = customerInfo?.shippingProvider ? String(customerInfo.shippingProvider).toUpperCase() : null;
    const shippingService = customerInfo?.shippingService ? String(customerInfo.shippingService) : null;
    const shippingAddress = customerInfo?.shippingAddress ? String(customerInfo.shippingAddress) : null;
    const shippingCost = customerInfo?.shippingCost ? Number(customerInfo.shippingCost) : 0;
    const shippingEta = customerInfo?.shippingEta ? String(customerInfo.shippingEta) : null;
    const destinationLat = customerInfo?.destinationLatitude ? Number(customerInfo.destinationLatitude) : null;
    const destinationLng = customerInfo?.destinationLongitude ? Number(customerInfo.destinationLongitude) : null;
    const itemsSubtotal = normalizedItems.reduce((sum, it) => sum + (it.price * it.quantity), 0);
    const store = await prisma.store.findUnique({ where: { id: numericStoreId } });
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const taxPercent = Number((store as any).taxPercent || 0);
    const servicePercent = Number((store as any).serviceChargePercent || 0);
    const qrisFeePercent = Number((store as any).qrisFeePercent || 0);
    const gopayFeePercent = Number((store as any).gopayFeePercent || 0);
    const manualTransferFee = Number((store as any).manualTransferFee || 0);
    const feePaidBy = String((store as any).feePaidBy || "CUSTOMER").toUpperCase();

    const taxAmount = itemsSubtotal * (taxPercent / 100);
    const serviceCharge = itemsSubtotal * (servicePercent / 100);
    const subtotalWithTaxService = itemsSubtotal + taxAmount + serviceCharge;

    const paymentType = specificType ? String(specificType) : null;
    let paymentFee = 0;
    if (feePaidBy === "CUSTOMER") {
      if (paymentType === "qris" && qrisFeePercent) {
        paymentFee = subtotalWithTaxService * (qrisFeePercent / 100);
      } else if (paymentType === "gopay" && gopayFeePercent) {
        paymentFee = subtotalWithTaxService * (gopayFeePercent / 100);
      } else if (paymentType === "bank_transfer" && manualTransferFee) {
        paymentFee = manualTransferFee;
      }
    }

    const computedTotal =
      subtotalWithTaxService +
      (Number.isFinite(paymentFee) ? paymentFee : 0) +
      (Number.isFinite(shippingCost) ? shippingCost : 0);
    const safeTotal = Math.max(Number(total) || 0, computedTotal);

    const order = await prisma.order.create({
      data: {
        storeId: numericStoreId,
        customerPhone: customerInfo?.phone || 'GUEST',
        tableNumber: customerInfo?.tableNumber,
        totalAmount: safeTotal,
        status: 'PENDING',
        orderType: providedOrderType || (shippingProvider && shippingAddress ? 'DELIVERY' : 'DINE_IN'),
        paymentMethod: paymentType || undefined,
        taxAmount,
        serviceCharge,
        paymentFee,
        shippingProvider: shippingProvider || undefined,
        shippingService: shippingService || undefined,
        shippingAddress: shippingAddress || undefined,
        shippingCost: Number.isFinite(shippingCost) ? shippingCost : 0,
        shippingEta: shippingEta || undefined,
        destinationLat: destinationLat || undefined,
        destinationLng: destinationLng || undefined,
        shippingStatus: shippingProvider && shippingAddress ? 'QUOTE_READY' : undefined,
        items: {
          create: normalizedItems.map((item: any) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price
          }))
        }
      }
    });

    // Process Payment
    // If 'gateway' is sent (from old code?), default to midtrans or check settings.
    const method = paymentMethod === 'gateway' ? 'midtrans' : paymentMethod; 
    
    let result;
    if (method === 'gateway') {
       // Fallback logic
       const settings = await prisma.store.findUnique({ where: { id: numericStoreId } });
       if (settings?.enableMidtrans) result = await processPayment(order.id, safeTotal, customerInfo?.phone || '08123456789', 'midtrans', numericStoreId, specificType);
       else throw new Error("No gateway enabled");
    } else {
       result = await processPayment(order.id, safeTotal, customerInfo?.phone || '08123456789', method, numericStoreId, specificType);
    }

    void (async () => {
      try {
        if (store && order.orderType === "DELIVERY" && order.shippingProvider && order.shippingAddress) {
          const draft = await createBiteshipDraftForPendingOrder({
            store,
            order,
            items: normalizedItems.map((item: any) => ({
              name: item.name,
              quantity: item.quantity,
              price: item.price
            })),
            destinationCoordinate: order.destinationLat && order.destinationLng ? {
              latitude: order.destinationLat,
              longitude: order.destinationLng
            } : undefined
          });
          if (draft?.ok && draft?.draftOrderId) {
            const pendingDraft = draft as any;
            await prisma.order.update({
              where: { id: order.id },
              data: {
                biteshipOrderId: pendingDraft.draftOrderId,
                shippingStatus: pendingDraft.shippingStatus || order.shippingStatus || "draft_created"
              }
            });
          }
        }

        await createOrderNotification({
          storeId: parseInt(storeId),
          orderId: order.id,
          message: `Order Baru #${order.id}: ${customerInfo?.phone || "GUEST"} • Rp ${Math.round(safeTotal).toLocaleString("id-ID")}`,
          type: "NEW_ORDER"
        });

        const merchantMsg = await buildOrderMerchantSummary(order.id, "Order Baru (Web)");
        await sendMerchantWhatsApp(numericStoreId, merchantMsg, order.id).catch(() => null);

        const customerPhone = String(customerInfo?.phone || "").trim();
        const customerDigits = customerPhone.replace(/\D/g, "");
        if (customerDigits.length >= 8) {
          const ok = await acquireNotificationLock(`ORDER_PENDING_CUSTOMER_${order.id}`);
          if (ok) {
            const payUrl = resolvePaymentUrl(order.id, result?.paymentUrl || null);
            const msg =
              `🧾 *Order #${order.id} dibuat*\n` +
              `Toko: *${store.name}*\n` +
              `Total: *Rp ${Math.round(safeTotal).toLocaleString("id-ID")}*\n` +
              `Status: *MENUNGGU PEMBAYARAN*\n\n` +
              `Klik untuk lanjut bayar:\n${payUrl}`;
            await sendWhatsAppMessage(customerDigits, msg, numericStoreId).catch(() => null);
          }
        }
      } catch {
        return;
      }
    })();

    return NextResponse.json({ success: true, paymentUrl: result.paymentUrl, orderId: order.id });
  } catch (error: any) {
    console.error('Checkout Error:', error);
    return NextResponse.json({ error: error.message || 'Checkout failed' }, { status: 500 });
  }
}
