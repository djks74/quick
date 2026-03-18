import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";

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
  }
};

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();

    // Get Gemini Key from PlatformSettings
    const settings = await prisma.platformSettings.findUnique({ where: { key: "default" } }) as any;
    const geminiKey = settings?.geminiApiKey;

    if (!geminiKey) {
      return NextResponse.json({ error: "Gemini API Key not configured in Super Admin settings." }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: "You are the Gercep Platform Assistant. You help manage stores and orders. Use the available tools to find information."
    });

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
