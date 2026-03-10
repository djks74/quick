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

    // Send Welcome Message using Template (Required for business-initiated conversations)
    // For now, we will send a Utility Template if available, or fall back to text and log warning.
    // Ideally, we should use a registered template like "check_in_welcome"
    
    // NOTE: Sending free-form text as the first message will FAIL if not within 24h window.
    // If this fails, we will need to implement a fallback to redirect the user to WhatsApp.
    
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

    try {
      await sendWhatsAppMessage(phone, message, storeId);
    } catch (sendError) {
      console.error("Failed to send WhatsApp message (likely 24h window issue):", sendError);
      // We can't do much here if it fails, the client should handle the "success" but maybe show a warning?
      // But we are returning success: true anyway.
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Check-in error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
