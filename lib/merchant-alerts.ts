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
    let clean = String(p).trim().replace(/\D/g, "");
    if (clean.startsWith("0")) clean = "62" + clean.slice(1);
    else if (clean.startsWith("8")) clean = "62" + clean;
    // Special case: if already starts with 62, don't re-add
    return clean;
  });

  const finalPhones = Array.from(new Set(uniquePhones));
  console.log(`[MERCHANT_NOTIF] Final recipient phones for store ${store.name}:`, finalPhones);
  return { store, phones: finalPhones };
}

export async function sendMerchantWhatsApp(storeId: number, text: string, orderId?: number) {
  const { store, phones } = await getMerchantPhone(storeId);
  console.log(`[MERCHANT_ALERT] Starting alerts for store ${storeId} (${store?.name}). Recipients:`, phones);
  
  if (!store || phones.length === 0) {
    console.warn(`[MERCHANT_ALERT] No recipients found for store ${storeId}`);
    return false;
  }
  
  let overallSuccess = false;

  for (const phone of phones) {
    console.log(`[MERCHANT_ALERT] Attempting send to ${phone} using store account ${storeId}`);

    let sent = await sendWhatsAppMessage(phone, text, store.id);

    if (sent) {
      overallSuccess = true;
      console.log(`[MERCHANT_ALERT] Successfully sent to ${phone}`);
    } else {
      console.error(`[MERCHANT_ALERT] FAILED to send to ${phone} using store account ${storeId}`);
    }
  }

  return overallSuccess;
}

export function resolvePaymentUrl(orderId: number, paymentUrl?: string | null) {
  if (paymentUrl) return paymentUrl;
  const base = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://gercep.click").replace(/\/$/, "");
  return `${base}/checkout/pay/${orderId}`;
}

export async function buildOrderMerchantSummary(orderId: number, title: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { 
      store: true, 
      items: { include: { product: true } } 
    }
  });

  if (!order) return "Order not found";

  const { store, items } = order;
  const currency = new Intl.NumberFormat('id-ID');

  let itemsMsg = "";
  items.forEach(it => {
    itemsMsg += `- ${it.product.name} x${it.quantity} = Rp ${currency.format(it.price * it.quantity)}\n`;
  });

  const subtotal = items.reduce((sum, it) => sum + (it.price * it.quantity), 0);
  
  let msg = `🛒 *${title} #${order.id}*\n`;
  if (order.tableNumber) msg += `📍 Meja: *${order.tableNumber}*\n`;
  msg += `👤 Customer: ${order.customerPhone}\n`;
  msg += `🧾 Tipe: ${order.orderType === 'TAKEAWAY' ? 'Takeaway' : (order.orderType === 'DELIVERY' ? 'Delivery' : 'Dine In')}\n`;
  msg += `💳 Bayar: ${order.paymentMethod === 'qris' ? 'QRIS' : (order.paymentMethod === 'bank_transfer' ? 'Bank Transfer' : (order.paymentMethod || '-'))}\n`;
  
  if (order.orderType === 'TAKEAWAY' || order.orderType === 'DELIVERY') {
    const pName = order.shippingProvider === 'STORE_COURIER' ? 'Kurir Toko' : (order.shippingProvider === 'GOSEND' ? 'Gosend' : (order.shippingProvider || '-'));
    msg += `🚚 Kurir: ${pName}${order.shippingService ? ` ${order.shippingService}` : ''}\n`;
    msg += `📦 Ongkir: Rp ${currency.format(order.shippingCost || 0)}\n`;
    if (order.shippingAddress) msg += `📍 Alamat: ${order.shippingAddress}\n`;
  }

  msg += `\n📦 *Item:*\n${itemsMsg}\n`;
  msg += `------------------\n`;
  msg += `Subtotal: Rp ${currency.format(subtotal)}\n`;
  if (order.taxAmount > 0) msg += `Pajak (${store.taxPercent}%): Rp ${currency.format(order.taxAmount)}\n`;
  if (order.serviceCharge > 0) msg += `Service (${store.serviceChargePercent}%): Rp ${currency.format(order.serviceCharge)}\n`;
  if (order.paymentFee > 0) msg += `Fee: Rp ${currency.format(order.paymentFee)}\n`;
  msg += `*TOTAL: Rp ${currency.format(order.totalAmount)}*\n`;

  if (order.status === 'PAID') {
    msg += `\n✅ *STATUS: SUDAH DIBAYAR*`;
    msg += `\n⚠️ Mohon segera proses pesanan ini!`;
  } else {
    msg += `\n⏳ *STATUS: MENUNGGU PEMBAYARAN*`;
  }

  return msg;
}
