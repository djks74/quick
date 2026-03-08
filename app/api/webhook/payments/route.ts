import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('PAYMENT_WEBHOOK:', JSON.stringify(body, null, 2));

    const { order_id, transaction_status, gross_amount } = body;

    // Extract Order ID from "ORDER-123-171..."
    const orderIdStr = order_id.split('-')[1]; // Get '123'
    const orderId = parseInt(orderIdStr);

    if (isNaN(orderId)) {
      return NextResponse.json({ error: 'Invalid Order ID' }, { status: 400 });
    }

    let status = 'PENDING';
    if (transaction_status === 'capture' || transaction_status === 'settlement') {
      status = 'PAID';
    } else if (transaction_status === 'deny' || transaction_status === 'cancel' || transaction_status === 'expire') {
      status = 'CANCELLED';
    } else if (transaction_status === 'pending') {
      status = 'PENDING';
    }

    // Update Order
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status }
    });

    // Send WhatsApp Notification if PAID
    if (status === 'PAID') {
      await sendWhatsAppMessage(
        order.customerPhone,
        `✅ Payment Received! \n\nOrder #${order.id} has been paid successfully.\nAmount: Rp ${new Intl.NumberFormat('id-ID').format(order.totalAmount)}\n\nThank you for your order! We are preparing it now.`,
        order.storeId
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Payment Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
