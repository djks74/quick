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
  try {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: { owner: true }
    });

    if (!store) {
      console.error(`[MERCHANT_NOTIF] Store not found: ${storeId}`);
      return { store: null, phones: [] as string[] };
    }

    const phones = new Set<string>();

    // 1. STRONGLY PRIORITIZE store.whatsapp (Store Identity)
    console.log(`[MERCHANT_NOTIF] Raw store.whatsapp: "${store.whatsapp}"`);
    if (store.whatsapp && store.whatsapp.trim().length > 5) {
      phones.add(store.whatsapp.trim());
    }

    // 2. Shipping Sender Phone (fallback)
    console.log(`[MERCHANT_NOTIF] Raw shippingSenderPhone: "${store.shippingSenderPhone}"`);
    if (store.shippingSenderPhone && store.shippingSenderPhone.trim().length > 5) {
      phones.add(store.shippingSenderPhone.trim());
    }

    // 3. Owner's phone number
    console.log(`[MERCHANT_NOTIF] Raw owner.phoneNumber: "${store.owner?.phoneNumber}"`);
    if (store.owner?.phoneNumber && store.owner.phoneNumber.trim().length > 5) {
      phones.add(store.owner.phoneNumber.trim());
    }

    // 4. Staff/Cashiers (only those with phone numbers)
    const staff = await prisma.user.findMany({
      where: { 
        workedAtId: store.id,
        phoneNumber: { not: null }
      },
      select: { phoneNumber: true }
    });

    staff.forEach(s => {
      if (s.phoneNumber && s.phoneNumber.trim().length > 5) {
        phones.add(s.phoneNumber.trim());
        console.log(`[MERCHANT_NOTIF] Added phone from staff: ${s.phoneNumber}`);
      }
    });

    const uniquePhones = Array.from(phones).filter(Boolean).map(p => {
      let clean = String(p).trim().replace(/\D/g, "");
      if (clean.startsWith("0")) clean = "62" + clean.slice(1);
      else if (clean.startsWith("8")) clean = "62" + clean;
      return clean;
    });

    const finalPhones = Array.from(new Set(uniquePhones));
    console.log(`[MERCHANT_NOTIF] Final recipient phones for store ${store.name}:`, finalPhones);
    
    if (finalPhones.length === 0) {
      console.warn(`[MERCHANT_NOTIF] NO PHONES FOUND for store ${store.name} (#${storeId}). Store WhatsApp: ${store.whatsapp}, Owner Phone: ${store.owner?.phoneNumber}`);
    }

    return { store, phones: finalPhones };
  } catch (error) {
    console.error(`[MERCHANT_NOTIF] Error fetching merchant phones for store ${storeId}:`, error);
    return { store: null, phones: [] };
  }
}

export async function sendMerchantWhatsApp(storeId: number, text: string, orderId?: number) {
  try {
    console.log(`[MERCHANT_ALERT] Starting alerts for store ${storeId}. Order: ${orderId || "N/A"}`);
    const { store, phones } = await getMerchantPhone(storeId);
    
    if (!store || phones.length === 0) {
      console.warn(`[MERCHANT_ALERT] No recipients found for store ${storeId}`);
      return false;
    }
    
    console.log(`[MERCHANT_ALERT] Store: ${store.name}. Recipients:`, phones);
    
    let overallSuccess = false;
    const chunkSize = 3;
    for (let i = 0; i < phones.length; i += chunkSize) {
      const chunk = phones.slice(i, i + chunkSize);
      const results = await Promise.allSettled(
        chunk.map(async (phone) => {
          console.log(`[MERCHANT_NOTIF] Attempting send to ${phone} for store ${store.name} (#${store.id})`);
          const sent = await sendWhatsAppMessage(phone, text, store.id);
          if (sent) {
            console.log(`[MERCHANT_NOTIF] Successfully sent to ${phone}`);
          } else {
            console.error(`[MERCHANT_NOTIF] FAILED to send to ${phone} for store ${store.name}`);
          }
          return sent;
        })
      );
      if (results.some((r) => r.status === "fulfilled" && r.value)) {
        overallSuccess = true;
      }
    }

    return overallSuccess;
  } catch (error) {
    console.error(`[MERCHANT_ALERT_CRITICAL_ERROR]`, error);
    return false;
  }
}

export function resolvePaymentUrl(orderId: number, paymentUrl?: string | null) {
  if (paymentUrl) return paymentUrl;
  const base = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://gercep.click").replace(/\/$/, "");
  return `${base}/checkout/pay/${orderId}`;
}

export async function buildOrderMerchantSummary(orderId: number, title: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { 
        store: true, 
        items: { include: { product: true } } 
      }
    });

    if (!order) return `Order #${orderId} not found`;

    const { store, items } = order;
    
    // Simple currency formatter that won't throw
    const formatIDR = (num: number) => {
      try {
        return new Intl.NumberFormat('id-ID').format(num);
      } catch (e) {
        return num.toLocaleString();
      }
    };

    let itemsMsg = "";
    if (items && items.length > 0) {
      items.forEach(it => {
        const pName = it.product?.name || "Product";
        itemsMsg += `- ${pName} x${it.quantity} = Rp ${formatIDR(it.price * it.quantity)}\n`;
      });
    } else {
      itemsMsg = "- No items found\n";
    }

    const subtotal = items?.reduce((sum, it) => sum + (it.price * it.quantity), 0) || 0;
    
    let msg = `🛒 *${title} #${order.id}*\n`;
    if (order.tableNumber) msg += `📍 Meja: *${order.tableNumber}*\n`;
    msg += `👤 Customer: ${order.customerPhone}\n`;
    msg += `🧾 Tipe: ${order.orderType === 'TAKEAWAY' ? 'Pickup' : (order.orderType === 'DELIVERY' ? 'Delivery' : 'Dine In')}\n`;
    msg += `💳 Bayar: ${order.paymentMethod === 'qris' ? 'QRIS' : (order.paymentMethod === 'bank_transfer' ? 'Bank Transfer' : (order.paymentMethod || '-'))}\n`;
    
    if (order.orderType === 'DELIVERY') {
      const pName = order.shippingProvider === 'STORE_COURIER' ? 'Kurir Toko' : (order.shippingProvider === 'GOSEND' ? 'Gosend' : (order.shippingProvider || '-'));
      msg += `🚚 Kurir: ${pName}${order.shippingService ? ` ${order.shippingService}` : ''}\n`;
      msg += `📦 Ongkir: Rp ${formatIDR(order.shippingCost || 0)}\n`;
      if (order.shippingAddress) msg += `📍 Alamat: ${order.shippingAddress}\n`;
    }

    msg += `\n📦 *Item:*\n${itemsMsg}\n`;
    msg += `------------------\n`;
    msg += `Subtotal: Rp ${formatIDR(subtotal)}\n`;
    if (order.taxAmount > 0) msg += `Pajak (${store.taxPercent}%): Rp ${formatIDR(order.taxAmount)}\n`;
    if (order.serviceCharge > 0) msg += `Service (${store.serviceChargePercent}%): Rp ${formatIDR(order.serviceCharge)}\n`;
    if (order.paymentFee > 0) msg += `Fee: Rp ${formatIDR(order.paymentFee)}\n`;
    msg += `*TOTAL: Rp ${formatIDR(order.totalAmount)}*\n`;

    if (order.status === 'PAID') {
      msg += `\n✅ *STATUS: SUDAH DIBAYAR*`;
      msg += `\n⚠️ Mohon segera proses pesanan ini!`;
    } else {
      msg += `\n⏳ *STATUS: MENUNGGU PEMBAYARAN*`;
    }

    return msg;
  } catch (error) {
    console.error(`[MERCHANT_ALERT] Error building summary for order #${orderId}:`, error);
    return `Order #${orderId} (Summary Error)`;
  }
}
