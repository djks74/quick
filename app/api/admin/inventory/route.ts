import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { GuardError, requireStoreAccessBySlug } from "@/lib/guards";

let ensuredSchema: Promise<void> | null = null;

async function generateUniqueInventoryBarcode(storeId: number) {
  for (let i = 0; i < 5; i++) {
    const candidate = `${Date.now().toString().slice(-10)}${Math.floor(10 + Math.random() * 90)}`;
    const existing = await prisma.inventoryItem.findFirst({
      where: { storeId, barcode: candidate },
      select: { id: true }
    });
    if (!existing) return candidate;
  }
  return `${Date.now()}${Math.floor(100 + Math.random() * 900)}`;
}

async function ensureInventorySchema() {
  if (!ensuredSchema) {
    ensuredSchema = (async () => {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Product"
        ADD COLUMN IF NOT EXISTS "barcode" TEXT;
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "InventoryItem" (
          "id" SERIAL PRIMARY KEY,
          "storeId" INTEGER NOT NULL REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          "name" TEXT NOT NULL,
          "barcode" TEXT,
          "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "unit" TEXT NOT NULL DEFAULT 'pcs',
          "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "InventoryItem_storeId_barcode_key"
        ON "InventoryItem" ("storeId", "barcode");
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProductIngredient" (
          "id" SERIAL PRIMARY KEY,
          "productId" INTEGER NOT NULL REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          "inventoryItemId" INTEGER NOT NULL REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          "quantity" DOUBLE PRECISION NOT NULL,
          "quantityUnit" TEXT NOT NULL DEFAULT 'pcs',
          "baseUnit" TEXT NOT NULL DEFAULT 'pcs',
          "conversionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await prisma.$executeRawUnsafe(`
        ALTER TABLE "ProductIngredient"
        ADD COLUMN IF NOT EXISTS "quantityUnit" TEXT NOT NULL DEFAULT 'pcs';
      `);

      await prisma.$executeRawUnsafe(`
        ALTER TABLE "ProductIngredient"
        ADD COLUMN IF NOT EXISTS "baseUnit" TEXT NOT NULL DEFAULT 'pcs';
      `);

      await prisma.$executeRawUnsafe(`
        ALTER TABLE "ProductIngredient"
        ADD COLUMN IF NOT EXISTS "conversionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1;
      `);

      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ProductIngredient_productId_inventoryItemId_key"
        ON "ProductIngredient" ("productId", "inventoryItemId");
      `);
    })().catch(() => {});
  }

  await ensuredSchema;
}

async function sendLowStockReminder(storeId: number, item: { name: string; stock: number; minStock: number; unit: string }) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { owner: true }
  });
  if (!store) return;
  const merchantPhone = store.whatsapp || store.owner?.phoneNumber;
  if (!merchantPhone) return;
  const stockText = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Math.max(0, Number(item.stock)));
  const minText = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(item.minStock));
  const msg = `⚠️ *Peringatan Stok Menipis*\n\n${item.name} menipis.\nStok saat ini: ${stockText} ${item.unit}\nStok minimum: ${minText} ${item.unit}\n\nSegera restock agar tidak kehabisan.`;
  await sendWhatsAppMessage(merchantPhone, msg, store.id);
}

async function sendOutOfStockReminder(storeId: number, item: { name: string; unit: string }) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { owner: true }
  });
  if (!store) return;
  const merchantPhone = store.whatsapp || store.owner?.phoneNumber;
  if (!merchantPhone) return;
  const msg = `🚨 *Stok Habis (Kritis)*\n\n${item.name} (${item.unit}) sudah mencapai 0.\nMohon restock secepatnya.`;
  await sendWhatsAppMessage(merchantPhone, msg, store.id);
}

// GET /api/admin/inventory?slug=store-slug&barcode=123
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const barcode = searchParams.get("barcode");
    const slug = searchParams.get("slug");

    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const { store } = await requireStoreAccessBySlug(slug);

    await ensureInventorySchema();

    try {
      // If barcode provided, find one. Otherwise find all.
      if (barcode) {
        const item = await prisma.inventoryItem.findFirst({
          where: { storeId: store.id, barcode: barcode },
        });
        if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
        return NextResponse.json(item);
      }

      const items = await prisma.inventoryItem.findMany({
        where: { storeId: store.id },
        orderBy: { updatedAt: 'desc' }
      });
      return NextResponse.json(items);
    } catch (dbError: any) {
      console.error("[INVENTORY_API_GET_DB_ERROR]", dbError);
      // Fallback: if table doesn't exist yet, return empty array instead of 500
      if (dbError.code === 'P2021') {
        return NextResponse.json([]);
      }
      throw dbError;
    }
  } catch (error: any) {
    if (error instanceof GuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[INVENTORY_API_GET]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// POST /api/admin/inventory (Create or Update Stock)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[INVENTORY_POST] Request body:", JSON.stringify(body));
    
    const { slug, action, id, ...data } = body;

    if (!slug) {
      console.error("[INVENTORY_POST] Missing slug");
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const { store } = await requireStoreAccessBySlug(slug);

    await ensureInventorySchema();

    // Handle Stock Update (Scanning)
    if (action === "update_stock") {
      const itemId = Number(body.itemId);
      const amount = Number(body.amount);
      
      if (isNaN(itemId) || isNaN(amount)) {
        return NextResponse.json({ error: "Invalid item ID or amount" }, { status: 400 });
      }

      console.log("[INVENTORY_POST] Updating stock for item:", itemId, "amount:", amount);
      const existing = await prisma.inventoryItem.findFirst({
        where: { id: itemId, storeId: store.id },
        select: { stock: true, minStock: true, name: true, unit: true }
      });

      if (!existing) {
        return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
      }

      if (existing.stock + amount < 0) {
        return NextResponse.json({ error: "Stock cannot go below zero" }, { status: 400 });
      }

      const item = await prisma.inventoryItem.update({
        where: { id: itemId, storeId: store.id },
        data: { stock: { increment: amount } }
      });
      const wasLow = Number(existing.stock) <= Number(existing.minStock);
      const isLow = Number(item.stock) <= Number(item.minStock);
      const becameOutOfStock = Number(existing.stock) > 0 && Number(item.stock) <= 0;
      if (!wasLow && isLow) {
        await sendLowStockReminder(store.id, {
          name: item.name,
          stock: Number(item.stock),
          minStock: Number(item.minStock),
          unit: item.unit || "pcs"
        });
      }
      if (becameOutOfStock) {
        await sendOutOfStockReminder(store.id, {
          name: item.name,
          unit: item.unit || "pcs"
        });
      }
      return NextResponse.json(item);
    }

    // Convert empty barcode to null to avoid unique constraint issues
    let barcode = data.barcode?.toString().trim() || null;
    if (!barcode) {
      barcode = await generateUniqueInventoryBarcode(store.id);
    }
    const name = data.name?.toString().trim();

    if (!name) {
      console.error("[INVENTORY_POST] Missing name in data:", data);
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const stock = Number(data.stock);
    const minStock = Number(data.minStock);
    const costPrice = Number(data.costPrice);

    if (isNaN(stock) || isNaN(minStock) || isNaN(costPrice)) {
      return NextResponse.json({ error: "Invalid number format for stock or price" }, { status: 400 });
    }

    // Handle Create New Item
    console.log("[INVENTORY_POST] Creating new item for store:", store.id);
    const newItem = await prisma.inventoryItem.create({
      data: {
        name: name,
        barcode,
        stock: stock || 0,
        unit: data.unit?.toString() || "pcs",
        minStock: minStock || 0,
        costPrice: costPrice || 0,
        storeId: store.id,
      }
    });
    console.log("[INVENTORY_POST] Item created successfully:", newItem.id);
    return NextResponse.json(newItem);
  } catch (error: any) {
    if (error instanceof GuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[INVENTORY_API_POST_ERROR]", error);
    // Provide a more descriptive error if it's a unique constraint violation
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Barcode already exists for this store" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// PUT /api/admin/inventory (Update Item Details)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[INVENTORY_PUT] Request body:", JSON.stringify(body));
    
    const { id, slug, ...data } = body;

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (!id) return NextResponse.json({ error: "Missing item ID" }, { status: 400 });

    const { store } = await requireStoreAccessBySlug(slug);

    await ensureInventorySchema();

    // Convert empty barcode to null
    const barcode = data.barcode?.toString().trim() || null;
    const name = data.name?.toString().trim();

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const updatedId = Number(id);
    const stock = Number(data.stock);
    const minStock = Number(data.minStock);
    const costPrice = Number(data.costPrice);

    if (isNaN(updatedId) || isNaN(stock) || isNaN(minStock) || isNaN(costPrice)) {
      return NextResponse.json({ error: "Invalid number format" }, { status: 400 });
    }

    const existing = await prisma.inventoryItem.findFirst({
      where: { id: updatedId, storeId: store.id },
      select: { stock: true, minStock: true }
    });

    if (!existing) {
      return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
    }

    const updated = await prisma.inventoryItem.update({
      where: { id: updatedId, storeId: store.id },
      data: {
        name: name,
        barcode,
        stock: stock || 0,
        unit: data.unit?.toString() || "pcs",
        minStock: minStock || 0,
        costPrice: costPrice || 0,
      }
    });
    const wasLow = Number(existing.stock) <= Number(existing.minStock);
    const isLow = Number(updated.stock) <= Number(updated.minStock);
    const becameOutOfStock = Number(existing.stock) > 0 && Number(updated.stock) <= 0;
    if (!wasLow && isLow) {
      await sendLowStockReminder(store.id, {
        name: updated.name,
        stock: Number(updated.stock),
        minStock: Number(updated.minStock),
        unit: updated.unit || "pcs"
      });
    }
    if (becameOutOfStock) {
      await sendOutOfStockReminder(store.id, {
        name: updated.name,
        unit: updated.unit || "pcs"
      });
    }
    console.log("[INVENTORY_PUT] Item updated successfully:", updated.id);
    return NextResponse.json(updated);
  } catch (error: any) {
    if (error instanceof GuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[INVENTORY_API_PUT_ERROR]", error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Barcode already exists for this store" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/admin/inventory
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = parseInt(searchParams.get("id") || "");
    const slug = searchParams.get("slug");

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const { store } = await requireStoreAccessBySlug(slug);

    await ensureInventorySchema();

    await prisma.inventoryItem.delete({
      where: { id: id, storeId: store.id }
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof GuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[INVENTORY_API_DELETE]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
