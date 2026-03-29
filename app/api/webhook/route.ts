import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { createPaymentLink } from '@/lib/payment';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { handleMerchantMessage } from '@/lib/whatsapp-merchant';
import { createOrderNotification } from '@/lib/order-notifications';
import { refundWaUsageByMessageId } from '@/lib/wa-credit';
import { resolvePaymentUrl, sendMerchantWhatsApp, buildOrderMerchantSummary } from '@/lib/merchant-alerts';
import { createBiteshipDraftForPendingOrder, getBiteshipOrderStatus, getShippingQuoteFromBiteship, normalizeBiteshipStatus, trackShipmentWithBiteship } from '@/lib/shipping-biteship';
import { ensureStoreSettingsSchema } from '@/lib/store-settings-schema';
import { logTraffic } from '@/lib/traffic';
import { getDistanceMeters } from '@/lib/utils';

type WaLang = "id" | "en";
const SESSION_CONTEXT_TTL_MS = 2 * 60 * 60 * 1000;
const STORE_LOCK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const WA_AI_HISTORY_LIMIT = Math.max(0, Number(process.env.GEMINI_HISTORY_LIMIT_PUBLIC || "12") || 12);
const WA_AI_REPLY_CHAR_LIMIT = Math.max(200, Number(process.env.WA_AI_REPLY_CHAR_LIMIT || "2400") || 2400);
const WA_AI_TIMEOUT_MS = Math.max(5000, Number(process.env.WA_AI_TIMEOUT_MS || "50000") || 50000);

const sanitizeWhatsAppAssistantText = (input: string) => {
  let text = String(input || "");
  text = text.replace(/\*\*(.+?)\*\*/g, "*$1*");
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1: $2");
  text = text.replace(/\*\*/g, "*");
  const stars = (text.match(/\*/g) || []).length;
  if (stars % 2 === 1) {
    const idx = text.lastIndexOf("*");
    if (idx >= 0) text = text.slice(0, idx) + text.slice(idx + 1);
  }
  return text;
};

const isSessionExpired = (updatedAt?: Date | string | null, ttlMs: number = SESSION_CONTEXT_TTL_MS) => {
  if (!updatedAt) return true;
  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return true;
  return (Date.now() - ts) > ttlMs;
};

const assistantStoreEligibilityWhere = {
  isActive: true,
  shippingSenderAddress: { not: null },
  NOT: [{ shippingSenderAddress: "" }],
  products: { some: { category: { not: "System" } } }
};

// Session Helpers
async function getSession(phoneNumber: string, storeId: number) {
  let session = await prisma.whatsAppSession.findUnique({
    where: { 
      phoneNumber_storeId: { 
        phoneNumber, 
        storeId 
      } 
    }
  });
  
  if (!session) {
    session = await prisma.whatsAppSession.create({
      data: { phoneNumber, storeId }
    });
  }
  return session;
}

async function updateSession(phoneNumber: string, storeId: number, data: any) {
  return await prisma.whatsAppSession.update({
    where: { 
      phoneNumber_storeId: { 
        phoneNumber, 
        storeId 
      } 
    },
    data
  });
}

let ensuredWaLangSchema: Promise<void> | null = null;

async function ensureWaLangSchema() {
  if (!ensuredWaLangSchema) {
    ensuredWaLangSchema = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "WaUserPreference" (
          "id" SERIAL PRIMARY KEY,
          "phoneNumber" TEXT NOT NULL,
          "storeId" INTEGER NOT NULL,
          "language" TEXT NOT NULL DEFAULT 'id',
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "WaUserPreference_phone_store_key"
        ON "WaUserPreference" ("phoneNumber", "storeId");
      `);
    })().catch(() => {});
  }
  await ensuredWaLangSchema;
}

async function getWaLanguage(phoneNumber: string, storeId: number): Promise<WaLang> {
  await ensureWaLangSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{ language: string }>>(
    `SELECT "language" FROM "WaUserPreference" WHERE "phoneNumber" = $1 AND "storeId" = $2 LIMIT 1`,
    phoneNumber,
    storeId
  ).catch(() => []);
  if (rows && rows[0]?.language?.toLowerCase() === "en") return "en";
  return "id";
}

async function setWaLanguage(phoneNumber: string, storeId: number, language: WaLang) {
  await ensureWaLangSchema();
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "WaUserPreference" ("phoneNumber", "storeId", "language", "updatedAt")
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT ("phoneNumber", "storeId")
      DO UPDATE SET "language" = EXCLUDED."language", "updatedAt" = NOW()
    `,
    phoneNumber,
    storeId,
    language
  ).catch(() => null);
}

function parseOrderingStep(step?: string | null) {
  if (!step || !step.startsWith("ORDERING")) {
    return { category: null as string | null, searchIds: null as number[] | null };
  }
  const parts = step.split(":");
  const category = parts[1] && parts[1] !== "ALL" ? parts[1] : null;
  let searchIds: number[] | null = null;
  if (parts[2] === "SEARCH" && parts[3]) {
    const ids = parts[3]
      .split(",")
      .map((id) => parseInt(id, 10))
      .filter((id) => !isNaN(id));
    if (ids.length > 0) searchIds = ids;
  }
  return { category, searchIds };
}

function buildOrderingStep(category: string | null, searchIds?: number[] | null) {
  const base = category ? `ORDERING:${category}` : "ORDERING:ALL";
  if (searchIds && searchIds.length > 0) {
    return `${base}:SEARCH:${searchIds.join(",")}`;
  }
  return base;
}

async function getOrderableProducts(storeId: number, category: string | null, searchIds?: number[] | null) {
  const whereClause: any = {
    storeId,
    stock: { gt: 0 },
    category: { not: "_ARCHIVED_" }
  };
  if (category) {
    whereClause.category = { equals: category, mode: "insensitive" };
  }
  if (searchIds && searchIds.length > 0) {
    whereClause.id = { in: searchIds };
  }
  return prisma.product.findMany({
    where: whereClause,
    take: 10,
    orderBy: { name: "asc" }
  });
}

async function validateCartStock(storeId: number, cart: any[]) {
  const requestedByProduct = new Map<number, { qty: number; name: string }>();
  cart.forEach((item) => {
    const current = requestedByProduct.get(item.productId);
    if (current) {
      current.qty += Number(item.qty) || 0;
    } else {
      requestedByProduct.set(item.productId, { qty: Number(item.qty) || 0, name: item.name || "Item" });
    }
  });
  const productIds = Array.from(requestedByProduct.keys());
  if (productIds.length === 0) return { ok: true, issues: [] as string[] };
  const products = await prisma.product.findMany({
    where: { 
      id: { in: productIds }, 
      storeId,
      category: { not: "_ARCHIVED_" }
    },
    select: { id: true, name: true, stock: true }
  });
  const stockMap = new Map(products.map((p) => [p.id, p]));
  const issues: string[] = [];
  for (const [productId, req] of requestedByProduct.entries()) {
    const product = stockMap.get(productId);
    if (!product || Number(product.stock) <= 0) {
      issues.push(`${req.name}: out of stock`);
      continue;
    }
    if (req.qty > Number(product.stock)) {
      issues.push(`${product.name}: only ${product.stock} left`);
    }
  }
  return { ok: issues.length === 0, issues };
}

function getProductVariations(product: any): Array<{ name: string; price: number }> {
  if (!product?.variations || !Array.isArray(product.variations)) return [];
  return (product.variations as any[])
    .map((v) => ({
      name: String(v?.name || "").trim(),
      price: Number(v?.price || 0)
    }))
    .filter((v) => v.name && Number.isFinite(v.price) && v.price > 0);
}

function buildVariationSelectStep(productId: number, qty: number, category: string | null, searchIds: number[] | null) {
  const encodedCategory = encodeURIComponent(category || "ALL");
  const searchPart = searchIds && searchIds.length > 0 ? searchIds.join(",") : "NONE";
  return `VARIATION_SELECT:${productId}:${qty}:${encodedCategory}:${searchPart}`;
}

function parseVariationSelectStep(step?: string | null) {
  if (!step || !step.startsWith("VARIATION_SELECT:")) return null;
  const parts = step.split(":");
  if (parts.length < 5) return null;
  const productId = parseInt(parts[1], 10);
  const qty = parseInt(parts[2], 10);
  const categoryRaw = decodeURIComponent(parts[3] || "ALL");
  const category = categoryRaw === "ALL" ? null : categoryRaw;
  const searchIds = parts[4] && parts[4] !== "NONE"
    ? parts[4].split(",").map((id) => parseInt(id, 10)).filter((id) => !isNaN(id))
    : null;
  if (isNaN(productId) || isNaN(qty) || qty <= 0) return null;
  return { productId, qty, category, searchIds };
}

function buildTakeawayDeliveryStep(method?: string) {
  return `TAKEAWAY_DELIVERY_SELECT:${method || "none"}`;
}

function parseTakeawayDeliveryStep(step?: string | null) {
  if (!step || !step.startsWith("TAKEAWAY_DELIVERY_SELECT:")) return { method: undefined as string | undefined };
  const method = step.split(":")[1];
  if (!method || method === "none") return { method: undefined as string | undefined };
  return { method };
}

function buildTakeawayAddressStep(provider: "JNE" | "GOSEND" | "PICKUP" | "STORE_COURIER", method?: string) {
  return `TAKEAWAY_ADDRESS:${provider}:${method || "none"}`;
}

function parseTakeawayAddressStep(step?: string | null) {
  if (!step || !step.startsWith("TAKEAWAY_ADDRESS:")) return null;
  const parts = step.split(":");
  if (parts.length < 3) return null;
  const provider = parts[1] as "JNE" | "GOSEND" | "PICKUP" | "STORE_COURIER";
  const method = parts[2] && parts[2] !== "none" ? parts[2] : undefined;
  return { provider, method };
}

function encodeStepPayload(value: string) {
  return Buffer.from(value || "", "utf8").toString("base64url");
}

function decodeStepPayload(value: string) {
  return Buffer.from(value || "", "base64url").toString("utf8");
}

function buildTakeawayGosendLocationStep(method: string | undefined, address: string) {
  return `TAKEAWAY_GOSEND_LOCATION:${method || "none"}:${encodeStepPayload(address)}`;
}

function parseTakeawayGosendLocationStep(step?: string | null) {
  if (!step || !step.startsWith("TAKEAWAY_GOSEND_LOCATION:")) return null;
  const parts = step.split(":");
  if (parts.length < 3) return null;
  const method = parts[1] && parts[1] !== "none" ? parts[1] : undefined;
  const address = decodeStepPayload(parts.slice(2).join(":"));
  return { method, address };
}

function buildDeliveryLocationStep(provider: "GOSEND" | "STORE_COURIER", method: string | undefined, address: string) {
  return `DELIVERY_LOCATION:${provider}:${method || "none"}:${encodeStepPayload(address)}`;
}

function parseDeliveryLocationStep(step?: string | null) {
  if (!step || !step.startsWith("DELIVERY_LOCATION:")) return null;
  const parts = step.split(":");
  if (parts.length < 4) return null;
  const provider = parts[1] as "GOSEND" | "STORE_COURIER";
  const method = parts[2] && parts[2] !== "none" ? parts[2] : undefined;
  const address = decodeStepPayload(parts.slice(3).join(":"));
  return { provider, method, address };
}

function isShippingConfigured(store: any) {
  return !!(store?.enableTakeawayDelivery && (store?.shippingEnableJne || (store?.shippingEnableGosend && !store?.shippingJneOnly) || store?.shippingEnableStoreCourier));
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('WEBHOOK_VERIFY_REQUEST', { mode, hasToken: Boolean(token), hasChallenge: Boolean(challenge) });
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'laku_verify_token';

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('WEBHOOK_VERIFIED_SUCCESS');
      return new NextResponse(challenge, { status: 200 });
    }
    console.log('WEBHOOK_VERIFIED_FAILED: Token mismatch');
    return new NextResponse(null, { status: 403 });
  }
  
  // Friendly message for direct browser access
  return NextResponse.json({ 
    status: "active", 
    message: "Gercep WhatsApp Webhook is running. Waiting for Meta verification or events." 
  });
}

// Fast memory cache for deduplication (fallback if DB fails)
const memoryCache = new Set<string>();

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    const signatureHeader = req.headers.get("x-hub-signature-256");
    if (appSecret) {
      if (!signatureHeader) {
        return NextResponse.json({ error: "Missing webhook signature" }, { status: 401 });
      }
      const expectedSig = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
      const sigBuf = Buffer.from(signatureHeader);
      const expectedBuf = Buffer.from(expectedSig);
      const isValidSig = sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
      if (!isValidSig) {
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
      }
    }
    const body = JSON.parse(rawBody || "{}");
    
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // 1. Handle status updates for credit refund
    if (value?.statuses) {
        const statuses = value.statuses as Array<{ id?: string; status?: string }>;
        for (const statusEntry of statuses) {
          const messageId = statusEntry?.id;
          const statusText = (statusEntry?.status || "").toLowerCase();
          if (!messageId) continue;
          if (statusText === "failed" || statusText === "undelivered") {
            await refundWaUsageByMessageId(messageId, statusText);
          }
        }
        return NextResponse.json({ success: true });
    }

    const message = value?.messages?.[0];
    if (!message) return NextResponse.json({ success: true });

    await ensureStoreSettingsSchema();

    // 2. FAST DEDUPLICATION: Memory Check
    if (message.id) {
        if (memoryCache.has(message.id)) {
            return NextResponse.json({ success: true });
        }
        memoryCache.add(message.id);
        if (memoryCache.size > 1000) memoryCache.clear();
    }

    // 3. PERSISTENT DEDUPLICATION: DB Check
    if (message.id) {
        try {
            await prisma.processedMessage.create({
                data: { id: message.id }
            });
            console.log(`[WHATSAPP] Processing NEW message: ${message.id} from ${message.from}`);
        } catch (e: any) {
            if (e.code === 'P2002') {
                return NextResponse.json({ success: true });
            }
            // If table missing, we continue because memoryCache already caught local duplicates
        }
    }

    const phoneNumberId = value?.metadata?.phone_number_id;
    const platform = await prisma.platformSettings.findUnique({ where: { key: "default" } }).catch(() => null);
    const platformPhoneNumberId = platform?.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID;

    const from = message.from;
    let textBody = String(
      message.text?.body ||
        message.interactive?.button_reply?.title ||
        message.interactive?.list_reply?.title ||
        message.interactive?.button_reply?.id ||
        message.interactive?.list_reply?.id ||
        ""
    ).trim();

    // If it's a category selection from a list, make it clear for the AI
    if (message.interactive?.list_reply?.id?.startsWith("CAT_")) {
      const catName = message.interactive.list_reply.title;
      textBody = `Saya memilih kategori: ${catName}`;
    }

    // If it's a product selection from a list, make it clear for the AI
    if (message.interactive?.list_reply?.id?.startsWith("PROD_")) {
      const prodName = message.interactive.list_reply.title;
      textBody = `Saya ingin memesan: ${prodName}`;
    }
    
    const lowerText = textBody?.toLowerCase();
    const listReplyId = String(message.interactive?.list_reply?.id || "");
    const listReplyTitle = String(message.interactive?.list_reply?.title || "");
    const isCategoryListTap = listReplyId.startsWith("CAT_");
    const isProductListTap = listReplyId.startsWith("PROD_");
    const isStoreListTap = listReplyId.startsWith("STORE_");

    // Get language early for localization
    // We use a dummy storeId 0 if we don't know the store yet, or try to guess from metadata
    let lang: WaLang = "id";
    try {
      const storeIdGuess = phoneNumberId 
        ? (await prisma.store.findFirst({ where: { whatsappPhoneId: String(phoneNumberId) }, select: { id: true } }))?.id || 0
        : 0;
      lang = await getWaLanguage(from, storeIdGuess);
    } catch (e) {}
    const l = (idText: string, enText: string) => (lang === "en" ? enText : idText);

    // Log WhatsApp Traffic
      logTraffic(undefined, "WHATSAPP", { from, text: textBody, messageId: message.id }).catch(() => null);

      // --- SENDER IDENTIFICATION ---
      const senderPhoneVariants = (() => {
        const raw = String(from || "").trim();
        const cleaned = raw.replace(/[^\d+]/g, "");
        const noPlus = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
        const digits = noPlus.replace(/\D/g, "");
        const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
        const variants = new Set<string>();
        if (digits) variants.add(digits);
        if (normalized) variants.add(normalized);
        if (normalized.startsWith("62")) variants.add(`0${normalized.slice(2)}`);
        if (digits) variants.add(`+${digits}`);
        if (normalized) variants.add(`+${normalized}`);
        return Array.from(variants).filter(Boolean);
      })();

      // Check if sender is a registered Admin/Merchant
      let dbUser = await prisma.user.findFirst({
        where: { phoneNumber: { in: senderPhoneVariants } },
        include: { stores: true }
      });

      // --- AI AGENT HANDLER ---
      const isAICommand = 
        isCategoryListTap ||
        isProductListTap ||
        isStoreListTap ||
        lowerText?.startsWith("ai ") || 
        lowerText?.startsWith("tanya ") || 
        lowerText?.startsWith("ask ") || 
        lowerText?.startsWith("cari ") ||
        lowerText?.startsWith("search ") || 
        lowerText?.startsWith("find ") ||
        lowerText?.startsWith("tolong ") ||
        lowerText?.startsWith("bantu ") ||
        lowerText?.startsWith("minta ") ||
        (lowerText?.includes("cari ") && lowerText?.length > 8) ||
        (lowerText?.includes("tanya ") && lowerText?.length > 8) ||
        (lowerText?.includes("bantu ") && lowerText?.length > 8) ||
        (lowerText?.includes("tolong ") && lowerText?.length > 8) ||
        (lowerText?.includes("minta ") && lowerText?.length > 8) ||
        // Special case for searching across all stores
        (lowerText?.includes("cari ") && lowerText?.includes("gercep")) ||
        (lowerText?.includes("find ") && lowerText?.includes("gercep")) ||
        // Natural questions (e.g., "Ada promo apa?", "Bisa antar ke...?")
        (lowerText?.includes("?") && lowerText?.length > 10) ||
        (lowerText?.includes("bagaimana ") && lowerText?.length > 10) ||
        (lowerText?.includes("apakah ") && lowerText?.length > 10) ||
        (lowerText?.includes("dimana ") && lowerText?.length > 10);

      let aiSession = await prisma.whatsAppSession.findFirst({
        where: { phoneNumber: from, step: "AI_MODE" }
      });
      if (aiSession && isSessionExpired(aiSession.updatedAt)) {
        const meta = (aiSession.metadata as any) || {};
        const preservedMetadata: any = {};
        if (meta.lockedStoreId) preservedMetadata.lockedStoreId = meta.lockedStoreId;
        if (meta.lockedStoreSlug) preservedMetadata.lockedStoreSlug = meta.lockedStoreSlug;
        if (meta.lockedStoreAt) preservedMetadata.lockedStoreAt = meta.lockedStoreAt;
        if (meta.customerProfile) preservedMetadata.customerProfile = meta.customerProfile;
        await prisma.whatsAppSession
          .update({
            where: { id: aiSession.id },
            data: { step: "START", cart: [], metadata: preservedMetadata as any, tableNumber: null }
          })
          .catch(() => null);
        aiSession = null;
      }

      if (isAICommand || aiSession) {
        // Switch to AI Mode if command used
        if (isAICommand && !aiSession) {
          const existing = await prisma.whatsAppSession.findUnique({
            where: { phoneNumber_storeId: { phoneNumber: from, storeId: 0 } }
          });

          aiSession = await prisma.whatsAppSession.upsert({
            where: { phoneNumber_storeId: { phoneNumber: from, storeId: 0 } },
            update: { 
              step: "AI_MODE", 
              cart: [],
              metadata: {
                ...(existing?.metadata as any || {}),
                prevStep: existing?.step || "START"
              }
            },
            create: { phoneNumber: from, storeId: 0, step: "AI_MODE", cart: [] }
          });
        }

        // Handle "exit" to leave AI mode
        if (lowerText === "exit" || lowerText === "stop" || lowerText === "keluar" || lowerText === "menu") {
          const prevStep = (aiSession?.metadata as any)?.prevStep || "START";
          await prisma.whatsAppSession.update({
            where: { phoneNumber_storeId: { phoneNumber: from, storeId: 0 } },
            data: { step: prevStep }
          });
          
          let exitMsg = "✅ Keluar dari mode AI. Balas 'Menu' untuk kembali ke menu utama.";
          if (prevStep === 'MERCHANT_MODE') exitMsg = "✅ Keluar dari mode AI. Kamu kembali ke **Mode Admin**. Balas 'Menu' untuk menu admin.";
          if (prevStep === 'USER_MODE') exitMsg = "✅ Keluar dari mode AI. Kamu kembali ke **Mode User**. Balas 'Menu' untuk menu belanja.";

          await sendWhatsAppMessage(from, exitMsg, 0);
          return NextResponse.json({ success: true });
        }

        // Fetch history from session metadata
        const metadata = (aiSession?.metadata as any) || {};
        const historyRaw = metadata?.chatHistory || [];
        const customerProfile = metadata?.customerProfile || {};
        
        const history = (WA_AI_HISTORY_LIMIT > 0 && Array.isArray(historyRaw) && historyRaw.length > WA_AI_HISTORY_LIMIT)
          ? historyRaw.slice(-WA_AI_HISTORY_LIMIT)
          : historyRaw;
        
        let finalPrompt = textBody;

        // If it's a location message, provide a richer prompt for the AI
        if (!finalPrompt && (message as any).location) {
          const loc = (message as any).location;
          finalPrompt = `[LOCATION_SHARED] Saya baru saja membagikan lokasi saya (Lat: ${loc.latitude}, Lng: ${loc.longitude}). Mohon gunakan lokasi ini untuk menghitung ongkir atau mencari toko terdekat.`;
          
          // Update customer profile with last known location if needed
          customerProfile.lastLat = loc.latitude;
          customerProfile.lastLng = loc.longitude;
        }

        if (!finalPrompt) {
          console.warn("[AI_WEBHOOK] No prompt found in message, skipping AI chat.");
          return NextResponse.json({ success: true });
        }

        try {
          const isPlatformNumberForAi = platformPhoneNumberId && String(phoneNumberId) === String(platformPhoneNumberId);
          
          // Look for a "locked" store in the session metadata if on platform number
          let lockedStoreId = metadata?.lockedStoreId;

          let aiStore = phoneNumberId
            ? (isPlatformNumberForAi
                ? (
                    lockedStoreId
                      ? await prisma.store.findUnique({ where: { id: Number(lockedStoreId) }, select: { id: true, slug: true, name: true } })
                      : await prisma.whatsAppSession.findFirst({
                          where: { phoneNumber: from, storeId: { gt: 0 } },
                          orderBy: { updatedAt: "desc" },
                          select: { storeId: true }
                        }).then(async (s) => {
                          if (!s?.storeId) return null;
                          return prisma.store.findUnique({ where: { id: Number(s.storeId) }, select: { id: true, slug: true, name: true } });
                        })
                  )
                : await prisma.store.findFirst({
                    where: { whatsappPhoneId: String(phoneNumberId) },
                    select: { id: true, slug: true, name: true }
                  }))
            : null;
          let aiStoreId = Number(aiStore?.id || 0);

          if (isStoreListTap) {
            const selectedStoreId = Number(listReplyId.replace(/^STORE_/, "")) || 0;
            if (selectedStoreId > 0) {
              if (message.id) {
                try {
                  await prisma.processedMessage.create({ data: { id: `OUT_STORE_${message.id}` } });
                } catch (e: any) {
                  if (e.code === "P2002") {
                    return NextResponse.json({ success: true });
                  }
                }
              }
              const selectedStore = await prisma.store.findUnique({ where: { id: selectedStoreId }, select: { id: true, slug: true, name: true } });
              if (selectedStore?.id) {
                aiStore = selectedStore as any;
                aiStoreId = Number(selectedStore.id);
                const categories = await prisma.category.findMany({
                  where: { storeId: aiStoreId },
                  select: { name: true, slug: true },
                  orderBy: { name: "asc" }
                });
                if (aiSession?.id) {
                  await prisma.whatsAppSession.update({
                    where: { id: aiSession.id },
                    data: {
                      metadata: {
                        ...metadata,
                        lockedStoreId: selectedStore.id,
                        lockedStoreSlug: selectedStore.slug,
                        lockedStoreAt: new Date().toISOString()
                      } as any
                    }
                  }).catch(() => null);
                }
                const options = categories.length > 0
                  ? {
                      list: {
                        buttonText: l("Pilih Kategori", "Choose Category"),
                        sections: [
                          {
                            title: l("Kategori Produk", "Product Categories"),
                            rows: [
                              { id: "CAT_ALL", title: l("Semua Menu", "All Menu"), description: l("Lihat semua produk tersedia", "View all available products") },
                              ...categories.slice(0, 9).map((c: any) => ({
                                id: `CAT_${c.slug}`,
                                title: String(c.name).slice(0, 24),
                                description: l(`Lihat produk di ${c.name}`, `View items in ${c.name}`)
                              }))
                            ]
                          }
                        ]
                      }
                    }
                  : undefined;

                await sendWhatsAppMessage(
                  from,
                  `🤖 *Gercep Assistant*:\n\n${l(`Siap Kak. Ini kategori di *${String(selectedStore.name)}* — silakan pilih ya.`, `Sure. Here are categories in *${String(selectedStore.name)}* — please choose one.`)}\n\n_(Balas 'Exit' untuk berhenti)_`,
                  aiStoreId,
                  options as any
                );
                return NextResponse.json({ success: true });
              }
            }
          }

          const wantsListProduk =
            /\b(?:list|daftar)\s+(?:produk|menu)\b/i.test(String(lowerText || "")) ||
            /\b(?:menu|produk)\s+lengkap\b/i.test(String(lowerText || "")) ||
            /\bsemua\s+(?:produk|menu)\b/i.test(String(lowerText || ""));
          const storeHint = String(lowerText || "")
            .replace(/[^\p{L}\p{N}\s-]/gu, " ")
            .replace(/\b(bisa|minta|tolong|please|dong|ya|kak|kakak|list|daftar|produk|menu|semua|lengkap)\b/gi, " ")
            .replace(/\s+/g, " ")
            .trim();

          if (wantsListProduk && storeHint.length >= 3) {
            const candidates = await prisma.store.findMany({
              where: {
                isActive: true,
                enableWhatsApp: true,
                name: { contains: storeHint, mode: "insensitive" }
              },
              select: { id: true, slug: true, name: true },
              orderBy: { updatedAt: "desc" },
              take: 3
            });

            if (candidates.length === 1) {
              aiStore = candidates[0] as any;
              aiStoreId = Number((aiStore as any)?.id || 0);
              const categories = await prisma.category.findMany({
                where: { storeId: aiStoreId },
                select: { name: true, slug: true },
                orderBy: { name: "asc" }
              });

              if (message.id) {
                try {
                  await prisma.processedMessage.create({ data: { id: `OUT_LIST_${message.id}` } });
                } catch (e: any) {
                  if (e.code === "P2002") {
                    return NextResponse.json({ success: true });
                  }
                }
              }

              if (aiSession?.id) {
                await prisma.whatsAppSession.update({
                  where: { id: aiSession.id },
                  data: {
                    metadata: {
                      ...metadata,
                      lockedStoreId: (aiStore as any).id,
                      lockedStoreSlug: (aiStore as any).slug,
                      lockedStoreAt: new Date().toISOString()
                    } as any
                  }
                }).catch(() => null);
              }

              const options = categories.length > 0
                ? {
                    list: {
                      buttonText: l("Pilih Kategori", "Choose Category"),
                      sections: [
                        {
                          title: l("Kategori Produk", "Product Categories"),
                          rows: [
                            { id: "CAT_ALL", title: l("Semua Menu", "All Menu"), description: l("Lihat semua produk tersedia", "View all available products") },
                            ...categories.slice(0, 9).map((c: any) => ({
                              id: `CAT_${c.slug}`,
                              title: String(c.name).slice(0, 24),
                              description: l(`Lihat produk di ${c.name}`, `View items in ${c.name}`)
                            }))
                          ]
                        }
                      ]
                    }
                  }
                : undefined;

              await sendWhatsAppMessage(
                from,
                `🤖 *Gercep Assistant*:\n\n${l(`Siap Kak. Ini kategori di *${String((aiStore as any).name)}* — silakan pilih ya.`, `Sure. Here are categories in *${String((aiStore as any).name)}* — please choose one.`)}\n\n_(Balas 'Exit' untuk berhenti)_`,
                aiStoreId,
                options as any
              );
              return NextResponse.json({ success: true });
            }

            if (candidates.length > 1) {
              if (message.id) {
                try {
                  await prisma.processedMessage.create({ data: { id: `OUT_LIST_${message.id}` } });
                } catch (e: any) {
                  if (e.code === "P2002") {
                    return NextResponse.json({ success: true });
                  }
                }
              }
              await sendWhatsAppMessage(
                from,
                `🤖 *Gercep Assistant*:\n\n${l("Aku nemu beberapa toko yang mirip. Pilih toko dulu ya:", "I found multiple matching stores. Please choose one:")}\n\n_(Balas 'Exit' untuk berhenti)_`,
                0,
                {
                  list: {
                    buttonText: l("Pilih Toko", "Choose Store"),
                    sections: [
                      {
                        title: l("Daftar Toko", "Stores"),
                        rows: candidates.slice(0, 10).map((s: any) => ({
                          id: `STORE_${s.id}`,
                          title: String(s.name).slice(0, 24),
                          description: String(s.slug || "").slice(0, 72)
                        }))
                      }
                    ]
                  }
                } as any
              );
              return NextResponse.json({ success: true });
            }
          }
          const categoryTextMatch = String(lowerText || "").match(/(?:lihat\s+produk\s+di|produk\s+di)\s+(.+)$/i);
          const categoryTextRaw = categoryTextMatch?.[1] ? String(categoryTextMatch[1]).trim() : "";
          if ((isCategoryListTap || categoryTextRaw) && aiStoreId > 0) {
            if (message.id) {
              try {
                await prisma.processedMessage.create({ data: { id: `OUT_CAT_${message.id}` } });
              } catch (e: any) {
                if (e.code === "P2002") {
                  return NextResponse.json({ success: true });
                }
              }
            }
            const categories = await prisma.category.findMany({
              where: { storeId: aiStoreId },
              select: { name: true, slug: true },
              orderBy: { name: "asc" }
            });
            const normalizedCategoryText = categoryTextRaw.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim();
            const selectedCategoryByText = normalizedCategoryText
              ? categories.find((c: any) => String(c.name || "").toLowerCase() === normalizedCategoryText)
                || categories.find((c: any) => String(c.slug || "").toLowerCase() === normalizedCategoryText.replace(/\s+/g, "-"))
                || categories.find((c: any) => String(c.name || "").toLowerCase().includes(normalizedCategoryText))
                || categories.find((c: any) => normalizedCategoryText.includes(String(c.name || "").toLowerCase()))
              : null;
            const selectedCategorySlug = isCategoryListTap
              ? (listReplyId === "CAT_ALL" ? null : listReplyId.replace(/^CAT_/, ""))
              : (selectedCategoryByText?.slug || null);
            const whereClause: any = {
              storeId: aiStoreId,
              stock: { gt: 0 },
              category: { not: "_ARCHIVED_" }
            };
            if (selectedCategorySlug) {
              whereClause.category = { equals: selectedCategorySlug, mode: "insensitive" };
            }

            const products = await prisma.product.findMany({
              where: whereClause,
              take: 10,
              orderBy: { name: "asc" }
            });

            const categoryLabel = selectedCategorySlug
              ? (isCategoryListTap ? (listReplyTitle || selectedCategorySlug) : (selectedCategoryByText?.name || categoryTextRaw || selectedCategorySlug))
              : l("Semua Menu", "All Menu");
            const responseText = products.length > 0
              ? l(`Tentu Kak, ini produk untuk kategori *${categoryLabel}*:`, `Sure, here are products in *${categoryLabel}*:`)
              : l(`Maaf Kak, belum ada produk tersedia di kategori *${categoryLabel}*.`, `Sorry, there are no in-stock products in *${categoryLabel}* right now.`);

            const options = products.length > 0
              ? {
                  list: {
                    buttonText: l("Pilih Produk", "Choose Product"),
                    sections: [
                      {
                        title: l("Daftar Produk", "Product List"),
                        rows: products.slice(0, 10).map((p: any) => ({
                          id: `PROD_${p.id}`,
                          title: String(p.name).slice(0, 24),
                          description: `Rp ${new Intl.NumberFormat("id-ID").format(Number(p.price || 0))}`.slice(0, 72)
                        }))
                      }
                    ]
                  }
                }
              : undefined;

            await sendWhatsAppMessage(
              from,
              `🤖 *Gercep Assistant*:\n\n${responseText}\n\n_(Balas 'Exit' untuk berhenti)_`,
              aiStoreId,
              options as any
            );
            return NextResponse.json({ success: true });
          }

          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://gercep.click";
          const aiAbortController = new AbortController();
          const aiTimeout = setTimeout(() => aiAbortController.abort(), WA_AI_TIMEOUT_MS);
          let res: Response;
          try {
            res = await fetch(`${baseUrl}/api/ai/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: aiAbortController.signal,
              body: JSON.stringify({ 
                message: finalPrompt, 
                history, 
                isPublic: true,
                context: {
                  phoneNumber: from,
                  channel: "WHATSAPP",
                  slug: (aiStore as any)?.slug || undefined,
                  storeId: aiStoreId || undefined,
                  storeName: (aiStore as any)?.name || undefined,
                  tableNumber: aiSession?.tableNumber || undefined,
                  location: (message as any).location,
                  userName: dbUser?.name || undefined,
                  userRole: dbUser?.role || undefined,
                  subscriptionPlan: (dbUser as any)?.stores?.[0]?.subscriptionPlan || undefined,
                  customerProfile // Pass the customer profile to AI
                }
              })
            });
          } finally {
            clearTimeout(aiTimeout);
          }
          if (!res.ok) {
            throw new Error(`AI route failed with status ${res.status}`);
          }
          const data = await res.json();
          if (data.text) {
            // Update customer profile from AI response if it suggests changes
            if (data.customerProfile) {
              Object.assign(customerProfile, data.customerProfile);
            }

            // If there's a breakdown or recap, show it before the main text
            let rawResponseText = data.text;
            if (data.orderRecap) {
              rawResponseText = `${data.orderRecap}\n\n${data.text}`;
            } else if (data.breakdown) {
              rawResponseText = `${data.breakdown}\n\n${data.text}`;
            }
            
            let responseText = String(rawResponseText || "")
              .replace(/(\*?Detail Pesanan[\s\S]*)$/i, "")
              .replace(/[\s\n]*(?:silahkan|silakan) bayar menggunakan tautan[:\s]*https?:\/\/\S+/gi, "")
              .replace(/[\s\n]*https?:\/\/\S+/gi, "")
              .trim();
            responseText = sanitizeWhatsAppAssistantText(responseText);
            if (responseText.length > WA_AI_REPLY_CHAR_LIMIT) {
              responseText = responseText.slice(0, WA_AI_REPLY_CHAR_LIMIT).trimEnd() + "…";
            }

            // Update session with active store and history
            if (aiSession) {
              const updatedMetadata = {
                ...metadata,
                chatHistory: (WA_AI_HISTORY_LIMIT > 0 && Array.isArray(data.history) && data.history.length > WA_AI_HISTORY_LIMIT)
                  ? data.history.slice(-WA_AI_HISTORY_LIMIT)
                  : (data.history || []),
                customerProfile
              };

              const allowStoreSwitch =
                /\b(?:pindah|ganti)\s+(?:toko|store)\b/i.test(textBody || "") ||
                /\bcari\s+toko\s+lain\b/i.test(textBody || "") ||
                /\b(?:toko|store)\s+lain\b/i.test(textBody || "") ||
                /\b(?:switch|change)\s+store\b/i.test(textBody || "");
              const hasExistingLock = !!(metadata as any)?.lockedStoreId;
              if ((data.activeStoreId || data.activeStoreSlug) && (!hasExistingLock || allowStoreSwitch)) {
                updatedMetadata.lockedStoreId = data.activeStoreId || (metadata as any)?.lockedStoreId;
                updatedMetadata.lockedStoreSlug = data.activeStoreSlug || (metadata as any)?.lockedStoreSlug;
                updatedMetadata.lockedStoreAt = new Date().toISOString();
              }

              await prisma.whatsAppSession.update({
                where: { id: aiSession.id },
                data: { metadata: updatedMetadata }
              }).catch(() => null);
            }

            const quickReplies = Array.isArray(data.quickReplies)
              ? data.quickReplies
                  .slice(0, 3)
                  .map((q: any, idx: number) => ({
                    id: String(q?.id || `QR_${idx + 1}`).slice(0, 200),
                    title: String(q?.title || q?.value || "").slice(0, 20)
                  }))
                  .filter((q: any) => q.title)
              : [];
            
            const categories = Array.isArray(data.categories) ? data.categories : [];
            const products = Array.isArray(data.products) ? data.products : [];
            const shippingOptions = Array.isArray(data.shippingOptions) ? data.shippingOptions : [];
            const shippingAsButtons = shippingOptions.slice(0, 3).map((s: any, idx: number) => ({
              id: String(s?.id || `SHIP_${idx + 1}`).slice(0, 200),
              title: String(s?.title || s?.provider || `Opsi ${idx + 1}`).slice(0, 20)
            }));
            
            let options: any = { imageUrl: data.productImage };
            if (data.paymentUrl) {
              options = {
                buttonText: "Pay Now",
                buttonUrl: data.paymentUrl,
                imageUrl: data.productImage
              };
            } else if (products.length > 0) {
              // Show products list FIRST if products are returned
              options = {
                list: {
                  buttonText: l("Pilih Produk", "Choose Product"),
                  sections: [
                    {
                      title: l("Daftar Produk", "Product List"),
                      rows: products.slice(0, 10).map((p: any) => ({
                        id: `PROD_${p.id}`,
                        title: String(p.name).slice(0, 24),
                        description: `Rp ${new Intl.NumberFormat('id-ID').format(p.price || 0)}`
                      }))
                    }
                  ]
                },
                imageUrl: data.productImage
              };
            } else if (categories.length > 0) {
              options = {
                list: {
                  buttonText: l("Pilih Kategori", "Choose Category"),
                  sections: [
                    {
                      title: l("Kategori Produk", "Product Categories"),
                      rows: [
                        { id: "CAT_ALL", title: l("Semua Menu", "All Menu"), description: l("Lihat semua produk tersedia", "View all available products") },
                        ...categories.slice(0, 9).map((c: any) => ({
                          id: `CAT_${c.slug}`,
                          title: String(c.name).slice(0, 24),
                          description: l(`Lihat produk di ${c.name}`, `View items in ${c.name}`)
                        }))
                      ]
                    }
                  ]
                },
                imageUrl: data.productImage
              };
            } else if (shippingOptions.length > 3) {
              options = {
                list: {
                  buttonText: l("Pilih Pengiriman", "Choose Shipping"),
                  sections: [
                    {
                      title: l("Opsi Pengiriman", "Shipping Options"),
                      rows: shippingOptions.slice(0, 10).map((s: any, idx: number) => ({
                        id: String(s?.id || `SHIP_${idx + 1}`).slice(0, 200),
                        title: String(s?.title || s?.provider || `Option ${idx + 1}`).slice(0, 24),
                        description: `Rp ${new Intl.NumberFormat('id-ID').format(Number(s?.fee || 0))}${s?.eta ? ` • ${String(s.eta)}` : ""}`.slice(0, 72)
                      }))
                    }
                  ]
                },
                imageUrl: data.productImage
              };
            } else if (shippingAsButtons.length > 0) {
              options = { quickReplies: shippingAsButtons, imageUrl: data.productImage };
            } else if (quickReplies.length > 0) {
              options = { quickReplies, imageUrl: data.productImage };
            }
            const persistHistoryPromise = (aiSession?.id
              ? prisma.whatsAppSession.update({
                  where: { id: aiSession.id },
                  data: {
                    metadata: {
                      ...((aiSession as any)?.metadata || {}),
                      chatHistory: (WA_AI_HISTORY_LIMIT > 0 && Array.isArray(data.history) && data.history.length > WA_AI_HISTORY_LIMIT)
                        ? data.history.slice(-WA_AI_HISTORY_LIMIT)
                        : (data.history || [])
                    }
                  } as any
                })
              : Promise.resolve(null)
            ).catch(() => null);
            let shouldSendAiReply = true;
            if (message.id) {
              try {
                await prisma.processedMessage.create({ data: { id: `OUT_AI_${message.id}` } });
              } catch (e: any) {
                if (e.code === "P2002") {
                  shouldSendAiReply = false;
                }
              }
            }
            await Promise.all([
              persistHistoryPromise,
              shouldSendAiReply
                ? sendWhatsAppMessage(from, `🤖 *Gercep Assistant*:\n\n${responseText}\n\n_(Balas 'Exit' untuk berhenti)_`, aiStoreId, options as any)
                : Promise.resolve(null)
            ]);
          } else {
            await sendWhatsAppMessage(from, "❌ Maaf, AI sedang sibuk. Coba lagi nanti.", aiStoreId);
          }
        } catch (e) {
          console.error("[WA_AI_ERROR]", e);
          await sendWhatsAppMessage(from, "❌ Maaf, AI sedang sibuk. Coba lagi sebentar ya.", 0);
        }
        return NextResponse.json({ success: true });
      }

      console.log(`[WHATSAPP] Incoming Message: "${textBody}" from ${from} (Store Context: ${phoneNumberId})`);

    if (message && phoneNumberId) {
      // 0. MERCHANT CHECK
      // Use the identification already performed above
      let user = dbUser;

      let preferredMerchantStoreId: number | null = null;
      let isStoreWhatsappNumber = false;

      // Fallback or verify: Check if this number is listed as a Store WhatsApp Number
      if (true) { // Always check to set preferredMerchantStoreId
          const storeByPhone = await prisma.store.findFirst({ 
            where: { whatsapp: { in: senderPhoneVariants } }, 
            include: { owner: true },
            orderBy: { updatedAt: "desc" }
          });
          
          if (storeByPhone) {
              isStoreWhatsappNumber = true;
              preferredMerchantStoreId = storeByPhone.id;
              
              if (!user) {
                // Try finding the owner as the user
                user = await prisma.user.findFirst({
                    where: { id: storeByPhone.ownerId },
                    include: { stores: true }
                });
                
                // If owner found but not MERCHANT/SUPER_ADMIN, force MERCHANT role for this session
                if (user && !["MERCHANT", "SUPER_ADMIN"].includes(user.role)) {
                  (user as any).role = "MERCHANT";
                }
              }
          }
      }

      // Check if Merchant is in "User Mode"
      let isMerchant = !!user && (user.role === 'MERCHANT' || user.role === 'SUPER_ADMIN');
      let forceUserMode = false;

      if (user) {
        console.log(`[WHATSAPP] Found User: ${user.phoneNumber || from}, Role: ${user.role}, isStoreWhatsappNumber: ${isStoreWhatsappNumber}`);
      }

      // Detect User Intent that overrides Merchant Mode
      if (isMerchant) {
          const lower = message.text?.body?.toLowerCase() || "";
          console.log(`[WHATSAPP] Merchant Check: ${from}, StoreID=${user?.stores[0]?.id}`);
          
          // Scanning QR (Table ...)
          if (lower.startsWith('table') || lower.startsWith('meja')) {
             forceUserMode = true;
          }
      }

      // Use a special session for Merchant Mode Toggle
      let merchantSession = null;
      if (isMerchant) {
        merchantSession = await prisma.whatsAppSession.findFirst({
          where: { phoneNumber: from, storeId: 0 }
        });
        
        if (!merchantSession) {
           merchantSession = await prisma.whatsAppSession.create({
             data: { phoneNumber: from, storeId: 0, step: 'MERCHANT_MODE' }
           });
        }

        const lower = message.text?.body?.toLowerCase() || "";
        
        // Mode Switching Logic
        if (lower === 'user mode' || lower === 'mode user') {
           await prisma.whatsAppSession.update({
             where: { id: merchantSession.id },
             data: { step: 'USER_MODE' }
           });
           await sendWhatsAppMessage(from, "🔄 Berhasil pindah ke **Mode User**. Sekarang kamu bisa order dari toko lain.\nKetik 'Admin Mode' untuk kembali.", 0);
           return NextResponse.json({ success: true });
        }
        
        if (lower === 'admin mode' || lower === 'mode admin') {
           await prisma.whatsAppSession.update({
             where: { id: merchantSession.id },
             data: { step: 'MERCHANT_MODE' }
           });
           await sendWhatsAppMessage(from, "🔄 Berhasil pindah ke **Mode Admin**. Sekarang kamu bisa kelola toko.\nKetik 'User Mode' untuk kembali.", user?.stores[0]?.id || 0);
           return NextResponse.json({ success: true });
        }

        // Logic to bypass merchant handler
        const isInUserMode = merchantSession.step === 'USER_MODE' || forceUserMode;
        
        // If command is report/balance, it's always for merchant admin.
        // BUT if command is help/menu, only treat as merchant command if NOT in USER_MODE.
        const isMerchantAdminCommand = ["report", "balance", "wa balance", "saldo", "saldo wa"].includes(lowerText || "") || 
                                       ((lowerText === "help" || lowerText === "menu") && !isInUserMode);
        
        if (isInUserMode && !isMerchantAdminCommand) {
            // Proceed to User Logic (below)
        } else {
            // Default: Merchant Handler
            if (user) {
              console.log(`[WHATSAPP] Routing to Merchant Handler for ${from}. Mode: ${merchantSession.step}`);
              if (preferredMerchantStoreId && Array.isArray((user as any).stores)) {
                const stores = (user as any).stores as any[];
                const idx = stores.findIndex((s) => Number(s?.id) === Number(preferredMerchantStoreId));
                if (idx > 0) {
                  (user as any).stores = [stores[idx], ...stores.slice(0, idx), ...stores.slice(idx + 1)];
                }
              }
              await handleMerchantMessage(user, message, from, merchantSession);
            }
            return NextResponse.json({ success: true });
        }
      }

      let targetStore = null;
      let isSharedNumber = false;

      // 1. Try finding store by Phone ID (ONLY if it's not the shared platform number)
      const isPlatformNumber = platformPhoneNumberId && String(phoneNumberId) === String(platformPhoneNumberId);
      
      if (!isPlatformNumber) {
        const store = await prisma.store.findFirst({
          where: { ...assistantStoreEligibilityWhere, whatsappPhoneId: String(phoneNumberId) }
        });

        if (store) {
          targetStore = store;
          console.log(`[WHATSAPP] Found target store by PhoneID: ${targetStore.name}`);
        }
      }
      
      // 2. Force Shared Number logic
      if (!targetStore || isPlatformNumber) {
         console.log(`[WHATSAPP] Processing on ${isPlatformNumber ? 'Shared Platform' : 'Unknown'} Number`);
         isSharedNumber = true;
         
         // If a merchant is in USER_MODE, DO NOT auto-resolve to their own store.
         const isMerchantInUserMode = isMerchant && merchantSession?.step === 'USER_MODE';
         const globalContextSession = isPlatformNumber
           ? await prisma.whatsAppSession.findUnique({
               where: { phoneNumber_storeId: { phoneNumber: from, storeId: 0 } }
             })
           : null;
         const lockedStoreIdFromGlobal = Number((globalContextSession?.metadata as any)?.lockedStoreId || 0);
         const lockedStoreAtFromGlobal = (globalContextSession?.metadata as any)?.lockedStoreAt || null;
         const isLockedStoreFresh =
           lockedStoreIdFromGlobal > 0 &&
           !isSessionExpired(lockedStoreAtFromGlobal || globalContextSession?.updatedAt, STORE_LOCK_TTL_MS);

         if (!targetStore && isLockedStoreFresh) {
           const lockedStore = await prisma.store.findFirst({
             where: { ...assistantStoreEligibilityWhere, id: lockedStoreIdFromGlobal }
           });
           if (lockedStore) {
             targetStore = lockedStore;
             console.log(`[WHATSAPP] Resolved target store from locked store context: ${targetStore.name}`);
           }
         }

         if (!targetStore && !isMerchantInUserMode) {
           const storeBySender = await prisma.store.findFirst({
             where: { ...assistantStoreEligibilityWhere, whatsapp: { in: senderPhoneVariants } },
             orderBy: { updatedAt: "desc" }
           });
           if (storeBySender) {
             targetStore = storeBySender;
             console.log(`[WHATSAPP] Resolved target store from sender whatsapp: ${targetStore.name}`);
           }
         }
         
         if (!targetStore) {
           const recentSession = await prisma.whatsAppSession.findFirst({
              where: { phoneNumber: from },
              orderBy: { updatedAt: 'desc' }
           });
           
           if (recentSession && recentSession.storeId && !isSessionExpired(recentSession.updatedAt)) {
              const s = await prisma.store.findFirst({ where: { ...assistantStoreEligibilityWhere, id: recentSession.storeId } });
              
              // If merchant in user mode, only use this session if it's not their own store
              // OR if it's recent (< 30m)
              const isOwnStore = s && isMerchant && Array.isArray((user as any).stores) && (user as any).stores.some((ms: any) => ms.id === s.id);
              const isRecent = recentSession.updatedAt && (Date.now() - new Date(recentSession.updatedAt).getTime()) < 30 * 60 * 1000;

              if (s && (!isMerchantInUserMode || !isOwnStore || isRecent)) {
                  targetStore = s;
                  console.log(`[WHATSAPP] Resolved target store from session: ${targetStore.name}`);
              }
           }
         }
         
         if (!targetStore) {
            targetStore = await prisma.store.findFirst({ where: { ...assistantStoreEligibilityWhere, slug: 'demo' } });
            console.log(`[WHATSAPP] Fallback to Demo Store: ${targetStore?.name}`);
         }
      }

      // Dev Fallback
      if (!targetStore && process.env.NODE_ENV === 'development') {
         targetStore = await prisma.store.findFirst({ where: assistantStoreEligibilityWhere });
      }

      if (!targetStore) {
        console.log(`[WHATSAPP] No store found for Phone ID: ${phoneNumberId}`);
        return NextResponse.json({ success: true });
      }

      console.log(`[WHATSAPP] Incoming: "${textBody}" from ${from}, STORE: ${targetStore.name}`);
      const session = await getSession(from, targetStore.id);
      if (isSessionExpired(session.updatedAt)) {
        await updateSession(from, targetStore.id, { step: 'START', cart: [], metadata: {} as any, tableNumber: null });
        session.step = 'START';
        session.cart = [];
        session.metadata = {} as any;
        session.tableNumber = null as any;
      }

      const deliveryLocationCtx =
        session.step && session.step.startsWith("DELIVERY_LOCATION:")
          ? parseDeliveryLocationStep(session.step)
          : null;
      const legacyGosendCtx =
        !deliveryLocationCtx && session.step && session.step.startsWith("TAKEAWAY_GOSEND_LOCATION:")
          ? { provider: "GOSEND" as const, ...parseTakeawayGosendLocationStep(session.step) }
          : null;

      if (deliveryLocationCtx || legacyGosendCtx) {
        const ctx = (deliveryLocationCtx || legacyGosendCtx) as { provider: "GOSEND" | "STORE_COURIER"; method?: string; address: string };
        const cart = (session.cart as any[]) || [];
        if (!ctx || !ctx.address) {
          await updateSession(from, targetStore.id, { step: 'ORDERING:ALL' });
          await sendWhatsAppMessage(from, l(`Sesi pengiriman tidak valid, balas "Menu".`, `Invalid shipping session, reply "Menu".`), targetStore.id);
          return NextResponse.json({ success: true });
        }
        if (cart.length === 0) {
          await updateSession(from, targetStore.id, { step: 'START' });
          await sendWhatsAppMessage(from, l(`Keranjang kosong. Balas "Menu" untuk pesan lagi.`, `Your cart is empty. Reply "Menu" to order again.`), targetStore.id);
          return NextResponse.json({ success: true });
        }

        const loc = (message as any).location;
        const lat = typeof loc?.latitude === "number" ? loc.latitude : parseFloat(String(loc?.latitude || ""));
        const lng = typeof loc?.longitude === "number" ? loc.longitude : parseFloat(String(loc?.longitude || ""));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          await sendWhatsAppMessage(
            from,
            l(
              `📍 Lokasi belum terbaca. Mohon *cek lokasi* lalu kirim lagi (Share Location) untuk pengiriman.`,
              `📍 Location not detected. Please check your location and share it again for delivery.`
            ),
            targetStore.id
          );
          return NextResponse.json({ success: true });
        }

        // --- Distance Check for Store Courier (100m) ---
        let isNearStore = false;
        if (targetStore.biteshipOriginLat && targetStore.biteshipOriginLng) {
          const storeLat = parseFloat(String(targetStore.biteshipOriginLat));
          const storeLng = parseFloat(String(targetStore.biteshipOriginLng));
          if (Number.isFinite(storeLat) && Number.isFinite(storeLng)) {
            const distance = getDistanceMeters(lat, lng, storeLat, storeLng);
            if (distance <= 100) {
              isNearStore = true;
              console.log(`[WHATSAPP_DISTANCE] Customer is near store: ${distance.toFixed(1)}m`);
            }
          }
        }

        const shippingOptions = await getShippingQuoteFromBiteship({
          store: targetStore,
          destinationAddress: ctx.address,
          destinationLatitude: lat,
          destinationLongitude: lng
        });

        if (isNearStore || (targetStore as any).shippingEnableStoreCourier) {
          shippingOptions.unshift({
            provider: "STORE_COURIER",
            service: "Kurir Toko",
            fee: Number((targetStore as any).shippingStoreCourierFee || 0),
            eta: "15-30 min",
            type: "instant"
          });
        }

        const selected = shippingOptions.find((opt) => opt.provider === ctx.provider);
        if (!selected) {
          await updateSession(from, targetStore.id, { step: buildTakeawayDeliveryStep(ctx.method), cart });
          let optionsMsg = l(
            `🚫 Opsi pengiriman tidak tersedia untuk lokasi ini.\n\nJika lokasi salah, mohon *cek lalu kirim ulang lokasi (Share Location)*.\n\nSilakan pilih kurir lain.`,
            `🚫 Delivery option is not available for this location.\n\nIf your location is wrong, please check it and share again.\n\nPlease choose another courier.`
          );
          let optionCount = 0;
          const quickReplies: Array<{ id: string; title: string }> = [];
          if (isNearStore || (targetStore as any).shippingEnableStoreCourier) {
            optionCount++;
            optionsMsg += `\n${optionCount}. Kurir Toko (Store Courier)`;
            quickReplies.push({ id: "STORE_COURIER", title: "Kurir Toko" });
          }
          if (targetStore.shippingEnableGosend && !targetStore.shippingJneOnly) {
            optionCount++;
            optionsMsg += `\n${optionCount}. GoSend`;
            quickReplies.push({ id: "GOSEND", title: "GoSend" });
          }
          if (targetStore.shippingEnableJne) {
            optionCount++;
            optionsMsg += `\n${optionCount}. JNE`;
            quickReplies.push({ id: "JNE", title: "JNE" });
          }
          await sendWhatsAppMessage(from, optionsMsg, targetStore.id, {
            quickReplies: quickReplies.slice(0, 3)
          });
          return NextResponse.json({ success: true });
        }

        const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const taxAmount = total * (targetStore.taxPercent / 100);
        const serviceCharge = total * (targetStore.serviceChargePercent / 100);
        const subtotalWithTaxService = total + taxAmount + serviceCharge;
        let fee = 0;
        if (targetStore.feePaidBy === 'CUSTOMER') {
          if (ctx.method === 'qris' && targetStore.qrisFeePercent) fee = subtotalWithTaxService * (Number(targetStore.qrisFeePercent) / 100);
          else if (ctx.method === 'bank_transfer' && targetStore.manualTransferFee) fee = Number(targetStore.manualTransferFee);
        }
        const shippingCost = Number(selected?.fee || 0);
        const finalTotal = subtotalWithTaxService + fee + shippingCost;

        let order = await prisma.order.create({
          data: {
            storeId: targetStore.id,
            customerPhone: from,
            totalAmount: finalTotal,
            taxAmount,
            serviceCharge,
            paymentFee: fee,
            status: 'PENDING',
            orderType: 'DELIVERY',
            shippingProvider: selected?.provider || "GOSEND",
            shippingService: selected?.provider === "STORE_COURIER" ? "KURIR_TOKO" : (selected?.service || "-"),
            shippingStatus: selected?.provider === "STORE_COURIER" ? "STORE_COURIER" : 'QUOTE_READY',
            shippingAddress: ctx.address,
            shippingCost,
            shippingEta: selected?.eta || "-",
            items: { create: cart.map(item => ({ productId: item.productId, quantity: item.qty, price: item.price })) }
          }
        });

        // Skip Biteship draft if Store Courier
        if (selected?.provider !== "STORE_COURIER") {
          const draft = await createBiteshipDraftForPendingOrder({
            store: targetStore,
            order,
            destinationCoordinate: { latitude: lat, longitude: lng },
            items: cart.map((item) => ({
              name: item.name,
              quantity: item.qty,
              price: item.price
            }))
          });

          if (!draft?.ok) {
            await prisma.order
              .update({ where: { id: order.id }, data: { shippingStatus: "draft_failed" } as any })
              .catch(() => null);
            await sendWhatsAppMessage(
              from,
              l(
                "Gagal membuat draft pengiriman. Mohon cek alamat (kode pos / share lokasi) dan coba pilih kurir ulang.",
                "Failed to create delivery draft. Please check your address (postal code / share location) and retry."
              ),
              targetStore.id
            );
            await updateSession(from, targetStore.id, { step: buildTakeawayDeliveryStep(ctx.method), cart });
            return NextResponse.json({ success: true });
          }

          if ((draft as any)?.draftOrderId) {
            const pendingDraft = draft as any;
            order = await prisma.order.update({
              where: { id: order.id },
              data: {
                biteshipOrderId: pendingDraft.draftOrderId,
                shippingStatus: pendingDraft.shippingStatus || order.shippingStatus || "draft_created"
              }
            });
          }
        }

        let itemsMsg = "";
        cart.forEach(item => { itemsMsg += `- ${item.name} x${item.qty}\n`; });

        await createOrderNotification({
          storeId: targetStore.id,
          orderId: order.id,
          message: `Order ${String((session.metadata as any)?.orderType || "DELIVERY").toLowerCase()} #${order.id} menunggu pembayaran: ${from} • Rp ${new Intl.NumberFormat('id-ID').format(finalTotal)}`,
          type: "WHATSAPP_ORDER"
        }).catch(() => null);

            const merchantMsg = await buildOrderMerchantSummary(order.id, "Order Pending");
            console.log(`[WHATSAPP_DELIVERY] Triggering merchant alert for order #${order.id}`);
            await sendMerchantWhatsApp(targetStore.id, merchantMsg, order.id).catch((e) => console.error("[WHATSAPP_DELIVERY_ALERT_ERROR]", e));

        const paymentLink = await createPaymentLink(order.id, finalTotal, from, targetStore.id, ctx.method as any);
        let summary = l("🧾 *Ringkasan Order*\n", "🧾 *Order Summary*\n");
        cart.forEach(item => { summary += `- ${item.name} x${item.qty} = ${new Intl.NumberFormat('id-ID').format(item.price * item.qty)}\n`; });
        summary += `\n------------------\nSubtotal: Rp ${new Intl.NumberFormat('id-ID').format(total)}\n`;
        if (taxAmount > 0) summary += `Tax (${targetStore.taxPercent}%): Rp ${new Intl.NumberFormat('id-ID').format(taxAmount)}\n`;
        if (serviceCharge > 0) summary += `Service (${targetStore.serviceChargePercent}%): Rp ${new Intl.NumberFormat('id-ID').format(serviceCharge)}\n`;
        summary += `${l("Biaya", "Fee")} (${ctx.method === 'qris' ? 'QRIS' : 'Bank Transfer'}): Rp ${new Intl.NumberFormat('id-ID').format(fee)}\n`;
        summary += l("Ongkir", "Shipping");
        if (selected?.provider === "STORE_COURIER") {
          summary += " (Kurir Toko)";
        } else {
          const pName = (selected?.provider || ctx.provider) === 'GOSEND' ? 'Gosend' : (selected?.provider || ctx.provider);
          summary += ` (${pName}${selected?.service ? ` ${selected.service}` : ""})`;
        }
        summary += `: Rp ${new Intl.NumberFormat('id-ID').format(shippingCost)}\n`;
        summary += `${l("Estimasi", "ETA")}: ${selected?.eta || "-"}\n`;
        summary += `\n*Total: Rp ${new Intl.NumberFormat('id-ID').format(finalTotal)}*`;
        summary += l("\n\n⏳ Link pembayaran bisa kedaluwarsa. Mohon selesaikan segera.", "\n\n⏳ Payment links can expire. Please complete payment soon.");
        await sendWhatsAppMessage(from, summary, targetStore.id, { buttonText: l("Bayar Sekarang", "Pay Now"), buttonUrl: paymentLink });
        await updateSession(from, targetStore.id, { step: 'START', cart: [] });
        return NextResponse.json({ success: true });
      }

      if (!textBody) return NextResponse.json({ success: true });
      
      // 1. GLOBAL COMMANDS
      const checkInMatch = textBody.match(/(?:check-in|table|meja)\s*(?:table|meja)?\s*(.+)/i);

      const langToEn = /^(en|english|inggris|bahasa inggris)$/i.test(textBody.trim());
      const langToId = /^(id|indonesia|bahasa indonesia)$/i.test(textBody.trim());
      if (langToEn || langToId) {
        lang = langToEn ? "en" : "id";
        await setWaLanguage(from, targetStore.id, lang);
        await sendWhatsAppMessage(
          from,
          lang === "en"
            ? `✅ Language changed to English.\nReply "Menu" to start ordering.`
            : `✅ Bahasa diubah ke Indonesia.\nBalas "Menu" untuk mulai pesan.`,
          targetStore.id
        );
        return NextResponse.json({ success: true });
      }
      
      if (checkInMatch) {
        const tableNum = checkInMatch[1].replace(/table|meja/gi, '').trim();
        const shippingConfigured = isShippingConfigured(targetStore);
        const prevTable = String(session.tableNumber || "").trim();
        const isRescanSameTable = !!prevTable && prevTable.toLowerCase() === String(tableNum).toLowerCase();
        const lastUpdatedAt = session?.updatedAt ? new Date(session.updatedAt).getTime() : 0;
        const isExpired = !lastUpdatedAt || (Date.now() - lastUpdatedAt) > 15 * 60 * 1000;

        if (isRescanSameTable && !isExpired) {
          await updateSession(from, targetStore.id, { tableNumber: tableNum });
        } else {
          await updateSession(from, targetStore.id, { tableNumber: tableNum, step: shippingConfigured ? 'SERVICE_TYPE_SELECTION' : 'MENU_SELECTION', cart: [] });
        }

        const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://gercep.click'}/${targetStore.slug}?table=${tableNum}`;
        await sendWhatsAppMessage(from, 
          (isRescanSameTable && !isExpired)
            ? l(
                `✅ Kamu sudah check-in di meja *${tableNum}*.\n\nBalas "Menu" untuk lanjut pesan via WhatsApp.\nIngin English? balas: EN`,
                `✅ You are already checked-in at Table *${tableNum}*.\n\nReply "Menu" to continue ordering via WhatsApp.\nWant Indonesian again? reply: ID`
              )
            : (
                shippingConfigured
                  ? l(
                      `👋 Selamat datang di *${targetStore.name}* meja *${tableNum}*!\n\n` +
                        `Pilih tipe order dulu:\n1. Dine In (Makan di tempat)\n2. Takeaway (Ambil sendiri)\n\n` +
                        `Setelah pilih, kamu bisa lanjut pesan via WhatsApp.\n` +
                        `Ingin English? balas: EN`,
                      `👋 Welcome to *${targetStore.name}* at Table *${tableNum}*!\n\n` +
                        `Choose order type first:\n1. Dine In\n2. Takeaway (Pickup)\n\n` +
                        `After selecting, continue ordering via WhatsApp.\n` +
                        `Want Indonesian again? reply: ID`
                    )
                  : l(
                      `👋 Selamat datang di *${targetStore.name}* meja *${tableNum}*!\n\nBalas "Menu" untuk mulai pesan.\nIngin English? balas: EN`,
                      `👋 Welcome to *${targetStore.name}* at Table *${tableNum}*!\n\nReply "Menu" to start ordering.\nWant Indonesian again? reply: ID`
                    )
              ),
          targetStore.id,
          (isRescanSameTable && !isExpired) ? undefined : { buttonText: l("Lihat Menu", "View Menu"), buttonUrl: menuUrl }
        );
        return NextResponse.json({ success: true });
      }

      const orderIntentMatch = textBody.match(/(?:i['’`]?d like to order|would like to order|ingin pesan|mau pesan|start order|mulai pesan|order via whatsapp)/i);
      if (orderIntentMatch) {
        const tableFromText = textBody.match(/(?:table|meja)\s*#?\s*([a-zA-Z0-9\-]+)/i)?.[1] || session.tableNumber || null;
        const isOnSite = !!tableFromText;
        const shippingConfigured = isShippingConfigured(targetStore);
        await updateSession(from, targetStore.id, {
          tableNumber: tableFromText,
          step: shippingConfigured ? 'SERVICE_TYPE_SELECTION' : 'MENU_SELECTION',
          cart: (session.cart as any[]) || []
        });

        const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://gercep.click'}/${targetStore.slug}${tableFromText ? `?table=${tableFromText}` : ''}`;
        await sendWhatsAppMessage(
          from,
          shippingConfigured
            ? l(
                isOnSite
                  ? `👋 Selamat datang di *${targetStore.name}*${tableFromText ? ` meja *${tableFromText}*` : ""}!\n\nPilih tipe order dulu:\n1. Dine In (Makan di tempat)\n2. Takeaway (Ambil sendiri)\n\nSetelah pilih, balas "Menu" untuk mulai pesan.`
                  : `👋 Selamat datang di *${targetStore.name}*!\n\nPilih tipe order dulu:\n1. Takeaway (Ambil sendiri)\n2. Delivery (Diantar ke rumah)\n\nSetelah pilih, balas "Menu" untuk mulai pesan.`,
                isOnSite
                  ? `👋 Welcome to *${targetStore.name}*${tableFromText ? ` at Table *${tableFromText}*` : ""}!\n\nChoose order type first:\n1. Dine In\n2. Takeaway (Pickup)\n\nAfter selecting, reply "Menu" to start ordering.`
                  : `👋 Welcome to *${targetStore.name}*!\n\nChoose order type first:\n1. Takeaway (Pickup)\n2. Delivery\n\nAfter selecting, reply "Menu" to start ordering.`
              )
            : l(
                `👋 Selamat datang di *${targetStore.name}*${tableFromText ? ` meja *${tableFromText}*` : ""}!\n\nBalas "Menu" untuk mulai pesan.`,
                `👋 Welcome to *${targetStore.name}*${tableFromText ? ` at Table *${tableFromText}*` : ""}!\n\nReply "Menu" to start ordering.`
              ),
          targetStore.id,
          { buttonText: l("Lihat Menu", "View Menu"), buttonUrl: menuUrl }
        );
        return NextResponse.json({ success: true });
      }

      if (lowerText === 'pay' || lowerText === 'payment' || lowerText === 'bayar') {
        await updateSession(from, targetStore.id, { step: 'PAYMENT_AMOUNT' });
        await sendWhatsAppMessage(from, l(`Masukkan jumlah pembayaran (contoh 50000).`, `Please enter the amount you want to pay (e.g. 50000).`), targetStore.id);
        return NextResponse.json({ success: true });
      }

      const continueMatch = lowerText?.match(/^(continue|lanjut)(?:\s+#?(\d+))?$/i);
      if (continueMatch) {
        const requestedOrderId = continueMatch[2] ? parseInt(continueMatch[2], 10) : null;
        const pendingOrder = await prisma.order.findFirst({
          where: {
            storeId: targetStore.id,
            customerPhone: from,
            status: "PENDING",
            ...(requestedOrderId ? { id: requestedOrderId } : {})
          },
          orderBy: { createdAt: "desc" }
        });
        if (!pendingOrder) {
          await sendWhatsAppMessage(from, `No pending order found. Reply 'Menu' to create a new order.`, targetStore.id);
          return NextResponse.json({ success: true });
        }
        const paymentUrl = resolvePaymentUrl(pendingOrder.id, pendingOrder.paymentUrl);
        await sendWhatsAppMessage(
          from,
          `🧾 Pending order found: #${pendingOrder.id}\nAmount: Rp ${new Intl.NumberFormat('id-ID').format(pendingOrder.totalAmount)}\n\nTap button below to continue payment.`,
          targetStore.id,
          { buttonText: "Continue Payment", buttonUrl: paymentUrl }
        );
        return NextResponse.json({ success: true });
      }

      const cancelMatch = lowerText?.match(/^(cancel|batal)(?:\s+#?(\d+))?$/i);
      if (cancelMatch) {
        const requestedOrderId = cancelMatch[2] ? parseInt(cancelMatch[2], 10) : null;
        const pendingOrder = await prisma.order.findFirst({
          where: {
            storeId: targetStore.id,
            customerPhone: from,
            status: "PENDING",
            ...(requestedOrderId ? { id: requestedOrderId } : {})
          },
          orderBy: { createdAt: "desc" }
        });
        if (!pendingOrder) {
          await sendWhatsAppMessage(from, `No pending order found to cancel.`, targetStore.id);
          return NextResponse.json({ success: true });
        }
        await prisma.order.update({
          where: { id: pendingOrder.id },
          data: { status: "CANCELLED" }
        });
        await createOrderNotification({
          storeId: targetStore.id,
          orderId: pendingOrder.id,
          message: `Customer membatalkan order #${pendingOrder.id}: ${from} (via WhatsApp)`,
          type: "CUSTOMER_CANCEL"
        }).catch(() => null);
        const storeContact = await prisma.store.findUnique({
          where: { id: targetStore.id },
          include: { owner: true }
        });
        const merchantPhone = storeContact?.whatsapp || storeContact?.owner?.phoneNumber;
        if (merchantPhone) {
          await sendWhatsAppMessage(
            merchantPhone,
            `⚠️ Customer cancelled pending order #${pendingOrder.id} before payment.\nCustomer: ${from}`,
            targetStore.id
          );
        }
        await sendWhatsAppMessage(from, `Order #${pendingOrder.id} has been cancelled.`, targetStore.id);
        return NextResponse.json({ success: true });
      }

      const resiMatch = textBody.match(/^(?:cek\s*resi|check\s*resi|track(?:ing)?)\s*(?:#?(\d+))?$/i);
      if (resiMatch) {
        const requestedOrderId = resiMatch[1] ? parseInt(resiMatch[1], 10) : null;
        const order = await prisma.order.findFirst({
          where: {
            storeId: targetStore.id,
            customerPhone: from,
            ...(requestedOrderId ? { id: requestedOrderId } : {})
          },
          orderBy: { createdAt: "desc" }
        });
        if (!order) {
          await sendWhatsAppMessage(from, l(`Order tidak ditemukan.`, `Order not found.`), targetStore.id);
          return NextResponse.json({ success: true });
        }
        if (!order.shippingProvider || (!order.shippingTrackingNo && !order.biteshipOrderId)) {
          await sendWhatsAppMessage(
            from,
            l(
              `Order #${order.id} belum punya nomor resi.\nStatus: ${order.status}\nBalas "Menu" untuk buat order baru.`,
              `Order #${order.id} does not have a tracking number yet.\nStatus: ${order.status}\nReply "Menu" to create a new order.`
            ),
            targetStore.id
          );
          return NextResponse.json({ success: true });
        }
        const trackingData = order.shippingTrackingNo
          ? await trackShipmentWithBiteship(targetStore, order.shippingTrackingNo, order.shippingProvider.toLowerCase())
          : null;
        const orderData = order.biteshipOrderId ? await getBiteshipOrderStatus(targetStore, order.biteshipOrderId) : null;
        const latestTrackingNo =
          trackingData?.tracking?.waybill_id ||
          trackingData?.tracking?.tracking_id ||
          trackingData?.data?.tracking_id ||
          orderData?.courier?.tracking_id ||
          orderData?.courier?.waybill_id ||
          order.shippingTrackingNo ||
          null;
        const latestStatus =
          trackingData?.tracking?.status ||
          trackingData?.data?.status ||
          trackingData?.status ||
          orderData?.status ||
          order.shippingStatus ||
          "ON_PROCESS";
        const normalizedShippingStatus = normalizeBiteshipStatus(String(latestStatus));
        await prisma.order.update({
          where: { id: order.id },
          data: {
            shippingStatus: normalizedShippingStatus,
            shippingTrackingNo: latestTrackingNo || order.shippingTrackingNo
          }
        }).catch(() => null);
        await sendWhatsAppMessage(
          from,
          l(
            `📦 *Status Pengiriman*\nOrder #${order.id}\nKurir: ${order.shippingProvider}\nLayanan: ${order.shippingService || "-"}\nBiteship ID: ${order.biteshipOrderId || "-"}\nResi: ${latestTrackingNo || "-"}\nStatus: ${normalizedShippingStatus}`,
            `📦 *Shipment Status*\nOrder #${order.id}\nCourier: ${order.shippingProvider}\nService: ${order.shippingService || "-"}\nBiteship ID: ${order.biteshipOrderId || "-"}\nTracking: ${latestTrackingNo || "-"}\nStatus: ${normalizedShippingStatus}`
          ),
          targetStore.id
        );
        return NextResponse.json({ success: true });
      }

      if (lowerText === 'stores' && isSharedNumber) {
         const stores = await prisma.store.findMany({
           take: 10,
           orderBy: { name: 'asc' }
         });
        
        let storeText = `🏪 *Select a Store*:\n\n`;
        stores.forEach((s, index) => {
          storeText += `${index + 1}. ${s.name}\n`;
        });
        storeText += `\nReply with number to select.`;
        
        await sendWhatsAppMessage(from, storeText, targetStore.id);
        await updateSession(from, targetStore.id, { step: 'STORE_SELECTION' });
        return NextResponse.json({ success: true });
      }

      const searchCommandMatch = textBody.match(/^(?:search|find|cari)\s+(.+)$/i);
      if (searchCommandMatch) {
        const query = searchCommandMatch[1].trim();
        if (query.length < 2) {
          await sendWhatsAppMessage(from, l(`Tulis nama produk setelah kata cari, contoh: "Cari nasi goreng".`, `Please provide product name after search, e.g. "Search nasi goreng".`), targetStore.id);
          return NextResponse.json({ success: true });
        }
        const inStockMatches = await prisma.product.findMany({
          where: {
            storeId: targetStore.id,
            name: { contains: query, mode: 'insensitive' },
            stock: { gt: 0 },
            category: { not: "_ARCHIVED_" }
          },
          take: 10,
          orderBy: { name: 'asc' }
        });
        if (inStockMatches.length > 1) {
          const ids = inStockMatches.map((p) => p.id);
          const nextStep = buildOrderingStep(null, ids);
          await updateSession(from, targetStore.id, { step: nextStep });
          let msg = l(`Ada beberapa pilihan untuk *${query}*:\n`, `I found multiple options for *${query}*:\n`);
          inStockMatches.forEach((p, idx) => {
            const vars = getProductVariations(p);
            if (vars.length > 0) {
              msg += `${idx + 1}. ${p.name} (${vars.length} varian)\n`;
            } else {
              msg += `${idx + 1}. ${p.name}\n`;
            }
          });
          msg += l(`\nBalas "Nomor Qty" (contoh "1 1") untuk pesan.`, `\nReply "ItemQty" (e.g. "1 1") to order.`);
          await sendWhatsAppMessage(from, msg, targetStore.id);
          return NextResponse.json({ success: true });
        }
        if (inStockMatches.length === 1) {
          const single = inStockMatches[0];
          const vars = getProductVariations(single);
          if (vars.length > 0) {
            const nextStep = buildVariationSelectStep(single.id, 1, null, [single.id]);
            await updateSession(from, targetStore.id, { step: nextStep });
            let varMsg = l(`Ditemukan: *${single.name}*\nPilih varian:\n`, `Found: *${single.name}*\nChoose variation:\n`);
            vars.forEach((v, idx) => {
              varMsg += `${idx + 1}. ${v.name} - Rp ${new Intl.NumberFormat('id-ID').format(v.price)}\n`;
            });
            varMsg += l(`\nBalas nomor varian (contoh "1").`, `\nReply variation number (e.g. "1").`);
            await sendWhatsAppMessage(from, varMsg, targetStore.id);
          } else {
            const nextStep = buildOrderingStep(null, [single.id]);
            await updateSession(from, targetStore.id, { step: nextStep });
            await sendWhatsAppMessage(from, l(`Ditemukan: *${single.name}*\nBalas "1 1" untuk pesan 1 item.`, `Found: *${single.name}*\nReply "1 1" to order one item.`), targetStore.id);
          }
          return NextResponse.json({ success: true });
        }
        const outOfStockMatches = await prisma.product.findMany({
          where: {
            storeId: targetStore.id,
            name: { contains: query, mode: 'insensitive' },
            stock: { lte: 0 },
            category: { not: "_ARCHIVED_" }
          },
          take: 5,
          orderBy: { name: 'asc' }
        });
        if (outOfStockMatches.length > 0) {
          let outMsg = l(`Maaf, produk berikut sedang habis:\n`, `Sorry, these products are currently out of stock:\n`);
          outOfStockMatches.forEach((p) => {
            outMsg += `- ${p.name}\n`;
          });
          outMsg += l(`\nBalas 'Menu' untuk lihat produk tersedia.`, `\nReply 'Menu' to see available products.`);
          await sendWhatsAppMessage(from, outMsg, targetStore.id);
          return NextResponse.json({ success: true });
        }
        await sendWhatsAppMessage(from, l(`Produk "${query}" tidak ditemukan. Balas 'Menu' untuk lihat daftar.`, `No product found for "${query}". Reply 'Menu' to browse items.`), targetStore.id);
        return NextResponse.json({ success: true });
      }

      if (lowerText === 'menu' || lowerText === 'help' || lowerText === 'bantuan') {
        // --- PLATFORM HELP (Shared Number context) ---
        // We show platform help if:
        // 1. User is on the Shared Number AND
        // 2. They typed 'help' AND
        // 3. They don't have a RECENT active session (scanned < 30m ago) OR they are at START step
        const lastUpdated = session.updatedAt ? new Date(session.updatedAt).getTime() : 0;
        const isSessionRecent = (Date.now() - lastUpdated) < 30 * 60 * 1000;
        const hasCartItems = Array.isArray(session.cart) && session.cart.length > 0;
        
        const isMerchantInUserMode = isMerchant && merchantSession?.step === 'USER_MODE';
        
        // Show platform help if explicitly requested AND not currently in a "hot" session
        if (isSharedNumber && lowerText === 'help') {
          const isSessionRecent = (Date.now() - lastUpdated) < 5 * 60 * 1000; // 5 mins
          const hasCartItems = Array.isArray(session.cart) && session.cart.length > 0;
          const isActivelyOrdering = hasCartItems || (session.step !== 'START' && isSessionRecent);

          if (!isActivelyOrdering || isMerchantInUserMode) {
            const platformHelp = l(
              `👋 *Selamat datang di Gercep!* ⚡\n\n` +
              `Cara pesan di restoran/toko favoritmu:\n` +
              `1. *Scan QR Code* yang ada di meja atau kasir.\n` +
              `2. Kamu akan otomatis masuk ke menu toko tersebut.\n` +
              `3. Pilih makanan/produk & checkout langsung via WhatsApp.\n\n` +
              `🔍 *Cari Toko Lain?*\n` +
              `Balas dengan *"Cari <nama toko>"* (contoh: "Cari Pasar Segar") untuk belanja di toko terdekat.\n\n` +
              `🤖 *Asisten AI*\n` +
              `Kamu juga bisa tanya langsung ke AI kami, contoh: "Ada promo apa hari ini?" atau "Rekomendasi nasi goreng enak".`,
              
              `👋 *Welcome to Gercep!* ⚡\n\n` +
              `How to order from your favorite store:\n` +
              `1. *Scan the QR Code* at the table or cashier.\n` +
              `2. You will automatically see the store's menu.\n` +
              `3. Choose items & checkout directly via WhatsApp.\n\n` +
              `🔍 *Find a Store?*\n` +
              `Reply with *"Find <store name>"* (e.g., "Find Pasar Segar") to shop at nearby stores.\n\n` +
              `🤖 *AI Assistant*\n` +
              `You can also ask our AI, e.g.: "Any promos today?" or "Recommend me some good fried rice."`
            );
            
            await sendWhatsAppMessage(from, platformHelp, targetStore.id);
            return NextResponse.json({ success: true });
          }
        }

        if (session.step === 'START' && isShippingConfigured(targetStore)) {
          const onSite = !!session.tableNumber;
          if (onSite) {
            await updateSession(from, targetStore.id, { step: 'SERVICE_TYPE_SELECTION' });
            await sendWhatsAppMessage(
              from,
              l(
                `Pilih tipe order dulu:\n1. Dine In (Makan di tempat)\n2. Takeaway (Ambil Sendiri)\n\nSetelah pilih, balas "Menu" untuk lanjut.`,
                `Choose order type first:\n1. Dine In\n2. Takeaway (Pickup)\n\nAfter selecting, reply "Menu" to continue.`
              ),
              targetStore.id
            );
          } else {
            // OFF-SITE: Force DELIVERY, no choice needed
            const meta = (session.metadata as any) || {};
            await updateSession(from, targetStore.id, { step: 'MENU_SELECTION', metadata: { ...meta, orderType: "DELIVERY" } });
            await sendWhatsAppMessage(
              from,
              l(
                `✅ Mode Pengiriman (Delivery) aktif karena Anda memesan dari luar lokasi.\n\nBalas "Menu" untuk mulai pesan.`,
                `✅ Delivery mode active (you are ordering from off-site).\n\nReply "Menu" to start ordering.`
              ),
              targetStore.id
            );
          }
          return NextResponse.json({ success: true });
        }
        try {
            const categories = await prisma.category.findMany({
                where: { storeId: targetStore.id },
                orderBy: { name: 'asc' }
            });

            if (categories.length > 0) {
                let catText = `🍽️ *${targetStore.name} Menu*\n\n`;
                catText += l(`Pilih kategori:\n`, `Select a category:\n`);
                catText += l(`1. Semua Menu\n`, `1. All Menu\n`);
                categories.forEach((c, idx) => {
                    catText += `${idx + 2}. ${c.name}\n`;
                });
                catText += l(`\nBalas angka untuk lihat item.\nAtau cari langsung: "Cari nasi goreng".`, `\nReply with number to view items.\nOr search directly: "Search nasi goreng".`);
                
                await updateSession(from, targetStore.id, { step: 'CATEGORY_SELECTION' });
                await sendWhatsAppMessage(from, catText, targetStore.id);
                return NextResponse.json({ success: true });
            }

            await updateSession(from, targetStore.id, { step: 'ORDERING' });

            const products = await prisma.product.findMany({ 
              where: { 
                storeId: targetStore.id, 
                stock: { gt: 0 },
                category: { not: "_ARCHIVED_" }
              },
              take: 10,
              orderBy: { name: 'asc' }
            });

            if (products.length === 0) {
                 await sendWhatsAppMessage(from, l(`Maaf, saat ini belum ada produk yang tersedia.`, `Sorry, there are no in-stock products right now.`), targetStore.id);
                 return NextResponse.json({ success: true });
            }

            const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://gercep.click'}/${targetStore.slug}${session.tableNumber ? `?table=${session.tableNumber}` : ''}`;
            let menuText = `🍽️ *${targetStore.name} Menu* 🍽️\n\n`;
            menuText += l(`👇 *Pesan via WhatsApp*:\n`, `👇 *Order via WhatsApp Text*:\n`);
            
            products.forEach((p, index) => {
              const priceRange = p.variations && Array.isArray(p.variations) && p.variations.length > 0
                ? `${new Intl.NumberFormat('id-ID').format(Math.min(...(p.variations as any[]).map((v:any) => v.price)))} - ${new Intl.NumberFormat('id-ID').format(Math.max(...(p.variations as any[]).map((v:any) => v.price)))}`
                : new Intl.NumberFormat('id-ID').format(p.price);

              menuText += `${index + 1}. ${p.name} - ${priceRange}\n`;
            });
            menuText += l(`\nBalas "Nomor Qty" (contoh '1 2').\nBalas "Nomor Qty Selesai Qris/Bank" (checkout cepat).\nBalas "Cari <produk>" untuk cari nama.\nBalas 'Menu' untuk kembali.`, `\nReply "ItemQty" (e.g. '1 2').\nReply "ItemQty Done Qris/Bank" (Quick Checkout).\nReply "Search <product>" to find by name.\nReply 'Menu' to go back.`);

            await sendWhatsAppMessage(from, menuText, targetStore.id, { buttonText: "Order via Web", buttonUrl: menuUrl });
            return NextResponse.json({ success: true });
        } catch (err) {
            console.error('DEBUG: Error in Menu Handler', err);
            await sendWhatsAppMessage(from, l(`Gagal mengambil menu. Coba lagi.`, `Error fetching menu. Please try again.`), targetStore.id);
            return NextResponse.json({ success: true });
        }
      }

      // 2. STATE BASED HANDLING
      if (session.step === 'CATEGORY_SELECTION') {
          const index = parseInt(textBody) - 1;
          if (isNaN(index)) {
             const query = textBody.trim();
             if (query.length >= 2) {
               const inStockMatches = await prisma.product.findMany({
                 where: {
                   storeId: targetStore.id,
                   name: { contains: query, mode: 'insensitive' },
                   stock: { gt: 0 },
                   category: { not: "_ARCHIVED_" }
                 },
                 take: 10,
                 orderBy: { name: 'asc' }
               });
               if (inStockMatches.length > 0) {
                 const ids = inStockMatches.map((p) => p.id);
                 const nextStep = buildOrderingStep(null, ids);
                 await updateSession(from, targetStore.id, { step: nextStep });
                 let msg = l(`Aku temukan beberapa menu untuk *${query}*:\n`, `I found some menu options for *${query}*:\n`);
                 inStockMatches.forEach((p, idx) => {
                   const vars = getProductVariations(p);
                   msg += vars.length > 0
                     ? `${idx + 1}. ${p.name} (${vars.length} varian)\n`
                     : `${idx + 1}. ${p.name}\n`;
                 });
                 msg += l(`\nBalas "Nomor Qty" (contoh "1 1") untuk pesan.`, `\nReply "ItemQty" (e.g. "1 1") to order.`);
                 await sendWhatsAppMessage(from, msg, targetStore.id);
                 return NextResponse.json({ success: true });
               }
             }
             await sendWhatsAppMessage(from, l(`Pilihan tidak valid. Balas angka kategori atau ketik nama menu seperti "nasi".`, `Invalid selection. Reply with category number or type product keyword like "nasi".`), targetStore.id);
             return NextResponse.json({ success: true });
          }

          let selectedCategorySlug: string | null = null;
          let selectedCategoryLabel: string | null = null;
          if (index === 0) {
              selectedCategorySlug = null;
              selectedCategoryLabel = null;
          } else {
              const categories = await prisma.category.findMany({
                  where: { storeId: targetStore.id },
                  orderBy: { name: 'asc' }
              });
              
              if (index > 0 && index <= categories.length) {
                  selectedCategorySlug = categories[index - 1].slug;
                  selectedCategoryLabel = categories[index - 1].name;
              } else {
                  await sendWhatsAppMessage(from, l(`Pilihan tidak valid. Cek daftar lagi ya.`, `Invalid selection. Please check the list.`), targetStore.id);
                  return NextResponse.json({ success: true });
              }
          }

          const whereClause: any = { storeId: targetStore.id };
          if (selectedCategorySlug) {
              whereClause.category = { equals: selectedCategorySlug, mode: 'insensitive' };
          }

          const products = await prisma.product.findMany({
            where: { 
              ...whereClause, 
              stock: { gt: 0 },
              category: { not: "_ARCHIVED_" }
            },
            take: 10,
            orderBy: { name: 'asc' }
          });

          if (products.length === 0) {
             await sendWhatsAppMessage(from, l(`Tidak ada item tersedia di kategori ini.`, `No in-stock items found in this category.`), targetStore.id);
             return NextResponse.json({ success: true });
          }

          const stepValue = selectedCategorySlug ? `ORDERING:${selectedCategorySlug}` : `ORDERING:ALL`;
          await updateSession(from, targetStore.id, { step: stepValue });

          const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://gercep.click'}/${targetStore.slug}${session.tableNumber ? `?table=${session.tableNumber}` : ''}`;
          let title = selectedCategoryLabel ? `${selectedCategoryLabel}` : l(`Semua Menu`, `All Menu`);
          let menuText = `🍽️ *${title}* 🍽️\n\n`;
          
          products.forEach((p, idx) => {
             const priceRange = p.variations && Array.isArray(p.variations) && p.variations.length > 0
                ? `${new Intl.NumberFormat('id-ID').format(Math.min(...(p.variations as any[]).map((v:any) => v.price)))} - ${new Intl.NumberFormat('id-ID').format(Math.max(...(p.variations as any[]).map((v:any) => v.price)))}`
                : new Intl.NumberFormat('id-ID').format(p.price);
             menuText += `${idx + 1}. ${p.name} - ${priceRange}\n`;
          });
          menuText += l(`\nBalas "Nomor Qty" (contoh '1 2').\nBalas "Nomor Qty Selesai Qris/Bank" (checkout cepat).\nBalas "Cari <produk>" untuk cari nama.\nBalas 'Menu' untuk kembali.`, `\nReply "ItemQty" (e.g. '1 2').\nReply "ItemQty Done Qris/Bank" (Quick Checkout).\nReply "Search <product>" to find by name.\nReply 'Menu' to go back.`);
          
          await sendWhatsAppMessage(from, menuText, targetStore.id, { buttonText: l("Pesan via Web", "Order via Web"), buttonUrl: menuUrl });
          return NextResponse.json({ success: true });
      }

      if (session.step === 'STORE_SELECTION') {
        const index = parseInt(textBody) - 1;
        const stores = await prisma.store.findMany({ take: 10, orderBy: { name: 'asc' } });

        if (index >= 0 && index < stores.length) {
          const selectedStore = stores[index];
          let newSession = await prisma.whatsAppSession.findUnique({
             where: { phoneNumber_storeId: { phoneNumber: from, storeId: selectedStore.id } }
          });

          if (!newSession) {
             newSession = await prisma.whatsAppSession.create({
               data: { phoneNumber: from, storeId: selectedStore.id, step: 'START' }
             });
          } else {
             await prisma.whatsAppSession.update({
               where: { id: newSession.id },
               data: { updatedAt: new Date(), step: 'START' }
             });
          }
          const existingGlobalSession = await prisma.whatsAppSession.findUnique({
            where: { phoneNumber_storeId: { phoneNumber: from, storeId: 0 } }
          });
          await prisma.whatsAppSession
            .upsert({
              where: { phoneNumber_storeId: { phoneNumber: from, storeId: 0 } },
              create: {
                phoneNumber: from,
                storeId: 0,
                step: "START",
                cart: [],
                metadata: {
                  lockedStoreId: selectedStore.id,
                  lockedStoreSlug: selectedStore.slug,
                  lockedStoreAt: new Date().toISOString()
                } as any
              },
              update: {
                metadata: {
                  ...((existingGlobalSession?.metadata as any) || {}),
                  lockedStoreId: selectedStore.id,
                  lockedStoreSlug: selectedStore.slug,
                  lockedStoreAt: new Date().toISOString()
                } as any
              }
            })
            .catch(() => null);
          await sendWhatsAppMessage(from, l(`✅ Berhasil pindah ke *${selectedStore.name}*.\nBalas 'Menu' untuk pesan.`, `✅ Switched to *${selectedStore.name}*.\nReply 'Menu' to order.`), selectedStore.id);
        } else {
          await sendWhatsAppMessage(from, l(`Pilihan tidak valid. Balas dengan angka.`, `Invalid selection. Please reply with a number.`), targetStore.id);
        }
        return NextResponse.json({ success: true });
      }

      if (session.step === 'SERVICE_TYPE_SELECTION') {
        const shippingConfigured = isShippingConfigured(targetStore);
        if (!shippingConfigured) {
          await updateSession(from, targetStore.id, { step: 'MENU_SELECTION' });
          await sendWhatsAppMessage(from, l(`Balas "Menu" untuk mulai pesan.`, `Reply "Menu" to start ordering.`), targetStore.id);
          return NextResponse.json({ success: true });
        }
        const onSite = !!session.tableNumber;
        const meta = (session.metadata as any) || {};
        const input = textBody.trim();
        if (onSite) {
          if (input === "1") {
            await updateSession(from, targetStore.id, { step: 'MENU_SELECTION', metadata: { ...meta, orderType: "DINE_IN" } });
            await sendWhatsAppMessage(from, l(`✅ Dine In dipilih. Balas "Menu" untuk mulai pesan.`, `✅ Dine In selected. Reply "Menu" to start ordering.`), targetStore.id);
          } else if (input === "2") {
            await updateSession(from, targetStore.id, { tableNumber: null, step: 'MENU_SELECTION', metadata: { ...meta, orderType: "TAKEAWAY" } });
            await sendWhatsAppMessage(from, l(`✅ Takeaway dipilih. Balas "Menu" untuk mulai pesan.`, `✅ Takeaway selected. Reply "Menu" to start ordering.`), targetStore.id);
          } else {
            await sendWhatsAppMessage(from, l(`Balas 1 untuk Dine In atau 2 untuk Takeaway.`, `Reply 1 for Dine In or 2 for Takeaway.`), targetStore.id);
          }
        } else {
          if (input === "1") {
            await updateSession(from, targetStore.id, { step: 'MENU_SELECTION', metadata: { ...meta, orderType: "TAKEAWAY" } });
            await sendWhatsAppMessage(from, l(`✅ Takeaway dipilih. Balas "Menu" untuk mulai pesan.`, `✅ Takeaway selected. Reply "Menu" to start ordering.`), targetStore.id);
          } else if (input === "2") {
            await updateSession(from, targetStore.id, { step: 'MENU_SELECTION', metadata: { ...meta, orderType: "DELIVERY" } });
            await sendWhatsAppMessage(from, l(`✅ Delivery dipilih. Balas "Menu" untuk mulai pesan.`, `✅ Delivery selected. Reply "Menu" to start ordering.`), targetStore.id);
          } else {
            await sendWhatsAppMessage(from, l(`Balas 1 untuk Takeaway atau 2 untuk Delivery.`, `Reply 1 for Takeaway or 2 for Delivery.`), targetStore.id);
          }
        }
        return NextResponse.json({ success: true });
      }

      if (session.step && session.step.startsWith('TAKEAWAY_DELIVERY_SELECT:')) {
        const ctx = parseTakeawayDeliveryStep(session.step);
        const input = textBody.trim();
        const inputNorm = input.toLowerCase().replace(/\s+/g, " ").trim();
        const sessionOrderType = String((session.metadata as any)?.orderType || "").toUpperCase();
        const allowPickup = sessionOrderType !== "DELIVERY";
        const onSite = !!session.tableNumber;
        
        let selectedProvider: string | null = null;
        let currentOption = 0;
        
        // --- Option 1: Pickup ---
        if (allowPickup) {
          currentOption++;
          if (input === String(currentOption) || inputNorm === "pickup" || inputNorm === "ambil sendiri") selectedProvider = "PICKUP";
        }
        
        // --- Option 2: Store Courier (Distance-based or Explicitly enabled) ---
        // If customer is within 100m, always show Store Courier
        let isNearStore = false;
        if ((session.metadata as any)?.latitude && (session.metadata as any)?.longitude && targetStore.biteshipOriginLat && targetStore.biteshipOriginLng) {
          const distance = getDistanceMeters(
            parseFloat(String((session.metadata as any).latitude)),
            parseFloat(String((session.metadata as any).longitude)),
            parseFloat(String(targetStore.biteshipOriginLat)),
            parseFloat(String(targetStore.biteshipOriginLng))
          );
          if (distance <= 100) isNearStore = true;
        }

        if (!selectedProvider && (isNearStore || (targetStore as any).shippingEnableStoreCourier)) {
          currentOption++;
          if (input === String(currentOption) || inputNorm === "store_courier" || inputNorm === "kurir toko" || inputNorm === "kurir_toko") selectedProvider = "STORE_COURIER";
        }
        
        // --- Option 3: JNE ---
        if (!selectedProvider && targetStore.shippingEnableJne) {
          currentOption++;
          if (input === String(currentOption) || inputNorm === "jne") selectedProvider = "JNE";
        }
        
        // --- Option 4: GoSend ---
        if (!selectedProvider && targetStore.shippingEnableGosend && !targetStore.shippingJneOnly) {
          currentOption++;
          if (input === String(currentOption) || inputNorm === "gosend" || inputNorm === "go send") selectedProvider = "GOSEND";
        }

        if (selectedProvider === "PICKUP") {
          const meta = (session.metadata as any) || {};
          await updateSession(from, targetStore.id, {
            step: 'ORDERING:ALL',
            metadata: { ...meta, orderType: "TAKEAWAY" },
            cart: (session.cart as any[]) || []
          });
          await sendWhatsAppMessage(from, l(`✅ Pickup dipilih. Balas "Selesai" untuk checkout sekarang.`, `✅ Pickup selected. Reply "Done" to checkout now.`), targetStore.id);
          return NextResponse.json({ success: true });
        }

        if (selectedProvider === "STORE_COURIER") {
          await updateSession(from, targetStore.id, { step: buildTakeawayAddressStep("STORE_COURIER", ctx.method) });
          await sendWhatsAppMessage(from, l(`Kirim alamat lengkap untuk pengiriman Kurir Toko.`, `Please send full delivery address for Store Courier.`), targetStore.id);
          return NextResponse.json({ success: true });
        }

        if (selectedProvider === "JNE") {
          await updateSession(from, targetStore.id, { step: buildTakeawayAddressStep("JNE", ctx.method) });
          await sendWhatsAppMessage(from, l(`Kirim alamat lengkap untuk pengiriman JNE.`, `Please send full delivery address for JNE shipment.`), targetStore.id);
          return NextResponse.json({ success: true });
        }

        if (selectedProvider === "GOSEND") {
          await updateSession(from, targetStore.id, { step: buildTakeawayAddressStep("GOSEND", ctx.method) });
          await sendWhatsAppMessage(from, l(`Kirim alamat lengkap untuk pengiriman GoSend.`, `Please send full delivery address for GoSend delivery.`), targetStore.id);
          return NextResponse.json({ success: true });
        }

        let optionsMsg = l(`Pilihan tidak valid. Pilih opsi:`, `Invalid choice. Choose an option:`);
        let optionCount = 0;
        const quickReplies: Array<{ id: string; title: string }> = [];
        if (allowPickup) {
          optionCount++;
          optionsMsg += `\n${optionCount}. Pickup (Ambil Sendiri)`;
          quickReplies.push({ id: "PICKUP", title: "Pickup" });
        }
        if (isNearStore || (targetStore as any).shippingEnableStoreCourier) {
          optionCount++;
          optionsMsg += `\n${optionCount}. Kurir Toko (Store Courier)`;
          quickReplies.push({ id: "STORE_COURIER", title: "Kurir Toko" });
        }
        if (targetStore.shippingEnableJne) {
          optionCount++;
          optionsMsg += `\n${optionCount}. JNE`;
          quickReplies.push({ id: "JNE", title: "JNE" });
        }
        if (targetStore.shippingEnableGosend && !targetStore.shippingJneOnly) {
          optionCount++;
          optionsMsg += `\n${optionCount}. GoSend`;
          quickReplies.push({ id: "GOSEND", title: "GoSend" });
        }
        if (quickReplies.length > 3) {
          await sendWhatsAppMessage(from, optionsMsg, targetStore.id, {
            list: {
              buttonText: l("Pilih Pengiriman", "Choose Shipping"),
              sections: [
                {
                  title: l("Opsi Pengiriman", "Shipping Options"),
                  rows: quickReplies.slice(0, 10).map((q) => ({ id: q.id, title: q.title }))
                }
              ]
            }
          });
        } else {
          await sendWhatsAppMessage(from, optionsMsg, targetStore.id, {
            quickReplies
          });
        }
        return NextResponse.json({ success: true });
      }

      if (session.step && session.step.startsWith('TAKEAWAY_ADDRESS:')) {
        const ctx = parseTakeawayAddressStep(session.step);
        if (!ctx) {
          await updateSession(from, targetStore.id, { step: 'ORDERING:ALL' });
          await sendWhatsAppMessage(from, l(`Sesi pengiriman tidak valid, balas "Menu".`, `Invalid shipping session, reply "Menu".`), targetStore.id);
          return NextResponse.json({ success: true });
        }
        const cart = (session.cart as any[]) || [];
        if (cart.length === 0) {
          await updateSession(from, targetStore.id, { step: 'START' });
          await sendWhatsAppMessage(from, l(`Keranjang kosong. Balas "Menu" untuk pesan lagi.`, `Your cart is empty. Reply "Menu" to order again.`), targetStore.id);
          return NextResponse.json({ success: true });
        }
        const addressText = (textBody || "").trim();
        if (addressText.length < 8) {
          await sendWhatsAppMessage(from, l(`Alamat terlalu singkat. Mohon kirim alamat lengkap.`, `Address is too short. Please provide full address.`), targetStore.id);
          return NextResponse.json({ success: true });
        }

        if (ctx.provider === "GOSEND") {
          await updateSession(from, targetStore.id, { step: buildTakeawayGosendLocationStep(ctx.method, addressText), cart });
          await sendWhatsAppMessage(
            from,
            l(
              `📍 Untuk GoSend, mohon *kirim lokasi (Share Location)* kamu agar ongkir bisa dihitung.\n\nSetelah kirim lokasi, kami akan lanjut proses ongkir & checkout.`,
              `📍 For GoSend, please *share your location* so we can calculate shipping.\n\nAfter you send location, we will continue checkout.`
            ),
            targetStore.id
          );
          return NextResponse.json({ success: true });
        }
        const shippingOptions = await getShippingQuoteFromBiteship({
          store: targetStore,
          destinationAddress: addressText
        });

        // Add Store Courier manually if enabled (Biteship won't return it)
        if ((targetStore as any).shippingEnableStoreCourier) {
          shippingOptions.unshift({
            provider: "STORE_COURIER",
            service: "Kurir Toko",
            fee: Number((targetStore as any).shippingStoreCourierFee || 0),
            eta: "15-30 min",
            type: "instant"
          });
        }

        const selected = shippingOptions.find((opt) => opt.provider === ctx.provider);
        if (!selected) {
          await updateSession(from, targetStore.id, { step: buildTakeawayDeliveryStep(ctx.method), cart });
          let optionsMsg = l(`Kurir tidak tersedia untuk alamat ini. Pilih pengiriman:\n1. Pickup (Ambil Sendiri)`, `Courier is not available for this address. Choose shipping:\n1. Pickup (Self-pickup)`);
          let optionCount = 1;
          if (targetStore.shippingEnableGosend && !targetStore.shippingJneOnly) {
            optionCount++;
            optionsMsg += `\n${optionCount}. GoSend`;
          }
          if (targetStore.shippingEnableJne) {
            optionCount++;
            optionsMsg += `\n${optionCount}. JNE`;
          }
          await sendWhatsAppMessage(from, optionsMsg, targetStore.id);
          return NextResponse.json({ success: true });
        }
        const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const taxAmount = total * (targetStore.taxPercent / 100);
        const serviceCharge = total * (targetStore.serviceChargePercent / 100);
        const subtotalWithTaxService = total + taxAmount + serviceCharge;
        let fee = 0;
        if (targetStore.feePaidBy === 'CUSTOMER') {
          if (ctx.method === 'qris' && targetStore.qrisFeePercent) fee = subtotalWithTaxService * (Number(targetStore.qrisFeePercent) / 100);
          else if (ctx.method === 'bank_transfer' && targetStore.manualTransferFee) fee = Number(targetStore.manualTransferFee);
        }
        const shippingCost = Number(selected?.fee || 0);
        const finalTotal = subtotalWithTaxService + fee + shippingCost;
        let order = await prisma.order.create({
          data: {
            storeId: targetStore.id,
            customerPhone: from,
            totalAmount: finalTotal,
            taxAmount,
            serviceCharge,
            paymentFee: fee,
            status: 'PENDING',
            orderType: 'TAKEAWAY',
            shippingProvider: ctx.provider,
            shippingService: ctx.provider === "STORE_COURIER" ? "KURIR_TOKO" : (selected?.service || "-"),
            shippingStatus: ctx.provider === "STORE_COURIER" ? "STORE_COURIER" : 'QUOTE_READY',
            shippingAddress: addressText,
            shippingCost,
            shippingEta: selected?.eta || "-",
            items: { create: cart.map(item => ({ productId: item.productId, quantity: item.qty, price: item.price })) }
          }
        });
        
        // Skip Biteship draft if Store Courier
        if (ctx.provider !== "STORE_COURIER") {
          const draft = await createBiteshipDraftForPendingOrder({
            store: targetStore,
            order,
            items: cart.map((item) => ({
              name: item.name,
              quantity: item.qty,
              price: item.price
            }))
          });
          if (draft?.ok && draft?.draftOrderId) {
            const pendingDraft = draft as any;
            order = await prisma.order.update({
              where: { id: order.id },
              data: {
                biteshipOrderId: pendingDraft.draftOrderId,
                shippingStatus: pendingDraft.shippingStatus || order.shippingStatus || "draft_created"
              }
            });
          }
        }

        let itemsMsg = "";
        cart.forEach(item => { itemsMsg += `- ${item.name} x${item.qty}\n`; });

        await createOrderNotification({
          storeId: targetStore.id,
          orderId: order.id,
          message: `Order takeaway #${order.id} menunggu pembayaran: ${from} • Rp ${new Intl.NumberFormat('id-ID').format(finalTotal)}`,
          type: "WHATSAPP_ORDER"
        }).catch(() => null);

        const merchantMsg = await buildOrderMerchantSummary(order.id, "Order Pending");
        await sendMerchantWhatsApp(targetStore.id, merchantMsg, order.id).catch(() => null);

        const paymentLink = await createPaymentLink(order.id, finalTotal, from, targetStore.id, ctx.method as any);
        let summary = l("🧾 *Ringkasan Order*\n", "🧾 *Order Summary*\n");
        cart.forEach(item => { summary += `- ${item.name} x${item.qty} = ${new Intl.NumberFormat('id-ID').format(item.price * item.qty)}\n`; });
        summary += `\n------------------\nSubtotal: Rp ${new Intl.NumberFormat('id-ID').format(total)}\n`;
        if (taxAmount > 0) summary += `Tax (${targetStore.taxPercent}%): Rp ${new Intl.NumberFormat('id-ID').format(taxAmount)}\n`;
        if (serviceCharge > 0) summary += `Service (${targetStore.serviceChargePercent}%): Rp ${new Intl.NumberFormat('id-ID').format(serviceCharge)}\n`;
        summary += `${l("Biaya", "Fee")} (${ctx.method === 'qris' ? 'QRIS' : 'Bank Transfer'}): Rp ${new Intl.NumberFormat('id-ID').format(fee)}\n`;
        summary += l("Ongkir", "Shipping");
        if (selected?.provider === "STORE_COURIER") {
          summary += " (Kurir Toko)";
        } else {
          const pName = (selected?.provider || ctx.provider) === 'GOSEND' ? 'Gosend' : (selected?.provider || ctx.provider);
          summary += ` (${pName}${selected?.service ? ` ${selected.service}` : ""})`;
        }
        summary += `: Rp ${new Intl.NumberFormat('id-ID').format(shippingCost)}\n`;
        summary += `${l("Estimasi", "ETA")}: ${selected?.eta || "-"}\n`;
        summary += `\n*Total: Rp ${new Intl.NumberFormat('id-ID').format(finalTotal)}*`;
        await sendWhatsAppMessage(from, summary, targetStore.id, { buttonText: l("Bayar Sekarang", "Pay Now"), buttonUrl: paymentLink });
        await updateSession(from, targetStore.id, { step: 'START', cart: [] });
        return NextResponse.json({ success: true });
      }

      if (session.step === 'MENU_SELECTION') {
        if (textBody === '1') {
          const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://gercep.click'}/${targetStore.slug}?table=${session.tableNumber}`;
          await sendWhatsAppMessage(from, l(`Klik tombol di bawah untuk lihat menu dan pesan lewat web:`, `Click the button below to view the menu and order on the web:`), targetStore.id, { buttonText: l("Lihat Menu", "View Menu"), buttonUrl: menuUrl });
          await updateSession(from, targetStore.id, { step: 'START' });
        } else if (textBody === '2') {
          const categories = await prisma.category.findMany({ where: { storeId: targetStore.id }, orderBy: { name: 'asc' } });
          if (categories.length > 0) {
            let catText = `🍽️ *${targetStore.name} Menu*\n\n${l(`Pilih kategori:`, `Select a category:`)}\n${l(`1. Semua Menu`, `1. All Menu`)}\n`;
            categories.forEach((c, idx) => { catText += `${idx + 2}. ${c.name}\n`; });
            catText += l(`\nBalas angka untuk lihat item.\nAtau cari langsung: "Cari nasi goreng".`, `\nReply with number to view items.\nOr search directly: "Search nasi goreng".`);
            await updateSession(from, targetStore.id, { step: 'CATEGORY_SELECTION' });
            await sendWhatsAppMessage(from, catText, targetStore.id);
            return NextResponse.json({ success: true });
          }
          await updateSession(from, targetStore.id, { step: 'ORDERING' });
          const products = await prisma.product.findMany({ where: { storeId: targetStore.id, stock: { gt: 0 } }, take: 10, orderBy: { name: 'asc' } });
          if (products.length === 0) {
            await sendWhatsAppMessage(from, l(`Maaf, saat ini belum ada produk yang tersedia.`, `Sorry, there are no in-stock products right now.`), targetStore.id);
            return NextResponse.json({ success: true });
          }
          const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://gercep.click'}/${targetStore.slug}${session.tableNumber ? `?table=${session.tableNumber}` : ''}`;
          let menuText = `🍽️ *${targetStore.name} Menu* 🍽️\n\n${l(`👇 *Pesan via WhatsApp*:\n`, `👇 *Order via WhatsApp Text*:\n`)}`;
          products.forEach((p, index) => {
            const priceRange = p.variations && Array.isArray(p.variations) && p.variations.length > 0
              ? `${new Intl.NumberFormat('id-ID').format(Math.min(...(p.variations as any[]).map((v:any) => v.price)))} - ${new Intl.NumberFormat('id-ID').format(Math.max(...(p.variations as any[]).map((v:any) => v.price)))}`
              : new Intl.NumberFormat('id-ID').format(p.price);
            menuText += `${index + 1}. ${p.name} - ${priceRange}\n`;
          });
          menuText += l(`\nBalas "Nomor Qty" (contoh '1 2').\nBalas "Nomor Qty Selesai Qris/Bank" (checkout cepat).\nBalas "Cari <produk>" untuk cari nama.\nBalas 'Menu' untuk kembali.`, `\nReply "ItemQty" (e.g. '1 2').\nReply "ItemQty Done Qris/Bank" (Quick Checkout).\nReply "Search <product>" to find by name.\nReply 'Menu' to go back.`);
          await sendWhatsAppMessage(from, menuText, targetStore.id, { buttonText: l("Pesan via Web", "Order via Web"), buttonUrl: menuUrl });
        } else if (textBody === '3') {
          await updateSession(from, targetStore.id, { step: 'PAYMENT_AMOUNT' });
          await sendWhatsAppMessage(from, l(`Masukkan jumlah pembayaran (contoh 50000).`, `Please enter the amount you want to pay (e.g. 50000).`), targetStore.id);
        } else {
          await sendWhatsAppMessage(from, l(`Opsi tidak valid. Balas 1, 2, atau 3.`, `Invalid option. Reply 1, 2, or 3.`), targetStore.id);
        }
        return NextResponse.json({ success: true });
      }

      if (session.step && session.step.startsWith('VARIATION_SELECT:')) {
        const variationCtx = parseVariationSelectStep(session.step);
        if (!variationCtx) {
          await updateSession(from, targetStore.id, { step: 'ORDERING:ALL' });
          await sendWhatsAppMessage(from, l(`Sesi varian tidak valid. Balas "Menu" lalu pilih lagi.`, `Invalid variation session. Reply "Menu" and choose again.`), targetStore.id);
          return NextResponse.json({ success: true });
        }
        const product = await prisma.product.findFirst({
          where: { id: variationCtx.productId, storeId: targetStore.id, stock: { gt: 0 } }
        });
        if (!product) {
          await updateSession(from, targetStore.id, { step: buildOrderingStep(variationCtx.category, variationCtx.searchIds) });
          await sendWhatsAppMessage(from, l(`Produk tidak tersedia. Balas "Menu" untuk pilih menu lain.`, `Product is not available. Reply "Menu" to pick another item.`), targetStore.id);
          return NextResponse.json({ success: true });
        }
        const vars = getProductVariations(product);
        if (vars.length === 0) {
          const currentCart = (session.cart as any[]) || [];
          currentCart.push({ productId: product.id, name: product.name, price: product.price, qty: variationCtx.qty });
          await updateSession(from, targetStore.id, { step: buildOrderingStep(variationCtx.category, variationCtx.searchIds), cart: currentCart });
          await sendWhatsAppMessage(from, l(`Ditambahkan ke keranjang:\n- ${variationCtx.qty}x ${product.name}\n\nBalas "Selesai" untuk checkout atau lanjut pilih item lain.`, `Added to cart:\n- ${variationCtx.qty}x ${product.name}\n\nReply "Done" to checkout or continue selecting items.`), targetStore.id);
          return NextResponse.json({ success: true });
        }
        const choice = parseInt(textBody.trim(), 10);
        if (isNaN(choice) || choice < 1 || choice > vars.length) {
          let retryMsg = l(`Pilihan varian tidak valid. Pilih angka varian:\n`, `Invalid variation selection. Choose variation number:\n`);
          vars.forEach((v, idx) => {
            retryMsg += `${idx + 1}. ${v.name} - Rp ${new Intl.NumberFormat('id-ID').format(v.price)}\n`;
          });
          await sendWhatsAppMessage(from, retryMsg, targetStore.id);
          return NextResponse.json({ success: true });
        }
        const selectedVar = vars[choice - 1];
        const currentCart = (session.cart as any[]) || [];
        currentCart.push({
          productId: product.id,
          name: `${product.name} (${selectedVar.name})`,
          price: selectedVar.price,
          qty: variationCtx.qty,
          variationName: selectedVar.name
        });
        await updateSession(from, targetStore.id, {
          step: buildOrderingStep(variationCtx.category, variationCtx.searchIds),
          cart: currentCart
        });
        await sendWhatsAppMessage(
          from,
          l(
            `Ditambahkan ke keranjang:\n- ${variationCtx.qty}x ${product.name} (${selectedVar.name})\n\nBalas "Selesai Qris/Bank" untuk checkout atau lanjut pilih item.`,
            `Added to cart:\n- ${variationCtx.qty}x ${product.name} (${selectedVar.name})\n\nReply "Done Qris/Bank" to checkout or continue ordering.`
          ),
          targetStore.id
        );
        return NextResponse.json({ success: true });
      }

      if (session.step === 'PAYMENT_AMOUNT') {
        const cleanAmount = textBody.replace(/[^\d]/g, '');
        const amount = parseInt(cleanAmount);
        if (!isNaN(amount) && amount > 0) {
          try {
            const order = await prisma.order.create({
              data: { storeId: targetStore.id, customerPhone: from, totalAmount: amount, status: 'PENDING' }
            });
            await createOrderNotification({
              storeId: targetStore.id,
              orderId: order.id,
              message: `Order #${order.id} menunggu pembayaran: ${from} • Rp ${new Intl.NumberFormat('id-ID').format(amount)}`,
              type: "WHATSAPP_ORDER"
            });

            const merchantMsg = await buildOrderMerchantSummary(order.id, "Order Pending");
            await sendMerchantWhatsApp(targetStore.id, merchantMsg, order.id).catch(() => null);

            const paymentLink = await createPaymentLink(order.id, amount, from, targetStore.id);
            await sendWhatsAppMessage(
              from,
              l(
                `Order #${order.id} berhasil dibuat.\nJumlah: Rp ${new Intl.NumberFormat('id-ID').format(amount)}\n\n⏳ Link pembayaran bisa kedaluwarsa. Mohon selesaikan segera.`,
                `Order #${order.id} Created.\nAmount: Rp ${new Intl.NumberFormat('id-ID').format(amount)}\n\n⏳ Payment links can expire. Please complete payment soon.`
              ),
              targetStore.id,
              { buttonText: l("Bayar Sekarang", "Pay Now"), buttonUrl: paymentLink }
            );
            await updateSession(from, targetStore.id, { step: 'START' });
          } catch (e) {
            await sendWhatsAppMessage(from, l(`Gagal membuat order. Coba lagi ya.`, `Error creating order. Please try again.`), targetStore.id);
          }
        } else {
          await sendWhatsAppMessage(from, l(`Nominal tidak valid. Masukkan angka (contoh 50000).`, `Invalid amount. Please enter a number (e.g. 50000).`), targetStore.id);
        }
        return NextResponse.json({ success: true });
      }

      if (session.step && session.step.startsWith('ORDERING')) {
        const orderingContext = parseOrderingStep(session.step);
        const currentCategory = orderingContext.category;
        const searchIds = orderingContext.searchIds;

        if (lowerText === 'done' || lowerText === 'checkout' || lowerText === 'done qris' || lowerText === 'selesai' || lowerText === 'selesai qris') {
          const cart = (session.cart as any[]) || [];
          if (cart.length === 0) {
            await sendWhatsAppMessage(from, l(`Keranjang kamu masih kosong. Balas 'Menu' untuk lihat item.`, `Your cart empty. Reply 'Menu' to see items.`), targetStore.id);
            return NextResponse.json({ success: true });
          }
          const stockCheck = await validateCartStock(targetStore.id, cart);
          if (!stockCheck.ok) {
            await sendWhatsAppMessage(from, l(`Beberapa item tidak tersedia:\n- ${stockCheck.issues.join('\n- ')}\n\nSilakan ubah order kamu. Balas 'Menu' untuk muat ulang item tersedia.`, `Some items are unavailable:\n- ${stockCheck.issues.join('\n- ')}\n\nPlease update your order. Reply 'Menu' to refresh in-stock items.`), targetStore.id);
            return NextResponse.json({ success: true });
          }

          const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
          let method = 'qris'; // Always QRIS as manual transfer is removed

          const shippingConfigured = isShippingConfigured(targetStore);
          const sessionOrderType = String(((session.metadata as any)?.orderType || (session.tableNumber ? "DINE_IN" : "TAKEAWAY"))).toUpperCase();
          if (sessionOrderType === "DELIVERY" && shippingConfigured) {
            let optionsMsg = l(`Pilih kurir pengiriman:`, `Choose delivery courier:`);
            let optionCount = 0;
            if ((targetStore as any).shippingEnableStoreCourier) {
              optionCount++;
              optionsMsg += `\n${optionCount}. Kurir Toko`;
            }
            if (targetStore.shippingEnableJne) {
              optionCount++;
              optionsMsg += `\n${optionCount}. JNE`;
            }
            if (targetStore.shippingEnableGosend && !targetStore.shippingJneOnly) {
              optionCount++;
              optionsMsg += `\n${optionCount}. GoSend`;
            }
            await updateSession(from, targetStore.id, { step: buildTakeawayDeliveryStep(method), cart });
            await sendWhatsAppMessage(from, optionsMsg, targetStore.id);
            return NextResponse.json({ success: true });
          }

          const taxAmount = total * (targetStore.taxPercent / 100);
          const serviceCharge = total * (targetStore.serviceChargePercent / 100);
          const subtotalWithTaxService = total + taxAmount + serviceCharge;

          let fee = 0;
          if (targetStore.feePaidBy === 'CUSTOMER') {
              if (method === 'qris' && targetStore.qrisFeePercent) fee = subtotalWithTaxService * (Number(targetStore.qrisFeePercent) / 100);
              else if (method === 'bank_transfer' && targetStore.manualTransferFee) fee = Number(targetStore.manualTransferFee);
          }
          
          const finalTotal = subtotalWithTaxService + fee;
          const order = await prisma.order.create({
            data: {
              storeId: targetStore.id,
              customerPhone: from,
              totalAmount: finalTotal,
              taxAmount: taxAmount,
              serviceCharge: serviceCharge,
              paymentFee: fee,
              status: 'PENDING',
              orderType: sessionOrderType,
              tableNumber: session.tableNumber,
              items: { create: cart.map(item => ({ productId: item.productId, quantity: item.qty, price: item.price })) }
            }
          });
          await createOrderNotification({
            storeId: targetStore.id,
            orderId: order.id,
            message: `Order #${order.id} menunggu pembayaran: ${from}${session.tableNumber ? ` (Meja ${session.tableNumber})` : ""} • Rp ${new Intl.NumberFormat('id-ID').format(finalTotal)}`,
            type: "WHATSAPP_ORDER"
          });

          const merchantMsg = await buildOrderMerchantSummary(order.id, "Order Pending");
          console.log(`[WHATSAPP_CHECKOUT] Triggering merchant alert for order #${order.id}`);
          await sendMerchantWhatsApp(targetStore.id, merchantMsg, order.id).catch((e) => console.error("[WHATSAPP_CHECKOUT_ALERT_ERROR]", e));

          const paymentLink = await createPaymentLink(order.id, finalTotal, from, targetStore.id, method);
          let summary = l("🧾 *Ringkasan Order*\n", "🧾 *Order Summary*\n");
          cart.forEach(item => { summary += `- ${item.name} x${item.qty} = ${new Intl.NumberFormat('id-ID').format(item.price * item.qty)}\n`; });
          summary += `\n------------------\nSubtotal: Rp ${new Intl.NumberFormat('id-ID').format(total)}\n`;
          if (taxAmount > 0) summary += `Tax (${targetStore.taxPercent}%): Rp ${new Intl.NumberFormat('id-ID').format(taxAmount)}\n`;
          if (serviceCharge > 0) summary += `Service (${targetStore.serviceChargePercent}%): Rp ${new Intl.NumberFormat('id-ID').format(serviceCharge)}\n`;
          if (fee > 0) summary += `Fee (${method === 'qris' ? 'QRIS' : 'Bank'}): Rp ${new Intl.NumberFormat('id-ID').format(fee)}\n`;
          summary += `\n*Total: Rp ${new Intl.NumberFormat('id-ID').format(finalTotal)}*`;
          summary += l("\n\n⏳ Link pembayaran bisa kedaluwarsa. Mohon selesaikan segera.", "\n\n⏳ Payment links can expire. Please complete payment soon.");

          await sendWhatsAppMessage(from, summary, targetStore.id, { buttonText: l("Bayar Sekarang", "Pay Now"), buttonUrl: paymentLink });
          await updateSession(from, targetStore.id, { step: 'START', cart: [] });
          return NextResponse.json({ success: true });
        }

        const orderParts = textBody.split(',').map((p: string) => p.trim());
        const validOrders: { index: number, qty: number }[] = [];
        let quickCheckoutMethod: string | undefined = undefined;

        for (const part of orderParts) {
            const itemMatch = part.match(/^(\d+)\s+(\d+)(?:\s+done\s+(\w+))?$/i);
            if (itemMatch) {
                validOrders.push({ index: parseInt(itemMatch[1]) - 1, qty: parseInt(itemMatch[2]) });
                if (itemMatch[3]) quickCheckoutMethod = itemMatch[3].toLowerCase();
            }
        }
        
        const isCheckoutCommand = lowerText.includes('done') || lowerText.includes('checkout') || lowerText.includes('selesai');
        if (isCheckoutCommand && !quickCheckoutMethod) {
            if (lowerText.includes('qris')) quickCheckoutMethod = 'qris';
            else if (lowerText.includes('bank')) quickCheckoutMethod = 'bank_transfer';
        }
        if (quickCheckoutMethod === 'bank') quickCheckoutMethod = 'bank_transfer';

        if (validOrders.length === 0 && !isCheckoutCommand) {
          const query = textBody.trim();
          if (query.length >= 2) {
            const searchWhere: any = {
              storeId: targetStore.id,
              name: { contains: query, mode: 'insensitive' }
            };
            if (currentCategory) {
              searchWhere.category = { equals: currentCategory, mode: 'insensitive' };
            }
            const inStockMatches = await prisma.product.findMany({
              where: { ...searchWhere, stock: { gt: 0 } },
              take: 10,
              orderBy: { name: 'asc' }
            });
            if (inStockMatches.length > 1) {
              const ids = inStockMatches.map((p) => p.id);
              const nextStep = buildOrderingStep(currentCategory, ids);
              await updateSession(from, targetStore.id, { step: nextStep });
              let matchText = l(`Ada beberapa pilihan untuk *${query}*:\n`, `I found multiple options for *${query}*:\n`);
              inStockMatches.forEach((p, idx) => {
                const vars = getProductVariations(p);
                matchText += vars.length > 0
                  ? `${idx + 1}. ${p.name} (${vars.length} varian)\n`
                  : `${idx + 1}. ${p.name}\n`;
              });
              matchText += l(`\nBalas "Nomor Qty" (contoh "1 2") untuk pesan.`, `\nReply "ItemQty" (e.g. "1 2") to order.`);
              await sendWhatsAppMessage(from, matchText, targetStore.id);
              return NextResponse.json({ success: true });
            }
            if (inStockMatches.length === 1) {
              const single = inStockMatches[0];
              const vars = getProductVariations(single);
              if (vars.length > 0) {
                const nextStep = buildVariationSelectStep(single.id, 1, currentCategory, [single.id]);
                await updateSession(from, targetStore.id, { step: nextStep });
                let varMsg = l(`Ditemukan: *${single.name}*\nPilih varian:\n`, `Found: *${single.name}*\nChoose variation:\n`);
                vars.forEach((v, idx) => {
                  varMsg += `${idx + 1}. ${v.name} - Rp ${new Intl.NumberFormat('id-ID').format(v.price)}\n`;
                });
                varMsg += l(`\nBalas nomor varian (contoh "1").`, `\nReply variation number (e.g. "1").`);
                await sendWhatsAppMessage(from, varMsg, targetStore.id);
              } else {
                const ids = [single.id];
                const nextStep = buildOrderingStep(currentCategory, ids);
                await updateSession(from, targetStore.id, { step: nextStep });
                await sendWhatsAppMessage(from, l(`Ditemukan: *${single.name}*\nBalas "1 1" untuk pesan satu, atau ubah qty sesuai kebutuhan.`, `Found: *${single.name}*\nReply "1 1" to order one, or change quantity as needed.`), targetStore.id);
              }
              return NextResponse.json({ success: true });
            }
            const outOfStockMatches = await prisma.product.findMany({
              where: { ...searchWhere, stock: { lte: 0 } },
              take: 5,
              orderBy: { name: 'asc' }
            });
            if (outOfStockMatches.length > 0) {
              let outMsg = l(`Maaf, produk berikut sedang habis:\n`, `Sorry, these products are currently out of stock:\n`);
              outOfStockMatches.forEach((p) => {
                outMsg += `- ${p.name}\n`;
              });
              outMsg += l(`\nBalas 'Menu' untuk lihat item yang tersedia.`, `\nReply 'Menu' to see available items.`);
              await sendWhatsAppMessage(from, outMsg, targetStore.id);
              return NextResponse.json({ success: true });
            }
          }
        }

        if (validOrders.length > 0) {
          const products = await getOrderableProducts(targetStore.id, currentCategory, searchIds);
          const currentCart = (session.cart as any[]) || [];
          let addedItemsMsg = "";
          let outOfStockMsg = "";

          for (const order of validOrders) {
             if (order.index >= 0 && order.index < products.length && order.qty > 0) {
                const product = products[order.index];
                const vars = getProductVariations(product);
                if (Number(product.stock) <= 0) {
                  outOfStockMsg += `- ${product.name} is out of stock\n`;
                  continue;
                }
                if (order.qty > Number(product.stock)) {
                  outOfStockMsg += `- ${product.name} only has ${product.stock} left\n`;
                  continue;
                }
                if (vars.length > 0) {
                  const nextStep = buildVariationSelectStep(product.id, order.qty, currentCategory, searchIds);
                  await updateSession(from, targetStore.id, { step: nextStep, cart: currentCart });
                  let varMsg = l(`*${product.name}* punya beberapa varian.\nPilih varian dulu:\n`, `*${product.name}* has variations.\nPlease choose one first:\n`);
                  vars.forEach((v, idx) => {
                    varMsg += `${idx + 1}. ${v.name} - Rp ${new Intl.NumberFormat('id-ID').format(v.price)}\n`;
                  });
                  varMsg += l(`\nBalas nomor varian (contoh "1").`, `\nReply variation number (e.g. "1").`);
                  await sendWhatsAppMessage(from, varMsg, targetStore.id);
                  return NextResponse.json({ success: true });
                }
                currentCart.push({ productId: product.id, name: product.name, price: product.price, qty: order.qty });
                addedItemsMsg += `- ${order.qty}x ${product.name}\n`;
             }
          }

          if (addedItemsMsg) {
             await updateSession(from, targetStore.id, { cart: currentCart });
             if (isCheckoutCommand) {
                 const stockCheck = await validateCartStock(targetStore.id, currentCart);
                 if (!stockCheck.ok) {
                     await sendWhatsAppMessage(from, `Some items are unavailable:\n- ${stockCheck.issues.join('\n- ')}\n\nPlease update your order. Reply 'Menu' to refresh in-stock items.`, targetStore.id);
                     return NextResponse.json({ success: true });
                 }
                 const total = currentCart.reduce((sum: number, item: any) => sum + (item.price * item.qty), 0);
                 const shippingConfigured = targetStore.enableTakeawayDelivery && (targetStore.shippingEnableJne || (targetStore.shippingEnableGosend && !targetStore.shippingJneOnly));
                 if (!session.tableNumber && shippingConfigured) {
                     let optionsMsg = l(`Pilih pengiriman:\n1. Pickup (Ambil Sendiri)`, `Choose shipping:\n1. Pickup (Self-pickup)`);
                     let optionCount = 1;

                     if (targetStore.shippingEnableJne) {
                       optionCount++;
                       optionsMsg += `\n${optionCount}. JNE`;
                     }

                     if (targetStore.shippingEnableGosend && !targetStore.shippingJneOnly) {
                       optionCount++;
                       optionsMsg += `\n${optionCount}. GoSend`;
                     }

                     await updateSession(from, targetStore.id, { step: buildTakeawayDeliveryStep(quickCheckoutMethod), cart: currentCart });
                     await sendWhatsAppMessage(from, optionsMsg, targetStore.id);
                     return NextResponse.json({ success: true });
                 }
                 const taxAmount = total * (targetStore.taxPercent / 100);
                 const serviceCharge = total * (targetStore.serviceChargePercent / 100);
                 const subtotalWithTaxService = total + taxAmount + serviceCharge;
                 let fee = 0;
                 if (targetStore.feePaidBy === 'CUSTOMER') {
                     if (quickCheckoutMethod === 'qris' && targetStore.qrisFeePercent) fee = subtotalWithTaxService * (Number(targetStore.qrisFeePercent) / 100);
                     else if (quickCheckoutMethod === 'bank_transfer' && targetStore.manualTransferFee) fee = Number(targetStore.manualTransferFee);
                 }
                 const finalTotal = subtotalWithTaxService + fee;
                 const order = await prisma.order.create({
                    data: {
                      storeId: targetStore.id,
                      customerPhone: from,
                      totalAmount: finalTotal,
                      taxAmount: taxAmount,
                      serviceCharge: serviceCharge,
                      paymentFee: fee,
                      status: 'PENDING',
                      orderType: session.tableNumber ? 'DINE_IN' : 'TAKEAWAY',
                      tableNumber: session.tableNumber,
                      items: { create: currentCart.map((item: any) => ({ productId: item.productId, quantity: item.qty, price: item.price })) }
                    }
                 });
                 await createOrderNotification({
                   storeId: targetStore.id,
                   orderId: order.id,
                   message: `Order #${order.id} menunggu pembayaran: ${from}${session.tableNumber ? ` (Meja ${session.tableNumber})` : ""} • Rp ${new Intl.NumberFormat('id-ID').format(finalTotal)}`,
                   type: "WHATSAPP_ORDER"
                 });

                 const merchantMsg = await buildOrderMerchantSummary(order.id, "Order Pending");
                 await sendMerchantWhatsApp(targetStore.id, merchantMsg, order.id).catch(() => null);

                 const paymentLink = await createPaymentLink(order.id, finalTotal, from, targetStore.id, quickCheckoutMethod);
                 let summary = "🧾 *Order Summary*\n";
                 currentCart.forEach((item: any) => { summary += `- ${item.name} x${item.qty} = ${new Intl.NumberFormat('id-ID').format(item.price * item.qty)}\n`; });
                 summary += `\n------------------\nSubtotal: Rp ${new Intl.NumberFormat('id-ID').format(total)}\n`;
                 if (taxAmount > 0) summary += `Tax (${targetStore.taxPercent}%): Rp ${new Intl.NumberFormat('id-ID').format(taxAmount)}\n`;
                 if (serviceCharge > 0) summary += `Service (${targetStore.serviceChargePercent}%): Rp ${new Intl.NumberFormat('id-ID').format(serviceCharge)}\n`;
                 if (fee > 0) summary += `Fee (${quickCheckoutMethod === 'qris' ? 'QRIS' : 'Bank'}): Rp ${new Intl.NumberFormat('id-ID').format(fee)}\n`;
                 summary += `\n*Total: Rp ${new Intl.NumberFormat('id-ID').format(finalTotal)}*`;
                 await sendWhatsAppMessage(from, summary, targetStore.id, { buttonText: "Pay Now", buttonUrl: paymentLink });
                 await updateSession(from, targetStore.id, { step: 'START', cart: [] });
                 return NextResponse.json({ success: true });
             } else {
                 let addMsg = `Added to cart:\n${addedItemsMsg}`;
                 if (outOfStockMsg) addMsg += `\nNot added:\n${outOfStockMsg}`;
                 addMsg += `\nReply with more items, or "Done Qris/Bank" to checkout.\nReply 'Menu' to go back.`;
                 await sendWhatsAppMessage(from, addMsg, targetStore.id);
             }
          } else {
             if (outOfStockMsg) {
               await sendWhatsAppMessage(from, `Unable to add item(s):\n${outOfStockMsg}\nReply 'Menu' to see available products.`, targetStore.id);
             } else {
               await sendWhatsAppMessage(from, `Invalid item number(s). Please check the menu.`, targetStore.id);
             }
          }
        } else if (isCheckoutCommand) {
             const cart = (session.cart as any[]) || [];
             if (cart.length === 0) {
                await sendWhatsAppMessage(from, `Your cart is empty. Reply 'Menu' to see items.`, targetStore.id);
                return NextResponse.json({ success: true });
             }
             await sendWhatsAppMessage(from, `I didn't understand. Reply '1 2' to order Item #1 Quantity 2, or 'Done' to finish.`, targetStore.id);
        } else {
          await sendWhatsAppMessage(from, `I didn't understand. Reply '1 2' to order Item #1 Quantity 2, or 'Done' to finish.`, targetStore.id);
        }
        return NextResponse.json({ success: true });
      }

      if (textBody?.toLowerCase().includes("would like to order")) {
        await sendWhatsAppMessage(from, l(`Balas "Menu" untuk mulai order ya.`, `Reply "Menu" to start ordering.`), targetStore.id);
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
