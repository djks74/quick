import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";

const META_GRAPH_VERSION = "v21.0";

async function graphApiGet(path: string, accessToken: string, authHeaderToken?: string) {
  const url = authHeaderToken
    ? `https://graph.facebook.com/${META_GRAPH_VERSION}/${path}`
    : `https://graph.facebook.com/${META_GRAPH_VERSION}/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`;
  const headers = authHeaderToken ? { Authorization: `Bearer ${authHeaderToken}` } : undefined;
  const res = await fetch(url, { method: "GET", cache: "no-store", headers });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    const msg = data?.error?.message || `Graph API error (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

async function exchangeCodeForBusinessToken(code: string, appId: string, appSecret: string) {
  const exchange = async (redirectUri?: string) => {
    const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("client_secret", appSecret);
    url.searchParams.set("code", code);
    if (redirectUri !== undefined) {
      url.searchParams.set("redirect_uri", redirectUri);
    }
    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) {
      const msg = data?.error?.message || `Graph API error (${res.status})`;
      throw new Error(msg);
    }
    return data;
  };

  try {
    return await exchange();
  } catch (error: any) {
    if (String(error?.message || "").toLowerCase().includes("redirect_uri")) {
      return exchange("");
    }
    throw error;
  }
}

async function assertStoreManagementAccess(storeId: number) {
  const session = await getServerSession(authOptions);
  const user = (session as any)?.user;
  if (!session || !user) {
    throw new Error("Unauthorized");
  }
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, ownerId: true, slug: true, subscriptionPlan: true, whatsapp: true }
  });
  if (!store) {
    throw new Error("Store not found");
  }
  const role = String(user?.role || "");
  if (role === "SUPER_ADMIN") {
    return store;
  }
  const uid = Number(user?.id);
  const userStoreId = Number(user?.storeId);
  if (uid === store.ownerId || userStoreId === store.id) {
    return store;
  }
  throw new Error("Forbidden");
}

export async function POST(req: NextRequest) {
  try {
    await ensureStoreSettingsSchema();
    const body = await req.json();
    const storeId = Number(body?.storeId);
    const code = String(body?.code || "").trim();
    const legacyAccessToken = String(body?.accessToken || "").trim();
    const selectedPhoneId = String(body?.selectedPhoneId || "").trim();
    const embeddedSession = body?.sessionInfo && typeof body.sessionInfo === "object" ? body.sessionInfo : null;
    const sessionWabaId = String(embeddedSession?.wabaId || embeddedSession?.waba_id || "").trim();
    const sessionPhoneNumberId = String(embeddedSession?.phoneNumberId || embeddedSession?.phone_number_id || "").trim();
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid storeId" }, { status: 400 });
    }
    if (!code && !legacyAccessToken) {
      return NextResponse.json({ success: false, error: "Missing Meta code or access token" }, { status: 400 });
    }

    const store = await assertStoreManagementAccess(storeId);
    const plan = String(store.subscriptionPlan || "").toUpperCase();
    if (!["SOVEREIGN", "CORPORATE", "ENTERPRISE"].includes(plan) || store.slug === "demo") {
      return NextResponse.json({ success: false, error: "Plan is not eligible for custom Meta integration" }, { status: 403 });
    }

    const platformSettings = await prisma.platformSettings.findUnique({
      where: { key: "default" },
      select: {
        whatsappToken: true,
        facebookAppId: true
      }
    });

    const appId = String(platformSettings?.facebookAppId || process.env.FACEBOOK_APP_ID || process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || "").trim();
    const appSecret = String(process.env.WHATSAPP_APP_SECRET || process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || "").trim();
    const systemToken = String(platformSettings?.whatsappToken || "").trim();

    let businessToken = legacyAccessToken;
    if (code) {
      if (!appId || !appSecret) {
        return NextResponse.json({
          success: false,
          error: "Meta App ID or App Secret is missing for Embedded Signup token exchange"
        }, { status: 500 });
      }
      const exchanged = await exchangeCodeForBusinessToken(code, appId, appSecret);
      businessToken = String(exchanged?.access_token || "").trim();
    }

    if (!businessToken || businessToken.length < 20) {
      return NextResponse.json({ success: false, error: "Failed to create Meta business token" }, { status: 400 });
    }

    const candidates: Array<{
      businessId: string | null;
      businessName: string | null;
      wabaId: string;
      wabaName: string | null;
      phoneId: string;
      displayPhoneNumber: string | null;
      verifiedName: string | null;
      nameStatus: string | null;
      qualityRating: string | null;
    }> = [];
    let resolvedWabaId = sessionWabaId;
    let resolvedBusinessId: string | null = null;

    if (!resolvedWabaId && systemToken) {
      const debugToken = await graphApiGet(`debug_token?input_token=${encodeURIComponent(businessToken)}`, businessToken, systemToken).catch((error) => {
        console.error("[META_API_ERROR] debug_token:", error);
        return null;
      });
      const granularScopes = Array.isArray(debugToken?.data?.granular_scopes) ? debugToken.data.granular_scopes : [];
      const managementScope = granularScopes.find((scope: any) => scope?.scope === "whatsapp_business_management");
      const targetIds = Array.isArray(managementScope?.target_ids) ? managementScope.target_ids : [];
      if (targetIds.length > 0) {
        resolvedWabaId = String(targetIds[0]);
      }
    }

    if (resolvedWabaId) {
      const phoneNumbers = await graphApiGet(
        `${resolvedWabaId}/phone_numbers?fields=id,display_phone_number,verified_name,name_status,quality_rating`,
        businessToken
      ).catch((error) => {
        console.error("[META_API_ERROR] phone_numbers:", error);
        return null;
      });

      for (const phone of phoneNumbers?.data || []) {
        if (!phone?.id) continue;
        candidates.push({
          businessId: resolvedBusinessId,
          businessName: null,
          wabaId: resolvedWabaId,
          wabaName: null,
          phoneId: String(phone.id),
          displayPhoneNumber: phone?.display_phone_number || null,
          verifiedName: phone?.verified_name || null,
          nameStatus: phone?.name_status || null,
          qualityRating: phone?.quality_rating || null
        });
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "No WhatsApp Business phone number found on this Meta account.",
        metaDebug: {
          resolvedWabaId,
          sessionWabaId,
          sessionPhoneNumberId,
          usedCodeExchange: Boolean(code),
          tokenLength: businessToken.length
        }
      }, { status: 404 });
    }

    const chosen =
      (sessionPhoneNumberId ? candidates.find((c) => c.phoneId === sessionPhoneNumberId) : null) ||
      (selectedPhoneId ? candidates.find((c) => c.phoneId === selectedPhoneId) : null) ||
      candidates.find((c) => ["APPROVED", "ACTIVE", "AVAILABLE"].includes(String(c.nameStatus || "").toUpperCase())) ||
      candidates[0];

    if (!chosen?.phoneId) {
      return NextResponse.json({ success: false, error: "No eligible phone number found" }, { status: 404 });
    }

    const updated = await prisma.store.update({
      where: { id: store.id },
      data: {
        whatsappToken: businessToken,
        whatsappPhoneId: chosen.phoneId,
        whatsapp: chosen.displayPhoneNumber || store.whatsapp || null,
        enableWhatsApp: true
      },
      select: {
        id: true,
        slug: true,
        whatsapp: true,
        whatsappPhoneId: true,
        enableWhatsApp: true
      }
    });

    return NextResponse.json({
      success: true,
      store: updated,
      tokenPreview: `${businessToken.slice(0, 8)}...${businessToken.slice(-6)}`,
      selected: {
        phoneId: chosen.phoneId,
        displayPhoneNumber: chosen.displayPhoneNumber,
        verifiedName: chosen.verifiedName,
        wabaId: chosen.wabaId,
        wabaName: chosen.wabaName,
        businessId: chosen.businessId,
        businessName: chosen.businessName
      },
      discoveredPhones: candidates.map((c) => ({
        phoneId: c.phoneId,
        displayPhoneNumber: c.displayPhoneNumber,
        verifiedName: c.verifiedName,
        nameStatus: c.nameStatus,
        wabaId: c.wabaId,
        wabaName: c.wabaName
      }))
    });
  } catch (error: any) {
    const message = error?.message || "Failed to finalize Meta signup";
    if (message === "Unauthorized") {
      return NextResponse.json({ success: false, error: message }, { status: 401 });
    }
    if (message === "Forbidden") {
      return NextResponse.json({ success: false, error: message }, { status: 403 });
    }
    if (message === "Store not found") {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
