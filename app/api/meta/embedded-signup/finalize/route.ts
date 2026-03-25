import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";

async function graphApiGet(path: string, accessToken: string) {
  const url = `https://graph.facebook.com/v21.0/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    const msg = data?.error?.message || `Graph API error (${res.status})`;
    throw new Error(msg);
  }
  return data;
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
    const accessToken = String(body?.accessToken || "").trim();
    const selectedPhoneId = String(body?.selectedPhoneId || "").trim();
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid storeId" }, { status: 400 });
    }
    if (!accessToken || accessToken.length < 20) {
      return NextResponse.json({ success: false, error: "Invalid Meta access token" }, { status: 400 });
    }

    const store = await assertStoreManagementAccess(storeId);
    const plan = String(store.subscriptionPlan || "").toUpperCase();
    if (!["SOVEREIGN", "CORPORATE", "ENTERPRISE"].includes(plan) || store.slug === "demo") {
      return NextResponse.json({ success: false, error: "Plan is not eligible for custom Meta integration" }, { status: 403 });
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

    // Fetch WABAs directly
    const wabasUrl = `https://graph.facebook.com/v21.0/me/owned_whatsapp_business_accounts?fields=id,name,phone_numbers{id,display_phone_number,verified_name,name_status,quality_rating}&limit=50&access_token=${encodeURIComponent(accessToken)}`;
    const wabasRes = await fetch(wabasUrl, { method: "GET", cache: "no-store" });
    const wabas = await wabasRes.json().catch(() => null);

    if (wabas?.error) {
      console.error("[META_API_ERROR] Direct wabas fetch:", wabas.error);
    }
    for (const waba of wabas?.data || []) {
      for (const phone of waba?.phone_numbers?.data || []) {
        if (!phone?.id) continue;
        candidates.push({
          businessId: null,
          businessName: null,
          wabaId: String(waba?.id),
          wabaName: waba?.name || null,
          phoneId: String(phone.id),
          displayPhoneNumber: phone?.display_phone_number || null,
          verifiedName: phone?.verified_name || null,
          nameStatus: phone?.name_status || null,
          qualityRating: phone?.quality_rating || null
        });
      }
    }

    if (candidates.length === 0) {
      console.log("[META_SIGNUP] No candidates found. WABAs:", JSON.stringify(wabas));
      return NextResponse.json({ 
        success: false, 
        error: "No WhatsApp Business phone number found on this Meta account.",
        metaDebug: {
          wabasFound: wabas?.data?.length || 0,
          rawWabas: wabas,
          tokenLength: accessToken.length
        }
      }, { status: 404 });
    }

    const chosen =
      (selectedPhoneId ? candidates.find((c) => c.phoneId === selectedPhoneId) : null) ||
      candidates.find((c) => ["APPROVED", "ACTIVE", "AVAILABLE"].includes(String(c.nameStatus || "").toUpperCase())) ||
      candidates[0];

    if (!chosen?.phoneId) {
      return NextResponse.json({ success: false, error: "No eligible phone number found" }, { status: 404 });
    }

    const updated = await prisma.store.update({
      where: { id: store.id },
      data: {
        whatsappToken: accessToken,
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
