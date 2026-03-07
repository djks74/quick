'use server';

import { prisma } from './prisma';
import { Product, Category } from './types';

export async function getProducts(categorySlug?: string): Promise<Product[]> {
  try {
    const where: any = {};
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

export async function getCategories(): Promise<Category[]> {
  try {
    const categories = await prisma.category.findMany();
    
    // If no categories exist, seed initial ones
    if (categories.length === 0) {
      const initialCategories = [
        { name: "Makanan", slug: "makanan", subCategories: [] },
        { name: "Minuman", slug: "minuman", subCategories: [] },
        { name: "Tambahan", slug: "tambahan", subCategories: [] }
      ];
      
      for (const cat of initialCategories) {
        await prisma.category.create({ data: cat });
      }
      
      // Fetch again after seeding
      const seeded = await prisma.category.findMany();
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

export async function createCategory(data: any) {
  try {
    const category = await prisma.category.create({
      data: {
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

export async function getDashboardStats() {
  try {
    const totalRevenue = await prisma.order.aggregate({
      _sum: {
        totalAmount: true
      },
      where: {
        status: { in: ['completed', 'paid', 'COMPLETED', 'PAID'] }
      }
    });

    const totalOrders = await prisma.order.count();

    // Count unique customers by phone
    const customers = await prisma.order.groupBy({
      by: ['customerPhone'],
    });

    // Sum of all items sold
    const productsSold = await prisma.orderItem.aggregate({
      _sum: {
        quantity: true
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

export async function getOrders() {
  try {
    const orders = await prisma.order.findMany({
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
      items: o.items.length
    }));
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}

export async function createProduct(data: any) {
  try {
    const product = await prisma.product.create({
      data: {
        name: data.name,
        price: data.price,
        image: data.image,
        gallery: data.gallery,
        category: data.category,
        subCategory: data.subCategory,
        description: data.description,
        shortDescription: data.shortDescription,
        type: data.type,
        rating: data.rating,
        variations: data.variations ? data.variations : undefined,
        stock: data.stock !== undefined ? data.stock : 0
      }
    });
    return product;
  } catch (error) {
    console.error('Error creating product:', error);
    return null;
  }
}

export async function updateProduct(id: number, data: any) {
  try {
    const product = await prisma.product.update({
      where: { id },
      data: {
        name: data.name,
        price: data.price,
        image: data.image,
        gallery: data.gallery,
        category: data.category,
        subCategory: data.subCategory,
        description: data.description,
        shortDescription: data.shortDescription,
        type: data.type,
        rating: data.rating,
        variations: data.variations ? data.variations : undefined,
        stock: data.stock !== undefined ? data.stock : undefined
      }
    });
    return product;
  } catch (error) {
    console.error('Error updating product:', error);
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

export async function getStoreSettings() {
  try {
    const settings = await prisma.storeSettings.findFirst();
    return settings;
  } catch (error) {
    console.error('Error fetching store settings:', error);
    return null;
  }
}

export async function updateStoreSettings(data: any) {
  try {
    const existing = await prisma.storeSettings.findFirst();
    if (existing) {
      return await prisma.storeSettings.update({
        where: { id: existing.id },
        data: {
          storeName: data.storeName,
          whatsapp: data.whatsapp,
          themeColor: data.themeColor,
          whatsappToken: data.whatsappToken,
          whatsappPhoneId: data.whatsappPhoneId,
          enableWhatsApp: data.enableWhatsApp,
          enableMidtrans: data.enableMidtrans,
          enableXendit: data.enableXendit,
          enableManualTransfer: data.enableManualTransfer,
          paymentGatewaySecret: data.paymentGatewaySecret,
          paymentGatewayClientKey: data.paymentGatewayClientKey
        }
      });
    } else {
      return await prisma.storeSettings.create({
        data: {
          storeName: data.storeName,
          whatsapp: data.whatsapp,
          themeColor: data.themeColor,
          whatsappToken: data.whatsappToken,
          whatsappPhoneId: data.whatsappPhoneId,
          enableWhatsApp: data.enableWhatsApp,
          enableMidtrans: data.enableMidtrans,
          enableXendit: data.enableXendit,
          enableManualTransfer: data.enableManualTransfer,
          paymentGatewaySecret: data.paymentGatewaySecret,
          paymentGatewayClientKey: data.paymentGatewayClientKey
        }
      });
    }
  } catch (error) {
    console.error('Error updating store settings:', error);
    return null;
  }
}

