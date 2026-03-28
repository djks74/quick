import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePlatformSettingsSchema } from "@/lib/super-admin";
import { getDefaultStoreTypes, normalizeStoreTypes } from "@/lib/store-types";

export async function GET() {
  try {
    await ensurePlatformSettingsSchema();
    const settings = await prisma.platformSettings.findUnique({
      where: { key: "default" },
      select: {
        facebookAppId: true,
        whatsappSignupConfigId: true,
        storeTypes: true
      }
    });
    const normalizedStoreTypes = normalizeStoreTypes((settings as any)?.storeTypes);
    if (settings && normalizedStoreTypes.length === 0) {
      await prisma.platformSettings
        .update({
          where: { key: "default" },
          data: { storeTypes: getDefaultStoreTypes() as any }
        })
        .catch(() => null);
    }
    const fallbackAppId =
      String(process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || "").trim() ||
      String(process.env.FACEBOOK_APP_ID || "").trim() ||
      null;
    const facebookAppId = String(settings?.facebookAppId || "").trim() || fallbackAppId;
    const fallbackSignupConfigId =
      String(process.env.NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID || "").trim() ||
      String(process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID || "").trim() ||
      null;
    const whatsappSignupConfigId = String((settings as any)?.whatsappSignupConfigId || "").trim() || fallbackSignupConfigId;

    return NextResponse.json({
      success: true,
      settings,
      facebookAppId,
      whatsappSignupConfigId,
      storeTypes: normalizedStoreTypes.length > 0 ? normalizedStoreTypes : getDefaultStoreTypes()
    });
  } catch (error) {
    console.error("[API_PUBLIC_SETTINGS_ERROR]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch public settings" }, { status: 500 });
  }
}
