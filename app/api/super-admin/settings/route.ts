import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePlatformSettingsSchema } from "@/lib/super-admin";

export async function GET() {
  try {
    await ensurePlatformSettingsSchema();
    const settings = await prisma.platformSettings.findUnique({
      where: { key: "default" },
      select: {
        facebookAppId: true
      }
    });
    const fallbackAppId =
      String(process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || "").trim() ||
      String(process.env.FACEBOOK_APP_ID || "").trim() ||
      null;
    const facebookAppId = String(settings?.facebookAppId || "").trim() || fallbackAppId;

    return NextResponse.json({
      success: true,
      settings,
      facebookAppId
    });
  } catch (error) {
    console.error("[API_PUBLIC_SETTINGS_ERROR]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch public settings" }, { status: 500 });
  }
}
