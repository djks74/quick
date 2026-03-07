
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { merchantConfig } from '@/config/merchant';
import { createPaymentLink } from '@/lib/payment';

// Helper to send WhatsApp message (placeholder)
async function sendWhatsAppMessage(to: string, message: string) {
  // In a real implementation, you'd use fetch() to Meta's Graph API
  // const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
  // const body = { messaging_product: "whatsapp", to, type: "text", text: { body: message } };
  console.log(`[WHATSAPP_MOCK] Sending to ${to}: ${message}`);
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode && token) {
    if (mode === 'subscribe' && token === 'laku_verify_token') {
      console.log('WEBHOOK_VERIFIED');
      return new NextResponse(challenge, { status: 200 });
    }
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (message) {
      const from = message.from; 
      const textBody = message.text?.body?.trim();
      
      // 1. Handle "I am at Table X"
      // Regex to match "Table X" or "Meja X" case insensitive
      const tableMatch = textBody?.match(/(?:table|meja)\s*(\d+)/i);
      
      if (tableMatch) {
        const tableNumber = tableMatch[1];
        // Reply with the digital menu link containing the table parameter
        const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://laku.com'}?table=${tableNumber}`;
        await sendWhatsAppMessage(from, `Welcome to Table ${tableNumber}! 👋\n\nPlease order from our digital menu here:\n${menuUrl}`);
      } 
      // 2. Handle Order Checkout Message
      else if (textBody?.toLowerCase().includes("would like to order")) {
        // Parse "Total: *Rp 55.000*" to get amount
        // This is a simplified parser based on the message we generate in DigitalMenuClient
        const totalMatch = textBody.match(/Total:\s*\*?Rp\s*([\d.]+)/i);
        
        if (totalMatch) {
          // Remove dots to get integer amount (Rp 55.000 -> 55000)
          const amount = parseInt(totalMatch[1].replace(/\./g, ''));
          
          // Create Pending Order
          // Note: In a real app, we might want to parse the items too, but for now we just need the total for payment
          const order = await prisma.order.create({
            data: {
              customerPhone: from,
              totalAmount: amount,
              status: 'PENDING',
              items: [] // In this simplified flow, we might not parse items yet, or we could pass them as JSON in the message
            }
          });

          // Generate Payment Link
          const paymentLink = await createPaymentLink(order.id, amount, from);
          
          await sendWhatsAppMessage(from, `Order #${order.id} received!\nAmount: Rp ${new Intl.NumberFormat('id-ID').format(amount)}\n\nPlease complete payment here:\n${paymentLink}`);
        }
      }
      // 3. Fallback / Default Menu
      else if (textBody?.toLowerCase() === 'menu') {
        const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://laku.com'}`;
        await sendWhatsAppMessage(from, `Here is our menu:\n${menuUrl}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
