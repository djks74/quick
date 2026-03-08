import { prisma } from "@/lib/prisma";

export async function sendWhatsAppMessage(to: string, message: string, storeId: number) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  
  // Default to Super Admin (Platform) Config
  let token = process.env.WHATSAPP_TOKEN;
  let phoneNumberId = process.env.WHATSAPP_PHONE_ID;

  // Enterprise Override: Use Store's own config if they are Enterprise and have set it up
  if (store?.subscriptionPlan === 'ENTERPRISE' && store.whatsappToken && store.whatsappPhoneId) {
    token = store.whatsappToken;
    phoneNumberId = store.whatsappPhoneId;
    console.log(`[WHATSAPP] Using Enterprise Config for Store ${storeId}`);
  } else {
    console.log(`[WHATSAPP] Using Platform Config for Store ${storeId}`);
  }
  
  if (!token) {
    console.log(`[WHATSAPP_MOCK] (No Token Configured) Sending to ${to}: ${message}`);
    return;
  }

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
