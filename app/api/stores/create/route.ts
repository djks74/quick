import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import slugify from "slugify";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = (session as any).user;
    const { name, sourceStoreId } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "Store name is required" }, { status: 400 });
    }

    // Check if user is allowed to create more stores
    const dbUser = await prisma.user.findUnique({
      where: { id: parseInt(user.id) },
      include: { stores: true }
    });

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isCorporate = dbUser.stores.some(s => s.subscriptionPlan === "CORPORATE");
    const isSuperAdmin = dbUser.role === "SUPER_ADMIN";

    if (!isCorporate && !isSuperAdmin && dbUser.stores.length >= 1) {
      return NextResponse.json({ 
        error: "Please upgrade to CORPORATE plan to manage multiple outlets." 
      }, { status: 403 });
    }

    // Generate unique slug
    let slug = slugify(name, { lower: true, strict: true });
    const existingStore = await prisma.store.findUnique({ where: { slug } });
    if (existingStore) {
      slug = `${slug}-${Math.floor(Math.random() * 1000)}`;
    }

    // Create the store and optionally copy menu in a transaction
    const newStore = await prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name,
          slug,
          ownerId: dbUser.id,
          subscriptionPlan: isCorporate ? "CORPORATE" : "FREE",
          enableWhatsApp: true,
          qrisFeePercent: 1.0,
          manualTransferFee: 5000,
          posEnabled: true,
          whatsapp: dbUser.phoneNumber || "",
        }
      });

      // Copy menu if requested
      if (sourceStoreId) {
        const sourceId = parseInt(sourceStoreId);
        if (Number.isNaN(sourceId)) {
          throw new Error("Invalid source store ID");
        }
        const sourceStore = await tx.store.findUnique({
          where: { id: sourceId },
          select: { id: true, ownerId: true }
        });
        if (!sourceStore) {
          throw new Error("Source store not found");
        }
        if (!isSuperAdmin && sourceStore.ownerId !== dbUser.id) {
          throw new Error("Unauthorized source store access");
        }
        
        // Copy Categories
        const categories = await tx.category.findMany({
          where: { storeId: sourceId }
        });

        for (const cat of categories) {
          await tx.category.create({
            data: {
              storeId: store.id,
              name: cat.name,
              slug: cat.slug,
              image: cat.image,
              subCategories: cat.subCategories || [],
            }
          });
        }

        // Copy Products
        const products = await tx.product.findMany({
          where: { storeId: sourceId }
        });

        for (const prod of products) {
          await tx.product.create({
            data: {
              storeId: store.id,
              name: prod.name,
              price: prod.price,
              image: prod.image,
              gallery: prod.gallery || [],
              category: prod.category,
              subCategory: prod.subCategory,
              description: prod.description,
              shortDescription: prod.shortDescription,
              type: prod.type,
              variations: prod.variations || {},
              unit: prod.unit,
              stock: prod.stock,
              barcode: prod.barcode,
            }
          });
        }
      }

      return store;
    });

    return NextResponse.json({ success: true, slug: newStore.slug });
  } catch (error) {
    console.error("Error creating store:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    if (message.includes("Unauthorized source store access")) {
      return NextResponse.json({ error: "Unauthorized source store access" }, { status: 403 });
    }
    if (message.includes("Source store not found") || message.includes("Invalid source store ID")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
