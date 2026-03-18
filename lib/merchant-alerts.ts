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
  if (!store) return { store: null, phones: [] as string[] };
  
  const phones = new Set<string>();
  if (store.whatsapp) phones.add(store.whatsapp);
  if (store.owner?.phoneNumber) phones.add(store.owner.phoneNumber);
  if (store.shippingSenderPhone) phones.add(store.shippingSenderPhone);
  
  // Also try searching for all users associated with this store (cashiers)
  const staff = await prisma.user.findMany({
    where: { workedAtId: store.id },
    select: { phoneNumber: true }
  });
  staff.forEach(u => {
    if (u.phoneNumber) phones.add(u.phoneNumber);
  });
  
  const uniquePhones = Array.from(phones).filter(Boolean).map(p => {
    let clean = String(p).replace(/\D/g, "");
    if (clean.startsWith("0")) clean = "62" + clean.slice(1);
    else if (clean.startsWith("8")) clean = "62" + clean;
    return clean;
  });

  return { store, phones: Array.from(new Set(uniquePhones)) };
}

export async function sendMerchantWhatsApp(storeId: number, text: string) {
  const { store, phones } = await getMerchantPhone(storeId);
  console.log(`[MERCHANT_ALERT] Sending to store ${storeId} (${store?.name}). Target phones:`, phones);
  
  if (!store || phones.length === 0) {
    console.warn(`[MERCHANT_ALERT] No phones found for store ${storeId}`);
    return false;
  }
  
  let overallSuccess = false;

  for (const phone of phones) {
    console.log(`[MERCHANT_ALERT] Attempting send to ${phone} for store ${storeId}`);
    
    // 1. First, try sending from the store's own account (billable or own token)
    let sent = await sendWhatsAppMessage(phone, text, store.id);
    
    // 2. If it failed, try sending from the platform account (storeId 0)
    // This is crucial if the store's own bot number is the same as the merchant's phone number
    // (Meta API often blocks sending a message to yourself)
    if (!sent) {
      console.log(`[MERCHANT_ALERT] Retrying with platform account (storeId 0) for phone ${phone}`);
      sent = await sendWhatsAppMessage(phone, text, 0);
    }

    if (sent) {
      console.log(`[MERCHANT_ALERT] Success sending to ${phone}`);
      overallSuccess = true;
    } else {
      console.error(`[MERCHANT_ALERT] Critical failure sending to ${phone} from both store and platform account`);
    }
  }

  return overallSuccess;
}

export function resolvePaymentUrl(orderId: number, paymentUrl?: string | null) {
  if (paymentUrl) return paymentUrl;
  const base = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://gercep.click").replace(/\/$/, "");
  return `${base}/checkout/pay/${orderId}`;
}
