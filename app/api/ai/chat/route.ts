import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import midtransClient from "midtrans-client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getShippingQuoteFromBiteship, createBiteshipDraftForPendingOrder } from "@/lib/shipping-biteship";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";
import { ensurePlatformSettingsSchema } from "@/lib/super-admin";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendMerchantWhatsApp, buildOrderMerchantSummary } from "@/lib/merchant-alerts";
import { processPayment } from "@/lib/payment";
import { getDistanceMeters } from "@/lib/utils";
import { triggerReverseSync, isStoreOpen } from "@/lib/api";
import { ensureDefaultStoreTypes, getStoreTypeLabelMap } from "@/lib/store-types";
import { evaluateAiAbuseGuard, extractClientIp, isSpamLikeMessage } from "@/lib/ai-abuse-guard";

export const runtime = "nodejs";

let AI_ACTIVE_REQUESTS = 0;
const AI_MAX_CONCURRENCY = Math.max(1, Number(process.env.AI_MAX_CONCURRENCY || "4") || 4);

function pickSimpleGreetingReply(raw: string) {
  const t = String(raw || "").toLowerCase().trim();
  if (!t) return null;
  const compact = t.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const first = compact.split(" ")[0] || "";
  const greetings = new Set([
    "pagi",
    "siang",
    "sore",
    "malam",
    "halo",
    "hai",
    "hello",
    "hi",
    "alo",
    "assalamualaikum",
    "assalamu",
    "permisi"
  ]);
  if (greetings.has(compact) || greetings.has(first)) {
    return "Halo Kak! Biar cepat, Kakak mau cari toko apa / beli apa, dan area-nya di mana?";
  }
  if (compact === "tes" || compact === "test" || compact === "testing") {
    return "Siap Kak, aku aktif. Mau cari toko atau mau buka menu toko tertentu?";
  }
  if (compact.includes("masih kendala") || compact.includes("kendala")) {
    return "Iya Kak, AI provider kadang high demand. Biar cepat, sebutkan *nama toko* atau *barang yang dicari* + *area* ya.";
  }
  return null;
}

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

async function inferStoreForWebPublic(message: string) {
  const raw = normalizeLooseText(String(message || "").trim());
  const cleaned = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;

  const looksLikeSlug = /^[a-z0-9-]{3,}$/.test(cleaned) || /^[a-z0-9-]{3,}\s+[a-z0-9-]{2,}$/.test(cleaned);
  const hasPasarSegar = /\bpasar\s+segar\b/i.test(cleaned);
  const shortLocationLike =
    cleaned.length >= 3 &&
    cleaned.length <= 40 &&
    cleaned.split(" ").length <= 5 &&
    !/\b(menu|produk|harga|ongkir|kurir|kirim|shipping|delivery|checkout|halo|hai)\b/i.test(cleaned);

  if (!looksLikeSlug && !hasPasarSegar && !shortLocationLike) return null;

  const locationHint = hasPasarSegar ? cleaned.replace(/\bpasar\s+segar\b/i, "").trim() : cleaned;

  const inferred = (await prisma.store.findFirst({
    where: buildAssistantStoreEligibilityWhere({
      OR: [
        { slug: { equals: cleaned } as any },
        { slug: { contains: cleaned } as any },
        { name: { contains: cleaned, mode: "insensitive" } as any },
        locationHint ? { name: { contains: locationHint, mode: "insensitive" } as any } : undefined
      ].filter(Boolean) as any
    } as any),
    select: { id: true, slug: true, name: true } as any
  })) as any;

  if (!inferred?.slug) return null;
  return inferred;
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

const AI_INTERNAL_CONTEXT_KEY = process.env.AI_INTERNAL_CONTEXT_KEY;
const AI_HISTORY_LIMIT_PUBLIC = Math.max(
  0,
  Number(process.env.AI_HISTORY_LIMIT_PUBLIC || "8") || 8
) || 8;
const AI_HISTORY_LIMIT_PRIVATE = Math.max(
  0,
  Number(process.env.AI_HISTORY_LIMIT_PRIVATE || "12") || 12
) || 12;

// These are the actual implementations used by the internal commerce chatbot.
const tools: Record<string, (args: any) => Promise<any>> = {
  async search_stores({
    query,
    location_context,
    latitude,
    longitude,
    store_type,
    scopedSlug
  }: {
    query: string;
    location_context?: string;
    latitude?: number;
    longitude?: number;
    store_type?: string;
    scopedSlug?: string;
  }) {
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
    const baseWhere: any = buildAssistantStoreEligibilityWhere(scopedSlug ? { slug: String(scopedSlug) } : {});
    
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

    await ensurePlatformSettingsSchema().catch(() => null);
    const platform = (await prisma.platformSettings
      .findUnique({ where: { key: "default" }, select: { storeTypes: true } })
      .catch(() => null)) as any;
    const storeTypes = ensureDefaultStoreTypes(platform?.storeTypes);
    const storeTypeLabelByCode = getStoreTypeLabelMap(storeTypes);

    const rawStoreType = String(store_type || "").trim();
    if (rawStoreType) {
      const want = rawStoreType.toLowerCase();
      let resolvedCode: string | null = null;
      for (const st of storeTypes as any[]) {
        const code = String(st?.code || "").trim();
        const label = String(st?.label || "").trim();
        if (!code) continue;
        if (want === code.toLowerCase() || (label && want === label.toLowerCase())) {
          resolvedCode = code;
          break;
        }
      }

      if (resolvedCode) {
        stores = stores.filter((s: any) => String(s?.storeType || "").toLowerCase() === resolvedCode!.toLowerCase());
      } else {
        const wantLoose = want.replace(/\s+/g, " ").trim();
        stores = stores.filter((s: any) => {
          const label = s?.storeType ? (storeTypeLabelByCode.get(String(s.storeType)) || String(s.storeType)) : "";
          return String(label || "").toLowerCase().includes(wantLoose);
        });
      }
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
    // Only return categories if NO products were found AND there wasn't a specific keyword search
    // This prevents the webhook from accidentally rendering the category list instead of the product list
    const shouldReturnCategories = products.length === 0 && !normalizedKeyword;

    return { 
      products: normalizedProducts,
      // If we found specific category matches, let the AI know it succeeded
      categoryMatches: categoryMatches.map(slug => ({
        slug,
        name: categoryNameBySlug.get(slug) || slug
      })),
      categories: shouldReturnCategories ? store.categories : [],
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
    } else if (payment_method === "gopay") {
      const gopayFeePercent = Number((store as any).gopayFeePercent || 0);
      paymentFee = subtotal * (gopayFeePercent / 100);
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

    const feePaidBy = String((store as any).feePaidBy || "CUSTOMER").toUpperCase();
    const qrisFeePercent = Number((store as any).qrisFeePercent || 0);
    const gopayFeePercent = Number((store as any).gopayFeePercent || 0);
    const manualTransferFee = Number((store as any).manualTransferFee || 0);

    let paymentFee = 0;
    if (feePaidBy === "CUSTOMER") {
      if (payment_method === "qris") {
        paymentFee = amount * (qrisFeePercent / 100);
      } else if (payment_method === "gopay") {
        paymentFee = amount * (gopayFeePercent / 100);
      } else if (payment_method === "bank_transfer") {
        paymentFee = manualTransferFee;
      }
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

function trimChatHistory(history: any[], historyLimit: number) {
  if (!Array.isArray(history)) return [];
  if (historyLimit > 0 && history.length > historyLimit) {
    return history.slice(-historyLimit);
  }
  return history;
}

function buildRuleReplyHistory(
  history: any[],
  userText: string,
  assistantText: string,
  historyLimit: number,
  extraParts: any[] = []
) {
  return trimChatHistory(
    [
      ...history,
      { role: "user", parts: [{ text: String(userText || "") }] },
      { role: "model", parts: [{ text: String(assistantText || "") }] },
      ...extraParts
    ],
    historyLimit
  );
}

function formatIdr(amount: number) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(Number(amount || 0))}`;
}

function isOrderStatusIntent(input: string) {
  const t = normalizeLooseText(input);
  return /\b(status pesanan|cek pesanan|pesanan saya|order saya|order terakhir|last order|lacak pesanan|tracking order|cek order)\b/.test(
    t
  );
}

function isStoreHoursIntent(input: string) {
  const t = normalizeLooseText(input);
  return /\b(jam buka|jam operasional|operasional|buka jam|tutup jam|buka sekarang|masih buka)\b/.test(t);
}

function isCategoryIntent(input: string) {
  const t = normalizeLooseText(input);
  return /\b(kategori|category|kategori apa|kategori apa saja)\b/.test(t);
}

function isStoreSearchIntent(input: string) {
  const t = normalizeLooseText(input);
  return /\b(toko|store|resto|restaurant|warung|merchant|outlet|cabang|pasar segar|terdekat|dekat|sekitar|nearby|near me|area)\b/.test(
    t
  );
}

function isShippingFaqIntent(input: string) {
  const t = normalizeLooseText(input);
  return /\b(ongkir|kurir|pengiriman|delivery|dikirim|shipping)\b/.test(t);
}

function isPaymentFaqIntent(input: string) {
  const t = normalizeLooseText(input);
  return /\b(bayar|payment|pembayaran|qris|transfer|gopay)\b/.test(t);
}

function isHelpFaqIntent(input: string) {
  const t = normalizeLooseText(input);
  return /\b(bantuan|help|cara pesan|cara order|gimana pesan|bagaimana pesan|cara belanja)\b/.test(t);
}

function isProductSearchIntent(input: string) {
  const t = normalizeLooseText(input);
  return (
    isFullMenuRequest(t) ||
    /\b(menu|produk|barang|item|stok|stock|cari|ada|jual|punya|tersedia|apa aja|apa saja|rekomendasi|beli|belanja)\b/.test(t)
  );
}

function cleanProductKeyword(input: string) {
  const { keyword } = normalizeStoreSearchInput(String(input || ""), "");
  return normalizeLooseText(keyword)
    .replace(
      /\b(menu|produk|barang|item|stok|stock|cari|ada|jual|punya|tersedia|apa aja|apa saja|rekomendasi|beli|belanja|dong|nih|yang|di|dengan|untuk|mau|saya|aku)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

async function handleInternalCommerceChat({
  message,
  validatedHistory,
  historyLimit,
  isPublic,
  context,
  customerProfile,
  scopedStore,
  forcedScopedSlug
}: any) {
  const rawMessage = String(message || "").trim();
  const loose = normalizeLooseText(rawMessage);
  const channelUpper = String((context as any)?.channel || "").toUpperCase();
  const isWebChannel = channelUpper === "WEB";
  const lat = Number((context as any)?.location?.latitude ?? customerProfile?.lastLat);
  const lng = Number((context as any)?.location?.longitude ?? customerProfile?.lastLng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 0.0001 && Math.abs(lng) > 0.0001;

  let activeStore: any = scopedStore || null;
  const activeSlug = String(activeStore?.slug || forcedScopedSlug || context?.slug || "").trim();
  if ((!activeStore || !activeStore?.id) && activeSlug) {
    activeStore = await prisma.store.findFirst({
      where: buildAssistantScopedStoreWhere({ slug: activeSlug }),
      select: { id: true, slug: true, name: true, isOpen: true, operatingHours: true, timezone: true }
    });
  } else if (activeStore?.id && (activeStore?.isOpen === undefined || activeStore?.timezone === undefined)) {
    activeStore = await prisma.store.findUnique({
      where: { id: Number(activeStore.id) },
      select: { id: true, slug: true, name: true, isOpen: true, operatingHours: true, timezone: true }
    });
  }

  if (isPublic && context?.phoneNumber && isOrderStatusIntent(rawMessage)) {
    const result = await tools.get_last_order_by_phone({
      phoneNumber: String(context.phoneNumber),
      callerPhone: String(context.phoneNumber),
      isMerchant: false
    });
    const text = result?.success
      ? result?.status === "PENDING" && result?.paymentUrl
        ? "Ini order terakhir Kakak. Kalau belum dibayar, bisa lanjut lewat link pembayaran ya."
        : "Ini detail order terakhir Kakak ya."
      : "Aku belum menemukan order untuk nomor ini. Kalau nomor yang dipakai berbeda, kirim dari nomor pemesan ya.";
    return {
      text,
      history: buildRuleReplyHistory(validatedHistory, rawMessage, text, historyLimit),
      breakdown: result?.success ? result.breakdown : undefined,
      paymentUrl: result?.success ? result.paymentUrl : undefined
    };
  }

  if (activeStore?.slug && isStoreHoursIntent(rawMessage)) {
    const openNow = await isStoreOpen(activeStore as any).catch(() => Boolean(activeStore?.isOpen));
    const text = openNow
      ? `Saat ini *${activeStore.name}* sedang buka. Kalau mau, aku bisa tampilkan kategori atau carikan produk juga.`
      : `Saat ini *${activeStore.name}* sedang tutup. Kakak tetap bisa lihat menu atau cari produk dulu ya.`;
    return {
      text,
      history: buildRuleReplyHistory(validatedHistory, rawMessage, text, historyLimit),
      activeStoreId: activeStore.id,
      activeStoreSlug: activeStore.slug
    };
  }

  if (isHelpFaqIntent(rawMessage)) {
    const text = activeStore?.slug
      ? `Aku bisa bantu di *${activeStore.name}*: lihat kategori, cari produk, cek ongkir, metode pembayaran, dan cek pesanan terakhir. Coba ketik nama produk atau balas "menu lengkap".`
      : "Aku bisa bantu cari toko terdekat, cari produk per toko, cek ongkir, metode pembayaran, dan cek pesanan terakhir. Supaya cepat, kirim *barang yang dicari + area* atau share lokasi ya.";
    return { text, history: buildRuleReplyHistory(validatedHistory, rawMessage, text, historyLimit) };
  }

  if (isPaymentFaqIntent(rawMessage) && !isOrderStatusIntent(rawMessage)) {
    const text = "Pembayaran Gercep umumnya pakai *QRIS* dan metode digital yang aktif di toko. Setelah checkout, aku akan kasih link bayar kalau tersedia.";
    return { text, history: buildRuleReplyHistory(validatedHistory, rawMessage, text, historyLimit) };
  }

  if (isShippingFaqIntent(rawMessage) && !activeStore?.slug) {
    const text =
      "Untuk cek ongkir yang akurat, pilih toko dulu lalu kirim alamat lengkap atau share lokasi. Setelah itu aku bisa bantu tampilkan opsi kurir yang tersedia.";
    return { text, history: buildRuleReplyHistory(validatedHistory, rawMessage, text, historyLimit) };
  }

  if (activeStore?.slug && isCategoryIntent(rawMessage)) {
    const result = await tools.get_store_categories({ slug: activeStore.slug });
    const categories = Array.isArray(result?.categories) ? result.categories : [];
    const text =
      categories.length > 0
        ? `Ini kategori di *${activeStore.name}*. Pilih salah satu ya.`
        : `Maaf, kategori di *${activeStore.name}* belum tersedia.`;
    return {
      text,
      history: buildRuleReplyHistory(validatedHistory, rawMessage, text, historyLimit),
      categories,
      activeStoreId: activeStore.id,
      activeStoreSlug: activeStore.slug
    };
  }

  if (activeStore?.slug && isProductSearchIntent(rawMessage)) {
    const keyword = cleanProductKeyword(rawMessage);
    if (!keyword && !isFullMenuRequest(rawMessage)) {
      const text = `Aku bisa bantu cari produk di *${activeStore.name}*. Coba ketik nama barangnya, atau balas "menu lengkap".`;
      return {
        text,
        history: buildRuleReplyHistory(validatedHistory, rawMessage, text, historyLimit),
        activeStoreId: activeStore.id,
        activeStoreSlug: activeStore.slug
      };
    }
    const result = await tools.get_store_products({ slug: activeStore.slug, keyword: keyword || undefined });
    const products = Array.isArray(result?.products) ? result.products : [];
    const categories = Array.isArray(result?.categories) ? result.categories : [];
    if (products.length > 0) {
      const preview = products
        .slice(0, 5)
        .map((p: any, idx: number) => `${idx + 1}. ${p.name} - ${formatIdr(Number(p.price || 0))}`)
        .join("\n");
      const text = keyword
        ? `Aku ketemu ${products.length} produk di *${activeStore.name}* yang cocok dengan "${keyword}":\n\n${preview}`
        : `Ini beberapa produk dari *${activeStore.name}*:\n\n${preview}`;
      return {
        text,
        history: buildRuleReplyHistory(validatedHistory, rawMessage, text, historyLimit),
        products,
        categories,
        activeStoreId: activeStore.id,
        activeStoreSlug: activeStore.slug
      };
    }
    if (categories.length > 0 && !keyword) {
      const text = `Aku tampilkan kategori di *${activeStore.name}* dulu ya.`;
      return {
        text,
        history: buildRuleReplyHistory(validatedHistory, rawMessage, text, historyLimit),
        categories,
        activeStoreId: activeStore.id,
        activeStoreSlug: activeStore.slug
      };
    }
    const text = `Aku belum ketemu produk yang cocok di *${activeStore.name}*. Coba pakai kata kunci lain atau balas "menu lengkap".`;
    return {
      text,
      history: buildRuleReplyHistory(validatedHistory, rawMessage, text, historyLimit),
      activeStoreId: activeStore.id,
      activeStoreSlug: activeStore.slug
    };
  }

  if (isPublic) {
    const shouldSearchStores = isStoreSearchIntent(rawMessage) || !activeStore?.slug;
    if (shouldSearchStores) {
      const result = await tools.search_stores({
        query: rawMessage,
        location_context: context?.location_context,
        latitude: hasCoords ? lat : undefined,
        longitude: hasCoords ? lng : undefined,
        scopedSlug: forcedScopedSlug || undefined
      });
      const stores = Array.isArray(result?.stores) ? result.stores : [];
      if (stores.length === 0) {
        const text =
          "Aku belum ketemu toko yang cocok. Coba sebut nama toko, barang yang dicari, atau area seperti Ciputat, Grogol, atau BSD ya.";
        return { text, history: buildRuleReplyHistory(validatedHistory, rawMessage, text, historyLimit) };
      }

      if (stores.length === 1) {
        const store = await prisma.store.findFirst({
          where: buildAssistantStoreEligibilityWhere({ slug: String(stores[0].slug || "") }),
          select: { id: true, slug: true, name: true }
        });
        const text = `Aku ketemu toko *${stores[0].name}*. Klik *Mulai Belanja* ya.`;
        return {
          text,
          history: buildRuleReplyHistory(validatedHistory, rawMessage, text, historyLimit),
          activeStoreId: store?.id,
          activeStoreSlug: store?.slug || String(stores[0].slug || ""),
          uiAction: store?.slug
            ? { type: "START_SHOPPING", label: "Mulai Belanja", storeSlug: store.slug, storeId: store.id }
            : undefined
        };
      }

      const intro = hasCoords ? "Ini beberapa toko terdekat dari lokasi Kakak:" : "Ini beberapa toko yang cocok:";
      const lines = stores
        .slice(0, 6)
        .map((s: any, idx: number) => {
          const distanceText = Number.isFinite(Number(s.distance))
            ? ` (~${Math.round(Number(s.distance) / 100) / 10} km)`
            : "";
          return `${idx + 1}. ${s.name}${distanceText}`;
        })
        .join("\n");
      const text = `${intro}\n\n${lines}\n\nPilih salah satu toko ya.`;
      return {
        text,
        history: buildRuleReplyHistory(validatedHistory, rawMessage, text, historyLimit),
        uiAction: {
          type: "CHOOSE_STORE",
          label: "Pilih Toko",
          options: stores.slice(0, 6).map((s: any) => ({ slug: String(s.slug), name: String(s.name) }))
        }
      };
    }
  }

  const text = activeStore?.slug
    ? `Aku bisa bantu di *${activeStore.name}*: cari produk, tampilkan kategori, cek jam buka, dan cek pesanan terakhir. Coba ketik nama produk atau balas "menu lengkap".`
    : "Aku fokus bantu commerce Gercep: cari toko, cari produk, ongkir, pembayaran, dan status pesanan. Coba kirim *nama produk + area* atau nama toko ya.";
  return {
    text,
    history: buildRuleReplyHistory(validatedHistory, rawMessage, text, historyLimit),
    activeStoreId: activeStore?.id,
    activeStoreSlug: activeStore?.slug
  };
}

export async function POST(req: NextRequest) {
  try {
    if (AI_ACTIVE_REQUESTS >= AI_MAX_CONCURRENCY) {
      return NextResponse.json({
        text: "Maaf, AI sedang sibuk. Coba lagi sebentar ya.",
        history: [],
        blocked: true
      });
    }
    AI_ACTIVE_REQUESTS++;
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
    const quickReply = pickSimpleGreetingReply(String(message || ""));
    if (quickReply) {
      return NextResponse.json({ text: quickReply, history: Array.isArray(history) ? history : [] });
    }
    await ensureStoreSettingsSchema();

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
    // Normalize history to our internal chat message format.
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
    const historyLimit = isPublic ? AI_HISTORY_LIMIT_PUBLIC : AI_HISTORY_LIMIT_PRIVATE;
    if (historyLimit > 0 && validatedHistory.length > historyLimit) {
      validatedHistory = validatedHistory.slice(-historyLimit);
    }
    while (validatedHistory.length > 0 && validatedHistory[0]?.role !== "user") {
      validatedHistory = validatedHistory.slice(1);
    }
    if (isGercepOutOfScopeMessage(message)) {
      return NextResponse.json({ text: getGercepScopeRefusal(message), history: validatedHistory });
    }

    if (isPublic) {
      const channel = context?.channel === "WHATSAPP" ? "WHATSAPP" : context?.channel === "WEB" ? "WEB" : "UNKNOWN";
      const nearbyIntent =
        /\b(terdekat|dekat\s+(saya|sini)|sekitar(\s+saya)?|nearby|near\s+me|di\s+sekitar|area\s+saya|lokasi\s+saya)\b/i.test(
          normalizeLooseText(String(message || ""))
        );
      const { effectiveLocation } = normalizeStoreSearchInput(String(message || ""), context?.location_context);
      const loc = normalizeLooseText(String(effectiveLocation || ""));
      const invalidLoc =
        !loc ||
        ["saya", "aku", "gue", "gw", "me", "here", "sini", "disini", "di sini", "dekat sini", "sekitar sini"].includes(
          loc
        );
      const lat = Number((context as any)?.location?.latitude ?? customerProfile?.lastLat);
      const lng = Number((context as any)?.location?.longitude ?? customerProfile?.lastLng);
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 0.0001 && Math.abs(lng) > 0.0001;
      if (nearbyIntent && !hasCoords && invalidLoc) {
        return NextResponse.json({
          text:
            "Boleh share lokasi (titik) atau sebutkan area Kakak di mana? (contoh: Ciputat, Grogol, BSD) Biar aku carikan toko terdekat.",
          history: validatedHistory,
          customerProfile: { ...customerProfile, pendingIntent: "NEARBY_STORES" }
        });
      }
      if (channel === "WEB" && nearbyIntent && hasCoords) {
        const radiusKm = 50;
        const latDelta = radiusKm / 111;
        const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180) || 1);
        const candidates = await prisma.store.findMany({
          where: {
            isActive: true,
            enableWhatsApp: true,
            biteshipOriginLat: { not: null, gte: lat - latDelta, lte: lat + latDelta },
            biteshipOriginLng: { not: null, gte: lng - lngDelta, lte: lng + lngDelta }
          } as any,
          select: { id: true, name: true, slug: true, biteshipOriginLat: true, biteshipOriginLng: true },
          take: 200
        });
        const nearby = candidates
          .map((s: any) => {
            const d = getDistanceMeters(
              lat,
              lng,
              Number(s.biteshipOriginLat || 0),
              Number(s.biteshipOriginLng || 0)
            );
            return { id: s.id, name: s.name, slug: s.slug, distance: d };
          })
          .filter((s: any) => Number.isFinite(s.distance) && s.distance <= 50000)
          .sort((a: any, b: any) => a.distance - b.distance)
          .slice(0, 6);
        if (nearby.length === 0) {
          return NextResponse.json({
            text: "Aku belum nemu toko terdekat di sekitar lokasi Kakak. Coba sebut area-nya (contoh: Ciputat, Grogol, BSD) ya.",
            history: validatedHistory
          });
        }
        const list = nearby
          .map((s: any, i: number) => {
            const km = Math.max(0, Math.round((Number(s.distance) / 1000) * 10) / 10);
            return `${i + 1}) ${s.name} (~${km} km)`;
          })
          .join("\n");
        return NextResponse.json({
          text: `Ini beberapa toko terdekat dari lokasi Kakak:\n\n${list}\n\nPilih salah satu toko ya:`,
          history: validatedHistory,
          uiAction: { type: "CHOOSE_STORE", label: "Pilih Toko", options: nearby.map((s: any) => ({ slug: String(s.slug), name: String(s.name) })) }
        });
      }
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
    const fullMenuState = getFullMenuStateFromHistory(validatedHistory);
    const channelUpper = String((context as any)?.channel || "").toUpperCase();
    const isWebChannel = channelUpper === "WEB";
    const isWhatsAppChannel = channelUpper === "WHATSAPP" || (!channelUpper && isPublic);

    if (isPublic && isWhatsAppChannel) {
      const raw = String(message || "");
      const compact = raw.toLowerCase().replace(/\s+/g, " ").trim();
      const normalizeIdr = (s: string) => {
        const digits = String(s || "").replace(/[^\d]/g, "");
        const n = Number(digits);
        return Number.isFinite(n) ? n : NaN;
      };
      const getScopedSlug = async () => {
        if (forcedScopedSlug) return forcedScopedSlug;
        const storeId = context?.storeId ? Number(context.storeId) : 0;
        if (storeId) {
          const s = await prisma.store.findUnique({ where: { id: storeId }, select: { slug: true } }).catch(() => null);
          if (s?.slug) return String(s.slug);
        }
        const slug = context?.slug ? String(context.slug) : "";
        if (slug) return slug;
        return null;
      };
      const scopedSlug = await getScopedSlug();
      let isMerchantCaller = false;
      if (isTrustedInternalContext && context?.phoneNumber) {
        const cleanPhone = String(context.phoneNumber).replace(/\D/g, "");
        const dbUser = await prisma.user
          .findFirst({
            where: { phoneNumber: { contains: cleanPhone } },
            select: { role: true }
          })
          .catch(() => null);
        if (dbUser && ["MERCHANT", "MANAGER", "SUPER_ADMIN"].includes(String(dbUser.role))) {
          isMerchantCaller = true;
        } else {
          const storeByPhone = await prisma.store
            .findFirst({
              where: { whatsapp: { contains: cleanPhone } },
              select: { slug: true }
            })
            .catch(() => null);
          if (storeByPhone?.slug && scopedSlug && String(storeByPhone.slug) === String(scopedSlug)) {
            isMerchantCaller = true;
          }
        }
      }
      const canActAsMerchant = Boolean(scopedSlug) && isMerchantCaller;

      const updatePriceMatch =
        compact.match(/^(?:ubah|ganti|update)\s+(?:harga|price)\s+(.+?)\s+(?:jadi|to|=)?\s*(?:rp\s*)?([\d.,]+)/i) ||
        compact.match(/^harga\s+(.+?)\s+(?:jadi|=)?\s*(?:rp\s*)?([\d.,]+)/i);
      const addProductMatch =
        compact.match(/^(?:tambah|add)\s+(?:produk|product)\s+(.+?)\s+(?:harga|price)?\s*(?:rp\s*)?([\d.,]+)(?:\s+(?:kategori|category)\s+(.+))?$/i);
      const openStore = /^(?:buka|open)\s+toko\b/i.test(compact);
      const closeStore = /^(?:tutup|close)\s+toko\b/i.test(compact);
      const enableStore = /^(?:aktifkan|enable)\s+toko\b/i.test(compact);
      const disableStore = /^(?:nonaktifkan|disable)\s+toko\b/i.test(compact);

      if (canActAsMerchant && scopedSlug && (updatePriceMatch || addProductMatch || openStore || closeStore || enableStore || disableStore)) {
        if (updatePriceMatch) {
          const productName = String(updatePriceMatch[1] || "").trim();
          const newPrice = normalizeIdr(String(updatePriceMatch[2] || ""));
          if (!productName || !Number.isFinite(newPrice) || newPrice <= 0) {
            return NextResponse.json({
              text: "Formatnya: *ubah harga <nama produk> <harga>* (contoh: *ubah harga gula pasir 15000*).",
              history: validatedHistory
            });
          }
          const r = await tools.update_product_price({ slug: scopedSlug, productName, newPrice }).catch((e: any) => ({ error: String(e?.message || e || "Failed") }));
          const text = r?.success ? `✅ ${r.message}` : `❌ ${r?.error || "Gagal update harga."}`;
          const nextHistory = [
            ...validatedHistory,
            { role: "user", parts: [{ text: String(message || "") }] },
            { role: "model", parts: [{ text }] }
          ];
          return NextResponse.json({ text, history: nextHistory });
        }

        if (addProductMatch) {
          const name = String(addProductMatch[1] || "").trim();
          const price = normalizeIdr(String(addProductMatch[2] || ""));
          const category = String(addProductMatch[3] || "").trim() || undefined;
          if (!name || !Number.isFinite(price) || price <= 0) {
            return NextResponse.json({
              text: "Formatnya: *tambah produk <nama> <harga> [kategori <nama>]* (contoh: *tambah produk Teh Botol 5000 kategori Minuman*).",
              history: validatedHistory
            });
          }
          const r = await tools.add_new_product({ slug: scopedSlug, name, price, category }).catch((e: any) => ({ error: String(e?.message || e || "Failed") }));
          const text = r?.success ? `✅ ${r.message}` : `❌ ${r?.error || "Gagal tambah produk."}`;
          const nextHistory = [
            ...validatedHistory,
            { role: "user", parts: [{ text: String(message || "") }] },
            { role: "model", parts: [{ text }] }
          ];
          return NextResponse.json({ text, history: nextHistory });
        }

        if (openStore || closeStore) {
          const r = await tools.toggle_store_open({ slug: scopedSlug, open: openStore }).catch((e: any) => ({ error: String(e?.message || e || "Failed") }));
          const text = r?.success ? `✅ ${r.message}` : `❌ ${r?.error || "Gagal ubah status toko."}`;
          const nextHistory = [
            ...validatedHistory,
            { role: "user", parts: [{ text: String(message || "") }] },
            { role: "model", parts: [{ text }] }
          ];
          return NextResponse.json({ text, history: nextHistory });
        }

        if (enableStore || disableStore) {
          const r = await tools.toggle_store_active({ slug: scopedSlug, active: enableStore }).catch((e: any) => ({ error: String(e?.message || e || "Failed") }));
          const text = r?.success ? `✅ ${r.message}` : `❌ ${r?.error || "Gagal ubah status toko."}`;
          const nextHistory = [
            ...validatedHistory,
            { role: "user", parts: [{ text: String(message || "") }] },
            { role: "model", parts: [{ text }] }
          ];
          return NextResponse.json({ text, history: nextHistory });
        }
      }
    }

    if (isPublic && isWebChannel && !scopedStore) {
      const inferred = await inferStoreForWebPublic(String(message || ""));
      if (inferred?.slug) {
        storeSlug = String(inferred.slug);
        scopedStore = inferred;
        forcedScopedSlug = String(inferred.slug);
      }
    }

    if (isPublic && isWebChannel) {
      const pick = String(message || "").trim().match(/^pilih_toko_slug\s*[:=]\s*([a-z0-9\-_.]+)\s*$/i);
      if (pick?.[1]) {
        const slug = String(pick[1]).trim().toLowerCase();
        const store = await prisma.store.findFirst({
          where: buildAssistantStoreEligibilityWhere({ slug }),
          select: { id: true, slug: true, name: true }
        });
        if (store?.slug) {
          const text = `Siap Kak. Kakak pilih *${store.name}*. Klik tombol *Mulai Belanja* ya.`;
          const nextHistory = [
            ...validatedHistory,
            { role: "user", parts: [{ text: String(message || "") }] },
            { role: "model", parts: [{ text }] }
          ];
          const trimmed = historyLimit > 0 && nextHistory.length > historyLimit ? nextHistory.slice(-historyLimit) : nextHistory;
          return NextResponse.json({
            text,
            history: trimmed,
            activeStoreId: store.id,
            activeStoreSlug: store.slug,
            uiAction: { type: "START_SHOPPING", label: "Mulai Belanja", storeSlug: store.slug, storeId: store.id }
          });
        }
      }
    }

    const isAffirmativeToMenu = isPublic && isAffirmativeReply(String(message || "")) && wasFullMenuOfferedInHistory(validatedHistory);
    const isAskingMenuExplicitly = isPublic && (isFullMenuRequest(String(message || "")) || isAskingWhereMenu(String(message || "")));

    if (isPublic && isWebChannel && isContinueMenuRequest(String(message || "")) && scopedStore?.id) {
      if (!fullMenuState || fullMenuState.storeId !== scopedStore.id) {
        const text = `Ketik "menu lengkap" untuk lihat daftar menu di *${scopedStore.name}*.`;
        const nextHistory = [
          ...validatedHistory,
          { role: "user", parts: [{ text: String(message || "") }] },
          { role: "model", parts: [{ text }] }
        ];
        const historyLimit = isPublic ? AI_HISTORY_LIMIT_PUBLIC : AI_HISTORY_LIMIT_PRIVATE;
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
        const historyLimit = isPublic ? AI_HISTORY_LIMIT_PUBLIC : AI_HISTORY_LIMIT_PRIVATE;
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
      const historyLimit = isPublic ? AI_HISTORY_LIMIT_PUBLIC : AI_HISTORY_LIMIT_PRIVATE;
      return NextResponse.json({
        text,
        history: historyLimit > 0 && nextHistory.length > historyLimit ? nextHistory.slice(-historyLimit) : nextHistory
      });
    }

    if ((isAskingMenuExplicitly || isAffirmativeToMenu) && scopedStore?.slug) {
      if (isPublic && !isWebChannel) {
        const categories = await prisma.category.findMany({
          where: { storeId: scopedStore.id },
          select: { name: true, slug: true },
          orderBy: { name: "asc" }
        });
        if (categories.length > 0) {
          return NextResponse.json({
            text: `Siap Kak. Aku tampilkan kategori dulu ya biar Kakak bisa pilih (lebih rapi & bisa di-scroll).`,
            history: validatedHistory,
            categories
          });
        }
        const products = await prisma.product.findMany({
          where: {
            storeId: scopedStore.id,
            stock: { gt: 0 },
            category: { notIn: ["_ARCHIVED_", "System"] }
          },
          select: { id: true, name: true, price: true },
          orderBy: { name: "asc" },
          take: 20
        });
        return NextResponse.json({
          text: products.length > 0
            ? `Siap Kak. Ini beberapa produk yang tersedia (bisa di-scroll):`
            : `Maaf Kak, belum ada produk aktif di ${scopedStore.name}.`,
          history: validatedHistory,
          products
        });
      }
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
      const historyLimit = isPublic ? AI_HISTORY_LIMIT_PUBLIC : AI_HISTORY_LIMIT_PRIVATE;
      return NextResponse.json({
        text,
        history: historyLimit > 0 && nextHistory.length > historyLimit ? nextHistory.slice(-historyLimit) : nextHistory
      });
    }

    const internalChatResponse = await handleInternalCommerceChat({
      message,
      validatedHistory,
      historyLimit,
      isPublic,
      context,
      customerProfile,
      scopedStore,
      forcedScopedSlug
    });
    return NextResponse.json(internalChatResponse);

  } catch (error: any) {
    const raw = String(error?.message || "");
    console.error("[INTERNAL_CHAT_ERROR]", error);
    if (error instanceof TypeError && error.message.includes("iterable")) {
      console.error("[INTERNAL_CHAT_ERROR_DETAIL] Likely invalid history or message parts format.");
    }
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
    return NextResponse.json({ text: "Maaf, AI sedang sibuk. Coba lagi sebentar ya.", error: raw || "" });
  }
  finally {
    AI_ACTIVE_REQUESTS = Math.max(0, AI_ACTIVE_REQUESTS - 1);
  }
}
