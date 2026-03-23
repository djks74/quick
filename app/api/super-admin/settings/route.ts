import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const settings = await prisma.platformSettings.findUnique({
      where: { key: "default" },
      select: {
        facebookAppId: true
      }
    });

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("[API_PUBLIC_SETTINGS_ERROR]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch public settings" }, { status: 500 });
  }
}
