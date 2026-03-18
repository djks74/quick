import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getShippingQuoteFromBiteship } from "@/lib/shipping-biteship";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

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
          select: { id: true, name: true, price: true, category: true, variations: true, stock: true }
        }
      }
    });
    if (!store) return { error: "Store not found" };
    return { 
      products: store.products,
      taxPercent: store.taxPercent,
      serviceChargePercent: store.serviceChargePercent
    };
  },

  async update_product_price({ slug, productName, newPrice, variationName }: any) {
    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return { error: "Store not found" };
    
    const products = await prisma.product.findMany({
      where: { storeId: store.id },
      select: { id: true, name: true, variations: true, price: true }
    });
    
    const product = products.find(p => p.name.toLowerCase().includes(productName.toLowerCase()));
    if (!product) return { error: `Product "${productName}" not found.` };
    
    if (variationName && product.variations && Array.isArray(product.variations)) {
      const variations = product.variations as any[];
      const idx = variations.findIndex(v => v.name.toLowerCase().includes(variationName.toLowerCase()));
      if (idx >= 0) {
        variations[idx].price = Number(newPrice);
        await prisma.product.update({ where: { id: product.id }, data: { variations } });
        return { success: true, message: `Updated ${product.name} (${variations[idx].name}) to ${newPrice}` };
      }
    }
    
    await prisma.product.update({ where: { id: product.id }, data: { price: Number(newPrice) } });
    return { success: true, message: `Updated ${product.name} price to ${newPrice}` };
  },

  async add_new_product({ slug, name, price, category }: any) {
    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return { error: "Store not found" };
    
    const product = await prisma.product.create({
      data: {
        storeId: store.id,
        name,
        price: Number(price),
        category: category || "General",
        stock: 100,
        description: "Added via AI Assistant"
      }
    });
    return { success: true, productId: product.id, message: `Added new product ${name}` };
  },

  async get_shipping_rates({ slug, address, latitude, longitude, weightGrams }: any) {
    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return { error: "Store not found" };
    const options = await getShippingQuoteFromBiteship({
      store,
      destinationAddress: address,
      destinationLatitude: latitude,
      destinationLongitude: longitude,
      weightGrams: weightGrams || 1000
    });
    return { options };
  },

  async create_customer_order({ slug, customer_phone, items, order_type, address, shippingProvider, shippingService, shippingFee, payment_method }: any) {
    const store = await prisma.store.findUnique({ where: { slug } });
    if (!store) return { error: "Store not found" };

    let itemsAmount = 0;
    const orderItemsData = [];
    const details = [];
    for (const item of items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId, storeId: store.id } });
      if (!product) return { error: `Product ID ${item.productId} not found` };
      const lineTotal = product.price * item.quantity;
      itemsAmount += lineTotal;
      orderItemsData.push({ productId: product.id, quantity: item.quantity, price: product.price });
      details.push(`${product.name} x${item.quantity}: Rp ${new Intl.NumberFormat('id-ID').format(lineTotal)}`);
    }

    const taxAmount = itemsAmount * (store.taxPercent / 100);
    const serviceCharge = itemsAmount * (store.serviceChargePercent / 100);
    const shippingCost = Number(shippingFee) || 0;
    
    let paymentFee = 0;
    const subtotal = itemsAmount + taxAmount + serviceCharge + shippingCost;
    if (payment_method === "qris") {
      paymentFee = subtotal * 0.01;
    } else if (payment_method === "bank_transfer") {
      paymentFee = 5000;
    }

    const finalAmount = subtotal + paymentFee;

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
        shippingCost,
        notes: JSON.stringify({ source: "AI_CHAT_ASSISTANT" }),
        items: { create: orderItemsData }
      } as any
    });

    const breakdown = [
      `🛒 *Detail Pesanan #${order.id}*`,
      ...details,
      `------------------`,
      `Subtotal: Rp ${new Intl.NumberFormat('id-ID').format(itemsAmount)}`,
      taxAmount > 0 ? `Pajak (${store.taxPercent}%): Rp ${new Intl.NumberFormat('id-ID').format(taxAmount)}` : null,
      serviceCharge > 0 ? `Service (${store.serviceChargePercent}%): Rp ${new Intl.NumberFormat('id-ID').format(serviceCharge)}` : null,
      shippingCost > 0 ? `Ongkir (${shippingProvider}): Rp ${new Intl.NumberFormat('id-ID').format(shippingCost)}` : null,
      paymentFee > 0 ? `Biaya (${payment_method}): Rp ${new Intl.NumberFormat('id-ID').format(paymentFee)}` : null,
      `*Total: Rp ${new Intl.NumberFormat('id-ID').format(finalAmount)}*`
    ].filter(Boolean).join("\n");

    return {
      success: true,
      orderId: order.id,
      totalAmount: finalAmount,
      breakdown,
      paymentUrl: `https://gercep.click/checkout/pay/${order.id}`
    };
  },

  async send_order_to_whatsapp({ orderId, phoneNumber }: { orderId: number; phoneNumber: string }) {
    const order = await prisma.order.findUnique({
      where: { id: Number(orderId) },
      include: { store: true, items: { include: { product: true } } }
    });

    if (!order) return { error: "Order not found" };

    const details = order.items.map(item =>
      `${item.product.name} x${item.quantity}: Rp ${new Intl.NumberFormat('id-ID').format(item.price * item.quantity)}`
    );

    const breakdown = [
      `🛒 *Gercep Order #${order.id}*`,
      ...details,
      `------------------`,
      `Subtotal: Rp ${new Intl.NumberFormat('id-ID').format(order.totalAmount - order.taxAmount - order.serviceCharge - order.paymentFee - order.shippingCost)}`,
      order.taxAmount > 0 ? `Pajak: Rp ${new Intl.NumberFormat('id-ID').format(order.taxAmount)}` : null,
      order.serviceCharge > 0 ? `Service: Rp ${new Intl.NumberFormat('id-ID').format(order.serviceCharge)}` : null,
      order.shippingCost > 0 ? `Ongkir: Rp ${new Intl.NumberFormat('id-ID').format(order.shippingCost)}` : null,
      order.paymentFee > 0 ? `Biaya: Rp ${new Intl.NumberFormat('id-ID').format(order.paymentFee)}` : null,
      `*Total: Rp ${new Intl.NumberFormat('id-ID').format(order.totalAmount)}*`
    ].filter(Boolean).join("\n");

    const paymentUrl = `https://gercep.click/checkout/pay/${order.id}`;

    await sendWhatsAppMessage(
      phoneNumber,
      `${breakdown}\n\nSilakan klik tombol di bawah untuk membayar.`,
      order.storeId,
      { buttonText: "Pay Now", buttonUrl: paymentUrl }
    );

    return { success: true, message: "Order details sent to WhatsApp." };
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

    // Determine if the user is a Merchant for the system instruction
    let userContextInfo = "";
    if (context?.phoneNumber) {
      const cleanPhone = context.phoneNumber.replace(/\D/g, "");
      const user = await prisma.user.findFirst({
        where: { phoneNumber: { contains: cleanPhone } },
        include: { stores: true }
      });
      if (user && user.role === "MERCHANT" && user.stores.length > 0) {
        userContextInfo = ` The user is a MERCHANT of the store '${user.stores[0].name}' (slug: ${user.stores[0].slug}). They can use merchant tools like 'get_store_stats' and 'create_merchant_invoice'. If they ask to 'tambah produk' or 'update harga', use the tools to help them.`;
      }
    }

    const chat = model.startChat({
      history: history || [],
      systemInstruction: {
        parts: [{ text: `You are the Gercep Platform Assistant. You help manage stores, restaurants, and orders. Use the term 'toko' or 'resto' when referring to businesses. Use the available tools to find information. If a user asks for a specific food (like 'nasi uduk'), use search_stores to find restaurants that sell it. If a user wants to order, first search_stores, then get_store_products. If it's a takeaway order, you MUST ask the user to share their location or address and provide delivery options (GOSEND/JNE) via 'get_shipping_rates' before calling 'create_customer_order'.

Once an order is created:
1. Show the user the 'breakdown' of the order.
2. Tell them they can pay directly here or have the payment link sent to their WhatsApp.
3. If they want to pay on WhatsApp, ask for their WhatsApp number and call 'send_order_to_whatsapp'.
4. Ensure all order details (taxes, service charges, fees) are clearly explained to the user before they confirm.${userContextInfo} ${context?.phoneNumber ? `The current user's phone number is ${context.phoneNumber}.` : ""} ${context?.channel === "WHATSAPP" ? "The user is chatting via WhatsApp." : ""}` }]
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
              description: "Get delivery options and costs for an address. Requires a full address or coordinates.",
              parameters: {
                type: "object",
                properties: {
                  slug: { type: "string" },
                  address: { type: "string" },
                  latitude: { type: "number" },
                  longitude: { type: "number" },
                  weightGrams: { type: "integer" }
                },
                required: ["slug"]
              }
            },
            {
              name: "update_product_price",
              description: "Update the price of an existing product or variation. Only for merchants.",
              parameters: {
                type: "object",
                properties: {
                  slug: { type: "string" },
                  productName: { type: "string" },
                  newPrice: { type: "number" },
                  variationName: { type: "string" }
                },
                required: ["slug", "productName", "newPrice"]
              }
            },
            {
              name: "add_new_product",
              description: "Add a new product to the store menu. Only for merchants.",
              parameters: {
                type: "object",
                properties: {
                  slug: { type: "string" },
                  name: { type: "string" },
                  price: { type: "number" },
                  category: { type: "string" }
                },
                required: ["slug", "name", "price"]
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
            },
            {
              name: "send_order_to_whatsapp",
              description: "Send order details and payment link to the user's WhatsApp number.",
              parameters: {
                type: "object",
                properties: {
                  orderId: { type: "integer" },
                  phoneNumber: { type: "string", description: "The WhatsApp number to send the order to." }
                },
                required: ["orderId", "phoneNumber"]
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

    let finalBreakdown = undefined;
    let finalPaymentUrl = undefined;

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
          
          // Capture structured data for the response
          if (call.name === "create_customer_order" && data.success) {
            finalBreakdown = data.breakdown;
            finalPaymentUrl = data.paymentUrl;
          }
          if (call.name === "create_merchant_invoice" && data.success) {
            finalPaymentUrl = data.paymentUrl;
          }
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
      history: await chat.getHistory(),
      breakdown: finalBreakdown,
      paymentUrl: finalPaymentUrl
    });

  } catch (error: any) {
    console.error("[GEMINI_CHAT_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
