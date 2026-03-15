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
  if (!store) return { store: null, phone: null as string | null };
  return { store, phone: store.whatsapp || store.owner?.phoneNumber || null };
}

export async function sendMerchantWhatsApp(storeId: number, text: string) {
  const { store, phone } = await getMerchantPhone(storeId);
  if (!store || !phone) return false;
  const sent = await sendWhatsAppMessage(phone, text, store.id);
  if (sent) return true;
  return sendWhatsAppMessage(phone, text, 0);
}

export function resolvePaymentUrl(orderId: number, paymentUrl?: string | null) {
  if (paymentUrl) return paymentUrl;
  const base = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://gercep.click").replace(/\/$/, "");
  return `${base}/checkout/pay/${orderId}`;
}
