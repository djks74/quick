import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const AI_API_KEY = process.env.AI_API_KEY || "gercep_ai_secret_123";

// These are the actual implementations of the tools Gemini will call
const tools: Record<string, Function> = {
  async search_stores({ query }: { query: string }) {
    const stores = await prisma.store.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
        ]
      },
      select: { name: true, slug: true },
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

  async create_customer_order({ slug, customer_phone, items, order_type, address }: any) {
    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return { error: "Store not found" };

    let totalAmount = 0;
    const orderItemsData = [];
    for (const item of items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId, storeId: store.id } });
      if (!product) return { error: `Product ID ${item.productId} not found` };
      totalAmount += product.price * item.quantity;
      orderItemsData.push({ productId: product.id, quantity: item.quantity, price: product.price });
    }

    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        customerPhone: customer_phone,
        totalAmount,
        status: "PENDING",
        orderType: order_type,
        shippingAddress: address || null,
        notes: JSON.stringify({ source: "AI_CHAT_ASSISTANT" }),
        items: { create: orderItemsData }
      } as any
    });

    return {
      success: true,
      orderId: order.id,
      totalAmount,
      paymentUrl: `https://gercep.click/checkout/pay/${order.id}`
    };
  }
};

export async function POST(req: NextRequest) {
  try {
    const { message, history, isPublic } = await req.json();

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
      model: "gemini-1.5-flash",
      systemInstruction: "You are the Gercep Platform Assistant. You help manage stores and orders. Use the available tools to find information. If a user wants to order, first search_stores, then get_store_products, then create_customer_order.",
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
                  address: { type: "string" }
                },
                required: ["slug", "customer_phone", "items", "order_type"]
              }
            }
          ]
        }
      ]
    } as any);

    const chat = model.startChat({
      history: history || [],
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
