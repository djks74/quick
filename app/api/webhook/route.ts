import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPaymentLink } from '@/lib/payment';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { handleMerchantMessage } from '@/lib/whatsapp-merchant';

// Session Helpers
async function getSession(phoneNumber: string, storeId: number) {
  let session = await prisma.whatsAppSession.findUnique({
    where: { 
      phoneNumber_storeId: { 
        phoneNumber, 
        storeId 
      } 
    }
  });
  
  if (!session) {
    session = await prisma.whatsAppSession.create({
      data: { phoneNumber, storeId }
    });
  }
  return session;
}

async function updateSession(phoneNumber: string, storeId: number, data: any) {
  return await prisma.whatsAppSession.update({
    where: { 
      phoneNumber_storeId: { 
        phoneNumber, 
        storeId 
      } 
    },
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
    const phoneNumberId = value?.metadata?.phone_number_id;

    if (message && phoneNumberId) {
      const from = message.from;

      // 0. MERCHANT CHECK
      // Check if sender is a registered Merchant
      let user = await prisma.user.findUnique({
        where: { phoneNumber: from },
        include: { stores: true }
      });

      // Fallback: Check if this number is listed as a Store WhatsApp Number
      if (!user) {
          const storeByPhone = await prisma.store.findFirst({ 
            where: { whatsapp: from }, 
            include: { owner: true } 
          });
          
          if (storeByPhone) {
              // Found a store with this number. The owner is the merchant.
              user = await prisma.user.findUnique({
                  where: { id: storeByPhone.ownerId },
                  include: { stores: true }
              });
          }
      }

      if (user && user.role === 'MERCHANT') {
        await handleMerchantMessage(user, message, from);
        return NextResponse.json({ success: true });
      }

      let targetStore = null;

      // 1. Try finding store by Phone ID (Enterprise or Single Setup)
      // Note: If multiple stores share the same ID in DB, findUnique will fail if unique constraint exists.
      // Assuming non-enterprise stores DO NOT have whatsappPhoneId set in DB, or it's nullable/unique?
      // Schema says: whatsappPhoneId String? @unique
      // So only one store can have a specific ID.
      // Non-enterprise stores should have null whatsappPhoneId in DB if they use shared.
      
      const store = await prisma.store.findUnique({
        where: { whatsappPhoneId: phoneNumberId }
      });

      if (store) {
        targetStore = store;
      } else if (phoneNumberId === process.env.WHATSAPP_PHONE_ID) {
         // 2. If matches Platform ID, try to infer context from recent session
         console.log('Received message on Shared Platform Number');
         const from = message.from;
         
         const recentSession = await prisma.whatsAppSession.findFirst({
            where: { phoneNumber: from },
            orderBy: { updatedAt: 'desc' }
         });
         
        if (recentSession) {
            targetStore = await prisma.store.findUnique({ where: { id: recentSession.storeId! } });
         }
         
         // Fallback to Demo Store if still no context
         if (!targetStore) {
            targetStore = await prisma.store.findFirst({ where: { slug: 'demo' } });
         }
      }

      // Dev Fallback
      if (!targetStore && process.env.NODE_ENV === 'development') {
         targetStore = await prisma.store.findFirst();
      }

      if (!targetStore) {
        console.log(`No store found for Phone ID: ${phoneNumberId}`);
        return NextResponse.json({ success: true });
      }

      console.log('INCOMING_MESSAGE:', message, 'STORE:', targetStore.name);
      const textBody = message.text?.body?.trim();
      const lowerText = textBody?.toLowerCase();

      if (!textBody) return NextResponse.json({ success: true });

      // Get or create session
      const session = await getSession(from, targetStore.id);
      
      // 1. GLOBAL COMMANDS (Reset state)
      
      // Handle "Table X" -> Enforce QR Scan
      const tableMatch = textBody.match(/(?:table|meja)\s*(.+)/i);
      if (tableMatch) {
        await sendWhatsAppMessage(from, 
          `👋 Welcome to ${targetStore.name}!\n\n` +
          `To start ordering, please *scan the QR code* on your table using your phone's camera. 📷\n\n` +
          `This ensures we get the correct table details.`,
          targetStore.id
        );
        return NextResponse.json({ success: true });
      }

      // Handle "Pay" / "Payment" -> Jump to Payment
      if (lowerText === 'pay' || lowerText === 'payment' || lowerText === 'bayar') {
        await updateSession(from, targetStore.id, { step: 'PAYMENT_AMOUNT' });
        await sendWhatsAppMessage(from, `Please enter the amount you want to pay (e.g. 50000).`, targetStore.id);
        return NextResponse.json({ success: true });
      }

      // Handle "Menu" -> Jump to Ordering
      if (lowerText === 'menu') {
        await updateSession(from, targetStore.id, { step: 'ORDERING' });
        const products = await prisma.product.findMany({ 
          where: { storeId: targetStore.id },
          take: 10,
          orderBy: { name: 'asc' }
        });

        const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://laku.com'}/${targetStore.slug}${session.tableNumber ? `?table=${session.tableNumber}` : ''}`;

        let menuText = `🍽️ *${targetStore.name} Menu* 🍽️\n\n`;
        menuText += `📱 *Recommended*: Order via Web\n${menuUrl}\n\n`;
        menuText += `👇 *Or Order via Text*:\n`;
        
        products.forEach((p, index) => {
          menuText += `${index + 1}. ${p.name} - ${new Intl.NumberFormat('id-ID').format(p.price)}\n`;
        });
        menuText += `\nReply with "ItemNumber Quantity" (e.g. '1 2' for 2 of item #1).\nReply 'Done' to checkout.`;

        await sendWhatsAppMessage(from, menuText, targetStore.id);
        return NextResponse.json({ success: true });
      }

      // 2. STATE BASED HANDLING

      // Step: MENU_SELECTION (After scanning table)
      if (session.step === 'MENU_SELECTION') {
        if (textBody === '1') {
          // Web Menu
          const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://laku.com'}/${targetStore.slug}?table=${session.tableNumber}`;
          await sendWhatsAppMessage(from, `Please order here: ${menuUrl}`, targetStore.id);
          await updateSession(from, targetStore.id, { step: 'START' }); // Reset
        } else if (textBody === '2') {
          // WhatsApp Menu
          await updateSession(from, targetStore.id, { step: 'ORDERING' });
          const products = await prisma.product.findMany({ 
            where: { storeId: targetStore.id },
            take: 10,
            orderBy: { name: 'asc' }
          });
          
          const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://laku.com'}/${targetStore.slug}${session.tableNumber ? `?table=${session.tableNumber}` : ''}`;

          let menuText = `🍽️ *${targetStore.name} Menu* 🍽️\n\n`;
          menuText += `📱 *Recommended*: Order via Web\n${menuUrl}\n\n`;
          menuText += `👇 *Or Order via Text*:\n`;

          products.forEach((p, index) => {
            menuText += `${index + 1}. ${p.name} - ${new Intl.NumberFormat('id-ID').format(p.price)}\n`;
          });
          menuText += `\nReply with "ItemNumber Quantity" (e.g. '1 2' for 2 of item #1).\nReply 'Done' to checkout.`;
          await sendWhatsAppMessage(from, menuText, targetStore.id);
        } else if (textBody === '3') {
          // Quick Pay
          await updateSession(from, targetStore.id, { step: 'PAYMENT_AMOUNT' });
          await sendWhatsAppMessage(from, `Please enter the amount you want to pay (e.g. 50000).`, targetStore.id);
        } else {
          await sendWhatsAppMessage(from, `Invalid option. Reply 1, 2, or 3.`, targetStore.id);
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
                storeId: targetStore.id,
                customerPhone: from,
                totalAmount: amount,
                status: 'PENDING'
              }
            });
            console.log('DEBUG: Order Created', order.id);

            const paymentLink = await createPaymentLink(order.id, amount, from, targetStore.id);
            console.log('DEBUG: Payment Link', paymentLink);
            
            await sendWhatsAppMessage(from, `Order #${order.id} Created.\nAmount: Rp ${new Intl.NumberFormat('id-ID').format(amount)}\n\nPay here: ${paymentLink}`, targetStore.id);
            
            await updateSession(from, targetStore.id, { step: 'START' }); // Reset
          } catch (e) {
            console.error('DEBUG: Error creating order/payment', e);
            await sendWhatsAppMessage(from, `Error creating order. Please try again.`, targetStore.id);
          }
        } else {
          await sendWhatsAppMessage(from, `Invalid amount. Please enter a number (e.g. 50000).`, targetStore.id);
        }
        return NextResponse.json({ success: true });
      }

      // Step: ORDERING (Adding items)
      if (session.step === 'ORDERING') {
        if (lowerText === 'done' || lowerText === 'checkout') {
          // Checkout logic
          const cart = (session.cart as any[]) || [];
          if (cart.length === 0) {
            await sendWhatsAppMessage(from, `Your cart is empty. Reply 'Menu' to see items.`, targetStore.id);
            return NextResponse.json({ success: true });
          }

          const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
          
          // Create Order with items
          const order = await prisma.order.create({
            data: {
              storeId: targetStore.id,
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

          const paymentLink = await createPaymentLink(order.id, total, from, targetStore.id);
          
          let summary = "🧾 *Order Summary*\n";
          cart.forEach(item => {
            summary += `- ${item.name} x${item.qty} = ${new Intl.NumberFormat('id-ID').format(item.price * item.qty)}\n`;
          });
          summary += `\n*Total: Rp ${new Intl.NumberFormat('id-ID').format(total)}*`;
          summary += `\n\nPay here: ${paymentLink}`;

          await sendWhatsAppMessage(from, summary, targetStore.id);
          await updateSession(from, targetStore.id, { step: 'START', cart: [] });
          return NextResponse.json({ success: true });
        }

        // Parse "ItemIndex Quantity" (e.g. "1 2")
        const itemMatch = textBody.match(/^(\d+)\s+(\d+)$/);
        if (itemMatch) {
          const index = parseInt(itemMatch[1]) - 1; // 1-based to 0-based
          const qty = parseInt(itemMatch[2]);

          const products = await prisma.product.findMany({ 
            where: { storeId: targetStore.id },
            take: 10,
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

            await updateSession(from, targetStore.id, { cart: currentCart });
            
            await sendWhatsAppMessage(from, `Added ${qty}x ${product.name} to cart.\nReply with more items (e.g. '2 1') or 'Done' to checkout.`, targetStore.id);
          } else {
            await sendWhatsAppMessage(from, `Invalid item number. Please check the menu.`, targetStore.id);
          }
        } else {
          // Maybe user typed text, try to fuzzy match or just ignore
          // Check if it's "Table X" or "Pay" to break out? (Handled at top)
          await sendWhatsAppMessage(from, `I didn't understand. Reply '1 2' to order Item #1 Quantity 2, or 'Done' to finish.`, targetStore.id);
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
              storeId: targetStore.id,
              customerPhone: from,
              totalAmount: amount,
              status: 'PENDING',
              items: { create: [] } 
            }
          });
          const paymentLink = await createPaymentLink(order.id, amount, from, targetStore.id);
          await sendWhatsAppMessage(from, `Order #${order.id} received!\nAmount: Rp ${new Intl.NumberFormat('id-ID').format(amount)}\n\nPlease complete payment here:\n${paymentLink}`, targetStore.id);
        }
      }

    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
