import { NextResponse } from "next/server";
import { ensurePasswordResetSchema } from "@/lib/password-reset-schema";
import { consumePasswordResetToken } from "@/lib/password-reset";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await ensurePasswordResetSchema();
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const password = String(body?.password || "").trim();

    const result = await consumePasswordResetToken({ token, newPassword: password });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: "Invalid or expired reset link." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Unable to reset password right now." },
      { status: 500 }
    );
  }
}

