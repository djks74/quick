import { prisma } from "@/lib/prisma";
import crypto from "crypto";

let ensuredAiAbuseGuardSchema: Promise<void> | null = null;

export async function ensureAiAbuseGuardSchema() {
  if (!ensuredAiAbuseGuardSchema) {
    ensuredAiAbuseGuardSchema = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AiAbuseGuard" (
          "id" SERIAL PRIMARY KEY,
          "channel" TEXT NOT NULL,
          "storeSlug" TEXT NOT NULL DEFAULT '',
          "identityHash" TEXT NOT NULL,
          "strikes" INTEGER NOT NULL DEFAULT 0,
          "blockedUntil" TIMESTAMP(3),
          "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
        );
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "AiAbuseGuard"
        ALTER COLUMN "storeSlug" SET DEFAULT '';
      `).catch(() => null);
      await prisma.$executeRawUnsafe(`
        UPDATE "AiAbuseGuard" SET "storeSlug"='' WHERE "storeSlug" IS NULL;
      `).catch(() => null);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "AiAbuseGuard"
        ALTER COLUMN "storeSlug" SET NOT NULL;
      `).catch(() => null);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "AiAbuseGuard_channel_storeSlug_identityHash_key"
        ON "AiAbuseGuard" ("channel", "storeSlug", "identityHash");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "AiAbuseGuard_blockedUntil_idx"
        ON "AiAbuseGuard" ("blockedUntil");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "AiAbuseGuard_lastSeenAt_idx"
        ON "AiAbuseGuard" ("lastSeenAt");
      `);
    })();
  }
  return ensuredAiAbuseGuardSchema;
}

function hashIdentity(raw: string) {
  const salt = process.env.AI_ABUSE_SALT || "gercep";
  return crypto.createHash("sha256").update(`${salt}:${raw}`).digest("hex");
}

export function extractClientIp(headers: Headers) {
  const xf = headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || null;
  const xr = headers.get("x-real-ip");
  if (xr) return xr.trim();
  return null;
}

export function isSpamLikeMessage(message: string) {
  const t = String(message || "").trim();
  if (!t) return true;
  if (t.length <= 2) return true;
  if (/^(test|tes|cek|coba|asdf|qwer|zxcv)$/i.test(t)) return true;
  if (/^[^a-zA-Z0-9]+$/.test(t)) return true;
  if (/^(.)\1{6,}$/.test(t)) return true;
  if (t.length >= 60) {
    const compact = t.replace(/\s+/g, "");
    const unique = new Set(compact.split(""));
    if (compact.length > 0 && unique.size / compact.length < 0.12) return true;
  }
  return false;
}

export type AbuseDecision =
  | { action: "ALLOW"; identityHash: string; channel: string; storeSlug: string }
  | { action: "BLOCK"; identityHash: string; channel: string; storeSlug: string; message: string; resetHistory: boolean; blockedUntil: Date };

export async function evaluateAiAbuseGuard(params: {
  channel: "WEB" | "WHATSAPP" | "ADMIN" | "UNKNOWN";
  storeSlug?: string | null;
  ip?: string | null;
  phone?: string | null;
  message: string;
  isInScope: boolean;
}) {
  await ensureAiAbuseGuardSchema().catch(() => null);

  const storeSlug = params.storeSlug ? String(params.storeSlug) : "";
  const channel = String(params.channel || "UNKNOWN");
  const identityRaw = params.phone ? `phone:${params.phone}` : params.ip ? `ip:${params.ip}` : "anon";
  const identityHash = hashIdentity(identityRaw);
  const now = new Date();

  const key = { channel, storeSlug, identityHash };
  const existing = await prisma.aiAbuseGuard.findUnique({ where: { channel_storeSlug_identityHash: key } }).catch(() => null) as any;

  if (existing?.blockedUntil && new Date(existing.blockedUntil).getTime() > now.getTime()) {
    return {
      action: "BLOCK",
      identityHash,
      channel,
      storeSlug,
      message: "Maaf, aku hanya bisa bantu urusan Gercep (cari toko/menu/pesan). Ketik “menu” untuk mulai ya.",
      resetHistory: true,
      blockedUntil: new Date(existing.blockedUntil)
    } as AbuseDecision;
  }

  if (params.isInScope) {
    if (existing && (existing.strikes > 0 || existing.blockedUntil)) {
      await prisma.aiAbuseGuard
        .update({
          where: { channel_storeSlug_identityHash: key },
          data: { strikes: 0, blockedUntil: null, lastSeenAt: now }
        })
        .catch(() => null);
    } else if (existing) {
      await prisma.aiAbuseGuard
        .update({
          where: { channel_storeSlug_identityHash: key },
          data: { lastSeenAt: now }
        })
        .catch(() => null);
    }
    return { action: "ALLOW", identityHash, channel, storeSlug } as AbuseDecision;
  }

  const cooldownMinutes = Math.max(1, Number(process.env.AI_ABUSE_COOLDOWN_MINUTES || "30") || 30);
  const nextStrikes = Number(existing?.strikes || 0) + 1;
  const shouldBlock = nextStrikes >= 3;
  const blockedUntil = shouldBlock ? new Date(now.getTime() + cooldownMinutes * 60 * 1000) : null;

  if (existing) {
    await prisma.aiAbuseGuard
      .update({
        where: { channel_storeSlug_identityHash: key },
        data: { strikes: nextStrikes, blockedUntil, lastSeenAt: now }
      })
      .catch(() => null);
  } else {
    await prisma.aiAbuseGuard
      .create({
        data: { channel, storeSlug, identityHash, strikes: nextStrikes, blockedUntil, lastSeenAt: now }
      })
      .catch(() => null);
  }

  if (shouldBlock && blockedUntil) {
    return {
      action: "BLOCK",
      identityHash,
      channel,
      storeSlug,
      message: "Maaf, aku hanya bisa bantu urusan Gercep (cari toko/menu/pesan). Ketik “menu” untuk mulai ya.",
      resetHistory: true,
      blockedUntil
    } as AbuseDecision;
  }

  return { action: "ALLOW", identityHash, channel, storeSlug } as AbuseDecision;
}
