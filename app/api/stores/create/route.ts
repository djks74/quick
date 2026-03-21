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
    const { name } = await req.json();

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

    // Create the store
    const newStore = await prisma.store.create({
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
        // Copy some defaults if needed
      }
    });

    return NextResponse.json({ success: true, slug: newStore.slug });
  } catch (error) {
    console.error("Error creating store:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
