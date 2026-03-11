'use server';

import { prisma } from './prisma';
import { Product, Category } from './types';
import bcrypt from 'bcryptjs';

// --- Store ---

export async function getStoreBySlug(slug: string) {
  try {
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
    const where = typeof storeId === 'string' ? { slug: storeId } : { id: storeId };
    const settings = await prisma.store.findUnique({
      where: where as any
    });
    return settings;
  } catch (error) {
    console.error('Error fetching store settings:', error);
    return null;
  }
}

import { revalidatePath } from 'next/cache';

export async function updateStoreSettings(storeId: number, data: any) {
  try {
    // 1. Fetch store to get ownerId
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { ownerId: true, subscriptionPlan: true, slug: true }
    });

    if (!store) return null;

    console.log("SERVER: Updating store settings for", storeId, JSON.stringify(data));

    const canUseOwnIntegrationConfig = store.subscriptionPlan === "ENTERPRISE" && store.slug !== "demo";

    // 2. Transaction to update Store and User
    const [updatedStore] = await prisma.$transaction([
      // prisma.store.update({
      //   where: { id: storeId },
      //   data: {
      //     name: data.storeName,
      //     whatsapp: data.whatsapp,
      //     themeColor: data.themeColor,
      //     enableWhatsApp: data.enableWhatsApp,
      //     enableMidtrans: data.enableMidtrans,
      //     enableXendit: data.enableXendit,
      //     enableManualTransfer: data.enableManualTransfer,
      //     posEnabled: data.posEnabled ?? data.enablePos,
      //     taxPercent: data.taxPercent,
      //     serviceChargePercent: data.serviceChargePercent,
      //     qrisFeePercent: data.qrisFeePercent,
      //     manualTransferFee: data.manualTransferFee,
      //     feePaidBy: data.feePaidBy,
      //     posGridColumns: data.posGridColumns,
      //     ...(canUseOwnIntegrationConfig
      //       ? {
      //           whatsappToken: data.whatsappToken,
      //           whatsappPhoneId: data.whatsappPhoneId,
      //           paymentGatewaySecret: data.paymentGatewaySecret,
      //           paymentGatewayClientKey: data.paymentGatewayClientKey,
      //           bankAccount: data.bankAccount
      //         }
      //       : {})
      //   }
      // }),

      // Using update without transaction to debug if transaction is the issue, or splitting
      
      // Update store settings first
      prisma.store.update({
        where: { id: storeId },
        data: {
          name: data.storeName,
          whatsapp: data.whatsapp,
          themeColor: data.themeColor,
          enableWhatsApp: data.enableWhatsApp,
          enableMidtrans: data.enableMidtrans,
          enableXendit: data.enableXendit,
          enableManualTransfer: data.enableManualTransfer,
          posEnabled: data.posEnabled ?? data.enablePos,
          taxPercent: data.taxPercent,
          serviceChargePercent: data.serviceChargePercent,
          qrisFeePercent: data.qrisFeePercent,
          manualTransferFee: data.manualTransferFee,
          feePaidBy: data.feePaidBy,
          posGridColumns: data.posGridColumns,
          ...(canUseOwnIntegrationConfig
            ? {
                whatsappToken: data.whatsappToken,
                whatsappPhoneId: data.whatsappPhoneId,
                paymentGatewaySecret: data.paymentGatewaySecret,
                paymentGatewayClientKey: data.paymentGatewayClientKey,
                bankAccount: data.bankAccount
              }
            : {})
        }
      }),
      // Only update user phone if whatsapp number is provided
      ...(data.whatsapp ? [
        prisma.user.update({
          where: { id: store.ownerId },
          data: { phoneNumber: data.whatsapp }
        })
      ] : [])
    ]);
    
    // Revalidate paths to ensure fresh data
    revalidatePath(`/${store.slug}/admin/settings`);
    revalidatePath(`/${store.slug}/pos`);
    revalidatePath(`/${store.slug}`);

    return updatedStore;
  } catch (error) {
    console.error('Error updating store settings:', error);
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
        role: "CASHIER"
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
    const { 
        items, 
        total, 
        paymentMethod, 
        cashReceived, 
        customerPhone,
        taxAmount,
        serviceCharge,
        tipAmount,
        paymentFee
    } = data;

    const order = await prisma.order.create({
      data: {
        storeId,
        customerPhone: customerPhone || "POS-CUSTOMER",
        totalAmount: total,
        status: "COMPLETED", // POS orders are completed immediately
        paymentMethod: paymentMethod,
        taxAmount: taxAmount || 0,
        serviceCharge: serviceCharge || 0,
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
    });
    
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

    return { success: true, orderId: order.id };
  } catch (error) {
    console.error('Error creating POS order:', error);
    return { error: "Failed to create order" };
  }
}

export async function createStoreCashier(storeId: number, data: any) {
  try {
    const { name, email, password } = data;
    
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
        role: "CASHIER",
        workedAtId: storeId
      }
    });

    return { success: true, cashier };
  } catch (error) {
    console.error('Error creating cashier:', error);
    return { error: "Failed to create cashier" };
  }
}

export async function deleteStoreCashier(storeId: number, cashierId: number) {
  try {
    // Verify the cashier belongs to this store
    const cashier = await prisma.user.findFirst({
      where: {
        id: cashierId,
        workedAtId: storeId,
        role: "CASHIER"
      }
    });

    if (!cashier) {
      return { error: "Cashier not found or unauthorized" };
    }

    await prisma.user.delete({ where: { id: cashierId } });
    return { success: true };
  } catch (error) {
    console.error('Error deleting cashier:', error);
    return { error: "Failed to delete cashier" };
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
    const where: any = { storeId };
    if (categorySlug) {
      where.category = categorySlug;
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { id: 'desc' }
    });

    return products.map(p => ({
      id: p.id,
      name: p.name,
      price: p.price,
      image: p.image || '/placeholder-product.jpg',
      gallery: p.gallery || [],
      rating: p.rating,
      category: p.category || 'uncategorized',
      subCategory: p.subCategory || '',
      type: (p.type as "simple" | "variable") || 'simple',
      variations: p.variations ? JSON.parse(JSON.stringify(p.variations)) : [],
      stock: p.stock
    }));
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

export async function createProduct(storeId: number, data: any) {
  try {
    console.log("SERVER: Creating product", storeId, JSON.stringify(data));
    const product = await prisma.product.create({
      data: {
        storeId,
        name: data.name,
        price: parseFloat(data.price), // Ensure float
        image: data.image,
        gallery: data.gallery,
        category: data.category,
        subCategory: data.subCategory,
        description: data.description,
        shortDescription: data.shortDescription,
        type: data.type,
        rating: parseFloat(data.rating?.toString() || '0'),
        variations: data.variations ? data.variations : undefined,
        stock: parseInt(data.stock?.toString() || '0')
      }
    });
    console.log("SERVER: Product created", product.id);
    return product;
  } catch (error) {
    console.error('SERVER: Error creating product:', error);
    return null;
  }
}

export async function updateProduct(id: number, data: any) {
  try {
    console.log("SERVER: Updating product", id, JSON.stringify(data));
    const product = await prisma.product.update({
      where: { id },
      data: {
        name: data.name,
        price: parseFloat(data.price),
        image: data.image,
        gallery: data.gallery,
        category: data.category,
        subCategory: data.subCategory,
        description: data.description,
        shortDescription: data.shortDescription,
        type: data.type,
        rating: parseFloat(data.rating?.toString() || '0'),
        variations: data.variations ? data.variations : undefined,
        stock: parseInt(data.stock?.toString() || '0') // stock might be undefined in update if not passed? No, form passes it.
      }
    });
    console.log("SERVER: Product updated", product.id);
    return product;
  } catch (error) {
    console.error('SERVER: Error updating product:', error);
    return null;
  }
}

export async function deleteProduct(id: number) {
  try {
    await prisma.product.delete({
      where: { id }
    });
    return true;
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
      where: { storeId },
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

// --- Dashboard ---

export async function getDashboardStats(storeId: number) {
  try {
    const totalRevenue = await prisma.order.aggregate({
      _sum: {
        totalAmount: true
      },
      where: {
        storeId,
        status: { in: ['completed', 'paid', 'COMPLETED', 'PAID'] }
      }
    });

    const totalOrders = await prisma.order.count({
      where: { storeId }
    });

    // Count unique customers by phone
    const customers = await prisma.order.groupBy({
      by: ['customerPhone'],
      where: { storeId }
    });

    // Sum of all items sold - this needs a join or two-step query because OrderItem doesn't have storeId directly 
    // Wait, I didn't add storeId to OrderItem in schema, but Order has it.
    // Let's filter OrderItems where Order.storeId = storeId
    const productsSold = await prisma.orderItem.aggregate({
      _sum: {
        quantity: true
      },
      where: {
        order: {
          storeId: storeId
        }
      }
    });

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
      include: { items: true }
    });

    return orders.map(o => ({
      id: o.id.toString(),
      customerName: o.customerPhone,
      customerEmail: "",
      date: o.createdAt.toISOString(),
      status: o.status.toLowerCase(),
      total: o.totalAmount,
      currency: "IDR",
      items: o.items.length,
      paymentMethod: o.paymentMethod || 'manual',
      uniqueCode: o.uniqueCode
    }));
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}
