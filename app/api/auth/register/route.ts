import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";

export async function POST(req: NextRequest) {
  try {
    await ensureStoreSettingsSchema();

    const sanitizeName = (input: unknown, maxLen: number) => {
      const raw = String(input ?? "");
      const cleaned = raw
        .replace(/[<>]/g, "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLen);
      return cleaned;
    };

    const normalizeEmail = (input: unknown) => String(input ?? "").trim().toLowerCase();

    const slugify = (input: string) => {
      const ascii = String(input || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
      return ascii || `store-${Math.floor(Date.now() / 1000)}`;
    };

    const raw = await req.json();
    const email = normalizeEmail(raw?.email);
    const password = String(raw?.password ?? "");
    const name = sanitizeName(raw?.name, 60);
    const storeName = sanitizeName(raw?.storeName, 80);
    const plan = String(raw?.plan ?? "");

    if (!name || !email || !password || !storeName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password too short" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    // Validate plan
    const validPlans = ["FREE", "PRO", "ENTERPRISE", "SOVEREIGN", "CORPORATE"];
    const targetPlan = validPlans.includes(plan) ? plan : "FREE";

    // Check existing email
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json({ error: "Email already exists" }, { status: 400 });
    }

    // Create User
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate slug from store name
    let slug = slugify(storeName);
    // Ensure slug is unique
    const existingSlug = await prisma.store.findUnique({ where: { slug } });
    if (existingSlug) {
      slug = `${slug}-${Math.floor(Math.random() * 1000)}`;
    }

    // Set initial WA Credit based on plan
    let initialWaCredit = 0;
    if (targetPlan === "PRO") initialWaCredit = 10000;
    if (targetPlan === "ENTERPRISE") initialWaCredit = 25000;
    if (targetPlan === "SOVEREIGN") initialWaCredit = 50000;
    if (targetPlan === "CORPORATE") initialWaCredit = 100000;

    // Transaction: Create User -> Create Store
    const result = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "MERCHANT",
        stores: {
          create: [
            {
              name: storeName,
              slug: slug,
              subscriptionPlan: targetPlan,
              enableWhatsApp: true,
              waBalance: initialWaCredit,
              enableManualTransfer: false,
              qrisFeePercent: 1.0,
              gopayFeePercent: 2.5,
              manualTransferFee: 5000,
              whatsappToken: null,
              whatsappPhoneId: null,
              paymentGatewaySecret: null,
              paymentGatewayClientKey: null
            }
          ]
        }
      },
      include: {
        stores: true
      }
    });

    return NextResponse.json({ 
      success: true, 
      user: { id: result.id, email: result.email }, 
      store: { id: result.stores[0].id, slug: result.stores[0].slug } 
    });

  } catch (error) {
    console.error("Registration Error:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
