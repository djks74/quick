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
  
  // These are the core topics we MUST allow
  const scopeKeywords = [
    "gercep", "toko", "resto", "restaurant", "store", "menu", "produk", "product", "pesan", "order",
    "ulang", "ulangi", "reorder", "order lagi", "pesan lagi",
    "delivery", "pengiriman", "kurir", "checkout", "bayar", "payment", "qris", "transfer", "stok",
    "inventory", "kasir", "cashier", "outlet", "meja", "table", "wa", "whatsapp", "promo", "diskon",
    "sales", "omzet", "performa", "topup", "saldo", "cara", "help", "bantuan", "panduan", "guide",
    "pasar segar", "sayur", "buah", "daging", "ikan", "sembako", "belanja", "pokok", "bahan", "minta", "list", "daftar"
  ];

  // These are strictly prohibited topics (not related to fresh market/grocery at all)
  const strictlyOutOfScope = [
    "coding", "programming", "python", "javascript", "react", "nextjs", "typescript", "sql",
    "algoritma", "algorithm", "matematika", "fisika", "kimia", "biologi", "sejarah", "politik", "agama",
    "berita", "news", "crypto", "saham", "trading", "cuaca", "weather", "ramalan", "horoscope", "game",
    "how to make", "cara membuat", "write a code", "buatkan kode"
  ];

  const hasScope = scopeKeywords.some((kw) => text.includes(kw));
  if (hasScope) return false;

  // If it's a very short message or greeting, don't reject it
  if (text.length < 10) return false;

  const hasStrictlyOutOfScope = strictlyOutOfScope.some((kw) => text.includes(kw));
  return hasStrictlyOutOfScope;
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

  const offersFullMenu =
    (t.includes("menu lengkap") || t.includes("full menu") || t.includes("semua menu") || t.includes("semua produk")) &&
    (t.includes("mau") || t.includes("tampilkan") || t.includes("lihat"));
  if (offersFullMenu) {
    return [
      { id: "YES", title: "Ya", value: "Ya" },
      { id: "NO", title: "Tidak", value: "Tidak" }
    ];
  }

  const asksPayment =
    (t.includes("bayar") || t.includes("payment") || t.includes("metode pembayaran")) &&
    t.includes("qris") &&
    (t.includes("bank") || t.includes("transfer")) &&
    // Only show payment buttons if we are NOT still clarifying items or location
    !t.includes("?") &&
    !t.includes("apakah") &&
    !t.includes("bantu konfirmasi");
  if (asksPayment) {
    return [
      { id: "PAY_QRIS", title: "QRIS", value: "qris" },
      { id: "PAY_BANK", title: "Bank Transfer", value: "bank transfer" }
    ];
  }

  const offersMenu =
    (t.includes("menu lengkap") || t.includes("full menu") || t.includes("semua menu") || t.includes("semua produk")) &&
    (t.includes("mau") || t.includes("tampilkan") || t.includes("lihat") || t.includes("ingin") || t.includes("?"));
  if (offersMenu) {
    return [
      { id: "YES", title: "Ya", value: "Ya" },
      { id: "NO", title: "Tidak", value: "Tidak" }
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

function isAffirmativeReply(input: string) {
  const t = String(input || "").toLowerCase().trim();
  // Broadened to include 'yea', 'send', 'kirim', etc. since it's guarded by wasFullMenuOfferedInHistory
  const isDirectAffirmative = /^(ya|iya|y|yes|yea|yeah|yep|yup|yap|ok|okay|oke|sip|boleh|silakan|sure|gas|gass|yapz|yepz|info|mau|siap)\b/.test(t);
  const isPositiveRequest = /\b(kirim|send|tampil|lihat|liat|show|kasih|kasi|kasihkan|kasikan)\b/.test(t) && !/\b(jangan|gak|ga|no|tidak|nanti|ntar)\b/.test(t);
  return isDirectAffirmative || isPositiveRequest;
}

function isAskingWhereMenu(input: string) {
  const t = String(input || "").toLowerCase().trim();
  return /\b(mana\s+menu(\s+nya)?|menu\s+mana|kok\s+ga\s+ada\s+menu|kok\s+gak\s+ada\s+menu|ga\s+ada\s+menu|gak\s+ada\s+menu)\b/.test(t);
}

function wasFullMenuOfferedInHistory(history: any[]) {
  if (!Array.isArray(history)) return false;
  let modelMessagesSeen = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h?.role !== "model") continue;
    modelMessagesSeen++;

    const parts = Array.isArray(h.parts) ? h.parts : [];
    const text = parts.map((p: any) => (typeof p === "string" ? p : p?.text)).filter(Boolean).join("\n");
    const t = String(text || "").toLowerCase();
    
    // Consistent with offersMenu detection logic
    const isMenuOffer =
      (t.includes("menu lengkap") || t.includes("full menu") || t.includes("semua menu") || t.includes("semua produk") || t.includes("daftar menu")) &&
      (t.includes("mau") || t.includes("tampilkan") || t.includes("lihat") || t.includes("ingin") || t.includes("?") || t.includes("balas") || t.includes("ketik"));
    
    if (isMenuOffer) return true;
    if (modelMessagesSeen >= 2) break; // Allow responding even if there's a small intermediary exchange
  }
  return false;
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

function normalizeLooseText(input: string) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSlugText(input: string) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function levenshteinDistance(a: string, b: string) {
  const aa = String(a || "");
  const bb = String(b || "");
  const matrix = Array.from({ length: aa.length + 1 }, () => new Array<number>(bb.length + 1).fill(0));
  for (let i = 0; i <= aa.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= bb.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= aa.length; i += 1) {
    for (let j = 1; j <= bb.length; j += 1) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[aa.length][bb.length];
}

function findMatchedCategorySlugs(categories: Array<{ name: string; slug: string }>, keyword?: string) {
  const rawKeyword = String(keyword || "").trim();
  if (!rawKeyword) return [] as string[];
  const looseKeyword = normalizeLooseText(rawKeyword);
  const slugKeyword = normalizeSlugText(rawKeyword);
  const matched = new Set<string>();
  for (const category of categories || []) {
    const catName = normalizeLooseText(category.name);
    const catSlug = normalizeSlugText(category.slug);
    if (!catSlug) continue;
    const directMatch =
      looseKeyword === catName ||
      slugKeyword === catSlug ||
      looseKeyword.includes(catName) ||
      catName.includes(looseKeyword) ||
      slugKeyword.includes(catSlug) ||
      catSlug.includes(slugKeyword);
    if (directMatch) {
      matched.add(category.slug);
      continue;
    }
    const distName = levenshteinDistance(looseKeyword, catName);
    const distSlug = levenshteinDistance(slugKeyword, catSlug);
    if (distName <= 2 || distSlug <= 2) {
      matched.add(category.slug);
      continue;
    }
    const keywordTokens = looseKeyword.split(" ").filter(Boolean);
    const catTokens = catName.split(" ").filter(Boolean);
    let tokenScore = 0;
    for (const k of keywordTokens) {
      if (catTokens.some((ct) => ct === k || levenshteinDistance(ct, k) <= 1)) tokenScore += 1;
    }
    if (tokenScore > 0 && tokenScore >= Math.min(keywordTokens.length, catTokens.length)) {
      matched.add(category.slug);
    }
  }
  return Array.from(matched);
}

const AI_API_KEY = process.env.AI_API_KEY;
const AI_INTERNAL_CONTEXT_KEY = process.env.AI_INTERNAL_CONTEXT_KEY;
const GEMINI_MAX_OUTPUT_TOKENS = Math.max(64, Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || "1024") || 1024);
const GEMINI_MAX_TOOL_ITERATIONS = Math.max(0, Number(process.env.GEMINI_MAX_TOOL_ITERATIONS || "10") || 10);
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
    
    const finalWhere: any = {
      ...baseWhere
    };

    if (keywordOr.length > 0 || locationOr.length > 0) {
      finalWhere.OR = [
        // Priority 1: Keyword AND Location
        ...( (keywordOr.length > 0 && locationOr.length > 0) ? [{ AND: [{ OR: keywordOr }, { OR: locationOr }] }] : [] ),
        // Priority 2: Keyword only
        ...( keywordOr.length > 0 ? keywordOr : [] ),
        // Priority 3: Location only
        ...( locationOr.length > 0 ? locationOr : [] )
      ];
    }
    
    // Combine into a single query with weighted logic via Prisma's OR
    let stores = await prisma.store.findMany({
      where: finalWhere,
      select: selectShape,
      take: 20
    });

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

  async get_store_products({ slug, keyword }: { slug: string; keyword?: string }) {
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findFirst({
      where: buildAssistantStoreEligibilityWhere({ slug }),
      include: {
        categories: { select: { name: true, slug: true } }
      }
    });
    if (!store) return { error: "Store not found" };

    const normalizedKeyword = String(keyword || "").trim();
    const categoryMatches = findMatchedCategorySlugs(store.categories as any[], normalizedKeyword);
    const slugKeyword = normalizeSlugText(normalizedKeyword);
    const whereClause: any = {
      storeId: store.id,
      category: { notIn: ["System", "_ARCHIVED_"] }
    };

    if (normalizedKeyword) {
      if (categoryMatches.length > 0) {
        // If we have category matches, filter by them
        whereClause.category = { in: categoryMatches };
      } else {
        // Broad search by keyword across multiple fields
        const orConditions: any[] = [
          { name: { contains: normalizedKeyword, mode: "insensitive" } },
          { description: { contains: normalizedKeyword, mode: "insensitive" } },
          { shortDescription: { contains: normalizedKeyword, mode: "insensitive" } },
          { category: { contains: normalizedKeyword, mode: "insensitive" } }
        ];
        if (slugKeyword) {
          orConditions.push({ category: { contains: slugKeyword, mode: "insensitive" } });
        }
        whereClause.OR = orConditions;
      }
    }

    let products = await prisma.product.findMany({
      where: whereClause,
      select: { id: true, name: true, price: true, category: true, variations: true, stock: true, image: true, description: true },
      take: normalizedKeyword ? 20 : 100
    });

    // Fallback: If category search returned 0 products, try a keyword search instead
    if (normalizedKeyword && categoryMatches.length > 0 && products.length === 0) {
      const fallbackWhere: any = {
        storeId: store.id,
        category: { notIn: ["System", "_ARCHIVED_"] },
        OR: [
          { name: { contains: normalizedKeyword, mode: "insensitive" } },
          { category: { contains: normalizedKeyword, mode: "insensitive" } }
        ]
      };
      products = await prisma.product.findMany({
        where: fallbackWhere,
        select: { id: true, name: true, price: true, category: true, variations: true, stock: true, image: true, description: true },
        take: 20
      });
    }

    const categoryNameBySlug = new Map<string, string>(
      (store.categories || []).map((c: any) => [String(c.slug), String(c.name)])
    );
    const normalizedProducts = (products || []).map((p: any) => ({
      ...p,
      categoryName: p.category ? (categoryNameBySlug.get(String(p.category)) || String(p.category)) : null
    }));
    return { 
      products: normalizedProducts,
      // If we found specific category matches, let the AI know it succeeded
      categoryMatches: categoryMatches.map(slug => ({
        slug,
        name: categoryNameBySlug.get(slug) || slug
      })),
      // Always include categories to avoid AI re-requesting them in a loop
      categories: store.categories,
      taxPercent: store.taxPercent,
      serviceChargePercent: store.serviceChargePercent
    };
  },

  async get_store_categories({ slug }: { slug: string }) {
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findFirst({
      where: buildAssistantStoreEligibilityWhere({ slug }),
      include: {
        categories: { select: { name: true, slug: true, image: true } }
      }
    });
    if (!store) return { error: "Store not found" };
    return { categories: store.categories };
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
  },

  async update_customer_profile(profile: any) {
    return { success: true, updatedProfile: profile };
  },

  async get_order_recap({ items }: { items: any[] }) {
    if (!items || items.length === 0) return { error: "No items to recap" };
    
    let recap = `🛒 *Recap Pesanan Kakak:*\n\n`;
    let total = 0;
    items.forEach((item: any, idx: number) => {
      const subtotal = (item.price || 0) * (item.quantity || 1);
      total += subtotal;
      recap += `${idx + 1}. ${item.name} x${item.quantity || 1} - Rp ${new Intl.NumberFormat('id-ID').format(subtotal)}\n`;
    });
    recap += `\n*Total Estimasi: Rp ${new Intl.NumberFormat('id-ID').format(total)}*`;
    
    return { recap, total };
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
    const customerProfile = context?.customerProfile || {};

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

    const isAffirmativeToMenu = isPublic && isAffirmativeReply(String(message || "")) && wasFullMenuOfferedInHistory(validatedHistory);
    const isAskingMenuExplicitly = isPublic && (isFullMenuRequest(String(message || "")) || isAskingWhereMenu(String(message || "")));

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

    if ((isAskingMenuExplicitly || isAffirmativeToMenu) && scopedStore?.slug) {
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
        parts: [{ text: `You are the Gercep Platform Assistant, specialized in the "Pasar Segar" (Fresh Market) and grocery domain. Your goal is to be a clever, helpful, and non-restrictive shopping companion.

DOMAIN FOCUS:
- You operate within the context of Pasar Segar: fresh vegetables, fruits, meat, fish, groceries (sembako), and related household items.
- While you should stay focused on shopping and orders, do not be "stupidly" restrictive. If a user makes small talk or asks a question related to cooking/ingredients (e.g., "What can I cook with these potatoes?"), answer it and then guide them back to shopping (e.g., "By the way, we have fresh chicken to go with those potatoes!").

CUSTOMER MEMORY & PROFILE:
- You have access to the customer's profile: ${JSON.stringify(customerProfile)}.
- If the user provides their name, address, or preferences (e.g., "I prefer organic vegetables"), remember them and use them in future responses.
- If the user has a "lastLat" and "lastLng" in their profile, use them for 'search_stores' if they ask for something "nearby" and haven't shared a new location.
- If you identify new information (like a name or preferred address), acknowledge it: "Baik Kak [Nama], saya catat alamatnya ya."

RESPONSE STYLE:
1. Be polite, friendly, and human-like. Use "Kak" to refer to the customer.
2. Use *bold* (single asterisk) for emphasis (WhatsApp style).
3. Default format: 2-3 short bullets + 1 clear question.
4. If the user shares a location ([LOCATION_SHARED] marker), acknowledge it and proceed to the next step (calculating shipping or searching nearby).

FLOW & LOGIC:
1. SHOPPING CART: Do not lose track of items the user has picked (check history). If they provide an address while picking items, it's for DELIVERY of those items.
2. STICKY STORE: If you are already in a store context ('${context?.storeName || 'the current store'}'), STAY focused on this store. Do not suggest other stores or call 'search_stores' unless the user explicitly asks to "cari toko lain" or "pindah toko".
3. LARGE MENUS: For stores with many items, you MUST NEVER list products or categories in your text response as bullets. Instead, you MUST call 'get_store_products' (for products) or 'get_store_categories' (for categories). These tools automatically generate the required interactive buttons.
4. CATEGORY SELECTION: When a user selects or asks about a category (e.g., "Bahan Pokok" or "Bumbu Dapur"), you MUST call 'get_store_products' with that category name as the keyword. This ensures the "Pilih Produk" button appears. DO NOT summarize the category in text.
5. NO LISTING IN TEXT: It is strictly forbidden to list products, categories, or options manually in your text response if a tool can provide them. Your response should be a brief confirmation (e.g., "Tentu Kak, ini beberapa pilihan Bumbu Dapur untuk Kakak:") followed by the tool call.
6. NO PRODUCTS FOUND: If you call 'get_store_products' and it returns 0 products, do not just give up. Try searching for a broader keyword or show the category list instead.
6. LIST MESSAGES:
   - Use 'get_store_categories' to show a tappable category list.
   - Use 'get_store_products' to show a tappable product list.
   - When the user selects a product from the list, ALWAYS ask for the quantity (e.g., "Mau berapa banyak Kak?") and any specific variations if available.
6. SHIPPING: Always call 'get_shipping_rates' once you have a physical address and coordinates (latitude/longitude). If the user has a 'preferredAddress' in their profile and hasn't provided a new one, you can ask: "Kak, mau dikirim ke [Preferred Address] seperti biasa?"
7. PAYMENT: Ask for payment method ('qris' or 'bank_transfer') only AFTER items and shipping are confirmed.
8. ORDER RECAP: For long lists (5+ items), use 'get_order_recap' to show a clear summary instead of listing them manually.

GERCEP INFO:
- Owner: PT Digitalisasi Kreasi Indonesia
- Founder: Sandi Suhendro
- Website: https://gercep.click

RE-ORDERING:
- If the user says "order lagi" or "sama kayak kemarin", use 'get_last_order_by_phone' to see what they bought before.

${userContextInfo}${storeContextInfo}${tableInfo}${locationInfo} ${context?.phoneNumber ? `The current user's phone number is ${context.phoneNumber}.` : ""} ${context?.channel === "WHATSAPP" ? "The user is chatting via WhatsApp." : ""}` }]
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
              description: "Get menu items for a store. You can optionally filter by keyword for large menus.",
              parameters: {
                type: "object",
                properties: {
                  slug: { type: "string", description: "Store slug." },
                  keyword: { type: "string", description: "Optional search keyword for products (name, category, or description)." }
                },
                required: ["slug"]
              }
            },
            {
              name: "get_store_categories",
              description: "Get the list of product categories available in a store.",
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
            },
            {
              name: "update_customer_profile",
              description: "Update the customer's persistent profile with new information like name, preferred address, or preferences.",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string", description: "The customer's name." },
                  preferredAddress: { type: "string", description: "The customer's primary delivery address." },
                  preferences: { type: "string", description: "Any other notes or preferences (e.g. 'likes organic', 'no plastic')." }
                }
              }
            },
            {
              name: "get_order_recap",
              description: "Generate a formatted summary of items currently in the user's shopping history.",
              parameters: {
                type: "object",
                properties: {
                  items: { 
                    type: "array", 
                    description: "List of items to recap, including name, price, and quantity.",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        price: { type: "number" },
                        quantity: { type: "number" }
                      }
                    }
                  }
                },
                required: ["items"]
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
    let lastCategories: any[] | null = null;
    let lastProducts: any[] | null = null;
    let orderRecap: string | null = null;
    let activeStoreId = scopedStore?.id || undefined;
    let activeStoreSlug = scopedStore?.slug || undefined;
    let updatedCustomerProfile = { ...customerProfile };

    while (calls && calls.length > 0 && iterations < MAX_ITERATIONS) {
      console.log(`[AI_CHAT] Iteration ${iterations + 1}: Received ${calls.length} tool calls`);
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
          if (call.name === "search_stores" && (data as any).stores && (data as any).stores.length === 1) {
            activeStoreId = (data as any).stores[0].id;
            activeStoreSlug = (data as any).stores[0].slug;
          }
          if (args.slug) activeStoreSlug = String(args.slug);
          if (args.storeId) activeStoreId = Number(args.storeId);

          if (call.name === "get_shipping_rates" && Array.isArray((data as any)?.shippingOptions)) {
            lastShippingOptions = (data as any).shippingOptions;
          }
          if (call.name === "get_store_products" && Array.isArray((data as any)?.products)) {
            lastProducts = (data as any).products;
          }
          if (call.name === "get_store_categories" && Array.isArray((data as any)?.categories)) {
            lastCategories = (data as any).categories;
          }
          if (call.name === "get_order_recap" && (data as any)?.recap) {
            orderRecap = (data as any).recap;
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
          if (call.name === "update_customer_profile" && data.success) {
            Object.assign(updatedCustomerProfile, call.args);
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
      shippingOptions: lastShippingOptions,
      categories: lastCategories,
      products: lastProducts,
      orderRecap,
      activeStoreId,
      activeStoreSlug,
      customerProfile: updatedCustomerProfile
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
