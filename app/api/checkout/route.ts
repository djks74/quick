import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processPayment } from '@/lib/payment';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { storeId, items, total, customerInfo, paymentMethod } = body;

    if (!storeId) {
      return NextResponse.json({ error: 'Store ID is required' }, { status: 400 });
    }

    // Create Order
    const order = await prisma.order.create({
      data: {
        storeId: parseInt(storeId),
        customerPhone: customerInfo?.phone || 'GUEST',
        tableNumber: customerInfo?.tableNumber,
        totalAmount: total,
        status: 'PENDING',
        items: {
          create: items.map((item: any) => ({
            productId: item.id,
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
       const settings = await prisma.store.findUnique({ where: { id: parseInt(storeId) } });
       if (settings?.enableMidtrans) result = await processPayment(order.id, total, customerInfo?.phone || '08123456789', 'midtrans', parseInt(storeId));
       else if (settings?.enableXendit) result = await processPayment(order.id, total, customerInfo?.phone || '08123456789', 'xendit', parseInt(storeId));
       else throw new Error("No gateway enabled");
    } else {
       result = await processPayment(order.id, total, customerInfo?.phone || '08123456789', method, parseInt(storeId));
    }

    if (result.type === 'manual') {
       return NextResponse.json({ 
         success: true, 
         isManual: true, 
         orderId: order.id,
         amount: result.amount,
         uniqueCode: result.uniqueCode,
         bankInfo: {
            bankName: result.bankName,
            accountNumber: result.accountNumber,
            accountName: result.accountName
         }
       });
    }

    return NextResponse.json({ success: true, paymentUrl: result.paymentUrl, orderId: order.id });
  } catch (error: any) {
    console.error('Checkout Error:', error);
    return NextResponse.json({ error: error.message || 'Checkout failed' }, { status: 500 });
  }
}
