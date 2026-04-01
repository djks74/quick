import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const storeId = Number(body?.storeId || 0);
    const sessionId = Number(body?.sessionId || 0) || null;
    const phoneRaw = String(body?.phone || "");
    const phone = phoneRaw.replace(/\D/g, "").replace(/^0/, "62").replace(/^8/, "628");
    const cart = body?.cart;

    if (!storeId || !phone || typeof cart !== "object" || Array.isArray(cart)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const sanitizeCart = (raw: any) => {
      const out: Record<string, number> = {};
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
      for (const key of Object.keys(raw)) {
        const qty = Math.max(0, Math.floor(Number(raw[key] || 0)));
        const id = String(key || "").replace(/\D/g, "");
        if (!id || qty <= 0) continue;
        out[id] = qty;
      }
      return out;
    };

    const safeCart = sanitizeCart(cart);

    if (sessionId) {
      const existing = await prisma.whatsAppSession.findUnique({
        where: { id: sessionId },
        select: { id: true, metadata: true }
      });
      if (existing) {
        await prisma.whatsAppSession.update({
          where: { id: existing.id },
          data: {
            metadata: {
              ...(existing.metadata as any),
              webviewCart: safeCart
            } as any
          }
        });
        return NextResponse.json({ ok: true });
      }
    }

    const existing = await prisma.whatsAppSession.findUnique({
      where: { phoneNumber_storeId: { phoneNumber: phone, storeId } },
      select: { id: true, metadata: true }
    });

    if (existing) {
      await prisma.whatsAppSession.update({
        where: { id: existing.id },
        data: {
          metadata: {
            ...(existing.metadata as any),
            webviewCart: safeCart
          } as any
        }
      });
      return NextResponse.json({ ok: true });
    }

    await prisma.whatsAppSession.create({
      data: {
        phoneNumber: phone,
        storeId,
        step: "START",
        metadata: { webviewCart: safeCart } as any
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

