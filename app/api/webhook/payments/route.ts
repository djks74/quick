import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { applyWaTopup, grantBundleCredit } from '@/lib/wa-credit';

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
    const order = await prisma.order.update({
      where: { id },
      data: { status }
    });

    // Send WhatsApp Notification if PAID
    if (status === 'PAID') {
      // Update Store Balance (Net Amount)
      const netAmount = order.totalAmount - (order.paymentFee || 0) - (order.transactionFee || 0);
      await prisma.store.update({
        where: { id: order.storeId },
        data: { balance: { increment: netAmount } }
      });

      // 1. Notify Customer
      await sendWhatsAppMessage(
        order.customerPhone,
        `✅ Payment Received! \n\nOrder #${order.id} has been paid successfully.\nAmount: Rp ${new Intl.NumberFormat('id-ID').format(order.totalAmount)}\n\nThank you for your order! We are preparing it now.`,
        order.storeId
      );

      // 2. Notify Merchant
      const store = await prisma.store.findUnique({
          where: { id: order.storeId },
          include: { owner: true }
      });

      if (store) {
          let merchantPhone = store.whatsapp;
          if (!merchantPhone && store.owner) {
              merchantPhone = store.owner.phoneNumber;
          }

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
                      await prisma.inventoryItem.update({
                          where: { id: ingredient.inventoryItemId },
                          data: { stock: { decrement: decrementAmount } }
                      });
                  }
              }
          }

          if (merchantPhone) {
              let msg = `💰 *Payment Received for Order #${order.id}*\n`;
              if (order.tableNumber) msg += `📍 Table: *${order.tableNumber}*\n`;
              msg += `👤 Customer: ${order.customerPhone}\n`;
              msg += `💵 Amount: Rp ${new Intl.NumberFormat('id-ID').format(order.totalAmount)}\n\n`;
              msg += `*Items:*\n`;
              
              items.forEach(item => {
                  msg += `${item.quantity}x ${item.product.name}\n`;
              });
              
              msg += `\n⚠️ Please start preparing the order!`;

              await sendWhatsAppMessage(merchantPhone, msg, store.id);
          }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Payment Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
