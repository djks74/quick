import { prisma } from "@/lib/prisma";

let ensuredPasswordResetSchemaV1: Promise<void> | null = null;

export async function ensurePasswordResetSchema() {
  if (!ensuredPasswordResetSchemaV1) {
    ensuredPasswordResetSchemaV1 = (async () => {
      const commands = [
        `CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
          "id" TEXT PRIMARY KEY,
          "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "tokenHash" TEXT NOT NULL,
          "expiresAt" TIMESTAMPTZ NOT NULL,
          "usedAt" TIMESTAMPTZ,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash")`,
        `CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId")`,
        `CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt")`
      ];

      for (const cmd of commands) {
        await prisma.$executeRawUnsafe(cmd).catch((err: any) => {
          if (!String(err?.message || "").includes("already exists")) throw err;
        });
      }
    })().catch((error) => {
      ensuredPasswordResetSchemaV1 = null;
      throw error;
    });
  }

  await ensuredPasswordResetSchemaV1;
}

