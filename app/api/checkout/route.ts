import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processPayment } from '@/lib/payment';
import { createOrderNotification } from '@/lib/order-notifications';
import { ensureStoreSettingsSchema } from '@/lib/store-settings-schema';
import { createBiteshipDraftForPendingOrder } from '@/lib/shipping-biteship';
import { sendMerchantWhatsApp, buildOrderMerchantSummary } from '@/lib/merchant-alerts';


export async function POST(req: NextRequest) {
  try {
    await ensureStoreSettingsSchema();
    const body = await req.json();
    const { storeId, items, total, customerInfo, paymentMethod, specificType, orderType: providedOrderType } = body;

    if (!storeId) {
      return NextResponse.json({ error: 'Store ID is required' }, { status: 400 });
    }

    const shippingProvider = customerInfo?.shippingProvider ? String(customerInfo.shippingProvider).toUpperCase() : null;
    const shippingService = customerInfo?.shippingService ? String(customerInfo.shippingService) : null;
    const shippingAddress = customerInfo?.shippingAddress ? String(customerInfo.shippingAddress) : null;
    const shippingCost = customerInfo?.shippingCost ? Number(customerInfo.shippingCost) : 0;
    const shippingEta = customerInfo?.shippingEta ? String(customerInfo.shippingEta) : null;

    let order = await prisma.order.create({
      data: {
        storeId: parseInt(storeId),
        customerPhone: customerInfo?.phone || 'GUEST',
        tableNumber: customerInfo?.tableNumber,
        totalAmount: total,
        status: 'PENDING',
        orderType: providedOrderType || (shippingProvider && shippingAddress ? 'DELIVERY' : 'DINE_IN'),
        shippingProvider: shippingProvider || undefined,
        shippingService: shippingService || undefined,
        shippingAddress: shippingAddress || undefined,
        shippingCost: Number.isFinite(shippingCost) ? shippingCost : 0,
        shippingEta: shippingEta || undefined,
        shippingStatus: shippingProvider && shippingAddress ? 'QUOTE_READY' : undefined,
        items: {
          create: items.map((item: any) => ({
            productId: item.id,
            quantity: item.quantity,
            price: item.price
          }))
        }
      }
    });

    const store = await prisma.store.findUnique({ where: { id: parseInt(storeId) } });
    if (store && order.orderType === "DELIVERY" && order.shippingProvider && order.shippingAddress) {
      const draft = await createBiteshipDraftForPendingOrder({
        store,
        order,
        items: (items || []).map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price
        }))
      });
      if (draft?.ok && draft?.draftOrderId) {
        const pendingDraft = draft as any;
        order = await prisma.order.update({
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
      source: "STOREFRONT",
      title: `Order #${order.id} menunggu pembayaran`,
      body: `${customerInfo?.phone || "GUEST"} • Rp ${Math.round(total).toLocaleString("id-ID")}`,
      metadata: {
        paymentMethod,
        totalAmount: total,
        tableNumber: customerInfo?.tableNumber || null
      }
    });

    // Notify Merchant
    const merchantMsg = await buildOrderMerchantSummary(order.id, "Order Baru (Web)");
    await sendMerchantWhatsApp(parseInt(storeId), merchantMsg, order.id).catch(() => null);

    // Process Payment
    // If 'gateway' is sent (from old code?), default to midtrans or check settings.
    const method = paymentMethod === 'gateway' ? 'midtrans' : paymentMethod; 
    
    let result;
    if (method === 'gateway') {
       // Fallback logic
       const settings = await prisma.store.findUnique({ where: { id: parseInt(storeId) } });
       if (settings?.enableMidtrans) result = await processPayment(order.id, total, customerInfo?.phone || '08123456789', 'midtrans', parseInt(storeId), specificType);
       else throw new Error("No gateway enabled");
    } else {
       result = await processPayment(order.id, total, customerInfo?.phone || '08123456789', method, parseInt(storeId), specificType);
    }

    return NextResponse.json({ success: true, paymentUrl: result.paymentUrl, orderId: order.id });
  } catch (error: any) {
    console.error('Checkout Error:', error);
    return NextResponse.json({ error: error.message || 'Checkout failed' }, { status: 500 });
  }
}
