import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getShippingQuoteFromBiteship } from "@/lib/shipping-biteship";

const AI_API_KEY = process.env.AI_API_KEY || "gercep_ai_secret_123";

// These are the actual implementations of the tools Gemini will call
const tools: Record<string, (args: any) => Promise<any>> = {
  async search_stores({ query }: { query: string }) {
    const stores = await prisma.store.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
          { categories: { some: { name: { contains: query, mode: "insensitive" } } } },
          { products: { some: { name: { contains: query, mode: "insensitive" } } } }
        ]
      },
      select: { 
        name: true, 
        slug: true,
        categories: { select: { name: true }, take: 2 },
        products: { 
          where: { name: { contains: query, mode: "insensitive" } },
          select: { name: true },
          take: 2
        }
      },
      take: 5
    });
    return { stores };
  },

  async get_store_stats({ slug }: { slug: string }) {
    const store = await prisma.store.findUnique({
      where: { slug },
      include: {
        orders: { where: { status: "PAID" }, select: { totalAmount: true } }
      }
    });
    if (!store) return { error: "Store not found" };
    const totalSales = store.orders.reduce((sum, o) => sum + o.totalAmount, 0);
    return {
      storeName: store.name,
      totalSales,
      walletBalance: store.balance,
      waBalance: store.waBalance
    };
  },

  async get_store_products({ slug }: { slug: string }) {
    const store = await prisma.store.findUnique({
      where: { slug },
      include: {
        products: {
          where: { category: { not: "System" } },
          select: { id: true, name: true, price: true, category: true }
        }
      }
    });
    if (!store) return { error: "Store not found" };
    return { products: store.products };
  },

  async get_shipping_rates({ slug, address, weightGrams }: any) {
    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return { error: "Store not found" };
    const options = await getShippingQuoteFromBiteship({
      store,
      destinationAddress: address,
      weightGrams: weightGrams || 1000
    });
    return { options };
  },

  async create_customer_order({ slug, customer_phone, items, order_type, address, shippingProvider, shippingService, shippingFee, payment_method }: any) {
    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return { error: "Store not found" };

    let itemsAmount = 0;
    const orderItemsData = [];
    for (const item of items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId, storeId: store.id } });
      if (!product) return { error: `Product ID ${item.productId} not found` };
      itemsAmount += product.price * item.quantity;
      orderItemsData.push({ productId: product.id, quantity: item.quantity, price: product.price });
    }

    const taxAmount = itemsAmount * (store.taxPercent / 100);
    const serviceCharge = itemsAmount * (store.serviceChargePercent / 100);
    
    let paymentFee = 0;
    if (payment_method === "qris") {
      paymentFee = (itemsAmount + taxAmount + serviceCharge + (Number(shippingFee) || 0)) * 0.01;
    } else if (payment_method === "bank_transfer") {
      paymentFee = 5000;
    }

    const finalAmount = itemsAmount + taxAmount + serviceCharge + (Number(shippingFee) || 0) + paymentFee;

    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        customerPhone: customer_phone,
        totalAmount: finalAmount,
        taxAmount,
        serviceCharge,
        paymentFee,
        status: "PENDING",
        orderType: order_type,
        paymentMethod: payment_method || null,
        shippingAddress: address || null,
        shippingProvider: shippingProvider || null,
        shippingService: shippingService || null,
        shippingCost: shippingFee || 0,
        notes: JSON.stringify({ source: "AI_CHAT_ASSISTANT" }),
        items: { create: orderItemsData }
      } as any
    });

    return {
      success: true,
      orderId: order.id,
      totalAmount: finalAmount,
      paymentUrl: `https://gercep.click/checkout/pay/${order.id}`
    };
  },

  async create_merchant_invoice({ amount, customer_phone, merchant_phone, payment_method }: any) {
    const user = await prisma.user.findFirst({
      where: { phoneNumber: { contains: merchant_phone.replace(/\D/g, "") } },
      include: { stores: true }
    });
    const store = user?.stores[0];
    if (!store) return { error: "Merchant store not found" };

    let product = await prisma.product.findFirst({
      where: { storeId: store.id, name: "Tagihan Manual" }
    });
    if (!product) {
      product = await prisma.product.create({
        data: {
          storeId: store.id,
          name: "Tagihan Manual",
          category: "System",
          price: 0,
          description: "Produk otomatis untuk tagihan manual",
          stock: 999999
        }
      });
    }

    let paymentFee = 0;
    if (payment_method === "qris") {
      paymentFee = amount * 0.01;
    } else if (payment_method === "bank_transfer") {
      paymentFee = 5000;
    }

    const finalAmount = amount + paymentFee;

    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        customerPhone: customer_phone,
        totalAmount: finalAmount,
        paymentFee,
        status: "PENDING",
        orderType: "TAKEAWAY",
        paymentMethod: payment_method || null,
        notes: JSON.stringify({ kind: "MERCHANT_INVOICE", requestedBy: merchant_phone }),
        items: {
          create: {
            productId: product.id,
            quantity: 1,
            price: amount
          }
        }
      } as any
    });

    return {
      success: true,
      orderId: order.id,
      totalAmount: finalAmount,
      paymentUrl: `https://gercep.click/checkout/pay/${order.id}`
    };
  }
};

export async function POST(req: NextRequest) {
  try {
    const { message, history, isPublic, context } = await req.json();

    // If not public, require session
    if (!isPublic) {
      const session = await getServerSession(authOptions);
      if (!session || (session as any).user?.role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Get Gemini Key from PlatformSettings
    const settings = await prisma.platformSettings.findUnique({ where: { key: "default" } }) as any;
    const geminiKey = settings?.geminiApiKey;

    if (!geminiKey) {
      return NextResponse.json({ error: "Gemini API Key not configured in Super Admin settings." }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3-flash-preview",
    }, { apiVersion: "v1beta" });

    const chat = model.startChat({
      history: history || [],
      systemInstruction: {
        parts: [{ text: `You are the Gercep Platform Assistant. You help manage stores, restaurants, and orders. Use the term 'toko' or 'resto' when referring to businesses. Use the available tools to find information. If a user asks for a specific food (like 'nasi uduk'), use search_stores to find restaurants that sell it. If a user wants to order, first search_stores, then get_store_products. If it's a takeaway order, use get_shipping_rates to show delivery options before calling create_customer_order. ${context?.phoneNumber ? `The current user's phone number is ${context.phoneNumber}.` : ""} ${context?.channel === "WHATSAPP" ? "The user is chatting via WhatsApp." : ""}` }]
      } as any,
      tools: [
        {
          functionDeclarations: [
            {
              name: "search_stores",
              description: "Find restaurants or stores by name or food category.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Search keyword." }
                },
                required: ["query"]
              }
            },
            {
              name: "get_store_stats",
              description: "Retrieve sales and balance for a store.",
              parameters: {
                type: "object",
                properties: {
                  slug: { type: "string", description: "Store slug." }
                },
                required: ["slug"]
              }
            },
            {
              name: "get_store_products",
              description: "Get menu items for a store.",
              parameters: {
                type: "object",
                properties: {
                  slug: { type: "string", description: "Store slug." }
                },
                required: ["slug"]
              }
            },
            {
              name: "get_shipping_rates",
              description: "Get delivery options and costs for an address.",
              parameters: {
                type: "object",
                properties: {
                  slug: { type: "string" },
                  address: { type: "string" },
                  weightGrams: { type: "integer" }
                },
                required: ["slug", "address"]
              }
            },
            {
              name: "create_customer_order",
              description: "Create an order for a user.",
              parameters: {
                type: "object",
                properties: {
                  slug: { type: "string" },
                  customer_phone: { type: "string" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        productId: { type: "integer" },
                        quantity: { type: "integer" }
                      }
                    }
                  },
                  order_type: { type: "string", enum: ["DINE_IN", "TAKEAWAY"] },
                  address: { type: "string" },
                  shippingProvider: { type: "string" },
                  shippingService: { type: "string" },
                  shippingFee: { type: "number" },
                  payment_method: { type: "string", enum: ["qris", "bank_transfer"] }
                },
                required: ["slug", "customer_phone", "items", "order_type"]
              }
            },
            {
              name: "create_merchant_invoice",
              description: "Create a manual invoice for a customer. Only for merchants.",
              parameters: {
                type: "object",
                properties: {
                  amount: { type: "number" },
                  customer_phone: { type: "string" },
                  merchant_phone: { type: "string" },
                  payment_method: { type: "string", enum: ["qris", "bank_transfer"] }
                },
                required: ["amount", "customer_phone", "merchant_phone"]
              }
            }
          ]
        }
      ] as any,
      generationConfig: { maxOutputTokens: 1000 }
    });

    // 1. Initial Request to Gemini
    let result = await chat.sendMessage(message);
    let response = result.response;
    let calls = response.functionCalls();

    // 2. Handle Function Calls (Loop until no more calls)
    const MAX_ITERATIONS = 5;
    let iterations = 0;

    while (calls && calls.length > 0 && iterations < MAX_ITERATIONS) {
      const toolResponses = [];
      for (const call of calls) {
        const toolFn = tools[call.name];
        if (toolFn) {
          console.log(`[AI_CHAT] Calling tool: ${call.name}`, call.args);
          const data = await toolFn(call.args);
          toolResponses.push({
            functionResponse: {
              name: call.name,
              response: { content: data }
            }
          });
        }
      }

      // Send the tool results back to Gemini
      result = await chat.sendMessage(toolResponses);
      response = result.response;
      calls = response.functionCalls();
      iterations++;
    }

    return NextResponse.json({ 
      text: response.text(),
      history: await chat.getHistory()
    });

  } catch (error: any) {
    console.error("[GEMINI_CHAT_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
