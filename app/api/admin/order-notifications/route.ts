import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureOrderNotificationsSchema } from "@/lib/order-notifications";
import { GuardError, requireStoreAccessById, requireStoreAccessBySlug, requireSessionUser } from "@/lib/guards";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = String(searchParams.get("slug") || "").trim();
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 25)));

    let storeId = Number(searchParams.get("storeId"));
    if (!Number.isFinite(storeId) || storeId <= 0) storeId = 0;

    let store: { id: number } | null = null;
    if (slug) {
      ({ store } = await requireStoreAccessBySlug(slug));
    } else if (storeId) {
      ({ store } = await requireStoreAccessById(storeId));
    } else {
      const user = await requireSessionUser();
      const userStoreId = Number(user?.storeId);
      if (Number.isFinite(userStoreId) && userStoreId > 0) {
        ({ store } = await requireStoreAccessById(userStoreId));
      } else {
        return NextResponse.json({ success: true, notifications: [] });
      }
    }
    await ensureOrderNotificationsSchema();

    const rows = await prisma.orderNotification.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        orderId: true,
        message: true,
        type: true,
        isRead: true,
        createdAt: true
      }
    });

    return NextResponse.json({
      success: true,
      notifications: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString()
      }))
    });
  } catch (error: any) {
    if (error instanceof GuardError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("ORDER_NOTIFICATIONS_GET_ERROR", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const slug = String(body?.slug || "").trim();
    const storeId = Number(body?.storeId);
    const action = String(body?.action || "").trim();
    const id = Number(body?.id);

    const { store } = slug
      ? await requireStoreAccessBySlug(slug)
      : await requireStoreAccessById(storeId);
    await ensureOrderNotificationsSchema();

    if (action === "mark_all_read") {
      await prisma.orderNotification.updateMany({
        where: { storeId: store.id, isRead: false },
        data: { isRead: true }
      });
      return NextResponse.json({ success: true });
    }

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    await prisma.orderNotification.updateMany({
      where: { id, storeId: store.id },
      data: { isRead: true }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof GuardError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("ORDER_NOTIFICATIONS_POST_ERROR", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
