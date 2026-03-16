import { prisma } from "@/lib/prisma";
import { finalizeWaMessageLog, reserveWaCreditForMessage } from "@/lib/wa-credit";

type WaResolvedConfig = {
  token: string | null;
  phoneNumberId: string | null;
  useEnterpriseConfig: boolean;
};

async function resolveWhatsAppConfig(storeId: number): Promise<WaResolvedConfig> {
  const store = storeId > 0 ? await prisma.store.findUnique({ where: { id: storeId } }) : null;
  const platform = await prisma.platformSettings.findUnique({ where: { key: "default" } }).catch(() => null);

  let token = platform?.whatsappToken || process.env.WHATSAPP_TOKEN || null;
  let phoneNumberId = platform?.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID || null;
  let useEnterpriseConfig = false;

  if (store?.slug !== "demo" && store?.subscriptionPlan === "ENTERPRISE" && store.whatsappToken && store.whatsappPhoneId) {
    token = store.whatsappToken;
    phoneNumberId = store.whatsappPhoneId;
    useEnterpriseConfig = true;
  }

  return { token, phoneNumberId, useEnterpriseConfig };
}

async function dispatchWhatsAppMessage(formattedTo: string, message: string, token: string, phoneNumberId: string, options?: { buttonText?: string, buttonUrl?: string }) {
  let body: any = {
    messaging_product: "whatsapp",
    to: formattedTo,
  };

  if (options?.buttonText && options?.buttonUrl) {
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
    body.type = "text";
    body.text = {
      body: message,
      preview_url: true
    };
  }

  const res = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    return { ok: false as const, error: errText, usedInteractive: body.type === "interactive" };
  }

  const payload = await res.json().catch(() => ({}));
  const messageId = payload?.messages?.[0]?.id || null;
  return { ok: true as const, messageId };
}

async function dispatchWhatsAppTemplateMessage(
  formattedTo: string,
  token: string,
  phoneNumberId: string,
  templateName: string,
  languageCode: string
) {
  const body: any = {
    messaging_product: "whatsapp",
    to: formattedTo,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: languageCode
      }
    }
  };

  const res = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    return { ok: false as const, error: errText };
  }

  const payload = await res.json().catch(() => ({}));
  const messageId = payload?.messages?.[0]?.id || null;
  return { ok: true as const, messageId };
}

export async function sendWhatsAppMessage(to: string, message: string, storeId: number, options?: { buttonText?: string, buttonUrl?: string }) {
  // Sanitize Phone Number (Indonesia Default)
  let formattedTo = to.replace(/\D/g, ''); 
  if (formattedTo.startsWith('0')) {
    formattedTo = '62' + formattedTo.substring(1);
  }

  const resolved = await resolveWhatsAppConfig(storeId);
  const token = resolved.token;
  const phoneNumberId = resolved.phoneNumberId;
  
  if (!token) {
    console.log(`[WHATSAPP_MOCK] (No Token Configured) Sending to ${to}: ${message}`);
    return true;
  }

  console.log('SEND_WHATSAPP_DEBUG:', { to, message, phoneNumberId, token: token ? 'EXISTS' : 'MISSING', options });

  if (!phoneNumberId) {
    console.log(`[WHATSAPP_MOCK] (No Phone ID) Sending to ${to}: ${message}`);
    return true;
  }

  const isBillable = storeId > 0 && !resolved.useEnterpriseConfig;
  const externalRef = `WA-${storeId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let usageLogId: number | null = null;
  let lowCreditAlertPhone: string | null = null;
  let lowCreditAlertUrl = "";
  let lowCreditAlertLevel: "LOW" | "CRITICAL" | null = null;

  if (isBillable) {
    const reserve = await reserveWaCreditForMessage(
      storeId,
      `Message to ${formattedTo}`,
      externalRef
    );
    if (!reserve.ok) {
      if (reserve.reason === "INSUFFICIENT_BALANCE") {
        console.warn(`[WHATSAPP_CREDIT] Insufficient balance for store ${storeId}`);
      } else {
        console.warn(`[WHATSAPP_CREDIT] Failed reserving credit for store ${storeId}`);
      }
      return false;
    }
    usageLogId = reserve.logId;
    if (reserve.shouldAlert && reserve.alertPhone) {
      lowCreditAlertPhone = reserve.alertPhone;
      lowCreditAlertLevel = reserve.alertLevel || null;
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
      lowCreditAlertUrl = reserve.storeSlug && baseUrl ? `${baseUrl.replace(/\/$/, "")}/${reserve.storeSlug}/admin/finance/ledger` : "";
    }
  }

  try {
    const result = await dispatchWhatsAppMessage(formattedTo, message, token, phoneNumberId, options);
    if (!result.ok) {
      console.error("[WHATSAPP_API_ERROR]", result.error);
      if (usageLogId) {
        await finalizeWaMessageLog(usageLogId, null, "failed");
      }
      if (result.usedInteractive && options?.buttonUrl) {
        console.log("[WHATSAPP] CTA Button failed, falling back to text...");
        return await sendWhatsAppMessage(to, `${message}\n\n${options.buttonUrl}`, storeId);
      }
      return false;
    }

    if (usageLogId) {
      await finalizeWaMessageLog(usageLogId, result.messageId, "sent");
    }
    if (lowCreditAlertPhone) {
      const alertText = lowCreditAlertLevel === "CRITICAL"
        ? (
            lowCreditAlertUrl
              ? `🚨 Your Gercep WA balance is almost empty. Top up immediately to avoid message interruption: ${lowCreditAlertUrl}`
              : `🚨 Your Gercep WA balance is almost empty. Top up immediately to avoid message interruption.`
          )
        : (
            lowCreditAlertUrl
              ? `⚠️ Your Gercep WA balance is low. Top up now so receipts keep sending: ${lowCreditAlertUrl}`
              : `⚠️ Your Gercep WA balance is low. Top up now so receipts keep sending.`
          );
      await dispatchWhatsAppMessage(
        lowCreditAlertPhone.replace(/\D/g, "").replace(/^0/, "62"),
        alertText,
        token,
        phoneNumberId
      );
    }
    return true;
  } catch (error) {
    console.error('[WHATSAPP_SEND_ERROR]', error);
    if (usageLogId) {
      await finalizeWaMessageLog(usageLogId, null, "failed");
    }
    return false;
  }
}

export async function sendWhatsAppTemplateMessage(
  to: string,
  storeId: number,
  templateName: string,
  languageCode: string = "id"
) {
  let formattedTo = to.replace(/\D/g, '');
  if (formattedTo.startsWith('0')) {
    formattedTo = '62' + formattedTo.substring(1);
  }

  const resolved = await resolveWhatsAppConfig(storeId);
  const token = resolved.token;
  const phoneNumberId = resolved.phoneNumberId;

  if (!token || !phoneNumberId) {
    return false;
  }

  const isBillable = storeId > 0 && !resolved.useEnterpriseConfig;
  const externalRef = `WA-TPL-${storeId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let usageLogId: number | null = null;

  if (isBillable) {
    const reserve = await reserveWaCreditForMessage(
      storeId,
      `Template message to ${formattedTo}`,
      externalRef
    );
    if (!reserve.ok) {
      return false;
    }
    usageLogId = reserve.logId;
  }

  try {
    const result = await dispatchWhatsAppTemplateMessage(
      formattedTo,
      token,
      phoneNumberId,
      templateName,
      languageCode
    );
    if (!result.ok) {
      console.error("[WHATSAPP_TEMPLATE_ERROR]", result.error);
      if (usageLogId) {
        await finalizeWaMessageLog(usageLogId, null, "failed");
      }
      return false;
    }
    if (usageLogId) {
      await finalizeWaMessageLog(usageLogId, result.messageId, "sent");
    }
    return true;
  } catch (error) {
    console.error("[WHATSAPP_TEMPLATE_SEND_ERROR]", error);
    if (usageLogId) {
      await finalizeWaMessageLog(usageLogId, null, "failed");
    }
    return false;
  }
}
