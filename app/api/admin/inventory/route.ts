import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/admin/inventory?slug=store-slug&barcode=123
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const barcode = searchParams.get("barcode");
    const slug = searchParams.get("slug");

    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

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
  } catch (error: any) {
    console.error("[INVENTORY_API_GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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

    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) {
      console.error("[INVENTORY_POST] Store not found for slug:", slug);
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Handle Stock Update (Scanning)
    if (action === "update_stock") {
      const itemId = Number(body.itemId);
      const amount = Number(body.amount);
      
      if (isNaN(itemId) || isNaN(amount)) {
        return NextResponse.json({ error: "Invalid item ID or amount" }, { status: 400 });
      }

      console.log("[INVENTORY_POST] Updating stock for item:", itemId, "amount:", amount);
      const item = await prisma.inventoryItem.update({
        where: { id: itemId, storeId: store.id },
        data: { stock: { increment: amount } }
      });
      return NextResponse.json(item);
    }

    // Convert empty barcode to null to avoid unique constraint issues
    const barcode = data.barcode?.toString().trim() || null;
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

    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

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
    console.log("[INVENTORY_PUT] Item updated successfully:", updated.id);
    return NextResponse.json(updated);
  } catch (error: any) {
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

    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    await prisma.inventoryItem.delete({
      where: { id: id, storeId: store.id }
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[INVENTORY_API_DELETE]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
