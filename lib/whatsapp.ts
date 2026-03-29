import { prisma } from "@/lib/prisma";
import { finalizeWaMessageLog, logPlatformWaUsage, reserveWaCreditForMessage } from "@/lib/wa-credit";

type WaResolvedConfig = {
  token: string | null;
  phoneNumberId: string | null;
  useEnterpriseConfig: boolean;
};

type WaQuickReply = { id: string; title: string };
type WaListRow = { id: string; title: string; description?: string };
type WaListSection = { title: string; rows: WaListRow[] };
type WaInteractiveOptions =
  | { type: "cta_url"; buttonText: string; buttonUrl: string }
  | { type: "buttons"; buttons: WaQuickReply[] }
  | { type: "list"; buttonText: string; sections: WaListSection[] };

const WA_CONFIG_CACHE_TTL_MS = 30 * 1000;
const waConfigCache = new Map<number, { value: WaResolvedConfig; expiresAt: number }>();

async function resolveWhatsAppConfig(storeId: number): Promise<WaResolvedConfig> {
  const cached = waConfigCache.get(storeId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const store = storeId > 0 ? await prisma.store.findUnique({ where: { id: storeId } }) : null;
  const platform = await prisma.platformSettings.findUnique({ where: { key: "default" } }).catch(() => null);

  let token = platform?.whatsappToken || process.env.WHATSAPP_TOKEN || null;
  let phoneNumberId = platform?.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID || null;
  let useEnterpriseConfig = false;

  if (store?.slug !== "demo" && 
      (store?.subscriptionPlan === "SOVEREIGN" || store?.subscriptionPlan === "CORPORATE") &&
      store?.whatsappToken && store.whatsappToken.trim().length > 10 && 
      store?.whatsappPhoneId && store.whatsappPhoneId.trim().length > 5) {
    token = store.whatsappToken.trim();
    phoneNumberId = store.whatsappPhoneId.trim();
    useEnterpriseConfig = true;
  }

  const resolved = { token, phoneNumberId, useEnterpriseConfig };
  waConfigCache.set(storeId, { value: resolved, expiresAt: Date.now() + WA_CONFIG_CACHE_TTL_MS });
  return resolved;
}

async function dispatchWhatsAppMessage(
  formattedTo: string,
  message: string,
  token: string,
  phoneNumberId: string,
  options?: { imageUrl?: string, interactive?: WaInteractiveOptions }
) {
  let body: any = {
    messaging_product: "whatsapp",
    to: formattedTo,
  };

  if (options?.imageUrl) {
    body.type = "image";
    body.image = {
      link: options.imageUrl,
      caption: message
    };
  } else if (options?.interactive?.type === "list") {
    body.type = "interactive";
    body.interactive = {
      type: "list",
      body: { text: message },
      action: {
        button: options.interactive.buttonText,
        sections: options.interactive.sections
      }
    };
  } else if (options?.interactive?.type === "buttons") {
    const buttons = (options.interactive.buttons || []).slice(0, 3).map((b) => ({
      type: "reply",
      reply: {
        id: String(b.id).slice(0, 200),
        title: String(b.title).slice(0, 20)
      }
    }));
    body.type = "interactive";
    body.interactive = {
      type: "button",
      body: { text: message },
      action: { buttons }
    };
  } else if (options?.interactive?.type === "cta_url") {
    body.type = "interactive";
    body.interactive = {
      type: "cta_url",
      body: {
        text: message
      },
      action: {
        name: "cta_url",
        parameters: {
          display_text: options.interactive.buttonText,
          url: options.interactive.buttonUrl
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
    return { ok: false as const, error: errText, usedInteractive: body.type === "interactive", interactiveType: body?.interactive?.type || null };
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

export async function sendWhatsAppMessage(
  to: string,
  message: string,
  storeId: number,
  options?: {
    buttonText?: string,
    buttonUrl?: string,
    imageUrl?: string,
    isSystemAlert?: boolean,
    quickReplies?: WaQuickReply[],
    list?: { buttonText: string; sections: WaListSection[] }
  }
) {
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
      externalRef,
      { category: "service", metaCost: 0 } // Free-form messages within 24h window are currently free by Meta, but we charge the platform fee or 0 depending on strategy. We'll set metaCost to 0 for service messages.
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
    const normalizedList = (() => {
      if (!options?.list) return null;
      const maxRows = 10;
      let remaining = maxRows;
      const sections = (options.list.sections || [])
        .map((s) => {
          if (remaining <= 0) return null;
          const rows = (s.rows || []).slice(0, remaining).map((r) => ({
            id: String(r.id || "").slice(0, 200),
            title: String(r.title || "").slice(0, 24),
            description: r.description != null ? String(r.description).slice(0, 72) : undefined
          }));
          remaining -= rows.length;
          if (rows.length === 0) return null;
          return {
            title: String(s.title || "").slice(0, 24),
            rows
          };
        })
        .filter(Boolean) as WaListSection[];
      if (sections.length === 0) return null;
      return {
        buttonText: String(options.list.buttonText || "").slice(0, 20),
        sections
      };
    })();

    const interactive: WaInteractiveOptions | undefined =
      normalizedList
        ? { type: "list", buttonText: normalizedList.buttonText, sections: normalizedList.sections }
        : (options?.quickReplies && options.quickReplies.length > 0)
          ? { type: "buttons", buttons: options.quickReplies }
          : (options?.buttonText && options?.buttonUrl)
            ? { type: "cta_url", buttonText: options.buttonText, buttonUrl: options.buttonUrl }
            : undefined;
    const result = await dispatchWhatsAppMessage(formattedTo, message, token, phoneNumberId, { imageUrl: options?.imageUrl, interactive });
    if (!result.ok) {
      console.error("[WHATSAPP_API_ERROR]", result.error);
      if (usageLogId) {
        await finalizeWaMessageLog(usageLogId, null, "failed");
      }
      
      if (result.usedInteractive) {
        if (options?.buttonUrl) {
          return await sendWhatsAppMessage(to, `${message}\n\n${options.buttonUrl}`, storeId);
        }
        if (options?.quickReplies?.length) {
          const listText = options.quickReplies
            .slice(0, 3)
            .map((b, idx) => `${idx + 1}. ${b.title}`)
            .join("\n");
          return await sendWhatsAppMessage(to, `${message}\n\n${listText}`, storeId);
        }
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
      externalRef,
      { category: "utility" } // Most of our templates are utility
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
