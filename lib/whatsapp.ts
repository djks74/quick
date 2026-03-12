import { prisma } from "@/lib/prisma";

export async function sendWhatsAppMessage(to: string, message: string, storeId: number, options?: { buttonText?: string, buttonUrl?: string }) {
  // Sanitize Phone Number (Indonesia Default)
  let formattedTo = to.replace(/\D/g, ''); 
  if (formattedTo.startsWith('0')) {
    formattedTo = '62' + formattedTo.substring(1);
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const platform = await prisma.platformSettings.findUnique({ where: { key: "default" } });
  
  let token = platform?.whatsappToken || process.env.WHATSAPP_TOKEN;
  let phoneNumberId = platform?.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID;

  // Enterprise Override: Use Store's own config if they are Enterprise and have set it up
  if (store?.slug !== "demo" && store?.subscriptionPlan === 'ENTERPRISE' && store.whatsappToken && store.whatsappPhoneId) {
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

  console.log('SEND_WHATSAPP_DEBUG:', { to, message, phoneNumberId, token: token ? 'EXISTS' : 'MISSING', options });

  if (!phoneNumberId) {
    console.log(`[WHATSAPP_MOCK] (No Phone ID) Sending to ${to}: ${message}`);
    return;
  }

  try {
    let body: any = {
      messaging_product: "whatsapp",
      to: formattedTo,
    };

    if (options?.buttonText && options?.buttonUrl) {
      // Send Interactive CTA URL Button
      body.type = "interactive";
      body.interactive = {
        type: "cta_url",
        body: {
          text: message
        },
        action: {
          name: "cta_url",
          parameters: {
            display_text: options.buttonText,
            url: options.buttonUrl
          }
        }
      };
    } else {
      // Fallback to standard text message
      body.type = "text";
      body.text = { 
          body: message,
          preview_url: true 
      };
    }

    const res = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });
    
    if (!res.ok) {
      const err = await res.text();
      console.error('[WHATSAPP_API_ERROR]', err);
      
      // If interactive fails (maybe API version or account restriction), fallback to text
      if (body.type === "interactive") {
          console.log('[WHATSAPP] CTA Button failed, falling back to text...');
          return await sendWhatsAppMessage(to, `${message}\n\n${options?.buttonUrl}`, storeId);
      }
      return false;
    }
    return true;
  } catch (error) {
    console.error('[WHATSAPP_SEND_ERROR]', error);
    return false;
  }
}
