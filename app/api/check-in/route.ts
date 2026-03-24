import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWhatsAppMessage, sendWhatsAppTemplateMessage } from '@/lib/whatsapp';
import { ensureStoreSettingsSchema } from '@/lib/store-settings-schema';

export async function POST(req: Request) {
  try {
    await ensureStoreSettingsSchema();
    const { phone, storeId, tableNumber, type } = await req.json();

    if (!phone || !storeId) {
      return NextResponse.json({ error: 'Missing phone or storeId' }, { status: 400 });
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const shippingConfigured = !!(store.enableTakeawayDelivery && (store.shippingEnableJne || (store.shippingEnableGosend && !store.shippingJneOnly)));

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
        data: { tableNumber: tableNumber?.toString() || null, step: shippingConfigured ? 'SERVICE_TYPE_SELECTION' : 'START' }
      });
    } else {
      await prisma.whatsAppSession.create({
        data: {
          phoneNumber: phone,
          storeId: storeId,
          tableNumber: tableNumber?.toString() || null,
          step: shippingConfigured ? 'SERVICE_TYPE_SELECTION' : 'START'
        }
      });
    }

    // Send Welcome Message using Template (Required for business-initiated conversations)
    // For now, we will send a Utility Template if available, or fall back to text and log warning.
    // Ideally, we should use a registered template like "check_in_welcome"
    
    // NOTE: Sending free-form text as the first message will FAIL if not within 24h window.
    // If this fails, we will need to implement a fallback to redirect the user to WhatsApp.
    
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://gercep.click';
    const menuUrl = `${baseUrl}/${store.slug}?phone=${phone}${tableNumber ? `&table=${tableNumber}` : ''}`;
    let message = `👋 Welcome to *${store.name}*`;
    if (tableNumber) {
        message += ` at *${tableNumber}*`;
    }
    message += `!\n\n`;
    
    if (type === 'whatsapp') {
        message += shippingConfigured
          ? `Reply with:\n1 for Dine In\n2 for Takeaway/Delivery\n\nThen reply "Menu" to start ordering. 🍽️`
          : `You can order directly via the button below, or reply with "Menu" to order here on WhatsApp. 🍽️`;
    } else {
        message += `You are currently viewing our Digital Menu on the web. Enjoy! 🌐`;
    }

    let sent = false;
    let templateSent = false;
    try {
      sent = await sendWhatsAppMessage(phone, message, storeId, { buttonText: "View Menu", buttonUrl: menuUrl }) || false;
      if (!sent && type === 'whatsapp') {
        const templateName = process.env.WHATSAPP_WELCOME_TEMPLATE || "hello_world";
        const templateLang = process.env.WHATSAPP_WELCOME_TEMPLATE_LANG || "en_US";
        templateSent = await sendWhatsAppTemplateMessage(phone, storeId, templateName, templateLang);
      }
    } catch (sendError) {
      console.error("Failed to send WhatsApp message:", sendError);
    }
    if (type === 'whatsapp') {
      if (!sent && !templateSent) {
        return NextResponse.json({
          success: false,
          messageSent: false,
          reason: "WHATSAPP_SEND_FAILED",
          fallbackPhone: "62882003961609"
        }, { status: 202 });
      }
      return NextResponse.json({
        success: true,
        messageSent: true,
        templateUsed: !sent && templateSent,
        fallbackPhone: "62882003961609"
      });
    }
    return NextResponse.json({
      success: true,
      messageSent: false
    });
  } catch (error) {
    console.error('Check-in error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
