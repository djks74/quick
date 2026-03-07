import { prisma } from "@/lib/prisma";

export async function sendWhatsAppMessage(to: string, message: string) {
  const settings = await prisma.storeSettings.findFirst();
  const token = settings?.whatsappToken || process.env.WHATSAPP_TOKEN;
  
  if (!token) {
    console.log(`[WHATSAPP_MOCK] (No Token Configured) Sending to ${to}: ${message}`);
    return;
  }

  const phoneNumberId = settings?.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID; 

  console.log('SEND_WHATSAPP_DEBUG:', { to, message, phoneNumberId, token: token ? 'EXISTS' : 'MISSING' });

  if (!phoneNumberId) {
    console.log(`[WHATSAPP_MOCK] (No Phone ID) Sending to ${to}: ${message}`);
    return;
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: message }
      })
    });
    
    if (!res.ok) {
      const err = await res.text();
      console.error('[WHATSAPP_API_ERROR]', err);
    }
  } catch (error) {
    console.error('[WHATSAPP_SEND_ERROR]', error);
  }
}
