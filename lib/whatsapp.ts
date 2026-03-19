import { prisma } from "@/lib/prisma";
import { finalizeWaMessageLog, logPlatformWaUsage, reserveWaCreditForMessage } from "@/lib/wa-credit";

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

  if (store?.slug !== "demo" && 
      store?.subscriptionPlan === "SOVEREIGN" &&
      store?.whatsappToken && store.whatsappToken.trim().length > 10 && 
      store?.whatsappPhoneId && store.whatsappPhoneId.trim().length > 5) {
    token = store.whatsappToken.trim();
    phoneNumberId = store.whatsappPhoneId.trim();
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
    console.error(`[WHATSAPP_API_ERROR] Status: ${res.status}. Body: ${errText}`);
    return { ok: false as const, error: errText, usedInteractive: body.type === "interactive" };
  }

  const payload = await res.json().catch(() => ({}));
  console.log(`[WHATSAPP_API_SUCCESS] Message ID: ${payload?.messages?.[0]?.id}`);
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

export async function sendWhatsAppMessage(to: string, message: string, storeId: number, options?: { buttonText?: string, buttonUrl?: string, isSystemAlert?: boolean }) {
  // Sanitize Phone Number (Indonesia Default)
  let formattedTo = to.replace(/\D/g, ''); 
  if (formattedTo.startsWith('0')) {
    formattedTo = '62' + formattedTo.substring(1);
  } else if (formattedTo.startsWith('8')) {
    formattedTo = '62' + formattedTo;
  }

  const resolved = await resolveWhatsAppConfig(storeId);
  const token = resolved.token;
  const phoneNumberId = resolved.phoneNumberId;
  
  if (!token || !phoneNumberId) {
    const errorMsg = `[WHATSAPP_CONFIG_ERROR] Missing ${!token ? 'Token' : ''} ${!phoneNumberId ? 'PhoneID' : ''} for store ${storeId}`;
    console.error(errorMsg);
    if (storeId === 0) {
      console.log(`[WHATSAPP_MOCK] Sending to ${to}: ${message}`);
      return true;
    }
    return false;
  }

  const maskedToken = token.length > 10 ? `${token.substring(0, 5)}...${token.substring(token.length - 5)}` : "SHORT_TOKEN";
  console.log('SEND_WHATSAPP_DEBUG:', { 
    to, 
    formattedTo,
    storeId, 
    phoneNumberId, 
    token: maskedToken, 
    useEnterprise: resolved.useEnterpriseConfig,
    options 
  });

  // System alerts (like order notifications to merchants) are NOT billable to the store.
  const isBillable = storeId > 0 && !resolved.useEnterpriseConfig && !options?.isSystemAlert;
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
        console.warn(`[WHATSAPP_CREDIT] Insufficient balance for store ${storeId} to send to ${to}`);
        const alertPhone = (reserve as any).alertPhone as string | null;
        const alertLevel = (reserve as any).alertLevel as "LOW" | "CRITICAL" | null;
        const storeSlug = (reserve as any).storeSlug as string | undefined;
        const shouldAlert = Boolean((reserve as any).shouldAlert);
        if (shouldAlert && alertPhone) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
          const lowCreditAlertUrl = storeSlug && baseUrl ? `${baseUrl.replace(/\/$/, "")}/${storeSlug}/admin/finance/ledger` : "";
          const alertText = alertLevel === "CRITICAL"
            ? (lowCreditAlertUrl
                ? `🚨 Saldo WA toko hampir habis. Top up sekarang agar notifikasi order tidak terhenti: ${lowCreditAlertUrl}`
                : `🚨 Saldo WA toko hampir habis. Top up sekarang agar notifikasi order tidak terhenti.`)
            : (lowCreditAlertUrl
                ? `⚠️ Saldo WA toko menipis. Top up sekarang: ${lowCreditAlertUrl}`
                : `⚠️ Saldo WA toko menipis. Top up sekarang.`);
          await sendWhatsAppMessage(alertPhone, alertText, 0);
        }
        return false;
      } else {
        console.warn(`[WHATSAPP_CREDIT] Failed reserving credit for store ${storeId}.`);
        return false;
      }
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
      
      // FALLBACK 1: If CTA Button failed, try plain text
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
    if (storeId === 0) {
      await logPlatformWaUsage({
        type: "PLATFORM_SEND",
        toPhone: formattedTo,
        description: "Platform WhatsApp message send",
        metadata: { interactive: Boolean(options?.buttonUrl), length: String(message || "").length }
      });
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
      console.warn(`[WHATSAPP_CREDIT] Credit reservation failed for template for store ${storeId}.`);
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
    if (storeId === 0) {
      await logPlatformWaUsage({
        type: "PLATFORM_TEMPLATE_SEND",
        toPhone: formattedTo,
        description: `Platform template send: ${templateName}`,
        metadata: { templateName, languageCode }
      });
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
