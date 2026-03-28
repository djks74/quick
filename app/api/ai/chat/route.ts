import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import midtransClient from "midtrans-client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getShippingQuoteFromBiteship, createBiteshipDraftForPendingOrder } from "@/lib/shipping-biteship";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";
import { ensurePlatformSettingsSchema } from "@/lib/super-admin";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { resolvePaymentUrl, sendMerchantWhatsApp, buildOrderMerchantSummary } from "@/lib/merchant-alerts";
import { processPayment } from "@/lib/payment";
import { createOrderNotification } from "@/lib/order-notifications";
import { getDistanceMeters } from "@/lib/utils";
import { triggerReverseSync, isStoreOpen } from "@/lib/api";
import { logTraffic } from "@/lib/traffic";
import { ensureDefaultStoreTypes, getStoreTypeLabelMap } from "@/lib/store-types";
import { evaluateAiAbuseGuard, extractClientIp, isSpamLikeMessage } from "@/lib/ai-abuse-guard";

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

function isGercepOutOfScopeMessage(input: string) {
  const text = String(input || "").toLowerCase().trim();
  if (!text) return false;
  const scopeKeywords = [
    "gercep", "toko", "resto", "restaurant", "store", "menu", "produk", "product", "pesan", "order",
    "delivery", "pengiriman", "kurir", "checkout", "bayar", "payment", "qris", "transfer", "stok",
    "inventory", "kasir", "cashier", "outlet", "meja", "table", "wa", "whatsapp", "promo", "diskon",
    "sales", "omzet", "performa", "topup", "saldo", "cara", "help", "bantuan", "panduan", "guide"
  ];
  const outOfScopeKeywords = [
    "coding", "koding", "programming", "python", "javascript", "react", "nextjs", "typescript", "sql",
    "algoritma", "algorithm", "matematika", "fisika", "kimia", "biologi", "sejarah", "politik", "agama",
    "berita", "news", "crypto", "saham", "trading", "cuaca", "weather", "ramalan", "horoscope", "game",
    "recipe", "resep", "masak", "cooking", "how to make", "cara membuat", "write a code", "buatkan kode"
  ];
  const hasScope = scopeKeywords.some((kw) => text.includes(kw));
  if (hasScope) return false;
  const hasOutOfScopeKeyword = outOfScopeKeywords.some((kw) => text.includes(kw));
  const looksGeneralQuestion = /^(what|why|how|when|where|who|apa|kenapa|bagaimana|kapan|dimana|siapa)\b/.test(text) || text.includes("?");
  return hasOutOfScopeKeyword || looksGeneralQuestion;
}

function getGercepScopeRefusal(input: string) {
  const text = String(input || "").toLowerCase();
  const isEnglish = /\b(what|why|how|where|coding|programming|learn|teach)\b/.test(text);
  if (isEnglish) {
    return "I can only help with Gercep topics (store/resto search, menu, ordering, delivery, payment, and merchant operations). Please ask within Gercep context.";
  }
  return "Maaf, saya hanya bisa bantu topik dalam sistem Gercep (cari toko/resto, menu, pemesanan, pengiriman, pembayaran, dan operasional merchant). Silakan tanya dalam konteks Gercep ya.";
}

function extractQuickRepliesFromText(text: string) {
  const raw = String(text || "");
  const t = raw.toLowerCase();
  const yesNo =
    /\b(ya|iya)\b.*\b(tidak|nggak|ga)\b/.test(t) ||
    /\b(tidak|nggak|ga)\b.*\b(ya|iya)\b/.test(t) ||
    /\b(yes)\b.*\b(no)\b/.test(t) ||
    /\b(no)\b.*\b(yes)\b/.test(t) ||
    /\bya\/tidak\b/.test(t) ||
    /\byes\/no\b/.test(t);
  if (yesNo) {
    return [
      { id: "YES", title: "Ya", value: "Ya" },
      { id: "NO", title: "Tidak", value: "Tidak" }
    ];
  }

  const asksPayment =
    (t.includes("bayar") || t.includes("payment") || t.includes("metode pembayaran")) &&
    t.includes("qris") &&
    (t.includes("bank") || t.includes("transfer"));
  if (asksPayment) {
    return [
      { id: "PAY_QRIS", title: "QRIS", value: "qris" },
      { id: "PAY_BANK", title: "Bank Transfer", value: "bank transfer" }
    ];
  }
  return null;
}

function isFullMenuRequest(input: string) {
  const t = String(input || "").toLowerCase().trim();
  return /\b(menu lengkap(?:nya)?|lihat menu lengkap|full menu|daftar menu|list menu|semua menu|daftar produk|list produk|semua produk|produk lengkap|lihat semua produk|all products|all menu)\b/.test(t);
}

function isContinueMenuRequest(input: string) {
  const t = String(input || "").toLowerCase().trim();
  return /\b(lanjut menu|menu lanjut|menu berikutnya|next menu)\b/.test(t);
}

function getFullMenuStateFromHistory(history: any[]) {
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h?.role !== "function") continue;
    const parts = Array.isArray(h.parts) ? h.parts : [];
    for (const p of parts) {
      const fr = p?.functionResponse;
      if (fr?.name !== "FULL_MENU_STATE") continue;
      const resp = fr?.response;
      if (!resp || typeof resp !== "object") continue;
      const storeId = Number((resp as any).storeId || 0) || null;
      const offset = Number((resp as any).offset || 0) || 0;
      const totalCount = Number((resp as any).totalCount || 0) || 0;
      if (storeId && offset >= 0) return { storeId, offset, totalCount };
    }
  }
  return null;
}

function buildFullMenuStateHistoryPart(state: { storeId: number; offset: number; totalCount: number }) {
  return {
    role: "function",
    parts: [
      {
        functionResponse: {
          name: "FULL_MENU_STATE",
          response: state
        }
      }
    ]
  };
}

function buildAssistantStoreEligibilityWhere(extra: Record<string, any> = {}) {
  return {
    isActive: true,
    shippingSenderAddress: { not: null },
    NOT: [{ shippingSenderAddress: "" }],
    products: { some: { category: { not: "System" } } },
    ...extra
  };
}

function buildAssistantScopedStoreWhere(extra: Record<string, any> = {}) {
  return {
    isActive: true,
    products: { some: { category: { not: "System" } } },
    ...extra
  };
}

function normalizeStoreSearchInput(query: string, locationContext?: string) {
  const raw = String(query || "").trim();
  const providedLocation = String(locationContext || "").trim();
  const normalized = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  let effectiveLocation = providedLocation;
  if (!effectiveLocation) {
    // Improved regex to capture location even without "sekitar/dekat"
    const locationMatch = normalized.match(/(?:sekitar|dekat|di area|area|nearby|near|di)\s+([a-z0-9\p{L}\s-]+)/iu);
    if (locationMatch?.[1]) {
      effectiveLocation = locationMatch[1].trim();
    } else {
      // If no explicit location keyword, check if the last word might be a location
      const words = normalized.split(" ");
      if (words.length > 1) {
        const lastWord = words[words.length - 1];
        // Simple heuristic: if last word is not a common food/action word, it might be a location
        const commonNonLocationWords = ["toko", "resto", "makanan", "minuman", "menu", "pesan", "order", "ada", "cari", "bisa", "tolong"];
        if (!commonNonLocationWords.includes(lastWord) && lastWord.length > 3) {
          // We don't set it as effectiveLocation automatically to avoid false positives, 
          // but we keep it in the query.
        }
      }
    }
  }

  let cleanedQuery = normalized
    .replace(/(?:\bapa ada\b|\badakah\b|\bada gak\b|\bada tak\b|\btolong\b|\bbisa\b|\bcari\b|\bfind\b|\bsearch\b|\bresto\b|\btoko\b|\bstore\b|\brestaurant\b|\bmakanan\b|\bkuliner\b|\bdi sekitar\b|\bsekitar\b|\bdekat\b|\bdi area\b|\barea\b|\bnearby\b|\bnear\b|\bdi\b)/giu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (effectiveLocation) {
    const escapedLocation = effectiveLocation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleanedQuery = cleanedQuery
      .replace(new RegExp(`\\b${escapedLocation}\\b`, "iu"), " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return {
    keyword: cleanedQuery,
    effectiveLocation
  };
}

const AI_API_KEY = process.env.AI_API_KEY;
const AI_INTERNAL_CONTEXT_KEY = process.env.AI_INTERNAL_CONTEXT_KEY;
const GEMINI_MAX_OUTPUT_TOKENS = Math.max(64, Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || "384") || 384);
const GEMINI_MAX_TOOL_ITERATIONS = Math.max(0, Number(process.env.GEMINI_MAX_TOOL_ITERATIONS || "1") || 1);
const GEMINI_HISTORY_LIMIT_PUBLIC = Math.max(0, Number(process.env.GEMINI_HISTORY_LIMIT_PUBLIC || "12") || 12);
const GEMINI_HISTORY_LIMIT_PRIVATE = Math.max(0, Number(process.env.GEMINI_HISTORY_LIMIT_PRIVATE || "20") || 20);

// These are the actual implementations of the tools Gemini will call
const tools: Record<string, (args: any) => Promise<any>> = {
  async search_stores({ query, location_context, latitude, longitude, scopedSlug }: { query: string, location_context?: string, latitude?: number, longitude?: number, scopedSlug?: string }) {
    await ensureStoreSettingsSchema();
    const { keyword, effectiveLocation } = normalizeStoreSearchInput(String(query || ""), location_context);
    const productSelect: any = keyword
      ? {
          where: {
            OR: [
              { name: { contains: keyword, mode: "insensitive" } },
              { description: { contains: keyword, mode: "insensitive" } },
              { shortDescription: { contains: keyword, mode: "insensitive" } }
            ]
          },
          select: { name: true, description: true, shortDescription: true },
          take: 2
        }
      : { select: { name: true }, take: 0 };

    const selectShape: any = {
      name: true,
      slug: true,
      storeType: true,
      whatsapp: true,
      shippingSenderAddress: true,
      shippingSenderName: true,
      shippingSenderPostalCode: true,
      biteshipOriginLat: true,
      biteshipOriginLng: true,
      categories: { select: { name: true }, take: 2 },
      products: productSelect
    };

    const keywordOr = keyword
      ? [
          { name: { contains: keyword, mode: "insensitive" } },
          { slug: { contains: keyword, mode: "insensitive" } },
          { categories: { some: { name: { contains: keyword, mode: "insensitive" } } } },
          { products: { some: { name: { contains: keyword, mode: "insensitive" } } } },
          { products: { some: { description: { contains: keyword, mode: "insensitive" } } } },
          { products: { some: { shortDescription: { contains: keyword, mode: "insensitive" } } } }
        ]
      : [];
    const locationOr = effectiveLocation
      ? [
          { shippingSenderAddress: { contains: effectiveLocation, mode: "insensitive" } },
          { shippingSenderPostalCode: { contains: effectiveLocation, mode: "insensitive" } },
          { name: { contains: effectiveLocation, mode: "insensitive" } },
          { slug: { contains: effectiveLocation, mode: "insensitive" } }
        ]
      : [];
    const baseWhere: any = buildAssistantStoreEligibilityWhere(
      scopedSlug ? { slug: String(scopedSlug) } : {}
    );
    const strictWhere: any = { ...baseWhere };
    if (keywordOr.length > 0) strictWhere.OR = keywordOr;
    if (locationOr.length > 0) strictWhere.AND = [{ OR: locationOr }];

    let stores = await prisma.store.findMany({
      where: strictWhere,
      select: selectShape,
      take: 20
    });

    if (stores.length === 0 && locationOr.length > 0) {
      stores = await prisma.store.findMany({
        where: { ...baseWhere, OR: locationOr },
        select: selectShape,
        take: 20
      });
    }

    if (stores.length === 0 && keywordOr.length > 0) {
      stores = await prisma.store.findMany({
        where: { ...baseWhere, OR: keywordOr },
        select: selectShape,
        take: 20
      });
    }

    if (latitude && longitude) {
      const mapped = stores.map(s => {
        let distance = null;
        if (s.biteshipOriginLat && s.biteshipOriginLng) {
          distance = getDistanceMeters(
            Number(latitude), 
            Number(longitude), 
            parseFloat(String(s.biteshipOriginLat)), 
            parseFloat(String(s.biteshipOriginLng))
          );
        }
        return { ...s, distance };
      });

      stores = mapped
        .filter(s => s.distance === null || s.distance <= 50000)
        .sort((a, b) => (a.distance || 999999) - (b.distance || 999999))
        .slice(0, 5) as any;
    } else {
      stores = stores.slice(0, 5);
    }

    await ensurePlatformSettingsSchema().catch(() => null);
    const platform = await prisma.platformSettings
      .findUnique({ where: { key: "default" }, select: { storeTypes: true } })
      .catch(() => null) as any;
    const storeTypeLabelByCode = getStoreTypeLabelMap(ensureDefaultStoreTypes(platform?.storeTypes));
    const normalizedStores = (stores as any[]).map((s) => ({
      ...s,
      storeTypeLabel: s?.storeType ? (storeTypeLabelByCode.get(String(s.storeType)) || String(s.storeType)) : null
    }));

    return { stores: normalizedStores };
  },

  async get_store_stats({ slug }: { slug: string }) {
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findFirst({
      where: buildAssistantStoreEligibilityWhere({ slug }),
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
    const store = await prisma.store.findFirst({
      where: buildAssistantStoreEligibilityWhere({ slug }),
      include: {
        categories: { select: { name: true, slug: true } },
        products: {
          where: { 
            category: { 
              notIn: ["System", "_ARCHIVED_"] 
            } 
          },
          select: { id: true, name: true, price: true, category: true, variations: true, stock: true, image: true, description: true }
        }
      }
    });
    if (!store) return { error: "Store not found" };
    const categoryNameBySlug = new Map<string, string>(
      (store.categories || []).map((c: any) => [String(c.slug), String(c.name)])
    );
    const products = (store.products || []).map((p: any) => ({
      ...p,
      categoryName: p.category ? (categoryNameBySlug.get(String(p.category)) || String(p.category)) : null
    }));
    return { 
      products,
      taxPercent: store.taxPercent,
      serviceChargePercent: store.serviceChargePercent
    };
  },

  async update_product_price({ slug, productName, newPrice, variationName }: any) {
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findFirst({ where: buildAssistantStoreEligibilityWhere({ slug }) });
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
        // Trigger Reverse Sync
        triggerReverseSync(product.id).catch(err => console.error("[SYNC_ERROR] AI trigger failed:", err));
        return { success: true, message: `Updated ${product.name} (${variations[idx].name}) to ${newPrice}` };
      }
    }
    
    await prisma.product.update({ where: { id: product.id }, data: { price: Number(newPrice) } });
    // Trigger Reverse Sync
    triggerReverseSync(product.id).catch(err => console.error("[SYNC_ERROR] AI trigger failed:", err));
    return { success: true, message: `Updated ${product.name} price to ${newPrice}` };
  },

  async add_new_product({ slug, name, price, category }: any) {
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findFirst({ where: buildAssistantStoreEligibilityWhere({ slug }) });
    if (!store) return { error: "Store not found" };
    const categoryLabel = String(category || "General").trim() || "General";
    const categorySlug = categoryLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "general";
    await prisma.category.upsert({
      where: { storeId_slug: { storeId: store.id, slug: categorySlug } },
      update: { name: categoryLabel },
      create: { storeId: store.id, name: categoryLabel, slug: categorySlug, subCategories: [] as any }
    }).catch(() => null);
    const product = await prisma.product.create({
      data: {
        storeId: store.id,
        name,
        price: Number(price),
        category: categorySlug,
        stock: 100,
        description: "Added via AI Assistant"
      }
    });
    return { success: true, productId: product.id, message: `Added new product ${name}` };
  },

  async toggle_store_active({ slug, active }: { slug: string; active: boolean }) {
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findFirst({ where: buildAssistantStoreEligibilityWhere({ slug }) });
    if (!store) return { error: "Store not found" };

    await (prisma.store as any).update({
      where: { id: store.id },
      data: { isActive: active }
    });

    return { success: true, message: `Store '${store.name}' is now ${active ? "ENABLED" : "DISABLED"}.` };
  },

  async toggle_store_open({ slug, open }: { slug: string; open: boolean }) {
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findFirst({ where: buildAssistantStoreEligibilityWhere({ slug }) });
    if (!store) return { error: "Store not found" };

    await prisma.store.update({
      where: { id: store.id },
      data: { isOpen: open }
    });

    return { success: true, message: `Store '${store.name}' is now manually ${open ? "OPENED" : "CLOSED"}.` };
  },

  async get_corporate_stats({ corporateId }: { corporateId: number }) {
    await ensureStoreSettingsSchema();
    const stores = await prisma.store.findMany({
      where: { ownerId: Number(corporateId) } as any,
      include: {
        orders: { where: { status: "PAID" }, select: { totalAmount: true } }
      }
    }) as any[];

    const stats = stores.map(s => ({
      name: s.name,
      slug: s.slug,
      sales: s.orders.reduce((sum: number, o: any) => sum + o.totalAmount, 0),
      balance: s.balance,
      isActive: s.isActive,
      isOpen: s.isOpen
    }));

    const totalSales = stats.reduce((sum, s) => sum + s.sales, 0);

    return {
      totalOutlets: stores.length,
      totalSales,
      outlets: stats
    };
  },

  async create_topup_payment_link({ storeId, amount, userId }: { storeId: number; amount: number; userId?: number }) {
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findUnique({
      where: { id: Number(storeId) },
      include: { owner: true }
    });
    if (!store) return { error: "Store not found" };

    if (userId && Number(store.ownerId) !== Number(userId)) {
       // Only allow if the user is the owner (unless it's a super-admin, handled in the loop)
       return { error: "Unauthorized access to this store for top-up." };
    }

    await ensurePlatformSettingsSchema().catch(() => null);
    const platform = await prisma.platformSettings.findUnique({ where: { key: "default" } }).catch(() => null);
    const topupRef = `AI-TOPUP-${store.id}-${Date.now()}`;

    const midtransServerKey = store.paymentGatewaySecret || platform?.midtransServerKey || process.env.PAYMENT_GATEWAY_SECRET || process.env.MIDTRANS_SERVER_KEY;
    const midtransClientKey = store.paymentGatewayClientKey || platform?.midtransClientKey || process.env.PAYMENT_GATEWAY_CLIENT_KEY || process.env.MIDTRANS_CLIENT_KEY;
    
    if (!midtransServerKey || !midtransClientKey) {
      return { error: "Payment gateway (Midtrans) not configured for this platform." };
    }

    try {
      const snap = new midtransClient.Snap({
        isProduction: !midtransServerKey.startsWith("SB-"),
        serverKey: midtransServerKey,
        clientKey: midtransClientKey
      });

      const transaction = await snap.createTransaction({
        transaction_details: {
          order_id: topupRef,
          gross_amount: amount
        },
        customer_details: {
          email: store.owner.email || "merchant@example.com",
          first_name: store.owner.name || store.name
        },
        item_details: [{
          id: "WA_TOPUP_AI",
          price: amount,
          quantity: 1,
          name: "WhatsApp Credit Top-up (via AI)"
        }],
        enabled_payments: ["gopay", "qris", "shopeepay", "other_qris"]
      } as any);

      return {
        success: true,
        provider: "midtrans",
        reference: topupRef,
        paymentUrl: transaction.redirect_url,
        token: transaction.token,
        message: `Top-up link generated for Rp ${new Intl.NumberFormat('id-ID').format(amount)}.`
      };
    } catch (e: any) {
      console.error("[AI_TOPUP_ERROR]", e);
      return { error: `Failed to create top-up payment: ${e.message}` };
    }
  },

  async get_shipping_rates({ slug, address, latitude, longitude, weightGrams }: any) {
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findFirst({ where: buildAssistantStoreEligibilityWhere({ slug }) });
    if (!store) return { error: "Store not found" };
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return { error: "Mohon bagikan lokasi (📍) dulu supaya ongkir bisa dihitung akurat.", needsLocation: true };
    }
    if (!String(address || "").trim()) {
      return { error: "Alamat lengkap diperlukan untuk menghitung ongkir.", needsAddress: true };
    }
    
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

      const shippingOptions = filtered.map((q: any) => {
        const providerLabel = q.provider === "STORE_COURIER" ? "Kurir Toko" : q.provider;
        const serviceLabel = q.provider === "STORE_COURIER" ? "KURIR_TOKO" : String(q.service || "-");
        const title = `${providerLabel}${q.provider === "STORE_COURIER" ? "" : ` ${q.service}`}`.replace(/\s+/g, " ").trim();
        const id = `SHIP_${String(q.provider)}_${String(serviceLabel)}`.replace(/[^A-Z0-9_]/gi, "_").slice(0, 200);
        return {
          id,
          provider: q.provider,
          service: serviceLabel,
          title,
          fee: Number(q.fee || 0),
          eta: q.eta || null
        };
      });

      const options = shippingOptions
        .map((o: any) => `- ${o.title}: Rp ${new Intl.NumberFormat('id-ID').format(o.fee)}`)
        .join("\n");

      return { options, shippingOptions };
    } catch (e) {
      console.error("[AI_SHIPPING_ERROR]", e);
      return { 
        error: "Technical issue calculating rates. Please try again or provide a more specific address.",
        suggestManual: true
      };
    }
  },

  async create_customer_order({ slug, customer_phone, items, order_type, address, latitude, longitude, shippingProvider, shippingService, shippingFee, payment_method, isMerchant, table_number }: any) {
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findFirst({ where: buildAssistantStoreEligibilityWhere({ slug }) }) as any;
    if (!store) return { error: "Store not found" };
    if (!store.isActive) return { error: `Mohon maaf, toko '${store.name}' sedang tidak aktif (Disabled) saat ini. Silakan hubungi admin toko.` };

    const isOpen = await isStoreOpen(store);
    if (!isOpen) {
      const schedule = store.operatingHours as any;
      let scheduleInfo = "";
      if (schedule) {
        const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: store.timezone || 'Asia/Jakarta' }).format(new Date()).toLowerCase();
        const todaySchedule = schedule[today];
        if (todaySchedule) {
          scheduleInfo = todaySchedule.closed ? " (Tutup sepanjang hari)" : ` (Buka: ${todaySchedule.open} - ${todaySchedule.close})`;
        }
      }
      return { error: `Mohon maaf, toko '${store.name}' saat ini sedang tutup${scheduleInfo}. Silakan cek kembali di jam operasional kami.` };
    }

    // Default to qris as manual transfer is disabled
    payment_method = payment_method === 'bank_transfer' ? 'qris' : (payment_method || 'qris');

    const cleanPhone = normalizePhoneNumber(customer_phone);
    const orderType = String(order_type || "").toUpperCase();
    const isDelivery = orderType === "DELIVERY";
    const trimmedAddress = String(address || "").trim();

    if (orderType === "DINE_IN" && !table_number) {
      return { error: "Nomor meja wajib diisi untuk pesanan makan di tempat (DINE_IN)." };
    }

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
      const providerEnabled =
        providerUpper === "STORE_COURIER"
          ? Boolean((store as any).shippingEnableStoreCourier)
          : providerUpper === "JNE"
            ? Boolean(store.shippingEnableJne)
            : providerUpper === "GOSEND"
              ? Boolean(store.shippingEnableGosend) && !Boolean(store.shippingJneOnly)
              : false;
      if (!providerEnabled) {
        return { error: `Kurir ${providerUpper || "-"} tidak aktif di pengaturan toko.` };
      }
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
        tableNumber: table_number || null,
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

    const merchantMsg = await buildOrderMerchantSummary(order.id, "Order Pending");
    await sendMerchantWhatsApp(store.id, merchantMsg, order.id).catch(() => null);

    if (isMerchant) {
      return {
        success: true,
        orderId: order.id,
        totalAmount: finalAmount,
        breakdown: merchantMsg,
        paymentUrl
      };
    }

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

  async send_order_to_whatsapp({ orderId, phoneNumber, actorIsMerchant, isMerchant, callerPhone }: { orderId: number; phoneNumber: string; actorIsMerchant?: boolean; isMerchant?: boolean; callerPhone?: string }) {
    const cleanPhone = normalizePhoneNumber(phoneNumber);
    const cleanCallerPhone = callerPhone ? normalizePhoneNumber(callerPhone) : null;
    const isMerchantActor = Boolean(actorIsMerchant ?? isMerchant);
    const order = await prisma.order.findUnique({
      where: { id: Number(orderId) },
      include: { store: true, items: { include: { product: true } } }
    });

    if (!order) return { error: "Order not found" };
    if (!isMerchantActor) {
      if (!cleanCallerPhone) return { error: "Unauthorized access" };
      if (normalizePhoneNumber(order.customerPhone || "") !== cleanCallerPhone) {
        return { error: "Unauthorized order access" };
      }
      if (cleanPhone !== cleanCallerPhone) {
        return { error: "Unauthorized target phone" };
      }
    }

    if (isMerchantActor) {
      const merchantMsg = await buildOrderMerchantSummary(order.id, "Summary Order");
      await sendWhatsAppMessage(cleanPhone, merchantMsg, order.id);
      return { success: true, message: "Order summary sent to merchant WhatsApp." };
    }

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

  async get_last_order_by_phone({ phoneNumber, actorIsMerchant, isMerchant, callerPhone }: { phoneNumber: string; actorIsMerchant?: boolean; isMerchant?: boolean; callerPhone?: string }) {
    await ensureStoreSettingsSchema();
    const cleanPhone = normalizePhoneNumber(phoneNumber);
    const cleanCallerPhone = callerPhone ? normalizePhoneNumber(callerPhone) : null;
    const isMerchantActor = Boolean(actorIsMerchant ?? isMerchant);
    if (!isMerchantActor) {
      if (!cleanCallerPhone || cleanCallerPhone !== cleanPhone) {
        return { error: "Unauthorized access" };
      }
    }
    const order = await prisma.order.findFirst({
      where: { customerPhone: cleanPhone },
      orderBy: { createdAt: "desc" },
      include: { 
        store: { select: { name: true, slug: true, taxPercent: true, serviceChargePercent: true } },
        items: { include: { product: { select: { name: true } } } }
      }
    });

    if (!order) return { error: "No orders found for this phone number." };

    if (isMerchantActor) {
      const merchantMsg = await buildOrderMerchantSummary(order.id, "Detail Order Terakhir");
      return { 
        success: true, 
        orderId: order.id, 
        breakdown: merchantMsg, 
        paymentUrl: order.paymentUrl,
        status: order.status
      };
    }

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

    const merchantMsg = await buildOrderMerchantSummary(order.id, "Tagihan Baru");
    await sendMerchantWhatsApp(store.id, merchantMsg, order.id).catch(() => null);

    return {
      success: true,
      orderId: order.id,
      totalAmount: finalAmount,
      breakdown: merchantMsg,
      paymentUrl
    };
  }
};

export async function POST(req: NextRequest) {
  try {
    await ensureStoreSettingsSchema();
    const startedAt = Date.now();
    const internalContextHeader = req.headers.get("x-internal-context-key");
    const isTrustedInternalContext = Boolean(
      AI_INTERNAL_CONTEXT_KEY &&
      internalContextHeader &&
      internalContextHeader === AI_INTERNAL_CONTEXT_KEY
    );
    const { message, history, isPublic, context } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (isPublic) {
      const channel = context?.channel === "WHATSAPP" ? "WHATSAPP" : context?.channel === "WEB" ? "WEB" : "UNKNOWN";
      const ip = extractClientIp(req.headers) || (req.headers.get("user-agent") ? `ua:${req.headers.get("user-agent")}` : null);
      const phone = context?.phoneNumber ? normalizePhoneNumber(String(context.phoneNumber)) : null;
      const isInScope = !isGercepOutOfScopeMessage(String(message || "")) && !isSpamLikeMessage(String(message || ""));
      const abuseDecision = await evaluateAiAbuseGuard({
        channel,
        storeSlug: context?.slug || null,
        ip,
        phone,
        message: String(message || ""),
        isInScope
      });
      if (abuseDecision.action === "BLOCK") {
        return NextResponse.json(
          {
            text: abuseDecision.message,
            blocked: true,
            resetHistory: abuseDecision.resetHistory,
            history: []
          },
          { status: 200 }
        );
      }
    }
    // Ensure history is a valid array of the correct format for Gemini SDK
    let validatedHistory = Array.isArray(history) ? history.map((h: any) => {
      // Role must be 'user', 'model', or 'function'
      let role = h.role;
      if (role !== "model" && role !== "function") {
        role = "user";
      }
      
      return {
        role,
        parts: Array.isArray(h.parts) 
          ? h.parts.map((p: any) => {
              if (typeof p === "string") return { text: p };
              if (p.text) return { text: String(p.text) };
              if (p.functionCall) return { functionCall: p.functionCall };
              if (p.functionResponse) return { functionResponse: p.functionResponse };
              return { text: JSON.stringify(p) };
            })
          : [{ text: String(h.text || h.parts || "") }]
      };
    }) : [];
    const historyLimit = isPublic ? GEMINI_HISTORY_LIMIT_PUBLIC : GEMINI_HISTORY_LIMIT_PRIVATE;
    if (historyLimit > 0 && validatedHistory.length > historyLimit) {
      validatedHistory = validatedHistory.slice(-historyLimit);
    }
    while (validatedHistory.length > 0 && validatedHistory[0]?.role !== "user") {
      validatedHistory = validatedHistory.slice(1);
    }
    if (isGercepOutOfScopeMessage(message)) {
      return NextResponse.json({ text: getGercepScopeRefusal(message), history: validatedHistory });
    }

    // If not public, require session
    const session = await getServerSession(authOptions);
    if (!isPublic) {
      if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const userRole = (session as any).user?.role;
      if (userRole !== "SUPER_ADMIN" && userRole !== "MERCHANT" && userRole !== "MANAGER") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Get Gemini Key: Prefer custom store key if Sovereign, otherwise platform default
    let geminiKey = null;
    let storeSlug = context?.slug || (Array.isArray(context) ? context[0]?.slug : null);
    let forcedScopedSlug: string | null = null;
    
    let scopedStore: any = null;
    const storeIdFromContext = context?.storeId ? Number(context.storeId) : null;
    if (!storeSlug && storeIdFromContext) {
      const store = await prisma.store.findFirst({
        where: buildAssistantScopedStoreWhere({ id: storeIdFromContext })
      }) as any;
      if (store?.slug) {
        storeSlug = String(store.slug);
        scopedStore = store;
      }
    }
    if (storeSlug && !scopedStore) {
      const store = await prisma.store.findFirst({
        where: buildAssistantScopedStoreWhere({ slug: storeSlug })
      }) as any;
      scopedStore = store;
    }
    if (isPublic && scopedStore?.slug) {
      forcedScopedSlug = String(scopedStore.slug);
    }
    if (["SOVEREIGN", "CORPORATE"].includes(scopedStore?.subscriptionPlan) && scopedStore?.customGeminiKey) {
      geminiKey = scopedStore.customGeminiKey;
      console.log(`[AI_CHAT] Using custom Gemini Key for store: ${storeSlug}`);
    }

    const fullMenuState = getFullMenuStateFromHistory(validatedHistory);

    if (isPublic && isContinueMenuRequest(String(message || "")) && scopedStore?.id) {
      if (!fullMenuState || fullMenuState.storeId !== scopedStore.id) {
        const text = `Ketik "menu lengkap" untuk lihat daftar menu di *${scopedStore.name}*.`;
        const nextHistory = [
          ...validatedHistory,
          { role: "user", parts: [{ text: String(message || "") }] },
          { role: "model", parts: [{ text }] }
        ];
        const historyLimit = isPublic ? GEMINI_HISTORY_LIMIT_PUBLIC : GEMINI_HISTORY_LIMIT_PRIVATE;
        return NextResponse.json({
          text,
          history: historyLimit > 0 && nextHistory.length > historyLimit ? nextHistory.slice(-historyLimit) : nextHistory
        });
      }

      const offset = Math.max(0, Number(fullMenuState.offset || 0) || 0);
      const products = await prisma.product.findMany({
        where: {
          storeId: scopedStore.id,
          stock: { gt: 0 },
          category: { notIn: ["_ARCHIVED_", "System"] }
        },
        select: { name: true, price: true, category: true },
        orderBy: [{ category: "asc" }, { name: "asc" }],
        skip: offset,
        take: 25
      });
      const totalCount = await prisma.product.count({
        where: {
          storeId: scopedStore.id,
          stock: { gt: 0 },
          category: { notIn: ["_ARCHIVED_", "System"] }
        }
      });
      if (products.length === 0) {
        const text = `Itu semua menu di *${scopedStore.name}*. Kamu bisa ketik "cari <nama produk>" kalau mau langsung item tertentu.`;
        const nextHistory = [
          ...validatedHistory,
          { role: "user", parts: [{ text: String(message || "") }] },
          { role: "model", parts: [{ text }] },
          buildFullMenuStateHistoryPart({ storeId: scopedStore.id, offset: totalCount, totalCount })
        ];
        const historyLimit = isPublic ? GEMINI_HISTORY_LIMIT_PUBLIC : GEMINI_HISTORY_LIMIT_PRIVATE;
        return NextResponse.json({
          text,
          history: historyLimit > 0 && nextHistory.length > historyLimit ? nextHistory.slice(-historyLimit) : nextHistory
        });
      }

      let text = `Berikut lanjutan menu di *${scopedStore.name}* (${Math.min(offset + products.length, totalCount)} dari ${totalCount}):\n\n`;
      products.forEach((p, idx) => {
        text += `${offset + idx + 1}. ${p.name} — Rp ${new Intl.NumberFormat("id-ID").format(Number(p.price || 0))}\n`;
      });
      if (offset + products.length < totalCount) {
        text += `\nMasih ada ${totalCount - (offset + products.length)} produk lagi. Balas "lanjut menu" atau ketik "cari <nama produk>".`;
      } else {
        text += `\nKetik "cari <nama produk>" kalau mau langsung item tertentu.`;
      }
      const nextHistory = [
        ...validatedHistory,
        { role: "user", parts: [{ text: String(message || "") }] },
        { role: "model", parts: [{ text }] },
        buildFullMenuStateHistoryPart({ storeId: scopedStore.id, offset: offset + products.length, totalCount })
      ];
      const historyLimit = isPublic ? GEMINI_HISTORY_LIMIT_PUBLIC : GEMINI_HISTORY_LIMIT_PRIVATE;
      return NextResponse.json({
        text,
        history: historyLimit > 0 && nextHistory.length > historyLimit ? nextHistory.slice(-historyLimit) : nextHistory
      });
    }

    if (isPublic && isFullMenuRequest(String(message || "")) && scopedStore?.slug) {
      const products = await prisma.product.findMany({
        where: {
          storeId: scopedStore.id,
          stock: { gt: 0 },
          category: { notIn: ["_ARCHIVED_", "System"] }
        },
        select: { name: true, price: true, category: true },
        orderBy: [{ category: "asc" }, { name: "asc" }],
        take: 25
      });
      const totalCount = await prisma.product.count({
        where: {
          storeId: scopedStore.id,
          stock: { gt: 0 },
          category: { notIn: ["_ARCHIVED_", "System"] }
        }
      });
      if (products.length === 0) {
        return NextResponse.json({
          text: `Maaf, belum ada produk aktif di ${scopedStore.name}.`,
          history: validatedHistory
        });
      }
      let text = `Berikut menu di *${scopedStore.name}* (${Math.min(products.length, totalCount)} dari ${totalCount}):\n\n`;
      products.forEach((p, idx) => {
        text += `${idx + 1}. ${p.name} — Rp ${new Intl.NumberFormat('id-ID').format(Number(p.price || 0))}\n`;
      });
      if (totalCount > products.length) {
        text += `\nMasih ada ${totalCount - products.length} produk lagi. Balas "lanjut menu" atau ketik "cari <nama produk>".`;
      } else {
        text += `\nKetik "cari <nama produk>" kalau mau langsung item tertentu.`;
      }
      const nextHistory = [
        ...validatedHistory,
        { role: "user", parts: [{ text: String(message || "") }] },
        { role: "model", parts: [{ text }] },
        buildFullMenuStateHistoryPart({ storeId: scopedStore.id, offset: products.length, totalCount })
      ];
      const historyLimit = isPublic ? GEMINI_HISTORY_LIMIT_PUBLIC : GEMINI_HISTORY_LIMIT_PRIVATE;
      return NextResponse.json({
        text,
        history: historyLimit > 0 && nextHistory.length > historyLimit ? nextHistory.slice(-historyLimit) : nextHistory
      });
    }

    if (!geminiKey) {
      await ensurePlatformSettingsSchema().catch(() => null);
      const settings = await prisma.platformSettings.findUnique({ where: { key: "default" } }).catch(() => null) as any;
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
    let isMerchantUser = false;
    let corporateId: number | null = null;
    let currentUserId: number | null = null;
    let currentUserRole: string | null = null;
    const allowedStoreSlugs = new Set<string>();
    const allowedStoreIds = new Set<number>();

    if (session && (session as any).user) {
      const dbUser = await prisma.user.findUnique({
        where: { email: (session as any).user.email! },
        include: {
          stores: true,
          workedAt: { select: { id: true, slug: true } }
        }
      }) as any;
      
      if (dbUser && (dbUser.role === "MERCHANT" || dbUser.role === "MANAGER")) {
        isMerchantUser = true;
        corporateId = dbUser.id;
        currentUserId = dbUser.id;
        currentUserRole = dbUser.role;
        const storesList = dbUser.stores.map((s: any) => `${s.name} (slug: ${s.slug})`).join(", ");
        const userPlan = dbUser.stores?.[0]?.subscriptionPlan || "FREE";
        userContextInfo = ` The user is an authenticated ADMIN/MERCHANT (ID: ${dbUser.id}). They manage: ${storesList}. They can use tools like 'get_store_stats', 'get_corporate_stats', 'toggle_store_active', 'toggle_store_open', and 'update_product_price'.`;
        for (const s of dbUser.stores || []) {
          if (s?.slug) allowedStoreSlugs.add(String(s.slug));
          if (s?.id) allowedStoreIds.add(Number(s.id));
        }
        if (dbUser.workedAt?.slug) allowedStoreSlugs.add(String(dbUser.workedAt.slug));
        if (dbUser.workedAt?.id) allowedStoreIds.add(Number(dbUser.workedAt.id));
        
        if (userPlan === "CORPORATE") {
           userContextInfo += " They are a CORPORATE user with multi-outlet access.";
        }
      } else if (dbUser && dbUser.role === "SUPER_ADMIN") {
        isMerchantUser = true; // Super admin can do everything
        currentUserRole = "SUPER_ADMIN";
        userContextInfo = " The user is a SUPER_ADMIN with full platform access.";
      }
    } else if (isTrustedInternalContext && context?.phoneNumber) {
      const cleanPhone = context.phoneNumber.replace(/\D/g, "");
      const dbUser = await prisma.user.findFirst({
        where: { phoneNumber: { contains: cleanPhone } },
        include: {
          stores: true,
          workedAt: { select: { id: true, slug: true } }
        }
      }) as any;
      
      if (dbUser && (dbUser.role === "MERCHANT" || dbUser.role === "MANAGER" || dbUser.role === "SUPER_ADMIN")) {
        isMerchantUser = true;
        corporateId = dbUser.id;
        currentUserId = dbUser.id;
        currentUserRole = dbUser.role;
        const storesList = dbUser.stores.map((s: any) => `${s.name} (slug: ${s.slug})`).join(", ");
        const userPlan = dbUser.stores?.[0]?.subscriptionPlan || "FREE";
        userContextInfo = ` The user is a registered ${dbUser.role} (ID: ${dbUser.id}) chatting via WhatsApp. They manage: ${storesList}. They can use tools like 'get_store_stats', 'get_corporate_stats', 'toggle_store_active', 'toggle_store_open', and 'update_product_price'.`;
        for (const s of dbUser.stores || []) {
          if (s?.slug) allowedStoreSlugs.add(String(s.slug));
          if (s?.id) allowedStoreIds.add(Number(s.id));
        }
        if (dbUser.workedAt?.slug) allowedStoreSlugs.add(String(dbUser.workedAt.slug));
        if (dbUser.workedAt?.id) allowedStoreIds.add(Number(dbUser.workedAt.id));
        
        if (userPlan === "CORPORATE") {
           userContextInfo += " They are a CORPORATE user with multi-outlet access.";
        }
      }
    }
    if (isPublic && forcedScopedSlug) {
      allowedStoreSlugs.add(forcedScopedSlug);
    }

    // Inject store context if provided
    let storeContextInfo = "";
    if (context?.storeId) {
      const store = await prisma.store.findUnique({
        where: { id: Number(context.storeId) },
        select: { name: true, slug: true, tables: true }
      });
      if (store) {
        const hasTables = store.tables && store.tables.length > 0;
        storeContextInfo = ` You are currently assisting at the store '${store.name}' (slug: ${store.slug}).${hasTables ? " This restaurant has tables." : ""}`;
      }
    } else if (forcedScopedSlug) {
      const store = await prisma.store.findFirst({
        where: buildAssistantStoreEligibilityWhere({ slug: forcedScopedSlug }),
        select: { name: true, slug: true, tables: true }
      });
      if (store) {
        const hasTables = store.tables && store.tables.length > 0;
        storeContextInfo = ` You are currently assisting at the store '${store.name}' (slug: ${store.slug}).${hasTables ? " This restaurant has tables." : ""}`;
      }
    }

    const tableInfo = context?.tableNumber ? ` The customer is sitting at Table ${context.tableNumber}.` : "";
    const locationInfo = context?.location 
      ? ` The user's current location is latitude: ${context.location.latitude}, longitude: ${context.location.longitude}.`
      : "";

    const chat = model.startChat({
      history: validatedHistory,
      systemInstruction: {
        parts: [{ text: `You are the Gercep Platform Assistant. You help manage stores, restaurants, and orders. Use the term 'toko' or 'resto' when referring to businesses. Use the available tools to find information.
RESPONSE STYLE (VERY IMPORTANT):
1. Default format: up to 3 bullets (short lines) + 1 question.
2. Only show up to 10 bullets if the user asks for "detail", "semua", or "menu lengkap".
3. Ask at most ONE question at the end. If you need multiple inputs, combine them into one question.
4. Keep replies short, clear, and actionable. Avoid long explanations and avoid repeating the user's message.
CHANNEL FORMATTING:
1. If the user is chatting via WhatsApp, use WhatsApp formatting only: *bold* (single asterisk). Never use **double-asterisk** markdown.
2. Avoid markdown links. If you must include a URL, paste the URL plainly.
SCOPE POLICY:
1. You only answer within Gercep scope: store/resto search, menu/products, ordering, delivery, payment, subscription, and merchant operations.
2. If user asks coding, learning, or general questions outside Gercep, politely refuse and redirect to Gercep-related help.
3. Never provide broad general-knowledge tutoring outside Gercep context.

ABOUT GERC EP (company info):
1. If the user asks "Gercep itu apa?", "fiturnya apa?", "cara kerja", or "help", explain briefly that Gercep is a WhatsApp + Web ordering platform to help customers find nearby stores/restos, view menus/products, place orders, choose delivery, and pay.
2. If the user asks about the owner/company/founder, answer:
   - Owner/Company: PT Digitalisasi Kreasi Indonesia
   - Founder: Sandi Suhendro
3. Keep it short and practical, then offer next steps within Gercep (search store, see menu, order).


MERCHANT/ADMIN ASSISTANCE:
If the user is an ADMIN or MERCHANT (see userContextInfo):
1. Help them manage their outlets. You can check sales using 'get_store_stats' or 'get_corporate_stats'.
2. You can update product prices ('update_product_price') or add products ('add_new_product').
3. You can enable/disable stores ('toggle_store_active') or manually open/close them ('toggle_store_open').
4. If they ask "bagaimana performa toko saya?", use stats tools.
5. If they are a CORPORATE user, prioritize 'get_corporate_stats' to show them a summary of all their outlets.
6. Always confirm changes before applying them if they involve data modification.
7. WHATSAPP CREDIT TOP-UP:
   - Only ADMIN, MERCHANT, or MANAGER can top up credits.
   - If a user asks to "topup", "isi saldo", or "beli kredit WhatsApp", check their role.
   - If they are a CORPORATE user (multi-outlet), you MUST ask: "Toko mana yang ingin di-topup?" and list their stores (slugs).
   - If they manage only ONE store, you can proceed directly but confirm the store name.
   - Suggest top-up amounts: Rp 50.000, Rp 100.000, or Rp 250.000 for convenience, but the user CAN fill ANY custom amount as long as it is at least Rp 10.000.
   - Once the store and amount are confirmed, use 'create_topup_payment_link'.
   - After calling the tool, provide the payment link to the user.
8. MERCHANT REGISTRATION:
   - If a user asks "bagaimana cara mendaftar?", "saya mau jadi merchant", "how to register", or "i want to open a store", tell them they can register at the Gercep Platform.
   - Provide the registration link: https://gercep.click/register.
   - Explain that Gercep helps businesses automate orders via WhatsApp and Web with AI.

CUSTOMER ASSISTANCE:
1. If a user asks for a specific food (like 'nasi uduk') or "nearby" stores, use 'search_stores'.
1b. When listing stores, use storeType (if available) to describe what they sell.
2. If you have the user's location (latitude/longitude) in the context, you MUST pass them to 'search_stores' to ensure results are relevant to their area.
3. If no stores are found within 50km, tell the user: "Maaf, sepertinya belum ada toko di area kamu yang bergabung dengan Gercep."

GREETING & INITIAL FLOW:
1. If store context is available (from QR scan or explicit store selection), greet with the store name: "Selamat datang di [Nama Toko]! Ada yang bisa Gercep bantu hari ini?"
2. If store context is NOT available, NEVER claim the user is connected to a specific store. Use platform onboarding style: "Halo! Saya bantu cari toko/resto terdekat, lihat menu, pilih pengiriman, dan pembayaran."
3. If the store context is available, ask them early what they'd like to do: "Mau makan di sini (DINE_IN), pesan antar (DELIVERY), atau ambil sendiri (TAKEAWAY)?"

PRODUCT IMAGES & DETAILS:
1. When a user asks about a product, or if you are showing the menu, you should mention that you can show pictures of the products.
2. If a user asks "boleh lihat fotonya?", "tampilkan gambar [Produk]", or requests an image using informal Indonesian/slang (e.g., "kirolim poto", "spill gambar", "liat ikannya"), you MUST find the product first.
3. If you have a store context, use 'get_store_products' to find the item and its 'image' field.
4. If you DO NOT have a store context, use 'search_stores' with the product name as the query to find which store sells it, then use 'get_store_products' for that store.
5. If a product has an image URL in the tool output, you MUST include it in your response using this exact format: [PRODUCT_IMAGE: https://url-to-image.jpg].
6. You can also provide a brief description of the product if available in the tool output.

SHIPPING & LOCATION:
1. Clarify the order type early: DINE_IN (makan di tempat), TAKEAWAY (ambil sendiri di toko), or DELIVERY (diantar ke rumah).
2. For DINE_IN (makan di tempat): 
   - You MUST ask for the table number (nomor meja) if it's not already provided in the context.
   - If the user provides a table number, confirm it: "Baik, pesanan untuk meja [Nomor Meja] ya."
   - When calling 'create_customer_order', you MUST pass the 'table_number'.
3. If the user is looking for a restaurant or food "near them", "in their area", or "nearby", you MUST ask them to share their location (use the 📍 button) or at least provide their area, city, or postal code BEFORE searching. Do not just list all available restaurants globally if they asked for something nearby.
4. If the user is ordering from home/outside the store (no table number or off-site), you MUST ONLY offer DELIVERY (diantar). TAKEAWAY or DINE_IN are not options for off-site customers.
5. If the user is AT the store/restaurant (on-site), offer DINE_IN or TAKEAWAY. DELIVERY is NOT needed if they are already there.
6. For DELIVERY orders, you MUST ask the user to share their location (use the 📍 button on web) AND provide their full physical address string.
7. DO NOT assume the address from coordinates alone. You MUST have the physical address text for Biteship to process the draft order correctly.
8. Once you have both the user's location (coordinates) and full address, use 'get_shipping_rates' to show delivery options.
9. If the user is near the store (within 100m), a 'Store Courier' (Kurir Toko) option might be available (often free or low cost). Explain this to the user if 'get_shipping_rates' returns it.
10. If 'search_stores' provides 'shippingSenderAddress' or coordinates for a store, use that info to explain where the item is coming from.
11. IMPORTANT: Always call 'get_shipping_rates' BEFORE 'create_customer_order' for delivery.
12. IMPORTANT: When calling 'create_customer_order' for a DELIVERY order, you MUST pass the 'address', 'latitude', and 'longitude'.
13. For TAKEAWAY orders (on-site only), no address or coordinates are needed; just tell them to pick up at the store address.

PAYMENT & RE-ORDERING:
1. You MUST ask the user for their preferred payment method ('qris' or 'bank_transfer') BEFORE calling 'create_customer_order'.
2. If a user wants to "re-order" or "order again", use 'get_last_order_by_phone' to find their items, but you MUST still ask for:
   - Their current location/address (if delivery).
   - Their preferred payment method.
   - Their table number (if dine-in).
3. If a product has variations (like size, flavor, etc.), you MUST pass the correct 'variationName' when calling 'create_customer_order' to ensure the correct price is used.
4. Do not create an order until the user has confirmed the items, shipping (if applicable), and payment method.

WEIGHT / UNIT CLARIFICATION:
1. If the user orders using weights (kg/gram) but the menu item is sold per pack (e.g., 0.5kg), convert into pack count and ask to confirm.
2. If conversion is ambiguous, ask the user to choose pack/weight before creating the order.

Once an order is created:
1. Show the user the 'breakdown' of the order.
2. Tell them they can pay directly here or have the payment link sent to their WhatsApp.
3. If they want to pay on WhatsApp, ask for their WhatsApp number and call 'send_order_to_whatsapp'.
4. If the user is a MERCHANT and asks to send order details or summary to their WhatsApp (or any number), you MUST set 'isMerchant=true' in 'send_order_to_whatsapp' to ensure they receive the merchant summary format.
5. Ensure all order details (taxes, service charges, fees) are clearly explained to the user before they confirm.${userContextInfo}${storeContextInfo}${tableInfo}${locationInfo} ${context?.phoneNumber ? `The current user's phone number is ${context.phoneNumber}.` : ""} ${context?.channel === "WHATSAPP" ? "The user is chatting via WhatsApp." : ""}` }]
      } as any,
      tools: [
        {
          functionDeclarations: [
            {
              name: "search_stores",
              description: "Find restaurants or stores by name/product/category and nearby area. For nearby intent, keep area in location_context (e.g. Ciputat) and keep query concise.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Search keyword (store name, category, or product name)." },
                  location_context: { type: "string", description: "Area, city, or postal code to filter results." },
                  latitude: { type: "number", description: "The customer's latitude for distance sorting." },
                  longitude: { type: "number", description: "The customer's longitude for distance sorting." }
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
              name: "get_corporate_stats",
              description: "Retrieve multi-outlet stats for a corporate account.",
              parameters: {
                type: "object",
                properties: {
                  corporateId: { type: "number", description: "The ID of the corporate user/owner." }
                },
                required: ["corporateId"]
              }
            },
            {
              name: "create_topup_payment_link",
              description: "Generate a Midtrans payment link for WhatsApp credit top-up. Only for admins/merchants.",
              parameters: {
                type: "object",
                properties: {
                  storeId: { type: "integer", description: "The numeric ID of the store to top up." },
                  amount: { type: "number", description: "The top-up amount in Rupiah (min 10000)." }
                },
                required: ["storeId", "amount"]
              }
            },
            {
              name: "toggle_store_active",
              description: "Enable or disable a store outlet. Only for admins.",
              parameters: {
                type: "object",
                properties: {
                  slug: { type: "string" },
                  active: { type: "boolean" }
                },
                required: ["slug", "active"]
              }
            },
            {
              name: "toggle_store_open",
              description: "Manually open or close a store (override schedule). Only for admins.",
              parameters: {
                type: "object",
                properties: {
                  slug: { type: "string" },
                  open: { type: "boolean" }
                },
                required: ["slug", "open"]
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
                required: ["slug", "address", "latitude", "longitude"]
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
                  payment_method: { type: "string", enum: ["qris", "bank_transfer"] },
                  table_number: { type: "string", description: "Nomor meja jika makan di tempat (DINE_IN)." },
                  isMerchant: { type: "boolean", description: "Set to true if the requester is the merchant." }
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
              description: "Send order details to a WhatsApp number. If sending to the merchant themselves, set isMerchant=true.",
              parameters: {
                type: "object",
                properties: {
                  orderId: { type: "integer" },
                  phoneNumber: { type: "string", description: "The WhatsApp number to send the order to." },
                  isMerchant: { type: "boolean", description: "Set to true if sending to the store owner/merchant." }
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
                  phoneNumber: { type: "string", description: "The customer's WhatsApp number." },
                  isMerchant: { type: "boolean", description: "Set to true if the requester is the merchant." }
                },
                required: ["phoneNumber"]
              }
            }
          ]
        }
      ] as any,
      generationConfig: { maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS }
    });

    // 1. Initial Request to Gemini
    console.log(`[AI_CHAT] Initial message: "${message}"`);
    let result = await chat.sendMessage(String(message));
    let response = result.response;
    let calls = response.functionCalls() || [];
    console.log(`[AI_CHAT] Gemini response calls count: ${calls.length}`);

    // 2. Handle Function Calls (Loop until no more calls)
    const MAX_ITERATIONS = GEMINI_MAX_TOOL_ITERATIONS;
    let iterations = 0;

    let finalBreakdown = undefined;
    let finalPaymentUrl = undefined;
    let finalProductImage = undefined;
    let lastShippingOptions: any[] | null = null;

    while (calls && calls.length > 0 && iterations < MAX_ITERATIONS) {
      const toolResponses = [];
      for (const call of calls) {
        const toolFn = tools[call.name];
        if (toolFn) {
          // Auto-inject isMerchant flag or corporateId
          const args = { ...call.args } as any;
          if (isMerchantUser) {
            if (["send_order_to_whatsapp", "get_last_order_by_phone"].includes(call.name)) {
              args.actorIsMerchant = true;
            }
            if (call.name === "create_customer_order") {
              args.isMerchant = true;
            }
            if (call.name === "get_corporate_stats" && !args.corporateId && corporateId) {
              args.corporateId = corporateId;
            }
            // For top-up, inject userId if NOT super-admin (super-admin skips ownership check)
            if (call.name === "create_topup_payment_link" && currentUserId) {
               if (currentUserRole !== "SUPER_ADMIN") {
                 args.userId = currentUserId;
               }
            }
          }
          if (context?.phoneNumber) {
            args.callerPhone = context.phoneNumber;
          }
          if (forcedScopedSlug) {
            const scopedSlugTools = new Set([
              "get_store_stats",
              "get_store_products",
              "get_shipping_rates",
              "create_customer_order",
              "update_product_price",
              "add_new_product",
              "toggle_store_active",
              "toggle_store_open",
              "create_merchant_invoice"
            ]);
            if (scopedSlugTools.has(call.name)) {
              args.slug = forcedScopedSlug;
            }
            if (call.name === "search_stores") {
              args.scopedSlug = forcedScopedSlug;
            }
          }

          const sensitiveTools = new Set([
            "update_product_price",
            "add_new_product",
            "toggle_store_active",
            "toggle_store_open",
            "create_topup_payment_link",
            "get_store_stats",
            "get_store_products",
            "create_merchant_invoice"
          ]);
          if (sensitiveTools.has(call.name) && !isMerchantUser) {
            toolResponses.push({
              functionResponse: {
                name: call.name,
                response: { error: "Unauthorized tool access" }
              }
            });
            continue;
          }
          if (currentUserRole !== "SUPER_ADMIN") {
            if (args.slug && allowedStoreSlugs.size > 0 && !allowedStoreSlugs.has(String(args.slug))) {
              toolResponses.push({
                functionResponse: {
                  name: call.name,
                  response: { error: "Unauthorized store access" }
                }
              });
              continue;
            }
            if (args.storeId && allowedStoreIds.size > 0 && !allowedStoreIds.has(Number(args.storeId))) {
              toolResponses.push({
                functionResponse: {
                  name: call.name,
                  response: { error: "Unauthorized store access" }
                }
              });
              continue;
            }
          }

          console.log(`[AI_CHAT] Calling tool: ${call.name}`, args);
          const data = await toolFn(args) || { success: false, error: "Tool returned no data" };
          toolResponses.push({
            functionResponse: {
              name: call.name,
              response: data
            }
          });
          
          // Capture structured data for the response
          if (call.name === "get_shipping_rates" && Array.isArray((data as any)?.shippingOptions)) {
            lastShippingOptions = (data as any).shippingOptions;
          }
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
          if (call.name === "create_topup_payment_link" && data.success) {
            finalPaymentUrl = data.paymentUrl;
          }
        }
      }

      // Send the tool results back to Gemini
      if (toolResponses.length > 0) {
        // Explicitly format as Parts array for sendMessage
        const parts = toolResponses.map(tr => ({
          functionResponse: {
            name: tr.functionResponse.name,
            response: typeof tr.functionResponse.response === "object" ? tr.functionResponse.response : { content: tr.functionResponse.response }
          }
        }));
        
        result = await chat.sendMessage(parts as any);
        response = result.response;
        calls = response.functionCalls() || [];
      } else {
        calls = [];
      }
      iterations++;
    }

    let responseText = String(response.text() || "");
    responseText = responseText.replace(/\n{3,}/g, "\n\n").trim();
    if (!responseText) {
      responseText = "Maaf, aku belum bisa menjawab itu. Coba tanya dengan kata lain ya.";
    }
    const imageMatch = responseText.match(/\[PRODUCT_IMAGE:\s*(https?:\/\/[^\]]+)\]/i);
    if (imageMatch) {
      finalProductImage = imageMatch[1];
    }

    const nextHistory = await chat.getHistory();
    let trimmedNextHistory = historyLimit > 0 && nextHistory.length > historyLimit
      ? nextHistory.slice(-historyLimit)
      : nextHistory;
    while (Array.isArray(trimmedNextHistory) && trimmedNextHistory.length > 0 && trimmedNextHistory[0]?.role !== "user") {
      trimmedNextHistory = trimmedNextHistory.slice(1);
    }
    await logTraffic(
      context?.storeId ? Number(context.storeId) : undefined,
      context?.channel === "WHATSAPP" ? "WHATSAPP" : "WEB",
      {
        event: "AI_CHAT",
        channel: context?.channel || (isPublic ? "PUBLIC" : "PRIVATE"),
        isPublic: Boolean(isPublic),
        storeSlug: context?.slug || null,
        historyCount: validatedHistory.length,
        messageChars: String(message || "").length,
        responseChars: String(responseText || "").length,
        functionCalls: Array.isArray(calls) ? calls.length : 0,
        iterationsUsed: iterations,
        durationMs: Date.now() - startedAt
      }
    );
    const quickReplies = extractQuickRepliesFromText(responseText);
    return NextResponse.json({ 
      text: responseText.replace(/\[PRODUCT_IMAGE:\s*https?:\/\/[^\]]+\]/gi, "").trim(),
      history: trimmedNextHistory,
      breakdown: finalBreakdown,
      paymentUrl: finalPaymentUrl,
      productImage: finalProductImage,
      quickReplies,
      shippingOptions: lastShippingOptions
    });

  } catch (error: any) {
    console.error("[GEMINI_CHAT_ERROR]", error);
    // Log more details if it's a TypeError related to iterables
    if (error instanceof TypeError && error.message.includes("iterable")) {
      console.error("[GEMINI_CHAT_ERROR_DETAIL] Likely invalid history or message parts format.");
    }
    const raw = String(error?.message || "");
    const shouldReset =
      raw.includes("First content should be with role 'user'") ||
      raw.includes("First content should be with role \"user\"");
    if (shouldReset) {
      return NextResponse.json(
        {
          error: "Maaf, sesi chat perlu direset. Silakan kirim pesan lagi ya.",
          resetHistory: true,
          history: []
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: raw || "An unexpected error occurred during chat." }, { status: 500 });
  }
}
