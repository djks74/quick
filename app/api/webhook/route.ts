import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPaymentLink } from '@/lib/payment';

// Helper to send WhatsApp message
async function sendWhatsAppMessage(to: string, message: string) {
  const settings = await prisma.storeSettings.findFirst();
  const token = settings?.whatsappToken || process.env.WHATSAPP_TOKEN;
  
  if (!token) {
    console.log(`[WHATSAPP_MOCK] (No Token Configured) Sending to ${to}: ${message}`);
    return;
  }

  const phoneNumberId = settings?.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID; 

  console.log('SEND_WHATSAPP_DEBUG:', { to, message, phoneNumberId, token: token ? 'EXISTS' : 'MISSING' });

  if (!phoneNumberId) {
    console.log(`[WHATSAPP_MOCK] (No Phone ID) Sending to ${to}: ${message}`);
    return;
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: message }
      })
    });
    
    if (!res.ok) {
      const err = await res.text();
      console.error('[WHATSAPP_API_ERROR]', err);
    }
  } catch (error) {
    console.error('[WHATSAPP_SEND_ERROR]', error);
  }
}

// Session Helpers
async function getSession(phoneNumber: string) {
  let session = await prisma.whatsAppSession.findUnique({
    where: { phoneNumber }
  });
  
  if (!session) {
    session = await prisma.whatsAppSession.create({
      data: { phoneNumber }
    });
  }
  return session;
}

async function updateSession(phoneNumber: string, data: any) {
  return await prisma.whatsAppSession.update({
    where: { phoneNumber },
    data
  });
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('WEBHOOK_VERIFY_REQUEST', { mode, token, challenge });

  if (mode && token) {
    if (mode === 'subscribe' && token === 'laku_verify_token') {
      console.log('WEBHOOK_VERIFIED_SUCCESS');
      return new NextResponse(challenge, { status: 200 });
    }
    console.log('WEBHOOK_VERIFIED_FAILED: Token mismatch');
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('WEBHOOK_BODY:', JSON.stringify(body, null, 2));
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (message) {
      console.log('INCOMING_MESSAGE:', message);
      const from = message.from; 
      const textBody = message.text?.body?.trim();
      const lowerText = textBody?.toLowerCase();

      if (!textBody) return NextResponse.json({ success: true });

      // Get or create session
      const session = await getSession(from);
      
      // 1. GLOBAL COMMANDS (Reset state)
      
      // Handle "Table X" -> Reset Session
      const tableMatch = textBody.match(/(?:table|meja)\s*(\d+)/i);
      if (tableMatch) {
        const tableNumber = tableMatch[1];
        const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://laku.com'}?table=${tableNumber}`;
        
        await updateSession(from, { 
          step: 'MENU_SELECTION', 
          tableNumber,
          cart: [] // Clear cart
        });

        await sendWhatsAppMessage(from, 
          `Welcome to Table ${tableNumber}! 👋\n\n` +
          `How would you like to order?\n` +
          `1. Order via Digital Menu (Web)\n` +
          `2. Order via WhatsApp (Text)\n` +
          `3. Quick Pay (Input Amount)\n\n` +
          `Reply with 1, 2, or 3.`
        );
        return NextResponse.json({ success: true });
      }

      // Handle "Pay" / "Payment" -> Jump to Payment
      if (lowerText === 'pay' || lowerText === 'payment' || lowerText === 'bayar') {
        await updateSession(from, { step: 'PAYMENT_AMOUNT' });
        await sendWhatsAppMessage(from, `Please enter the amount you want to pay (e.g. 50000).`);
        return NextResponse.json({ success: true });
      }

      // Handle "Menu" -> Jump to Ordering
      if (lowerText === 'menu') {
        await updateSession(from, { step: 'ORDERING' });
        // Fetch products
        const products = await prisma.product.findMany({ 
          take: 10,
          // where: { stock: { gt: 0 } }, // Removed stock check for testing
          orderBy: { name: 'asc' }
        });

        let menuText = "🍽️ *Menu List* 🍽️\n\n";
        products.forEach((p, index) => {
          menuText += `${index + 1}. ${p.name} - ${new Intl.NumberFormat('id-ID').format(p.price)}\n`;
        });
        menuText += `\nReply with "Number Quantity" (e.g. '1 2' for 2 of item #1).\nReply 'Done' to checkout.`;

        await sendWhatsAppMessage(from, menuText);
        return NextResponse.json({ success: true });
      }

      // 2. STATE BASED HANDLING

      // Step: MENU_SELECTION (After scanning table)
      if (session.step === 'MENU_SELECTION') {
        if (textBody === '1') {
          // Web Menu
          const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://laku.com'}?table=${session.tableNumber}`;
          await sendWhatsAppMessage(from, `Please order here: ${menuUrl}`);
          await updateSession(from, { step: 'START' }); // Reset
        } else if (textBody === '2') {
          // WhatsApp Menu
          await updateSession(from, { step: 'ORDERING' });
          const products = await prisma.product.findMany({ 
            take: 10,
            // where: { stock: { gt: 0 } },
            orderBy: { name: 'asc' }
          });
          let menuText = "🍽️ *Menu List* 🍽️\n\n";
          products.forEach((p, index) => {
            menuText += `${index + 1}. ${p.name} - ${new Intl.NumberFormat('id-ID').format(p.price)}\n`;
          });
          menuText += `\nReply with "Number Quantity" (e.g. '1 2' for 2 of item #1).\nReply 'Done' to checkout.`;
          await sendWhatsAppMessage(from, menuText);
        } else if (textBody === '3') {
          // Quick Pay
          await updateSession(from, { step: 'PAYMENT_AMOUNT' });
          await sendWhatsAppMessage(from, `Please enter the amount you want to pay (e.g. 50000).`);
        } else {
          await sendWhatsAppMessage(from, `Invalid option. Reply 1, 2, or 3.`);
        }
        return NextResponse.json({ success: true });
      }

      // Step: PAYMENT_AMOUNT (Manual Input)
      if (session.step === 'PAYMENT_AMOUNT') {
        console.log('DEBUG: Processing PAYMENT_AMOUNT', textBody);
        // Try parsing number
        const cleanAmount = textBody.replace(/[^\d]/g, ''); // Remove non-digits
        const amount = parseInt(cleanAmount);
        console.log('DEBUG: Parsed Amount', amount);
        
        if (!isNaN(amount) && amount > 0) {
          // Create Pending Order
          try {
            const order = await prisma.order.create({
              data: {
                customerPhone: from,
                totalAmount: amount,
                status: 'PENDING'
                // items: []  <-- Removed this
              }
            });
            console.log('DEBUG: Order Created', order.id);

            const paymentLink = await createPaymentLink(order.id, amount, from);
            console.log('DEBUG: Payment Link', paymentLink);
            
            await sendWhatsAppMessage(from, `Order #${order.id} Created.\nAmount: Rp ${new Intl.NumberFormat('id-ID').format(amount)}\n\nPay here: ${paymentLink}`);
            
            await updateSession(from, { step: 'START' }); // Reset
          } catch (e) {
            console.error('DEBUG: Error creating order/payment', e);
            await sendWhatsAppMessage(from, `Error creating order. Please try again.`);
          }
        } else {
          await sendWhatsAppMessage(from, `Invalid amount. Please enter a number (e.g. 50000).`);
        }
        return NextResponse.json({ success: true });
      }

      // Step: ORDERING (Adding items)
      if (session.step === 'ORDERING') {
        if (lowerText === 'done' || lowerText === 'checkout') {
          // Checkout logic
          const cart = (session.cart as any[]) || [];
          if (cart.length === 0) {
            await sendWhatsAppMessage(from, `Your cart is empty. Reply 'Menu' to see items.`);
            return NextResponse.json({ success: true });
          }

          const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
          
          // Create Order with items
          const order = await prisma.order.create({
            data: {
              customerPhone: from,
              totalAmount: total,
              status: 'PENDING',
              tableNumber: session.tableNumber,
              items: {
                create: cart.map(item => ({
                  productId: item.productId,
                  quantity: item.qty,
                  price: item.price
                }))
              }
            }
          });

          const paymentLink = await createPaymentLink(order.id, total, from);
          
          let summary = "🧾 *Order Summary*\n";
          cart.forEach(item => {
            summary += `- ${item.name} x${item.qty} = ${new Intl.NumberFormat('id-ID').format(item.price * item.qty)}\n`;
          });
          summary += `\n*Total: Rp ${new Intl.NumberFormat('id-ID').format(total)}*`;
          summary += `\n\nPay here: ${paymentLink}`;

          await sendWhatsAppMessage(from, summary);
          await updateSession(from, { step: 'START', cart: [] });
          return NextResponse.json({ success: true });
        }

        // Parse "ItemIndex Quantity" (e.g. "1 2")
        const itemMatch = textBody.match(/^(\d+)\s+(\d+)$/);
        if (itemMatch) {
          const index = parseInt(itemMatch[1]) - 1; // 1-based to 0-based
          const qty = parseInt(itemMatch[2]);

          const products = await prisma.product.findMany({ 
            take: 10,
            // where: { stock: { gt: 0 } },
            orderBy: { name: 'asc' }
          });

          if (index >= 0 && index < products.length && qty > 0) {
            const product = products[index];
            const currentCart = (session.cart as any[]) || [];
            
            // Add to cart
            currentCart.push({
              productId: product.id,
              name: product.name,
              price: product.price,
              qty: qty
            });

            await updateSession(from, { cart: currentCart });
            
            await sendWhatsAppMessage(from, `Added ${qty}x ${product.name} to cart.\nReply with more items (e.g. '2 1') or 'Done' to checkout.`);
          } else {
            await sendWhatsAppMessage(from, `Invalid item number. Please check the menu.`);
          }
        } else {
          // Maybe user typed text, try to fuzzy match or just ignore
          // Check if it's "Table X" or "Pay" to break out? (Handled at top)
          await sendWhatsAppMessage(from, `I didn't understand. Reply '1 2' to order Item #1 Quantity 2, or 'Done' to finish.`);
        }
        return NextResponse.json({ success: true });
      }

      // 3. LEGACY / FALLBACK (If no session step matched)
      
      // If user sends order summary from Web (Legacy flow)
      if (textBody?.toLowerCase().includes("would like to order")) {
        const totalMatch = textBody.match(/Total:\s*\*?Rp\s*([\d.]+)/i);
        if (totalMatch) {
           const amount = parseInt(totalMatch[1].replace(/\./g, ''));
           const order = await prisma.order.create({
            data: {
              customerPhone: from,
              totalAmount: amount,
              status: 'PENDING',
              items: [] 
            }
          });
          const paymentLink = await createPaymentLink(order.id, amount, from);
          await sendWhatsAppMessage(from, `Order #${order.id} received!\nAmount: Rp ${new Intl.NumberFormat('id-ID').format(amount)}\n\nPlease complete payment here:\n${paymentLink}`);
        }
      }

    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
