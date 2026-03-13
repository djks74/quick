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
    const { slug, action, ...data } = body;

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    // Handle Stock Update (Scanning)
    if (action === "update_stock") {
      const { itemId, amount } = data;
      const item = await prisma.inventoryItem.update({
        where: { id: itemId, storeId: store.id },
        data: { stock: { increment: amount } }
      });
      return NextResponse.json(item);
    }

    // Handle Create New Item
    const newItem = await prisma.inventoryItem.create({
      data: {
        ...data,
        storeId: store.id,
      }
    });
    return NextResponse.json(newItem);
  } catch (error: any) {
    console.error("[INVENTORY_API_POST]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/admin/inventory (Update Item Details)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, slug, ...data } = body;

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    const updated = await prisma.inventoryItem.update({
      where: { id: id, storeId: store.id },
      data
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("[INVENTORY_API_PUT]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
