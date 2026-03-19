import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getShippingQuoteFromBiteship, createBiteshipDraftForPendingOrder } from "@/lib/shipping-biteship";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendMerchantWhatsApp } from "@/lib/merchant-alerts";
import { processPayment } from "@/lib/payment";
import { createOrderNotification } from "@/lib/order-notifications";
import { getDistanceMeters } from "@/lib/utils";

export const runtime = "nodejs";

function normalizePhoneNumber(phone: string) {
  let clean = phone.replace(/\D/g, "");
  if (clean.startsWith("0")) {
    clean = "62" + clean.slice(1);
  } else if (clean.startsWith("8")) {
    clean = "62" + clean;
  }
  return clean;
}

const AI_API_KEY = process.env.AI_API_KEY || "gercep_ai_secret_123";

// These are the actual implementations of the tools Gemini will call
const tools: Record<string, (args: any) => Promise<any>> = {
  async search_stores({ query, location_context }: { query: string, location_context?: string }) {
    await ensureStoreSettingsSchema();
    const where: any = {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { slug: { contains: query, mode: "insensitive" } },
        { categories: { some: { name: { contains: query, mode: "insensitive" } } } },
        { products: { some: { name: { contains: query, mode: "insensitive" } } } }
      ]
    };

    if (location_context) {
      where.AND = [
        {
          OR: [
            { shippingSenderAddress: { contains: location_context, mode: "insensitive" } },
            { shippingSenderPostalCode: { contains: location_context, mode: "insensitive" } }
          ]
        }
      ];
    }

    const stores = await prisma.store.findMany({
      where,
      select: { 
        name: true, 
        slug: true,
        whatsapp: true,
        shippingSenderAddress: true,
        shippingSenderName: true,
        shippingSenderPostalCode: true,
        biteshipOriginLat: true,
        biteshipOriginLng: true,
        categories: { select: { name: true }, take: 2 },
        products: { 
          where: { name: { contains: query, mode: "insensitive" } },
          select: { name: true },
          take: 2
        }
      },
      take: 5
    });
    return { stores };
  },

  async get_store_stats({ slug }: { slug: string }) {
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findUnique({
      where: { slug },
      include: {
        orders: { where: { status: "PAID" }, select: { totalAmount: true } }
      }
    });
    if (!store) return { error: "Store not found" };
    const totalSales = store.orders.reduce((sum, o) => sum + o.totalAmount, 0);
    return {
      storeName: store.name,
      totalSales,
      walletBalance: store.balance,
      waBalance: store.waBalance
    };
  },

  async get_store_products({ slug }: { slug: string }) {
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findUnique({
      where: { slug },
      include: {
        products: {
          where: { category: { not: "System" } },
          select: { id: true, name: true, price: true, category: true, variations: true, stock: true }
        }
      }
    });
    if (!store) return { error: "Store not found" };
    return { 
      products: store.products,
      taxPercent: store.taxPercent,
      serviceChargePercent: store.serviceChargePercent
    };
  },

  async update_product_price({ slug, productName, newPrice, variationName }: any) {
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return { error: "Store not found" };
    
    const products = await prisma.product.findMany({
      where: { storeId: store.id },
      select: { id: true, name: true, variations: true, price: true }
    });
    
    const product = products.find(p => p.name.toLowerCase().includes(productName.toLowerCase()));
    if (!product) return { error: `Product "${productName}" not found.` };
    
    if (variationName && product.variations && Array.isArray(product.variations)) {
      const variations = product.variations as any[];
      const idx = variations.findIndex(v => v.name.toLowerCase().includes(variationName.toLowerCase()));
      if (idx >= 0) {
        variations[idx].price = Number(newPrice);
        await prisma.product.update({ where: { id: product.id }, data: { variations } });
        return { success: true, message: `Updated ${product.name} (${variations[idx].name}) to ${newPrice}` };
      }
    }
    
    await prisma.product.update({ where: { id: product.id }, data: { price: Number(newPrice) } });
    return { success: true, message: `Updated ${product.name} price to ${newPrice}` };
  },

  async add_new_product({ slug, name, price, category }: any) {
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return { error: "Store not found" };
    
    const product = await prisma.product.create({
      data: {
        storeId: store.id,
        name,
        price: Number(price),
        category: category || "General",
        stock: 100,
        description: "Added via AI Assistant"
      }
    });
    return { success: true, productId: product.id, message: `Added new product ${name}` };
  },

  async get_shipping_rates({ slug, address, latitude, longitude, weightGrams }: any) {
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return { error: "Store not found" };
    
    try {
      const quotes = await getShippingQuoteFromBiteship({
        store,
        destinationAddress: address,
        destinationLatitude: latitude,
        destinationLongitude: longitude,
        weightGrams: weightGrams || 1000
      });
      
      if (!quotes || quotes.length === 0) {
        return { 
          error: "No shipping options available for this location.",
          suggestManual: true 
        };
      }

      const enabledProviders: string[] = [];
      if (store.shippingEnableJne) enabledProviders.push("JNE");
      if (store.shippingEnableGosend && !store.shippingJneOnly) enabledProviders.push("GOSEND");
      
      // Check if near store (100m) for automatic Store Courier option
      let isNearStore = false;
      if (latitude && longitude && store.biteshipOriginLat && store.biteshipOriginLng) {
        const dist = getDistanceMeters(latitude, longitude, parseFloat(String(store.biteshipOriginLat)), parseFloat(String(store.biteshipOriginLng)));
        if (dist <= 100) {
          isNearStore = true;
        }
      }

      if (isNearStore || (store as any).shippingEnableStoreCourier) enabledProviders.push("STORE_COURIER");

      const filtered = quotes.filter((q: any) => enabledProviders.includes(q.provider));

      // If near store but no quote (Biteship might fail for very short distance), inject Store Courier manually
      if ((isNearStore || (store as any).shippingEnableStoreCourier) && !filtered.find((f: any) => f.provider === "STORE_COURIER")) {
         filtered.unshift({
           provider: "STORE_COURIER",
           service: "Kurir Toko",
           fee: Number((store as any).shippingStoreCourierFee || 0),
           eta: "15-30 min",
           type: "instant"
         });
       }

      if (filtered.length === 0) {
        return { 
          error: `Metode pengiriman tidak tersedia untuk rute ini. Toko hanya mendukung: ${enabledProviders.map(p => p === "STORE_COURIER" ? "Kurir Toko" : p).join(", ") || "Pickup"}.`,
          suggestManual: true 
        };
      }

      const options = filtered.map((q: any) => 
        `- ${q.provider === "STORE_COURIER" ? "Kurir Toko" : q.provider} ${q.provider === "STORE_COURIER" ? "" : q.service}: Rp ${new Intl.NumberFormat('id-ID').format(q.fee)}`.replace(/\s+/g, ' ').trim()
      ).join("\n");

      return { options };
    } catch (e) {
      console.error("[AI_SHIPPING_ERROR]", e);
      return { 
        error: "Technical issue calculating rates. Please try again or provide a more specific address.",
        suggestManual: true
      };
    }
  },

  async create_customer_order({ slug, customer_phone, items, order_type, address, latitude, longitude, shippingProvider, shippingService, shippingFee, payment_method }: any) {
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return { error: "Store not found" };

    const cleanPhone = normalizePhoneNumber(customer_phone);
    const orderType = String(order_type || "").toUpperCase();
    const isDelivery = orderType === "DELIVERY";
    const trimmedAddress = String(address || "").trim();

    if (isDelivery) {
      if (!trimmedAddress || trimmedAddress.length < 8) {
        return { error: "Alamat pengiriman wajib diisi untuk order delivery." };
      }
      const hasPostal = /\b\d{5}\b/.test(trimmedAddress);
      const hasCoordinate = typeof latitude === "number" && typeof longitude === "number";
      if (!hasPostal && !hasCoordinate) {
        return { error: "Alamat pengiriman wajib mencantumkan Kode Pos (5 digit) atau share lokasi (GPS)." };
      }
      if (!shippingProvider) {
        return { error: "Kurir belum dipilih. Mohon pilih kurir dan ongkir dulu." };
      }
      const providerUpper = String(shippingProvider || "").toUpperCase();
      if (providerUpper !== "STORE_COURIER") {
        if (!shippingService || shippingFee === undefined || shippingFee === null) {
          return { error: "Kurir belum dipilih. Mohon pilih kurir dan ongkir dulu." };
        }
      }

      const senderAddress = String(store?.shippingSenderAddress || "").trim();
      const senderPhone = String(store?.shippingSenderPhone || store?.whatsapp || "").trim();
      const senderPostal = String(store?.shippingSenderPostalCode || "").replace(/\D/g, "");
      if (!senderAddress || !senderPhone || !senderPostal) {
        return { error: "Alamat toko/pengirim belum lengkap. Mohon lengkapi di pengaturan shipping toko." };
      }
    }

    let itemsAmount = 0;
    const orderItemsData = [];
    const details = [];
    for (const item of items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId, storeId: store.id } });
      if (!product) return { error: `Product ID ${item.productId} not found` };
      
      let itemPrice = product.price;
      let itemName = product.name;
      
      if (item.variationName && product.variations && Array.isArray(product.variations)) {
        const variations = product.variations as any[];
        const variation = variations.find(v => 
          v.name.toLowerCase().includes(item.variationName.toLowerCase()) || 
          item.variationName.toLowerCase().includes(v.name.toLowerCase())
        );
        if (variation) {
          itemPrice = variation.price;
          itemName = `${product.name} (${variation.name})`;
        }
      }
      
      const lineTotal = itemPrice * item.quantity;
      itemsAmount += lineTotal;
      orderItemsData.push({ productId: product.id, quantity: item.quantity, price: itemPrice });
      details.push(`📦 ${itemName}\n   ${item.quantity}x @ Rp ${new Intl.NumberFormat('id-ID').format(itemPrice)} = Rp ${new Intl.NumberFormat('id-ID').format(lineTotal)}`);
    }

    const taxAmount = itemsAmount * (store.taxPercent / 100);
    const serviceCharge = itemsAmount * (store.serviceChargePercent / 100);
    const providerUpper = String(shippingProvider || "").toUpperCase();
    const shippingCost = isDelivery
      ? (providerUpper === "STORE_COURIER"
          ? Number.isFinite(Number(shippingFee))
            ? Number(shippingFee)
            : Number((store as any)?.shippingStoreCourierFee || 0)
          : Number(shippingFee) || 0)
      : 0;
    
    let paymentFee = 0;
    const subtotal = itemsAmount + taxAmount + serviceCharge + shippingCost;
    if (payment_method === "qris") {
      paymentFee = subtotal * 0.01;
    } else if (payment_method === "bank_transfer") {
      paymentFee = 5000;
    }

    const finalAmount = subtotal + paymentFee;

    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        customerPhone: cleanPhone,
        totalAmount: finalAmount,
        taxAmount,
        serviceCharge,
        paymentFee,
        status: "PENDING",
        orderType: orderType || "DINE_IN",
        paymentMethod: payment_method || null,
        shippingAddress: isDelivery ? (trimmedAddress || null) : null,
        shippingProvider: isDelivery ? (providerUpper || null) : null,
        shippingService: isDelivery
          ? (providerUpper === "STORE_COURIER" ? "KURIR_TOKO" : (shippingService || null))
          : null,
        shippingCost,
        notes: JSON.stringify({ source: "AI_CHAT_ASSISTANT" }),
        items: { create: orderItemsData }
      } as any
    });

    // --- Biteship Draft Integration ---
    if (isDelivery && providerUpper !== "STORE_COURIER" && providerUpper && shippingService) {
      try {
        const biteshipItems = [];
        for (const item of orderItemsData) {
          const product = await prisma.product.findUnique({ where: { id: item.productId } });
          biteshipItems.push({
            name: product?.name || "Product",
            quantity: item.quantity,
            price: item.price,
            weight: 200 // Default weight
          });
        }

        const draft = await createBiteshipDraftForPendingOrder({
          store,
          order,
          items: biteshipItems,
          destinationCoordinate: (latitude && longitude) ? { latitude, longitude } : undefined
        }) as any;

        if (draft.ok) {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              biteshipOrderId: draft.draftOrderId,
              shippingStatus: draft.shippingStatus
            } as any
          });
        } else if (draft?.error) {
          await prisma.order.update({
            where: { id: order.id },
            data: { shippingStatus: "draft_failed" } as any
          });
          return { error: "Gagal membuat draft pengiriman. Mohon cek alamat & pilih kurir ulang." };
        }
      } catch (e) {
        console.error("[BITESHIP_DRAFT_ERROR]", e);
        await prisma.order
          .update({ where: { id: order.id }, data: { shippingStatus: "draft_failed" } as any })
          .catch(() => null);
        return { error: "Gagal membuat draft pengiriman. Mohon coba lagi." };
      }
    }

    let paymentUrl: string | null = null;
    try {
      const payment = await processPayment(
        order.id,
        finalAmount,
        cleanPhone,
        "midtrans",
        store.id,
        payment_method
      );
      if (payment.paymentUrl) {
        paymentUrl = payment.paymentUrl;
      }
    } catch (e) {
      console.error("[AI_ORDER_PAYMENT_ERROR]", e);
    }

    if (!paymentUrl) {
      return {
        error: "Actual payment link is unavailable right now. Please retry."
      };
    }

    await sendMerchantWhatsApp(
      store.id,
      `🛒 *Order Pending*\nOrder #${order.id} menunggu pembayaran.\nCustomer: ${cleanPhone}\nTotal: Rp ${new Intl.NumberFormat("id-ID").format(finalAmount)}\nKurir: ${providerUpper === "STORE_COURIER" ? "Kurir Toko" : (shippingProvider || "-")}${shippingService ? ` ${shippingService}` : ""}${providerUpper === "STORE_COURIER" ? "\n\n🚀 *NOTE: Kirim dengan Kurir Toko*" : ""}`,
      order.id
    ).catch(() => null);

    const breakdown = [
      `🛒 *${store.name} ORDER #${order.id}*`,
      `--------------------------------`,
      ...details,
      `--------------------------------`,
      `💵 *RINGKASAN BIAYA*`,
      `Subtotal: Rp ${new Intl.NumberFormat('id-ID').format(itemsAmount)}`,
      taxAmount > 0 ? `Pajak (${store.taxPercent}%): Rp ${new Intl.NumberFormat('id-ID').format(taxAmount)}` : null,
      serviceCharge > 0 ? `Service (${store.serviceChargePercent}%): Rp ${new Intl.NumberFormat('id-ID').format(serviceCharge)}` : null,
      shippingCost > 0 ? `🚛 Ongkir (${providerUpper === "STORE_COURIER" ? "Kurir Toko" : `${providerUpper || "-"}${shippingService ? ` ${shippingService}` : ""}`}): Rp ${new Intl.NumberFormat('id-ID').format(shippingCost)}` : null,
      paymentFee > 0 ? `💳 Biaya (${payment_method === "bank_transfer" ? "Bank Transfer" : payment_method.toUpperCase()}): Rp ${new Intl.NumberFormat('id-ID').format(paymentFee)}` : null,
      `--------------------------------`,
      `💰 *TOTAL: Rp ${new Intl.NumberFormat('id-ID').format(finalAmount)}*`
    ].filter(Boolean).join("\n");

    return {
      success: true,
      orderId: order.id,
      totalAmount: finalAmount,
      breakdown,
      paymentUrl
    };
  },

  async send_order_to_whatsapp({ orderId, phoneNumber }: { orderId: number; phoneNumber: string }) {
    const cleanPhone = normalizePhoneNumber(phoneNumber);
    const order = await prisma.order.findUnique({
      where: { id: Number(orderId) },
      include: { store: true, items: { include: { product: true } } }
    });

    if (!order) return { error: "Order not found" };

    const details = order.items.map(item =>
      `${item.product.name} x${item.quantity}: Rp ${new Intl.NumberFormat('id-ID').format(item.price * item.quantity)}`
    );

    const breakdown = [
      `🛒 *${order.store.name} ORDER #${order.id}*`,
      `------------------`,
      ...details,
      `------------------`,
      `Subtotal: Rp ${new Intl.NumberFormat('id-ID').format(order.totalAmount - order.taxAmount - order.serviceCharge - order.paymentFee - order.shippingCost)}`,
      order.taxAmount > 0 ? `Pajak: Rp ${new Intl.NumberFormat('id-ID').format(order.taxAmount)}` : null,
      order.serviceCharge > 0 ? `Service: Rp ${new Intl.NumberFormat('id-ID').format(order.serviceCharge)}` : null,
      order.shippingCost > 0 ? `🚛 Ongkir (${order.shippingProvider === 'STORE_COURIER' ? 'Kurir Toko' : (order.shippingProvider === 'GOSEND' ? 'Gosend' : (order.shippingProvider || '-'))}${order.shippingService ? ` ${order.shippingService}` : ''}): Rp ${new Intl.NumberFormat('id-ID').format(order.shippingCost)}` : null,
      order.paymentFee > 0 ? `💳 Biaya (${order.paymentMethod === 'qris' ? 'QRIS' : (order.paymentMethod === 'bank_transfer' ? 'Bank Transfer' : (order.paymentMethod || '-'))}): Rp ${new Intl.NumberFormat('id-ID').format(order.paymentFee)}` : null,
      `------------------`,
      `💰 *Total: Rp ${new Intl.NumberFormat('id-ID').format(order.totalAmount)}*`
    ].filter(Boolean).join("\n");

    let resolvedPaymentUrl = order.paymentUrl || null;
    const isInternalCheckoutLink = Boolean(resolvedPaymentUrl && resolvedPaymentUrl.includes("/checkout/pay/"));
    if ((!resolvedPaymentUrl || isInternalCheckoutLink) && order.status === "PENDING") {
      try {
        const preferredType =
          order.paymentMethod === "qris" || order.paymentMethod === "bank_transfer"
            ? order.paymentMethod
            : undefined;
        const payment = await processPayment(
          order.id,
          order.totalAmount,
          order.customerPhone,
          "midtrans",
          order.storeId,
          preferredType
        );
        if (payment?.paymentUrl) {
          resolvedPaymentUrl = payment.paymentUrl;
          await prisma.order.update({
            where: { id: order.id },
            data: { paymentUrl: resolvedPaymentUrl }
          });
        }
      } catch (e) {
        console.error("[AI_SEND_WHATSAPP_PAYMENT_URL_ERROR]", e);
      }
    }

    if (!resolvedPaymentUrl || (resolvedPaymentUrl && resolvedPaymentUrl.includes("/checkout/pay/"))) {
      return { error: "Actual payment link unavailable for this order." };
    }

    await sendWhatsAppMessage(
      cleanPhone, 
      `${breakdown}\n\nSilakan klik tombol di bawah untuk membayar.`, 
      order.storeId,
      { buttonText: "Pay Now", buttonUrl: resolvedPaymentUrl }
    );

    return { success: true, message: "Order details sent to WhatsApp." };
  },

  async get_last_order_by_phone({ phoneNumber }: { phoneNumber: string }) {
    await ensureStoreSettingsSchema();
    const cleanPhone = normalizePhoneNumber(phoneNumber);
    const order = await prisma.order.findFirst({
      where: { customerPhone: cleanPhone },
      orderBy: { createdAt: "desc" },
      include: { 
        store: { select: { name: true, slug: true } },
        items: { include: { product: { select: { name: true } } } }
      }
    });

    if (!order) return { error: "No orders found for this phone number." };

    let resolvedPaymentUrl = order.paymentUrl || null;
    const isInternalCheckoutLink = Boolean(resolvedPaymentUrl && resolvedPaymentUrl.includes("/checkout/pay/"));
    if ((!resolvedPaymentUrl || isInternalCheckoutLink) && order.status === "PENDING") {
      try {
        const preferredType =
          order.paymentMethod === "qris" || order.paymentMethod === "bank_transfer"
            ? order.paymentMethod
            : undefined;
        const payment = await processPayment(
          order.id,
          order.totalAmount,
          cleanPhone,
          "midtrans",
          order.storeId,
          preferredType
        );
        if (payment?.paymentUrl) {
          resolvedPaymentUrl = payment.paymentUrl;
          await prisma.order.update({
            where: { id: order.id },
            data: { paymentUrl: resolvedPaymentUrl }
          });
        }
      } catch (e) {
        console.error("[AI_LAST_ORDER_PAYMENT_URL_ERROR]", e);
      }
    }

    const details = order.items.map(item => 
      `${item.product.name} x${item.quantity}: Rp ${new Intl.NumberFormat('id-ID').format(item.price * item.quantity)}`
    );

    const breakdown = [
      `🛒 *ORDER TERAKHIR #${order.id}*`,
      `Toko: ${order.store.name}`,
      `Tanggal: ${new Date(order.createdAt).toLocaleString('id-ID')}`,
      `Status: ${order.status}`,
      `--------------------------------`,
      ...details,
      `--------------------------------`,
      `💵 *RINGKASAN BIAYA*`,
      `Subtotal: Rp ${new Intl.NumberFormat('id-ID').format(order.totalAmount - order.taxAmount - order.serviceCharge - order.paymentFee - (order.shippingCost || 0))}`,
      order.taxAmount > 0 ? `Pajak: Rp ${new Intl.NumberFormat('id-ID').format(order.taxAmount)}` : null,
      order.serviceCharge > 0 ? `Service: Rp ${new Intl.NumberFormat('id-ID').format(order.serviceCharge)}` : null,
      order.shippingCost > 0 ? `🚛 Ongkir: Rp ${new Intl.NumberFormat('id-ID').format(order.shippingCost)}` : null,
      order.paymentFee > 0 ? `💳 Biaya (${order.paymentMethod?.toUpperCase()}): Rp ${new Intl.NumberFormat('id-ID').format(order.paymentFee)}` : null,
      `--------------------------------`,
      `💰 *TOTAL: Rp ${new Intl.NumberFormat('id-ID').format(order.totalAmount)}*`,
      resolvedPaymentUrl ? `Link Bayar: ${resolvedPaymentUrl}` : null
    ].filter(Boolean).join("\n");

    return { 
      success: true, 
      orderId: order.id, 
      breakdown, 
      paymentUrl: resolvedPaymentUrl,
      status: order.status
    };
  },

  async create_merchant_invoice({ amount, customer_phone, merchant_phone, payment_method }: any) {
    const cleanCustomerPhone = normalizePhoneNumber(customer_phone);
    const cleanMerchantPhone = normalizePhoneNumber(merchant_phone);
    const user = await prisma.user.findFirst({
      where: { phoneNumber: { contains: cleanMerchantPhone } },
      include: { stores: true }
    });
    const store = user?.stores[0];
    if (!store) return { error: "Merchant store not found" };

    let product = await prisma.product.findFirst({
      where: { storeId: store.id, name: "Tagihan Manual" }
    });
    if (!product) {
      product = await prisma.product.create({
        data: {
          storeId: store.id,
          name: "Tagihan Manual",
          category: "System",
          price: 0,
          description: "Produk otomatis untuk tagihan manual",
          stock: 999999
        }
      });
    }

    let paymentFee = 0;
    if (payment_method === "qris") {
      paymentFee = amount * 0.01;
    } else if (payment_method === "bank_transfer") {
      paymentFee = 5000;
    }

    const finalAmount = amount + paymentFee;

    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        customerPhone: cleanCustomerPhone,
        totalAmount: finalAmount,
        paymentFee,
        status: "PENDING",
        orderType: "TAKEAWAY",
        paymentMethod: payment_method || null,
        notes: JSON.stringify({ kind: "MERCHANT_INVOICE", requestedBy: cleanMerchantPhone }),
        items: {
          create: {
            productId: product.id,
            quantity: 1,
            price: amount
          }
        }
      } as any
    });

    let paymentUrl: string | null = null;
    try {
      const payment = await processPayment(
        order.id,
        finalAmount,
        cleanCustomerPhone,
        "midtrans",
        store.id,
        payment_method
      );
      if (payment.paymentUrl) {
        paymentUrl = payment.paymentUrl;
      }
    } catch (e) {
      console.error("[AI_INVOICE_PAYMENT_ERROR]", e);
    }

    if (!paymentUrl) {
      return {
        error: "Actual payment link is unavailable right now. Please retry."
      };
    }

    const breakdown = [
      `🛒 *${store.name} TAGIHAN MANUAL #${order.id}*`,
      `--------------------------------`,
      `🏷️ Deskripsi: Tagihan Manual`,
      `💰 Jumlah: Rp ${new Intl.NumberFormat('id-ID').format(amount)}`,
      `💳 Biaya (${payment_method.toUpperCase()}): Rp ${new Intl.NumberFormat('id-ID').format(paymentFee)}`,
      `--------------------------------`,
      `💰 *TOTAL: Rp ${new Intl.NumberFormat('id-ID').format(finalAmount)}*`
    ].join("\n");

    return {
      success: true,
      orderId: order.id,
      totalAmount: finalAmount,
      breakdown,
      paymentUrl
    };
  }
};

export async function POST(req: NextRequest) {
  try {
    const { message, history, isPublic, context } = await req.json();

    // If not public, require session
    if (!isPublic) {
      const session = await getServerSession(authOptions);
      if (!session || (session as any).user?.role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Get Gemini Key: Prefer custom store key if Sovereign, otherwise platform default
    let geminiKey = null;
    const storeSlug = context?.slug || (Array.isArray(context) ? context[0]?.slug : null);
    
    if (storeSlug) {
      const store = await prisma.store.findUnique({ 
        where: { slug: storeSlug }
      }) as any;
      if (store?.subscriptionPlan === "SOVEREIGN" && store?.customGeminiKey) {
        geminiKey = store.customGeminiKey;
        console.log(`[AI_CHAT] Using custom Gemini Key for store: ${storeSlug}`);
      }
    }

    if (!geminiKey) {
      const settings = await prisma.platformSettings.findUnique({ where: { key: "default" } }) as any;
      geminiKey = settings?.geminiApiKey;
    }

    if (!geminiKey) {
      return NextResponse.json({ error: "Gemini API Key not configured." }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3-flash-preview",
    }, { apiVersion: "v1beta" });

    // Determine if the user is a Merchant for the system instruction
    let userContextInfo = "";
    if (context?.phoneNumber) {
      const cleanPhone = context.phoneNumber.replace(/\D/g, "");
      const user = await prisma.user.findFirst({
        where: { phoneNumber: { contains: cleanPhone } },
        include: { stores: true }
      });
      if (user && user.role === "MERCHANT" && user.stores.length > 0) {
        userContextInfo = ` The user is a MERCHANT of the store '${user.stores[0].name}' (slug: ${user.stores[0].slug}). They can use merchant tools like 'get_store_stats' and 'create_merchant_invoice'. If they ask to 'tambah produk' or 'update harga', use the tools to help them.`;
      }
    }

    const locationInfo = context?.location 
      ? ` The user's current location is latitude: ${context.location.latitude}, longitude: ${context.location.longitude}.`
      : "";

    const chat = model.startChat({
      history: history || [],
      systemInstruction: {
        parts: [{ text: `You are the Gercep Platform Assistant. You help manage stores, restaurants, and orders. Use the term 'toko' or 'resto' when referring to businesses. Use the available tools to find information. If a user asks for a specific food (like 'nasi uduk'), use search_stores to find restaurants that sell it. If a user wants to order, first search_stores, then get_store_products.

SHIPPING & LOCATION:
1. Clarify the order type early: DINE_IN (makan di tempat), TAKEAWAY (ambil sendiri di toko), or DELIVERY (diantar ke rumah).
2. If the user is looking for a restaurant or food "near them", "in their area", or "nearby", you MUST ask them to share their location (use the 📍 button) or at least provide their area, city, or postal code BEFORE searching. Do not just list all available restaurants globally if they asked for something nearby.
3. If the user is ordering from home/outside the store (no table number or off-site), you MUST ONLY offer DELIVERY (diantar). TAKEAWAY or DINE_IN are not options for off-site customers.
4. If the user is AT the store/restaurant (on-site), offer DINE_IN or TAKEAWAY. DELIVERY is NOT needed if they are already there.
5. For DELIVERY orders, you MUST ask the user to share their location (use the 📍 button on web) AND provide their full physical address string.
6. DO NOT assume the address from coordinates alone. You MUST have the physical address text for Biteship to process the draft order correctly.
7. Once you have both the user's location (coordinates) and full address, use 'get_shipping_rates' to show delivery options.
8. If the user is near the store (within 100m), a 'Store Courier' (Kurir Toko) option might be available (often free or low cost). Explain this to the user if 'get_shipping_rates' returns it.
9. If 'search_stores' provides 'shippingSenderAddress' or coordinates for a store, use that info to explain where the item is coming from.
10. IMPORTANT: Always call 'get_shipping_rates' BEFORE 'create_customer_order' for delivery.
11. IMPORTANT: When calling 'create_customer_order' for a DELIVERY order, you MUST pass the 'address', 'latitude', and 'longitude'.
12. For TAKEAWAY orders (on-site only), no address or coordinates are needed; just tell them to pick up at the store address.

PAYMENT & RE-ORDERING:
1. You MUST ask the user for their preferred payment method ('qris' or 'bank_transfer') BEFORE calling 'create_customer_order'.
2. If a user wants to "re-order" or "order again", use 'get_last_order_by_phone' to find their items, but you MUST still ask for:
   - Their current location/address (if delivery).
   - Their preferred payment method.
3. If a product has variations (like size, flavor, etc.), you MUST pass the correct 'variationName' when calling 'create_customer_order' to ensure the correct price is used.
4. Do not create an order until the user has confirmed the items, shipping (if applicable), and payment method.

Once an order is created:
1. Show the user the 'breakdown' of the order.
2. Tell them they can pay directly here or have the payment link sent to their WhatsApp.
3. If they want to pay on WhatsApp, ask for their WhatsApp number and call 'send_order_to_whatsapp'.
4. Ensure all order details (taxes, service charges, fees) are clearly explained to the user before they confirm.${userContextInfo}${locationInfo} ${context?.phoneNumber ? `The current user's phone number is ${context.phoneNumber}.` : ""} ${context?.channel === "WHATSAPP" ? "The user is chatting via WhatsApp." : ""}` }]
      } as any,
      tools: [
        {
          functionDeclarations: [
            {
              name: "search_stores",
              description: "Find restaurants or stores by name or food category. Use location_context if the user specifies an area, city, or postal code.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Search keyword." },
                  location_context: { type: "string", description: "Area, city, or postal code to filter results." }
                },
                required: ["query"]
              }
            },
            {
              name: "get_store_stats",
              description: "Retrieve sales and balance for a store.",
              parameters: {
                type: "object",
                properties: {
                  slug: { type: "string", description: "Store slug." }
                },
                required: ["slug"]
              }
            },
            {
              name: "get_store_products",
              description: "Get menu items for a store.",
              parameters: {
                type: "object",
                properties: {
                  slug: { type: "string", description: "Store slug." }
                },
                required: ["slug"]
              }
            },
            {
              name: "get_shipping_rates",
              description: "Get delivery options and costs for an address. Requires a full address or coordinates.",
              parameters: {
                type: "object",
                properties: {
                  slug: { type: "string" },
                  address: { type: "string" },
                  latitude: { type: "number" },
                  longitude: { type: "number" },
                  weightGrams: { type: "integer" }
                },
                required: ["slug"]
              }
            },
            {
              name: "update_product_price",
              description: "Update the price of an existing product or variation. Only for merchants.",
              parameters: {
                type: "object",
                properties: {
                  slug: { type: "string" },
                  productName: { type: "string" },
                  newPrice: { type: "number" },
                  variationName: { type: "string" }
                },
                required: ["slug", "productName", "newPrice"]
              }
            },
            {
              name: "add_new_product",
              description: "Add a new product to the store menu. Only for merchants.",
              parameters: {
                type: "object",
                properties: {
                  slug: { type: "string" },
                  name: { type: "string" },
                  price: { type: "number" },
                  category: { type: "string" }
                },
                required: ["slug", "name", "price"]
              }
            },
            {
              name: "create_customer_order",
              description: "Create an order for a user.",
              parameters: {
                type: "object",
                properties: {
                  slug: { type: "string" },
                  customer_phone: { type: "string" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        productId: { type: "integer" },
                        quantity: { type: "integer" },
                        variationName: { type: "string" }
                      }
                    }
                  },
                  order_type: { type: "string", enum: ["DINE_IN", "TAKEAWAY", "DELIVERY"] },
                  address: { type: "string" },
                  latitude: { type: "number" },
                  longitude: { type: "number" },
                  shippingProvider: { type: "string" },
                  shippingService: { type: "string" },
                  shippingFee: { type: "number" },
                  payment_method: { type: "string", enum: ["qris", "bank_transfer"] }
                },
                required: ["slug", "customer_phone", "items", "order_type", "payment_method"]
              }
            },
            {
              name: "create_merchant_invoice",
              description: "Create a manual invoice for a customer. Only for merchants.",
              parameters: {
                type: "object",
                properties: {
                  amount: { type: "number" },
                  customer_phone: { type: "string" },
                  merchant_phone: { type: "string" },
                  payment_method: { type: "string", enum: ["qris", "bank_transfer"] }
                },
                required: ["amount", "customer_phone", "merchant_phone"]
              }
            },
            {
              name: "send_order_to_whatsapp",
              description: "Send order details and payment link to the user's WhatsApp number.",
              parameters: {
                type: "object",
                properties: {
                  orderId: { type: "integer" },
                  phoneNumber: { type: "string", description: "The WhatsApp number to send the order to." }
                },
                required: ["orderId", "phoneNumber"]
              }
            },
            {
              name: "get_last_order_by_phone",
              description: "Get the latest order details for a specific customer phone number.",
              parameters: {
                type: "object",
                properties: {
                  phoneNumber: { type: "string", description: "The customer's WhatsApp number." }
                },
                required: ["phoneNumber"]
              }
            }
          ]
        }
      ] as any,
      generationConfig: { maxOutputTokens: 1000 }
    });

    // 1. Initial Request to Gemini
    let result = await chat.sendMessage(message);
    let response = result.response;
    let calls = response.functionCalls();

    // 2. Handle Function Calls (Loop until no more calls)
    const MAX_ITERATIONS = 5;
    let iterations = 0;

    let finalBreakdown = undefined;
    let finalPaymentUrl = undefined;

    while (calls && calls.length > 0 && iterations < MAX_ITERATIONS) {
      const toolResponses = [];
      for (const call of calls) {
        const toolFn = tools[call.name];
        if (toolFn) {
          console.log(`[AI_CHAT] Calling tool: ${call.name}`, call.args);
          const data = await toolFn(call.args);
          toolResponses.push({
            functionResponse: {
              name: call.name,
              response: { content: data }
            }
          });
          
          // Capture structured data for the response
          if (call.name === "create_customer_order" && data.success) {
            finalBreakdown = data.breakdown;
            finalPaymentUrl = data.paymentUrl;
          }
          if (call.name === "get_last_order_by_phone" && data.success) {
            finalBreakdown = data.breakdown;
            finalPaymentUrl = data.paymentUrl;
          }
          if (call.name === "create_merchant_invoice" && data.success) {
            finalBreakdown = data.breakdown;
            finalPaymentUrl = data.paymentUrl;
          }
        }
      }

      // Send the tool results back to Gemini
      result = await chat.sendMessage(toolResponses);
      response = result.response;
      calls = response.functionCalls();
      iterations++;
    }

    return NextResponse.json({ 
      text: response.text(),
      history: await chat.getHistory(),
      breakdown: finalBreakdown,
      paymentUrl: finalPaymentUrl
    });

  } catch (error: any) {
    console.error("[GEMINI_CHAT_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
