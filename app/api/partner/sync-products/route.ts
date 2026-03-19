import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return NextResponse.json({ error: "Missing API Key" }, { status: 401 });

  await ensureStoreSettingsSchema();

  const store = await prisma.store.findUnique({
    where: { apiKey }
  });

  if (!store) return NextResponse.json({ error: "Invalid API Key" }, { status: 403 });

  if (store.subscriptionPlan !== "SOVEREIGN") {
    return NextResponse.json({ error: "API access is only available for Sovereign plan." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action, products } = body;

    if (!action || !Array.isArray(products)) {
      return NextResponse.json({ error: "Missing action or products array" }, { status: 400 });
    }

    const results = [];

    for (const prod of products) {
      if (action === "upsert") {
        const { externalId, name, price, category, description, stock } = prod;
        if (!name || price === undefined) {
          results.push({ name: name || "unknown", status: "error", message: "Missing name or price" });
          continue;
        }

        // We use name as a secondary identifier if externalId isn't provided, 
        // but ideally the merchant should provide an externalId from their system.
        const updated = await prisma.product.upsert({
          where: { 
            storeId_name: { 
              storeId: store.id, 
              name: name 
            } 
          },
          update: {
            price: Number(price),
            category: category || "General",
            description: description || "",
            stock: stock !== undefined ? Number(stock) : 999999,
            updatedAt: new Date()
          },
          create: {
            storeId: store.id,
            name: name,
            price: Number(price),
            category: category || "General",
            description: description || "",
            stock: stock !== undefined ? Number(stock) : 999999
          }
        });
        results.push({ name: updated.name, status: "success", id: updated.id });
      } else if (action === "delete") {
        const { name } = prod;
        await prisma.product.deleteMany({
          where: { storeId: store.id, name: name }
        });
        results.push({ name, status: "deleted" });
      }
    }

    revalidatePath(`/${store.slug}`);
    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error("[API_SYNC_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
