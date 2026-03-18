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
  
  return { store, phones: Array.from(phones) };
}

export async function sendMerchantWhatsApp(storeId: number, text: string) {
  const { store, phones } = await getMerchantPhone(storeId);
  if (!store || phones.length === 0) return false;
  
  let overallSuccess = false;

  for (const phone of phones) {
    // 1. Try sending using store config (if billable)
    let sent = await sendWhatsAppMessage(phone, text, store.id);
    
    // 2. If failed, try sending using platform config (storeId 0)
    if (!sent) {
      sent = await sendWhatsAppMessage(phone, text, 0);
    }

    if (sent) overallSuccess = true;
  }

  return overallSuccess;
}

export function resolvePaymentUrl(orderId: number, paymentUrl?: string | null) {
  if (paymentUrl) return paymentUrl;
  const base = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://gercep.click").replace(/\/$/, "");
  return `${base}/checkout/pay/${orderId}`;
}
