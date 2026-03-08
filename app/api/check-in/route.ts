import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export async function POST(req: Request) {
  try {
    const { phone, storeId, tableNumber, type } = await req.json();

    if (!phone || !storeId) {
      return NextResponse.json({ error: 'Missing phone or storeId' }, { status: 400 });
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Create or Update Session
    const existingSession = await prisma.whatsAppSession.findUnique({
      where: {
        phoneNumber_storeId: {
          phoneNumber: phone,
          storeId: storeId
        }
      }
    });

    if (existingSession) {
      await prisma.whatsAppSession.update({
        where: { id: existingSession.id },
        data: { tableNumber: tableNumber?.toString() || null, step: 'START' }
      });
    } else {
      await prisma.whatsAppSession.create({
        data: {
          phoneNumber: phone,
          storeId: storeId,
          tableNumber: tableNumber?.toString() || null,
          step: 'START'
        }
      });
    }

    // Send Welcome Message
    let message = `👋 Welcome to *${store.name}*`;
    if (tableNumber) {
        message += ` at *${tableNumber}*`;
    }
    message += `!\n\n`;
    
    if (type === 'whatsapp') {
        message += `Please reply with "Menu" to start ordering here on WhatsApp. 🍽️`;
    } else {
        message += `You are currently viewing our Digital Menu on the web. Enjoy! 🌐`;
    }

    // Only send if WhatsApp integration is enabled/configured
    // sendWhatsAppMessage handles checks internally or returns early if mock
    await sendWhatsAppMessage(phone, message, storeId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Check-in error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
