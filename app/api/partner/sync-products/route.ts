import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return NextResponse.json({ error: "Missing API Key" }, { status: 401 });

  const store = await prisma.store.findUnique({
    where: { apiKey },
    include: { products: true, categories: true }
  });

  if (!store) return NextResponse.json({ error: "Invalid API Key" }, { status: 403 });
  if (!["SOVEREIGN", "CORPORATE"].includes(store.subscriptionPlan)) {
    return NextResponse.json({ error: "API access is only available for Sovereign and Corporate plans." }, { status: 403 });
  }

  return NextResponse.json({ 
    success: true, 
    store: store.name,
    products: store.products
      .filter(p => p.category !== "_ARCHIVED_")
      .map(p => ({
        id: p.id,
        externalId: p.externalId,
        name: p.name,
        price: p.price,
        stock: p.stock,
        category: p.category,
        categoryName: p.category ? (store.categories.find((c) => c.slug === p.category)?.name || p.category) : null,
        image: p.image
      }))
  });
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return NextResponse.json({ error: "Missing API Key" }, { status: 401 });

  await ensureStoreSettingsSchema();

  const store = await prisma.store.findUnique({
    where: { apiKey }
  });

  if (!store) return NextResponse.json({ error: "Invalid API Key" }, { status: 403 });

  if (!["SOVEREIGN", "CORPORATE"].includes(store.subscriptionPlan)) {
    return NextResponse.json({ error: "API access is only available for Sovereign and Corporate plans." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action, products } = body;

    if (!action || !Array.isArray(products)) {
      return NextResponse.json({ error: "Missing action or products array" }, { status: 400 });
    }

    console.log(`[API_SYNC] Starting sync for store "${store.name}" (ID: ${store.id}). Action: ${action}, Products: ${products.length}`);

    const results = [];
    const syncedCategorySlugs = new Set<string>();

    for (const prod of products) {
      try {
        if (action === "upsert") {
          const externalId = prod.externalId ? String(prod.externalId) : null;
          const name = prod.name ? String(prod.name).trim() : null;
          const price = prod.price !== undefined ? Number(prod.price) : undefined;
          const categoryLabel = prod.category ? String(prod.category).trim() : "General";
          const categorySlug = String(categoryLabel).toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "") || "general";
          const description = prod.description ? String(prod.description) : "";
          const stock = prod.stock !== undefined ? Number(prod.stock) : 999999;
          const image = prod.image || null;

          if (!name || price === undefined) {
            results.push({ name: name || externalId || "unknown", status: "error", message: "Missing name or price" });
            continue;
          }

          if (categorySlug && !syncedCategorySlugs.has(categorySlug)) {
            await prisma.category.upsert({
              where: {
                storeId_slug: {
                  storeId: store.id,
                  slug: categorySlug
                }
              },
              update: {
                name: String(categoryLabel)
              },
              create: {
                storeId: store.id,
                name: String(categoryLabel),
                slug: categorySlug
              }
            }).catch(() => null);
            syncedCategorySlugs.add(categorySlug);
          }

          let updated;
          if (externalId) {
            const existingByExt = await prisma.product.findUnique({
              where: { storeId_externalId: { storeId: store.id, externalId: String(externalId) } }
            });

            if (existingByExt) {
              if (existingByExt.category === "_ARCHIVED_") {
                results.push({ name: name, status: "ignored", message: "Product is archived/deleted on platform" });
                continue;
              }

              updated = await prisma.product.update({
                where: { id: existingByExt.id },
                data: {
                  name: name,
                  price: Number(price),
                  category: categorySlug,
                  description: description || "",
                  image: image || null,
                  stock: stock !== undefined ? Number(stock) : 999999,
                  updatedAt: new Date()
                }
              });
            } else {
              const existingByName = await prisma.product.findUnique({
                where: { storeId_name: { storeId: store.id, name: name } }
              });

              if (existingByName) {
                const conflict = await prisma.product.findUnique({
                  where: { storeId_externalId: { storeId: store.id, externalId: String(externalId) } }
                });
                if (conflict && conflict.id !== existingByName.id) {
                  await prisma.product.update({
                    where: { id: conflict.id },
                    data: {
                      externalId: null,
                      category: "_ARCHIVED_",
                      name: `[ARCHIVED] ${new Date().toISOString().split("T")[0]} - ID ${conflict.id} - ${Math.random().toString(36).slice(2, 8)}`
                    }
                  }).catch(() => null);
                }

                updated = await prisma.product.update({
                  where: { id: existingByName.id },
                  data: {
                    externalId: String(externalId),
                    price: Number(price),
                    category: categorySlug,
                    description: description || "",
                    image: image || null,
                    stock: stock !== undefined ? Number(stock) : 999999,
                    updatedAt: new Date()
                  }
                });
              } else {
                updated = await prisma.product.create({
                  data: {
                    storeId: store.id,
                    externalId: String(externalId),
                    name: name,
                    price: Number(price),
                    category: categorySlug,
                    description: description || "",
                    image: image || null,
                    stock: stock !== undefined ? Number(stock) : 999999
                  }
                });
              }
            }
          } else {
            updated = await prisma.product.upsert({
              where: {
                storeId_name: {
                  storeId: store.id,
                  name: name
                }
              },
              update: {
                price: Number(price),
                category: categorySlug,
                description: description || "",
                image: image || null,
                stock: stock !== undefined ? Number(stock) : 999999,
                updatedAt: new Date()
              },
              create: {
                storeId: store.id,
                name: name,
                price: Number(price),
                category: categorySlug,
                description: description || "",
                image: image || null,
                stock: stock !== undefined ? Number(stock) : 999999
              }
            });
          }
          results.push({ name: updated.name, status: "success", id: updated.id, externalId: updated.externalId });
        } else if (action === "delete") {
          const externalId = prod.externalId ? String(prod.externalId) : null;
          const name = prod.name ? String(prod.name).trim() : null;

          if (externalId) {
            await prisma.product.deleteMany({
              where: { storeId: store.id, externalId: String(externalId) }
            });
            results.push({ externalId, status: "deleted" });
          } else if (name) {
            await prisma.product.deleteMany({
              where: { storeId: store.id, name: name }
            });
            results.push({ name, status: "deleted" });
          }
        }
      } catch (err: any) {
        const externalId = prod?.externalId ? String(prod.externalId) : null;
        const name = prod?.name ? String(prod.name).trim() : null;
        results.push({ name: name || externalId || "unknown", status: "error", message: err?.message || "Unknown error" });
      }
    }

    revalidatePath(`/${store.slug}`);

    // Update last sync time
    await prisma.store.update({
      where: { id: store.id },
      data: { lastSyncAt: new Date() }
    }).catch(() => null);

    return NextResponse.json({ 
      success: true, 
      count: results.filter(r => r.status === "success").length,
      errors: results.filter(r => r.status === "error").length,
      results 
    });
  } catch (error: any) {
    console.error("[API_SYNC_ERROR]", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 200 });
  }
}
