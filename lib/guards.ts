import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export class GuardError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function requireSessionUser() {
  const session = await getServerSession(authOptions);
  const user = (session as any)?.user;
  if (!session || !user) {
    throw new GuardError("Unauthorized", 401);
  }
  return user;
}

export async function requireSuperAdminUser() {
  const user = await requireSessionUser();
  if (user?.role !== "SUPER_ADMIN") {
    throw new GuardError("Forbidden", 403);
  }
  return user;
}

export async function requireStoreAccessBySlug(slug: string) {
  if (!slug) {
    throw new GuardError("Missing slug", 400);
  }
  const user = await requireSessionUser();
  const store = await prisma.store.findUnique({
    where: { slug },
    select: { id: true, ownerId: true, slug: true, apiKey: true }
  });
  if (!store) {
    throw new GuardError("Store not found", 404);
  }
  const userId = Number(user?.id);
  const userStoreId = Number(user?.storeId);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isOwner = userId === store.ownerId;
  const isStoreUser = userStoreId === store.id;
  if (!isSuperAdmin && !isOwner && !isStoreUser) {
    throw new GuardError("Unauthorized", 403);
  }
  return { user, store };
}

export async function requireStoreAccessById(storeId: number) {
  if (!Number.isFinite(storeId) || storeId <= 0) {
    throw new GuardError("Missing storeId", 400);
  }
  const user = await requireSessionUser();
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, ownerId: true, slug: true, apiKey: true }
  });
  if (!store) {
    throw new GuardError("Store not found", 404);
  }
  const userId = Number(user?.id);
  const userStoreId = Number(user?.storeId);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isOwner = userId === store.ownerId;
  const isStoreUser = userStoreId === store.id;
  if (!isSuperAdmin && !isOwner && !isStoreUser) {
    throw new GuardError("Unauthorized", 403);
  }
  return { user, store };
}

export function requireAiApiKey(headers: Headers) {
  const expected = process.env.AI_API_KEY;
  const provided = headers.get("x-api-key");
  if (!expected || provided !== expected) {
    throw new GuardError("Unauthorized", 401);
  }
}

export async function requireAiStoreAccessBySlug(headers: Headers, slug: string) {
  requireAiApiKey(headers);
  if (!slug) {
    throw new GuardError("Missing slug", 400);
  }
  const storeApiKey = headers.get("x-store-api-key");
  if (!storeApiKey) {
    throw new GuardError("Missing store API key", 401);
  }
  const store = await prisma.store.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      ownerId: true,
      apiKey: true,
      balance: true,
      waBalance: true,
      taxPercent: true,
      serviceChargePercent: true,
      paymentGatewaySecret: true,
      paymentGatewayClientKey: true,
      subscriptionPlan: true
    }
  });
  if (!store) {
    throw new GuardError("Store not found", 404);
  }
  if (!store.apiKey || store.apiKey !== storeApiKey) {
    throw new GuardError("Unauthorized store access", 403);
  }
  return store;
}
