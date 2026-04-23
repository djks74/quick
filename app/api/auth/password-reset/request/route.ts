import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePasswordResetSchema } from "@/lib/password-reset-schema";
import { createPasswordResetToken } from "@/lib/password-reset";
import { getEmailProvider } from "@/lib/email";

export const runtime = "nodejs";

const normalizeEmail = (value: string) => String(value || "").trim().toLowerCase();

export async function POST(req: Request) {
  try {
    await ensurePasswordResetSchema();

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(String(body?.email || ""));
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { ok: true, message: "If the account exists, you will receive a reset link shortly." },
        { status: 200 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true }
    });

    if (!user || user.email.endsWith("@pos.local")) {
      return NextResponse.json(
        { ok: true, message: "If the account exists, you will receive a reset link shortly." },
        { status: 200 }
      );
    }

    const provider = getEmailProvider();
    if (!provider.enabled) {
      return NextResponse.json(
        {
          ok: false,
          error: "Email delivery is not configured. Please contact support or your administrator to reset your password."
        },
        { status: 503 }
      );
    }

    const { link } = await createPasswordResetToken(user.id);
    await provider.send({
      to: user.email,
      subject: "Reset your password",
      html:
        `<p>We received a request to reset your password.</p>` +
        `<p><a href="${link}">Click here to reset your password</a></p>` +
        `<p>If you didn’t request this, you can ignore this email.</p>`,
      text: `Reset your password: ${link}`
    });

    return NextResponse.json(
      { ok: true, message: "If the account exists, you will receive a reset link shortly." },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: true, message: "If the account exists, you will receive a reset link shortly." },
      { status: 200 }
    );
  }
}

