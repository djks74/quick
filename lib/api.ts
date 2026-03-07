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
  // Return simple categories suitable for a food menu
  return [
    {
      id: "1",
      name: "Makanan",
      slug: "makanan",
      count: 0,
      subCategories: []
    },
    {
      id: "2",
      name: "Minuman",
      slug: "minuman",
      count: 0,
      subCategories: []
    },
    {
      id: "3",
      name: "Tambahan",
      slug: "tambahan",
      count: 0,
      subCategories: []
    }
  ];
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

