import { NextResponse } from "next/server";
import { setStoreWaBalance } from "@/lib/super-admin";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const storeId = Number(body?.storeId);
    const waBalance = Number(body?.waBalance);
    const reason = body?.reason ? String(body.reason) : undefined;

    if (!Number.isFinite(storeId) || storeId <= 0) {
      return NextResponse.json({ error: "Invalid storeId" }, { status: 400 });
    }
    if (!Number.isFinite(waBalance) || waBalance < 0) {
      return NextResponse.json({ error: "Invalid waBalance" }, { status: 400 });
    }

    const res = await setStoreWaBalance(storeId, waBalance, reason);
    if (!res.success) {
      return NextResponse.json({ error: res.error || "Failed" }, { status: 403 });
    }
    return NextResponse.json({ success: true, waBalance: res.data.waBalance });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}

