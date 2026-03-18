import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function acquireNotificationLock(key: string) {
  const id = `SYS-${key}`;
  try {
    await prisma.processedMessage.create({ data: { id } });
    return true;
  } catch {
    return false;
  }
}

export async function getMerchantPhone(storeId: number) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { owner: true }
  });
  
  if (!store) {
    console.error(`[MERCHANT_ALERT_ERROR] Store with ID ${storeId} not found`);
    return { store: null, phones: [] as string[] };
  }
  
  console.log(`[MERCHANT_ALERT_DEBUG] Store ${storeId} found: "${store.name}". Slug: "${store.slug}". WhatsApp in Identity: "${store.whatsapp}"`);

  const phones = new Set<string>();
  
  // 1. STRONGLY PRIORITIZE store.whatsapp (Store Identity from screenshot)
  if (store.whatsapp && store.whatsapp.trim().length > 5) {
    phones.add(store.whatsapp.trim());
    console.log(`[MERCHANT_ALERT_DEBUG] Added Store Identity Phone: ${store.whatsapp}`);
  }
  
  // 2. Add Owner's Phone
  if (store.owner?.phoneNumber && store.owner.phoneNumber.trim().length > 5) {
    phones.add(store.owner.phoneNumber.trim());
  }
  
  // 3. Add Shipping Sender Phone
  if (store.shippingSenderPhone && store.shippingSenderPhone.trim().length > 5) {
    phones.add(store.shippingSenderPhone.trim());
  }
  
  // 4. Add Staff Phones
  const staff = await prisma.user.findMany({
    where: { workedAtId: store.id },
    select: { phoneNumber: true }
  });
  staff.forEach(u => {
    if (u.phoneNumber && u.phoneNumber.trim().length > 5) {
      phones.add(u.phoneNumber.trim());
    }
  });
  
  const uniquePhones = Array.from(phones).filter(Boolean).map(p => {
    let clean = String(p).replace(/\D/g, "");
    if (clean.startsWith("0")) clean = "62" + clean.slice(1);
    else if (clean.startsWith("8")) clean = "62" + clean;
    // Special case for Indonesia numbers starting with 62 but needing consistency
    if (clean.startsWith("62")) {
       // Just make sure it's valid digits
       return clean;
    }
    return clean;
  });

  const finalPhones = Array.from(new Set(uniquePhones));
  console.log(`[MERCHANT_ALERT_DEBUG] Final sanitized merchant phones for store ${storeId}:`, finalPhones);

  return { store, phones: finalPhones };
}

export async function sendMerchantWhatsApp(storeId: number, text: string) {
  const { store, phones } = await getMerchantPhone(storeId);
  console.log(`[MERCHANT_ALERT] Starting alerts for store ${storeId} (${store?.name}). Recipients:`, phones);
  
  if (!store || phones.length === 0) {
    console.warn(`[MERCHANT_ALERT] No recipients found for store ${storeId}`);
    return false;
  }
  
  let overallSuccess = false;

  for (const phone of phones) {
    console.log(`[MERCHANT_ALERT] Attempting send to ${phone} using store account ${storeId}`);
    
    // 1. Always try the store's own account first as requested by the user
    // (They want it to come from the store's identity/bot)
    let sent = await sendWhatsAppMessage(phone, text, store.id);
    
    // 2. If it fails, then and only then try the platform account as a backup
    if (!sent) {
      console.log(`[MERCHANT_ALERT] Store account send failed for ${phone}, trying platform fallback (storeId 0)`);
      sent = await sendWhatsAppMessage(phone, text, 0);
    }

    if (sent) {
      overallSuccess = true;
      console.log(`[MERCHANT_ALERT] Successfully sent to ${phone}`);
    } else {
      console.error(`[MERCHANT_ALERT] FAILED to send to ${phone} from both store and platform accounts`);
    }
  }

  return overallSuccess;
}

export function resolvePaymentUrl(orderId: number, paymentUrl?: string | null) {
  if (paymentUrl) return paymentUrl;
  const base = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://gercep.click").replace(/\/$/, "");
  return `${base}/checkout/pay/${orderId}`;
}
