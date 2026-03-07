import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processPayment } from '@/lib/payment';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items, total, customerInfo, paymentMethod } = body;

    // Create Order
    const order = await prisma.order.create({
      data: {
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
    const method = paymentMethod === 'gateway' ? 'midtrans' : paymentMethod; // Default to midtrans if 'gateway' (legacy)
    // Actually, DigitalMenuClient sends 'manual', 'midtrans', 'xendit'.
    
    // If 'gateway', we need to pick one. But UI sends specific provider now.
    // If 'gateway' is sent (from old code?), default to midtrans or check settings.
    
    let result;
    if (method === 'gateway') {
       // Fallback logic
       const settings = await prisma.storeSettings.findFirst();
       if (settings?.enableMidtrans) result = await processPayment(order.id, total, customerInfo?.phone || '08123456789', 'midtrans');
       else if (settings?.enableXendit) result = await processPayment(order.id, total, customerInfo?.phone || '08123456789', 'xendit');
       else throw new Error("No gateway enabled");
    } else {
       result = await processPayment(order.id, total, customerInfo?.phone || '08123456789', method);
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
