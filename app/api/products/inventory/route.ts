import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const barcode = searchParams.get("barcode");
    const slug = searchParams.get("slug");

    if (!barcode || !slug) {
      return NextResponse.json({ error: "Missing barcode or slug" }, { status: 400 });
    }

    const store = await prisma.store.findUnique({
      where: { slug },
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const product = await prisma.product.findFirst({
      where: {
        storeId: store.id,
        barcode: barcode,
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error: any) {
    console.error("[INVENTORY_GET_ERROR]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { productId, amount, slug } = await req.json();

    if (!productId || amount === undefined || !slug) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const store = await prisma.store.findUnique({
      where: { slug },
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || product.storeId !== store.id) {
      return NextResponse.json({ error: "Product not found or access denied" }, { status: 404 });
    }

    const newStock = Math.max(0, product.stock + amount);

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: { stock: newStock },
    });

    return NextResponse.json({ 
      success: true, 
      product: updatedProduct 
    });
  } catch (error: any) {
    console.error("[INVENTORY_POST_ERROR]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
