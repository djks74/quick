import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export async function logTraffic(storeId?: number, source: "WEB" | "WHATSAPP" = "WEB", metadata?: any) {
  try {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0] || 
               headersList.get("x-real-ip") || 
               "unknown";
    const userAgent = headersList.get("user-agent") || "unknown";
    const path = headersList.get("x-invoke-path") || "/";

    await prisma.trafficLog.create({
      data: {
        storeId,
        path,
        ip,
        userAgent,
        source,
        metadata: metadata || {},
      },
    });
  } catch (error) {
    console.error("[TRAFFIC_LOG_ERROR]", error);
  }
}
