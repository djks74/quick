import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const baseUrl = () =>
  String(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || process.env.APP_URL || "https://gercep.click").replace(/\/$/, "");

export function makePasswordResetToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export async function createPasswordResetToken(userId: number) {
  const { token, tokenHash } = makePasswordResetToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const id = crypto.randomUUID();

  await prisma.passwordResetToken.create({
    data: { id, userId, tokenHash, expiresAt }
  });

  return {
    token,
    expiresAt,
    link: `${baseUrl()}/reset-password?token=${encodeURIComponent(token)}`
  };
}

export async function consumePasswordResetToken(input: { token: string; newPassword: string }) {
  const token = String(input.token || "").trim();
  const newPassword = String(input.newPassword || "").trim();
  if (!token || newPassword.length < 8) return { ok: false as const, reason: "INVALID_INPUT" as const };

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true }
  });

  if (!record) return { ok: false as const, reason: "INVALID_TOKEN" as const };
  if (record.usedAt) return { ok: false as const, reason: "USED_TOKEN" as const };
  if (record.expiresAt.getTime() < Date.now()) return { ok: false as const, reason: "EXPIRED_TOKEN" as const };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: record.userId },
      data: { password: passwordHash }
    });
    await tx.passwordResetToken.update({
      where: { tokenHash },
      data: { usedAt: new Date() }
    });
    await tx.passwordResetToken.deleteMany({
      where: { userId: record.userId, usedAt: { not: null } }
    });
  });

  return { ok: true as const };
}

