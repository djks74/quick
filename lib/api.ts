'use server';

import { prisma } from './prisma';
import { Product, Category } from './types';
import bcrypt from 'bcryptjs';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createOrderNotification, ensureOrderNotificationsSchema } from "@/lib/order-notifications";
import { ensureWaCreditSchema } from "@/lib/wa-credit";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";
import { lookupBiteshipAreaIdFromInput } from "@/lib/shipping-biteship";
import { triggerPartnerWebhook } from "@/lib/webhook-partner";

let ensuredRecipeSchema: Promise<void> | null = null;

async function ensureRecipeSchema() {
  if (!ensuredRecipeSchema) {
    ensuredRecipeSchema = (async () => {
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

  await ensuredRecipeSchema;
}

// --- Store ---

export async function isStoreOpen(store: any) {
  if (!store.isActive) return false;
  if (!store.isOpen) return false; // Manual override: Closed

  if (!store.operatingHours) return true; // Default to open if no schedule set

  const tz = store.timezone || "Asia/Jakarta";
  const now = new Date();
  
  // Get current time in store's timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value.toLowerCase() || "";
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || "0");
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || "0");
  const currentTime = hour * 60 + minute;

  const hours = store.operatingHours as any;
  const todaySchedule = hours[weekday];

  if (!todaySchedule || todaySchedule.closed) return false;

  const [openH, openM] = todaySchedule.open.split(':').map(Number);
  const [closeH, closeM] = todaySchedule.close.split(':').map(Number);
  
  const openTime = openH * 60 + openM;
  const closeTime = closeH * 60 + closeM;

  return currentTime >= openTime && currentTime <= closeTime;
}

export async function getStoreBySlug(slug: string) {
  try {
    await ensureWaCreditSchema();
    await ensureStoreSettingsSchema();
    const store = await prisma.store.findUnique({
      where: { slug }
    });
    return store;
  } catch (error) {
    console.error('Error fetching store by slug:', error);
    return null;
  }
}

export async function getStoreSettings(storeId: number | string) {
  try {
    await ensureWaCreditSchema();
    await ensureStoreSettingsSchema();
    const where = typeof storeId === 'string' ? { slug: storeId } : { id: storeId };
    const settings = await prisma.store.findUnique({
      where: where as any
    });
    if (!settings) return null;

    const canUseOwnIntegrationConfig =
      settings.subscriptionPlan === "ENTERPRISE" &&
      settings.slug !== "demo";

    if (!canUseOwnIntegrationConfig) {
      const platform = await prisma.platformSettings.findUnique({
        where: { key: "default" },
        select: {
          whatsappToken: true,
          whatsappPhoneId: true,
          midtransServerKey: true,
          midtransClientKey: true,
          biteshipApiKey: true
        }
      });

      return {
        ...settings,
        whatsappToken: platform?.whatsappToken ?? settings.whatsappToken,
        whatsappPhoneId: platform?.whatsappPhoneId ?? settings.whatsappPhoneId,
        paymentGatewaySecret: platform?.midtransServerKey ?? settings.paymentGatewaySecret,
        paymentGatewayClientKey: platform?.midtransClientKey ?? settings.paymentGatewayClientKey,
        biteshipApiKey: platform?.biteshipApiKey ?? settings.biteshipApiKey
      };
    }

    return settings;
  } catch (error) {
    console.error('Error fetching store settings:', error);
    return null;
  }
}

import { revalidatePath } from 'next/cache';
import crypto from 'crypto';

export async function updateStoreSettings(storeId: number, data: any) {
  try {
    await ensureStoreSettingsSchema();
    // 1. Fetch store to get ownerId
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { ownerId: true, subscriptionPlan: true, slug: true }
    });

    if (!store) return null;

    const canUseOwnIntegrationConfig = store.subscriptionPlan === "ENTERPRISE" && store.slug !== "demo";

    // 2. Update Store and User
    const updatedStore = await prisma.store.update({
      where: { id: storeId },
      data: {
        name: data.storeName,
        whatsapp: data.whatsapp,
        themeColor: data.themeColor,
        enableWhatsApp: data.enableWhatsApp,
        enableMidtrans: data.enableMidtrans,
        enableManualTransfer: data.enableManualTransfer,
        posEnabled: data.posEnabled ?? data.enablePos,
        taxPercent: data.taxPercent,
        serviceChargePercent: data.serviceChargePercent,
        qrisFeePercent: data.qrisFeePercent,
        manualTransferFee: data.manualTransferFee,
        feePaidBy: data.feePaidBy,
        posGridColumns: data.posGridColumns,
        posPaymentMethods: Array.isArray(data.posPaymentMethods) ? data.posPaymentMethods : [],
        shippingEnableJne: data.shippingEnableJne ?? false,
        shippingEnableGosend: data.shippingEnableGosend ?? false,
        shippingJneOnly: data.shippingJneOnly ?? false,
        shippingEnableStoreCourier: data.shippingEnableStoreCourier ?? false,
        shippingStoreCourierFee: data.shippingStoreCourierFee !== undefined && data.shippingStoreCourierFee !== null && data.shippingStoreCourierFee !== "" ? Number(data.shippingStoreCourierFee) : 0,
        enableTakeawayDelivery: data.enableTakeawayDelivery ?? true,
        biteshipOriginAreaId: data.biteshipOriginAreaId || null,
        biteshipOriginLat: data.biteshipOriginLat !== undefined && data.biteshipOriginLat !== null && data.biteshipOriginLat !== "" ? Number(data.biteshipOriginLat) : null,
        biteshipOriginLng: data.biteshipOriginLng !== undefined && data.biteshipOriginLng !== null && data.biteshipOriginLng !== "" ? Number(data.biteshipOriginLng) : null,
        shippingSenderName: data.shippingSenderName || null,
        shippingSenderPhone: data.shippingSenderPhone || null,
        shippingSenderAddress: data.shippingSenderAddress || null,
        shippingSenderPostalCode: data.shippingSenderPostalCode || null,
        webhookUrl: data.webhookUrl || null,
        customGeminiKey: data.customGeminiKey || null,
        enableAiChatWidget: data.enableAiChatWidget ?? true,
        operatingHours: data.operatingHours || null,
        timezone: data.timezone || null,
        ...(canUseOwnIntegrationConfig
          ? {
              whatsappToken: data.whatsappToken,
              whatsappPhoneId: data.whatsappPhoneId,
              paymentGatewaySecret: data.paymentGatewaySecret,
              paymentGatewayClientKey: data.paymentGatewayClientKey,
              bankAccount: data.bankAccount,
              biteshipApiKey: data.biteshipApiKey
            }
          : {})
      }
    });

    if (data.whatsapp) {
      await prisma.user.update({
        where: { id: store.ownerId },
        data: { phoneNumber: data.whatsapp }
      });
    }

    let finalStore: any = updatedStore;
    const postalDigits = String(data?.shippingSenderPostalCode || "").replace(/\D/g, "");
    const wantsAutoOriginAreaId = !String(data?.biteshipOriginAreaId || "").trim() && !!postalDigits;
    const missingOriginAreaId = !String((updatedStore as any)?.biteshipOriginAreaId || "").trim();
    if (wantsAutoOriginAreaId && missingOriginAreaId) {
      const areaId = await lookupBiteshipAreaIdFromInput(updatedStore, postalDigits);
      if (areaId) {
        finalStore = await prisma.store.update({
          where: { id: storeId },
          data: { biteshipOriginAreaId: areaId }
        });
      }
    }

    if (data?.posUsername || data?.posPassword) {
      await upsertPosCashier(storeId, store.slug, data.posUsername, data.posPassword);
    }
    
    // Revalidate paths to ensure fresh data
    revalidatePath(`/${store.slug}/admin/settings`);
    revalidatePath(`/${store.slug}/pos`);
    revalidatePath(`/${store.slug}`);

    return finalStore;
  } catch (error) {
    console.error('Error updating store settings:', error);
    return null;
  }
}

export async function getPosCashierUsername(storeId: number) {
  try {
    const email = `pos+${storeId}@pos.local`;
    const user = await prisma.user.findUnique({
      where: { email },
      select: { name: true }
    });
    return user?.name || "";
  } catch (error) {
    console.error('Error fetching POS cashier:', error);
    return "";
  }
}

export async function generateApiKey(storeId: number) {
  try {
    await ensureStoreSettingsSchema();
    const key = `gc_live_${crypto.randomBytes(24).toString('hex')}`;
    const updated = await prisma.store.update({
      where: { id: storeId },
      data: { apiKey: key }
    });
    return updated.apiKey;
  } catch (error) {
    console.error('Error generating API Key:', error);
    return null;
  }
}

export async function upsertPosCashier(storeId: number, storeSlug: string, username?: string, password?: string) {
  const normalizedUsername = username?.toString().trim();
  const normalizedPassword = password?.toString();

  if (!normalizedUsername && !normalizedPassword) return null;

  const email = `pos+${storeId}@pos.local`;
  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    if (!normalizedPassword) return null;
    const passwordHash = await bcrypt.hash(normalizedPassword, 10);
    const created = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        name: normalizedUsername || `pos-${storeSlug}`,
        role: "CASHIER",
        workedAtId: storeId
      }
    });
    return created;
  }

  const updateData: any = {
    role: "CASHIER",
    workedAtId: storeId
  };
  if (normalizedUsername) updateData.name = normalizedUsername;
  if (normalizedPassword) updateData.password = await bcrypt.hash(normalizedPassword, 10);

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: updateData
  });
  return updated;
}

export async function toggleStoreActive(storeId: number, isActive: boolean) {
  try {
    const updated = await prisma.store.update({
      where: { id: storeId },
      data: { isActive }
    });
    
    revalidatePath(`/dashboard`);
    revalidatePath(`/${updated.slug}`);
    revalidatePath(`/${updated.slug}/admin`);
    
    return updated;
  } catch (error) {
    console.error('Error toggling store active:', error);
    return null;
  }
}

export async function toggleStoreStatus(storeId: number, isOpen: boolean) {
  try {
    const updated = await prisma.store.update({
      where: { id: storeId },
      data: { isOpen }
    });
    
    revalidatePath(`/${updated.slug}`);
    revalidatePath(`/${updated.slug}/admin`);
    
    return updated;
  } catch (error) {
    console.error('Error toggling store status:', error);
    return null;
  }
}

export async function updateStoreDomain(storeId: number, domain: string) {
  try {
    return await prisma.store.update({
      where: { id: storeId },
      data: { customDomain: domain }
    });
  } catch (error) {
    console.error('Error updating store domain:', error);
    return null;
  }
}

// --- Users / Cashiers ---

export async function getStoreCashiers(storeId: number) {
  try {
    const cashiers = await prisma.user.findMany({
      where: {
        workedAtId: storeId,
        role: { in: ["CASHIER", "MANAGER"] }
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true
      }
    });
    return cashiers;
  } catch (error) {
    console.error('Error fetching cashiers:', error);
    return [];
  }
}

export async function createPosOrder(storeId: number, data: any) {
  try {
    await ensureOrderNotificationsSchema();
    await ensureStoreSettingsSchema();
    const { 
        items, 
        total, 
        paymentMethod, 
        cashReceived, 
        customerPhone,
        taxAmount,
        serviceCharge,
        discountAmount,
        tipAmount,
        paymentFee
    } = data;

    const netAmount = total - (paymentFee || 0);
    const [order] = await prisma.$transaction([
      prisma.order.create({
        data: {
          storeId,
          customerPhone: customerPhone || "POS-CUSTOMER",
          totalAmount: total,
          status: "COMPLETED",
          paymentMethod: paymentMethod,
          taxAmount: taxAmount || 0,
          serviceCharge: serviceCharge || 0,
          discountAmount: discountAmount || 0,
          tipAmount: tipAmount || 0,
          paymentFee: paymentFee || 0,
          items: {
              create: items.map((item: any) => ({
                  productId: item.id,
                  quantity: item.quantity,
                  price: item.price
              }))
          }
        }
      }),
      prisma.store.update({
        where: { id: storeId },
        data: { balance: { increment: netAmount } }
      })
    ]);
    
    // Update stock
    for (const item of items) {
        try {
            await prisma.product.update({
                where: { id: item.id },
                data: { stock: { decrement: item.quantity } }
            });
        } catch (e) {
            console.error(`Failed to update stock for product ${item.id}`, e);
        }
    }

    await createOrderNotification({
      storeId,
      orderId: order.id,
      source: "POS",
      title: `New POS order #${order.id}`,
      body: `${customerPhone || "POS-CUSTOMER"} • Rp ${Math.round(total).toLocaleString("id-ID")}`,
      metadata: {
        paymentMethod,
        totalAmount: total,
        discountAmount: discountAmount || 0
      }
    });

    // Trigger Partner Webhook
    triggerPartnerWebhook(order.id).catch((e) => console.error("PARTNER_WEBHOOK_FAILED", e));

    return { success: true, orderId: order.id };
  } catch (error) {
    console.error('Error creating POS order:', error);
    return { error: "Failed to create order" };
  }
}

export async function createStoreCashier(storeId: number, data: any) {
  try {
    const { name, email, password, role } = data;
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return { error: "User with this email already exists" };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const cashier = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role || "CASHIER",
        workedAtId: storeId
      }
    });

    return { success: true, cashier };
  } catch (error) {
    console.error('Error creating cashier:', error);
    return { error: "Failed to create cashier" };
  }
}

export async function getOrderNotifications(storeId: number, limit = 20) {
  try {
    await ensureOrderNotificationsSchema();
    const rows = await prisma.orderNotification.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        orderId: true,
        source: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
        metadata: true
      }
    });
    return rows.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      readAt: r.readAt ? r.readAt.toISOString() : null
    }));
  } catch (error) {
    console.error("Error fetching order notifications:", error);
    return [];
  }
}

export async function markOrderNotificationRead(id: number) {
  try {
    await ensureOrderNotificationsSchema();
    await prisma.orderNotification.update({
      where: { id },
      data: { readAt: new Date() }
    });
    return true;
  } catch (error) {
    console.error("Error marking notification read:", error);
    return false;
  }
}

export async function markAllOrderNotificationsRead(storeId: number) {
  try {
    await ensureOrderNotificationsSchema();
    await prisma.orderNotification.updateMany({
      where: { storeId, readAt: null },
      data: { readAt: new Date() }
    });
    return true;
  } catch (error) {
    console.error("Error marking all notifications read:", error);
    return false;
  }
}

export async function deleteStoreCashier(storeId: number, cashierId: number) {
  try {
    // Verify the user belongs to this store and has staff role
    const staff = await prisma.user.findFirst({
      where: {
        id: cashierId,
        workedAtId: storeId,
        role: { in: ["CASHIER", "MANAGER"] }
      }
    });

    if (!staff) {
      return { error: "Staff user not found or unauthorized" };
    }

    await prisma.user.delete({ where: { id: cashierId } });
    return { success: true };
  } catch (error) {
    console.error('Error deleting staff:', error);
    return { error: "Failed to delete staff" };
  }
}

// --- Tables ---

export async function getTables(storeId: number) {
  try {
    return await prisma.table.findMany({ where: { storeId }, orderBy: { createdAt: 'asc' } });
  } catch (error) {
    console.error('Error fetching tables:', error);
    return [];
  }
}

export async function createTable(storeId: number, name: string, identifier: string) {
  try {
    console.log("SERVER: Creating table for store", storeId, name, identifier);
    const table = await prisma.table.create({
      data: { storeId, name, identifier }
    });
    console.log("SERVER: Table created", table);
    return table;
  } catch (error) {
    console.error('SERVER: Error creating table:', error);
    return null;
  }
}

export async function deleteTable(id: number) {
  try {
    await prisma.table.delete({ where: { id } });
    return true;
  } catch (error) {
    console.error('Error deleting table:', error);
    return false;
  }
}

// --- Products ---

export async function getProducts(storeId: number, categorySlug?: string): Promise<Product[]> {
  try {
    await ensureRecipeSchema();
    const where: any = { 
      storeId,
      category: { not: "_ARCHIVED_" }
    };
    if (categorySlug) {
      where.category = categorySlug;
    }

    let products: any[] = [];
    try {
      products = await prisma.product.findMany({
        where,
        orderBy: { id: 'desc' },
        select: {
          id: true,
          name: true,
          price: true,
          image: true,
          gallery: true,
          rating: true,
          category: true,
          subCategory: true,
          type: true,
          variations: true,
          stock: true,
          barcode: true,
          ingredients: {
            include: {
              inventoryItem: {
                select: {
                  id: true,
                  name: true,
                  unit: true,
                  costPrice: true
                }
              }
            }
          }
        }
      });
    } catch (error: any) {
      const code = error?.code;
      if (code === 'P2022' || code === 'P2021') {
        products = await prisma.product.findMany({
          where,
          orderBy: { id: 'desc' },
          select: {
            id: true,
            name: true,
            price: true,
            image: true,
            gallery: true,
            rating: true,
            category: true,
            subCategory: true,
            type: true,
            variations: true,
            stock: true
          }
        });
      } else {
        throw error;
      }
    }

    return products.map(p => ({
      id: p.id,
      name: p.name,
      price: p.price,
      image: !p.image || p.image === '/placeholder-product.jpg' ? '/placeholder-product.svg' : p.image,
      gallery: p.gallery || [],
      rating: p.rating,
      category: p.category || 'uncategorized',
      subCategory: p.subCategory || '',
      type: (p.type as "simple" | "variable") || 'simple',
      variations: p.variations ? JSON.parse(JSON.stringify(p.variations)) : [],
      stock: p.stock,
      barcode: p.barcode || undefined,
      ingredients: p.ingredients?.map((i: any) => ({
        id: i.id,
        productId: i.productId,
        inventoryItemId: i.inventoryItemId,
        quantity: i.quantity,
        quantityUnit: i.quantityUnit || "pcs",
        baseUnit: i.baseUnit || "pcs",
        conversionFactor: i.conversionFactor ?? 1,
        inventoryItem: i.inventoryItem
      })) || []
    }));
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

export async function createProduct(storeId: number, data: any) {
  try {
    await ensureRecipeSchema();
    console.log("SERVER: Creating product", storeId, JSON.stringify(data));
    const baseData: any = {
      storeId,
      name: data.name,
      price: parseFloat(data.price),
      image: data.image,
      gallery: data.gallery,
      category: data.category,
      subCategory: data.subCategory,
      description: data.description,
      shortDescription: data.shortDescription,
      type: data.type,
      rating: parseFloat(data.rating?.toString() || '0') || 0,
      variations: data.variations ? data.variations : undefined,
      stock: parseInt(data.stock?.toString() || '0') || 0,
      barcode: data.barcode?.toString().trim() || null,
    };

    let product: any;
    try {
      product = await prisma.product.create({
        data: {
          ...baseData,
          ingredients: {
            create: data.ingredients?.map((i: any) => ({
              inventoryItemId: Number(i.inventoryItemId),
              quantity: parseFloat(i.quantity) || 0,
              quantityUnit: i.quantityUnit || "pcs",
              baseUnit: i.baseUnit || "pcs",
              conversionFactor: Math.max(0.000001, parseFloat(i.conversionFactor) || 1)
            }))
          }
        },
        include: {
          ingredients: {
            include: {
              inventoryItem: true
            }
          }
        }
      });
    } catch (error: any) {
      const code = error?.code;
      if (code === 'P2021') {
        product = await prisma.product.create({
          data: baseData
        });
      } else if (code === 'P2022') {
        const { barcode, ...withoutBarcode } = baseData;
        product = await prisma.product.create({
          data: withoutBarcode
        });
      } else {
        throw error;
      }
    }
    console.log("SERVER: Product created", product.id);

    if (product) {
      // Trigger Reverse Sync for the new product
      triggerReverseSync(product.id, 'create').catch(err => console.error("[SYNC_ERROR] Async create trigger failed:", err));
    }

    return product;
  } catch (error) {
    console.error('SERVER: Error creating product:', error);
    return null;
  }
}

export async function triggerReverseSync(productId: number, action: 'upsert' | 'delete' | 'create' = 'upsert') {
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        store: {
          select: {
            apiKey: true,
            webhookUrl: true
          }
        }
      }
    });

    if (!product || !product.store.webhookUrl) return;
    
    // For upsert/delete, we definitely need externalId if it's a synced product
    // For create, we might not have it yet, but we want to tell WordPress to create it
    if (action !== 'create' && !product.externalId) return;

    console.log(`[SYNC] Triggering reverse sync (${action}) for product "${product.name}" (ID: ${productId}, ExternalID: ${product.externalId}) to ${product.store.webhookUrl}`);
    
    let wpWebhookUrl = product.store.webhookUrl.trim();
    if (!wpWebhookUrl.startsWith('http')) {
      wpWebhookUrl = 'https://' + wpWebhookUrl;
    }
    
    try {
      const urlObj = new URL(wpWebhookUrl);
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
      wpWebhookUrl = baseUrl.replace(/\/$/, '') + '/wp-json/gercep/v1/sync-back';
    } catch (e) {
      wpWebhookUrl = wpWebhookUrl.replace(/\/$/, '') + '/wp-json/gercep/v1/sync-back';
    }
    
    console.log(`[SYNC] Target Webhook URL: ${wpWebhookUrl}`);

    const res = await fetch(wpWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': product.store.apiKey || ''
      },
      body: JSON.stringify({
        action,
        externalId: product.externalId,
        name: product.name,
        price: product.price,
        stock: product.stock,
        category: product.category,
        description: product.description,
        image: product.image
      })
    });

    const body = await res.text();
    console.log(`[SYNC_RESPONSE] Action: ${action}, Status: ${res.status}, Body: ${body}`);
    
    // If it was a create action and WordPress returned an ID, we should save it
    if (action === 'create' && res.ok) {
      try {
        const json = JSON.parse(body);
        if (json.externalId) {
          await prisma.product.update({
            where: { id: productId },
            data: { externalId: String(json.externalId) }
          });
          console.log(`[SYNC] Updated product ${productId} with new WordPress ExternalID: ${json.externalId}`);
        }
      } catch (e) {}
    }
  } catch (err: any) {
    console.error(`[SYNC_ERROR] Failed to notify WordPress (${action}): ${err.message}`);
  }
}

export async function updateProduct(id: number, data: any) {
  try {
    await ensureRecipeSchema();
    console.log("SERVER: Updating product", id, JSON.stringify(data));
    
    // Use a transaction to update product and its ingredients
    const updateData: any = {
      name: data.name,
      price: parseFloat(data.price),
      image: data.image,
      gallery: data.gallery,
      category: data.category,
      subCategory: data.subCategory,
      description: data.description,
      shortDescription: data.shortDescription,
      type: data.type,
      rating: parseFloat(data.rating?.toString() || '0') || 0,
      variations: data.variations ? data.variations : undefined,
      stock: parseInt(data.stock?.toString() || '0') || 0,
      barcode: data.barcode?.toString().trim() || null,
    };

    let result: any;
    try {
      result = await prisma.$transaction(async (tx) => {
        await tx.productIngredient.deleteMany({
          where: { productId: id }
        });

        const product = await tx.product.update({
          where: { id },
          data: {
            ...updateData,
            ingredients: {
              create: data.ingredients?.map((i: any) => ({
                inventoryItemId: Number(i.inventoryItemId),
                quantity: parseFloat(i.quantity) || 0,
                quantityUnit: i.quantityUnit || "pcs",
                baseUnit: i.baseUnit || "pcs",
                conversionFactor: Math.max(0.000001, parseFloat(i.conversionFactor) || 1)
              }))
            }
          },
          include: {
            store: {
              select: {
                slug: true
              }
            }
          }
        });

        return product;
      });
    } catch (dbError: any) {
      console.error("DB Update Error:", dbError);
      throw dbError;
    }

    if (result) {
      // Trigger Reverse Sync in background
      triggerReverseSync(id).catch(err => console.error("[SYNC_ERROR] Async trigger failed:", err));
      
      if (result.store?.slug) {
        revalidatePath(`/${result.store.slug}`);
      }
    }
    return result;
  } catch (error) {
    console.error('SERVER: Error updating product:', error);
    return null;
  }
}

export async function deleteProduct(id: number) {
  try {
    // 1. Trigger Reverse Sync before deletion to ensure we have the externalId
    await triggerReverseSync(id, 'delete').catch(err => console.error("[SYNC_ERROR] Async delete trigger failed:", err));

    // 2. Try to delete the product
    try {
      // Delete ingredients first due to foreign key constraints
      await prisma.productIngredient.deleteMany({
        where: { productId: id }
      });
      
      await prisma.product.delete({
        where: { id }
      });
      return true;
    } catch (error: any) {
      // 3. Handle Foreign Key Constraint (P2003) - e.g. Product is in an Order
      if (error.code === 'P2003') {
        console.log(`[SOFT_DELETE] Product ${id} has order history. Archiving instead of deleting.`);
        
        await prisma.product.update({
          where: { id },
          data: {
            category: "_ARCHIVED_",
            externalId: null, // Clear this so it doesn't conflict with future syncs
            name: `[ARCHIVED] ${new Date().toISOString().split('T')[0]} - ID ${id}` // Rename to avoid unique name constraint conflicts
          }
        });
        return true;
      }
      throw error;
    }
  } catch (error) {
    console.error('Error deleting product:', error);
    return false;
  }
}

// --- Categories ---

export async function getCategories(storeId: number): Promise<Category[]> {
  try {
    const categories = await prisma.category.findMany({
      where: { storeId }
    });
    
    // If no categories exist, seed initial ones for this store
    if (categories.length === 0) {
      const initialCategories = [
        { name: "Makanan", slug: "makanan", subCategories: [], storeId },
        { name: "Minuman", slug: "minuman", subCategories: [], storeId },
        { name: "Tambahan", slug: "tambahan", subCategories: [], storeId }
      ];
      
      for (const cat of initialCategories) {
        await prisma.category.create({ data: cat });
      }
      
      const seeded = await prisma.category.findMany({ where: { storeId } });
      return seeded.map(c => ({
        id: c.id.toString(),
        name: c.name,
        slug: c.slug,
        count: 0,
        subCategories: c.subCategories ? JSON.parse(JSON.stringify(c.subCategories)) : []
      }));
    }

    // Count products per category
    const products = await prisma.product.groupBy({
      by: ['category'],
      where: { 
        storeId,
        category: { not: "_ARCHIVED_" }
      },
      _count: { category: true }
    });

    const countMap = products.reduce((acc, p) => {
      if (p.category) acc[p.category] = p._count.category;
      return acc;
    }, {} as Record<string, number>);

    return categories.map(c => ({
      id: c.id.toString(),
      name: c.name,
      slug: c.slug,
      count: countMap[c.slug] || 0,
      subCategories: c.subCategories ? JSON.parse(JSON.stringify(c.subCategories)) : []
    }));
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

export async function createCategory(storeId: number, data: any) {
  try {
    const category = await prisma.category.create({
      data: {
        storeId,
        name: data.name,
        slug: data.name.toLowerCase().replace(/ /g, '-'),
        subCategories: data.subCategories || []
      }
    });
    return category;
  } catch (error) {
    console.error('Error creating category:', error);
    return null;
  }
}

export async function updateCategory(id: number, data: any) {
  try {
    const category = await prisma.category.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        subCategories: data.subCategories || []
      }
    });
    return category;
  } catch (error) {
    console.error('Error updating category:', error);
    return null;
  }
}

export async function deleteCategory(id: number) {
  try {
    await prisma.category.delete({
      where: { id }
    });
    return true;
  } catch (error) {
    console.error('Error deleting category:', error);
    return false;
  }
}

// --- Inventory ---

export async function getInventoryItems(storeId: number) {
  try {
    return await prisma.inventoryItem.findMany({
      where: { storeId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        barcode: true,
        stock: true,
        unit: true,
        minStock: true,
        costPrice: true
      }
    });
  } catch (error) {
    console.error('Error fetching inventory items:', error);
    return [];
  }
}

// --- Dashboard ---

export async function getDashboardStats(storeId: number) {
  try {
    const [totalRevenue, totalOrders, customers, productsSold] = await Promise.all([
      prisma.order.aggregate({
        _sum: {
          totalAmount: true
        },
        where: {
          storeId,
          status: { in: ['completed', 'paid', 'COMPLETED', 'PAID'] }
        }
      }),
      prisma.order.count({
        where: { storeId }
      }),
      prisma.order.groupBy({
        by: ['customerPhone'],
        where: { storeId }
      }),
      prisma.orderItem.aggregate({
        _sum: {
          quantity: true
        },
        where: {
          order: {
            storeId: storeId
          }
        }
      })
    ]);

    return {
      totalRevenue: totalRevenue._sum.totalAmount || 0,
      totalOrders,
      activeCustomers: customers.length,
      productsSold: productsSold._sum.quantity || 0
    };
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return {
      totalRevenue: 0,
      totalOrders: 0,
      activeCustomers: 0,
      productsSold: 0
    };
  }
}

export async function getOrders(storeId: number) {
  try {
    const orders = await prisma.order.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        customerPhone: true,
        createdAt: true,
        status: true,
        totalAmount: true,
        paymentMethod: true,
        uniqueCode: true,
        taxAmount: true,
        serviceCharge: true,
        paymentFee: true,
        transactionFee: true,
        tableNumber: true,
        orderType: true,
        biteshipOrderId: true,
        shippingProvider: true,
        shippingService: true,
        shippingStatus: true,
        shippingTrackingNo: true,
        shippingAddress: true,
        shippingCost: true,
        shippingEta: true,
        _count: {
          select: { items: true }
        }
      }
    });

    return orders.map(o => ({
      id: o.id.toString(),
      customerName: o.customerPhone,
      customerEmail: "",
      customerPhone: o.customerPhone,
      date: o.createdAt.toISOString(),
      status: o.status.toLowerCase(),
      total: o.totalAmount,
      currency: "IDR",
      items: o._count.items,
      paymentMethod: o.paymentMethod || 'manual',
      uniqueCode: o.uniqueCode,
      taxAmount: o.taxAmount,
      serviceCharge: o.serviceCharge,
      paymentFee: o.paymentFee,
      transactionFee: o.transactionFee,
      tableNumber: o.tableNumber,
      orderType: o.orderType,
      biteshipOrderId: o.biteshipOrderId,
      shippingProvider: o.shippingProvider,
      shippingService: o.shippingService,
      shippingStatus: o.shippingStatus,
      shippingTrackingNo: o.shippingTrackingNo,
      shippingAddress: o.shippingAddress,
      shippingCost: o.shippingCost,
      shippingEta: o.shippingEta
    }));
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}

export async function getOrderDetails(orderId: number) {
  try {
    return await prisma.order.findUnique({
      where: { id: orderId },
      include: { 
        items: {
          include: { product: true }
        }
      }
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    return null;
  }
}
