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
  
  // Friendly message for direct browser access
  return NextResponse.json({ 
    status: "active", 
    message: "Gercep WhatsApp Webhook is running. Waiting for Meta verification or events." 
  });
}

// Fast memory cache for deduplication (fallback if DB fails)
const memoryCache = new Set<string>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // 1. FAST EXIT: Ignore status updates (sent, delivered, read) to reduce log noise
    if (value?.statuses) {
        return NextResponse.json({ success: true });
    }

    const message = value?.messages?.[0];
    if (!message) return NextResponse.json({ success: true });

    // 2. FAST DEDUPLICATION: Memory Check
    if (message.id) {
        if (memoryCache.has(message.id)) {
            return NextResponse.json({ success: true });
        }
        memoryCache.add(message.id);
        if (memoryCache.size > 1000) memoryCache.clear();
    }

    // 3. PERSISTENT DEDUPLICATION: DB Check
    if (message.id) {
        try {
            await prisma.processedMessage.create({
                data: { id: message.id }
            });
            console.log(`[WHATSAPP] Processing NEW message: ${message.id} from ${message.from}`);
        } catch (e: any) {
            if (e.code === 'P2002') {
                return NextResponse.json({ success: true });
            }
            // If table missing, we continue because memoryCache already caught local duplicates
        }
    }

    const phoneNumberId = value?.metadata?.phone_number_id;
    const platform = await prisma.platformSettings.findUnique({ where: { key: "default" } }).catch(() => null);
    const platformPhoneNumberId = platform?.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID;

    const from = message.from;
    const textBody = message.text?.body?.trim();
    const lowerText = textBody?.toLowerCase();

    console.log(`[WHATSAPP] Incoming Message: "${textBody}" from ${from} (Store Context: ${phoneNumberId})`);

    if (message && phoneNumberId) {
      // 0. MERCHANT CHECK
      // Check if sender is a registered Merchant
      let user = await prisma.user.findUnique({
        where: { phoneNumber: from },
        include: { stores: true }
      });

      // Check if Merchant is in "User Mode"
      const isMerchant = user && (user.role === 'MERCHANT' || user.role === 'SUPER_ADMIN');
      let forceUserMode = false;

      // Detect User Intent that overrides Merchant Mode
      if (isMerchant) {
          const lower = message.text?.body?.toLowerCase() || "";
          console.log(`[WHATSAPP] Merchant Check: ${from}, StoreID=${user?.stores[0]?.id}`);
          
          // Scanning QR (Table ...)
          if (lower.startsWith('table') || lower.startsWith('meja')) {
             forceUserMode = true;
          }
      }

      // Fallback: Check if this number is listed as a Store WhatsApp Number
      if (!user) {
          const storeByPhone = await prisma.store.findFirst({ 
            where: { whatsapp: from }, 
            include: { owner: true } 
          });
          
          if (storeByPhone) {
              user = await prisma.user.findUnique({
                  where: { id: storeByPhone.ownerId },
                  include: { stores: true }
              });
          }
      }

      // Use a special session for Merchant Mode Toggle
      let merchantSession = null;
      if (isMerchant) {
        merchantSession = await prisma.whatsAppSession.findFirst({
          where: { phoneNumber: from, storeId: 0 }
        });
        
        if (!merchantSession) {
           merchantSession = await prisma.whatsAppSession.create({
             data: { phoneNumber: from, storeId: 0, step: 'MERCHANT_MODE' }
           });
        }

        const lower = message.text?.body?.toLowerCase() || "";
        
        // Mode Switching Logic
        if (lower === 'user mode' || lower === 'mode user') {
           await prisma.whatsAppSession.update({
             where: { id: merchantSession.id },
             data: { step: 'USER_MODE' }
           });
           await sendWhatsAppMessage(from, "🔄 Switched to **User Mode**. You can now order from other stores.\nType 'Admin Mode' to switch back.", 0);
           return NextResponse.json({ success: true });
        }
        
        if (lower === 'admin mode' || lower === 'mode admin') {
           await prisma.whatsAppSession.update({
             where: { id: merchantSession.id },
             data: { step: 'MERCHANT_MODE' }
           });
           await sendWhatsAppMessage(from, "🔄 Switched to **Admin Mode**. You can manage your store.\nType 'User Mode' to switch back.", user?.stores[0]?.id || 0);
           return NextResponse.json({ success: true });
        }

        // Logic to bypass merchant handler
        if (merchantSession.step === 'USER_MODE' || forceUserMode) {
            // Proceed to User Logic (below)
        } else {
            // Default: Merchant Handler
            if (user) {
              await handleMerchantMessage(user, message, from);
            }
            return NextResponse.json({ success: true });
        }
      }

      let targetStore = null;
      let isSharedNumber = false;

      // 1. Try finding store by Phone ID
      const store = await prisma.store.findFirst({
        where: { whatsappPhoneId: phoneNumberId }
      });

      if (store) {
        targetStore = store;
        console.log(`[WHATSAPP] Found target store by PhoneID: ${targetStore.name}`);
      } 
      
      // Force Shared Number logic
      if (!targetStore || (platformPhoneNumberId && phoneNumberId === platformPhoneNumberId)) {
         console.log('[WHATSAPP] Received message on Shared Platform Number');
         isSharedNumber = true;
         
         const recentSession = await prisma.whatsAppSession.findFirst({
            where: { phoneNumber: from },
            orderBy: { updatedAt: 'desc' }
         });
         
        if (recentSession && recentSession.storeId) {
            const s = await prisma.store.findUnique({ where: { id: recentSession.storeId } });
            if (s) {
                targetStore = s;
                console.log(`[WHATSAPP] Resolved target store from session: ${targetStore.name}`);
            }
         }
         
         if (!targetStore) {
            targetStore = await prisma.store.findFirst({ where: { slug: 'demo' } });
            console.log(`[WHATSAPP] Fallback to Demo Store: ${targetStore?.name}`);
         }
      }

      // Dev Fallback
      if (!targetStore && process.env.NODE_ENV === 'development') {
         targetStore = await prisma.store.findFirst();
      }

      if (!targetStore) {
        console.log(`[WHATSAPP] No store found for Phone ID: ${phoneNumberId}`);
        return NextResponse.json({ success: true });
      }

      console.log(`[WHATSAPP] Incoming: "${textBody}" from ${from}, STORE: ${targetStore.name}`);

      if (!textBody) return NextResponse.json({ success: true });

      // Get or create session
      const session = await getSession(from, targetStore.id);
      
      // 1. GLOBAL COMMANDS
      const checkInMatch = textBody.match(/(?:check-in|table|meja)\s*(?:table|meja)?\s*(.+)/i);
      
      if (checkInMatch) {
        const tableNum = checkInMatch[1].replace(/table|meja/gi, '').trim();
        await updateSession(from, targetStore.id, { tableNumber: tableNum, step: 'MENU_SELECTION' });

        const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://gercep.click'}/${targetStore.slug}?table=${tableNum}`;
        await sendWhatsAppMessage(from, 
          `👋 Welcome to *${targetStore.name}* at Table *${tableNum}*!\n\n` +
          `You can view our full digital menu and order directly via the button below, or reply with "Menu" to order via WhatsApp text.`,
          targetStore.id,
          { buttonText: "View Menu", buttonUrl: menuUrl }
        );
        return NextResponse.json({ success: true });
      }

      if (lowerText === 'pay' || lowerText === 'payment' || lowerText === 'bayar') {
        await updateSession(from, targetStore.id, { step: 'PAYMENT_AMOUNT' });
        await sendWhatsAppMessage(from, `Please enter the amount you want to pay (e.g. 50000).`, targetStore.id);
        return NextResponse.json({ success: true });
      }

      if (lowerText === 'stores' && isSharedNumber) {
         const stores = await prisma.store.findMany({
           take: 10,
           orderBy: { name: 'asc' }
         });
        
        let storeText = `🏪 *Select a Store*:\n\n`;
        stores.forEach((s, index) => {
          storeText += `${index + 1}. ${s.name}\n`;
        });
        storeText += `\nReply with number to select.`;
        
        await sendWhatsAppMessage(from, storeText, targetStore.id);
        await updateSession(from, targetStore.id, { step: 'STORE_SELECTION' });
        return NextResponse.json({ success: true });
      }

      if (lowerText === 'menu') {
        try {
            const categories = await prisma.category.findMany({
                where: { storeId: targetStore.id },
                orderBy: { name: 'asc' }
            });

            if (categories.length > 0) {
                let catText = `🍽️ *${targetStore.name} Menu*\n\n`;
                catText += `Select a category:\n`;
                catText += `1. All Menu\n`;
                categories.forEach((c, idx) => {
                    catText += `${idx + 2}. ${c.name}\n`;
                });
                catText += `\nReply with number to view items.`;
                
                await updateSession(from, targetStore.id, { step: 'CATEGORY_SELECTION' });
                await sendWhatsAppMessage(from, catText, targetStore.id);
                return NextResponse.json({ success: true });
            }

            await updateSession(from, targetStore.id, { step: 'ORDERING' });
            const products = await prisma.product.findMany({ 
              where: { storeId: targetStore.id },
              take: 10,
              orderBy: { name: 'asc' }
            });

            if (products.length === 0) {
                 await sendWhatsAppMessage(from, `Sorry, this store has no products yet.`, targetStore.id);
                 return NextResponse.json({ success: true });
            }

            const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://gercep.click'}/${targetStore.slug}${session.tableNumber ? `?table=${session.tableNumber}` : ''}`;
            let menuText = `🍽️ *${targetStore.name} Menu* 🍽️\n\n`;
            menuText += `👇 *Order via WhatsApp Text*:\n`;
            
            products.forEach((p, index) => {
              const priceRange = p.variations && Array.isArray(p.variations) && p.variations.length > 0
                ? `${new Intl.NumberFormat('id-ID').format(Math.min(...(p.variations as any[]).map((v:any) => v.price)))} - ${new Intl.NumberFormat('id-ID').format(Math.max(...(p.variations as any[]).map((v:any) => v.price)))}`
                : new Intl.NumberFormat('id-ID').format(p.price);

              menuText += `${index + 1}. ${p.name} - ${priceRange}\n`;
            });
            menuText += `\nReply "ItemQty" (e.g. '1 2').\nReply "ItemQty Done Qris/Bank" (Quick Checkout).\nReply 'Menu' to go back.`;

            await sendWhatsAppMessage(from, menuText, targetStore.id, { buttonText: "Order via Web", buttonUrl: menuUrl });
            return NextResponse.json({ success: true });
        } catch (err) {
            console.error('DEBUG: Error in Menu Handler', err);
            await sendWhatsAppMessage(from, `Error fetching menu. Please try again.`, targetStore.id);
            return NextResponse.json({ success: true });
        }
      }

      // 2. STATE BASED HANDLING
      if (session.step === 'CATEGORY_SELECTION') {
          const index = parseInt(textBody) - 1;
          if (isNaN(index)) {
             await sendWhatsAppMessage(from, `Invalid selection. Please reply with a number.`, targetStore.id);
             return NextResponse.json({ success: true });
          }

          let selectedCategoryName = null;
          if (index === 0) {
              selectedCategoryName = null;
          } else {
              const categories = await prisma.category.findMany({
                  where: { storeId: targetStore.id },
                  orderBy: { name: 'asc' }
              });
              
              if (index > 0 && index <= categories.length) {
                  selectedCategoryName = categories[index - 1].name;
              } else {
                  await sendWhatsAppMessage(from, `Invalid selection. Please check the list.`, targetStore.id);
                  return NextResponse.json({ success: true });
              }
          }

          const whereClause: any = { storeId: targetStore.id };
          if (selectedCategoryName) {
              whereClause.category = { equals: selectedCategoryName, mode: 'insensitive' };
          }

          const products = await prisma.product.findMany({ 
            where: whereClause,
            take: 10,
            orderBy: { name: 'asc' }
          });

          if (products.length === 0) {
             await sendWhatsAppMessage(from, `No items found in this category.`, targetStore.id);
             return NextResponse.json({ success: true });
          }

          const stepValue = selectedCategoryName ? `ORDERING:${selectedCategoryName}` : `ORDERING:ALL`;
          await updateSession(from, targetStore.id, { step: stepValue });

          const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://gercep.click'}/${targetStore.slug}${session.tableNumber ? `?table=${session.tableNumber}` : ''}`;
          let title = selectedCategoryName ? `${selectedCategoryName}` : `All Menu`;
          let menuText = `🍽️ *${title}* 🍽️\n\n`;
          
          products.forEach((p, idx) => {
             const priceRange = p.variations && Array.isArray(p.variations) && p.variations.length > 0
                ? `${new Intl.NumberFormat('id-ID').format(Math.min(...(p.variations as any[]).map((v:any) => v.price)))} - ${new Intl.NumberFormat('id-ID').format(Math.max(...(p.variations as any[]).map((v:any) => v.price)))}`
                : new Intl.NumberFormat('id-ID').format(p.price);
             menuText += `${idx + 1}. ${p.name} - ${priceRange}\n`;
          });
          menuText += `\nReply "ItemQty" (e.g. '1 2').\nReply "ItemQty Done Qris/Bank" (Quick Checkout).\nReply 'Menu' to go back.`;
          
          await sendWhatsAppMessage(from, menuText, targetStore.id, { buttonText: "Order via Web", buttonUrl: menuUrl });
          return NextResponse.json({ success: true });
      }

      if (session.step === 'STORE_SELECTION') {
        const index = parseInt(textBody) - 1;
        const stores = await prisma.store.findMany({ take: 10, orderBy: { name: 'asc' } });

        if (index >= 0 && index < stores.length) {
          const selectedStore = stores[index];
          let newSession = await prisma.whatsAppSession.findUnique({
             where: { phoneNumber_storeId: { phoneNumber: from, storeId: selectedStore.id } }
          });

          if (!newSession) {
             newSession = await prisma.whatsAppSession.create({
               data: { phoneNumber: from, storeId: selectedStore.id, step: 'START' }
             });
          } else {
             await prisma.whatsAppSession.update({
               where: { id: newSession.id },
               data: { updatedAt: new Date(), step: 'START' }
             });
          }
          await sendWhatsAppMessage(from, `✅ Switched to *${selectedStore.name}*.\nReply 'Menu' to order.`, selectedStore.id);
        } else {
          await sendWhatsAppMessage(from, `Invalid selection. Please reply with a number.`, targetStore.id);
        }
        return NextResponse.json({ success: true });
      }

      if (session.step === 'MENU_SELECTION') {
        if (textBody === '1') {
          const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://gercep.click'}/${targetStore.slug}?table=${session.tableNumber}`;
          await sendWhatsAppMessage(from, `Click the button below to view the menu and order on the web:`, targetStore.id, { buttonText: "View Menu", buttonUrl: menuUrl });
          await updateSession(from, targetStore.id, { step: 'START' });
        } else if (textBody === '2') {
          const categories = await prisma.category.findMany({ where: { storeId: targetStore.id }, orderBy: { name: 'asc' } });
          if (categories.length > 0) {
            let catText = `🍽️ *${targetStore.name} Menu*\n\nSelect a category:\n1. All Menu\n`;
            categories.forEach((c, idx) => { catText += `${idx + 2}. ${c.name}\n`; });
            catText += `\nReply with number to view items.`;
            await updateSession(from, targetStore.id, { step: 'CATEGORY_SELECTION' });
            await sendWhatsAppMessage(from, catText, targetStore.id);
            return NextResponse.json({ success: true });
          }
          await updateSession(from, targetStore.id, { step: 'ORDERING' });
          const products = await prisma.product.findMany({ where: { storeId: targetStore.id }, take: 10, orderBy: { name: 'asc' } });
          const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://gercep.click'}/${targetStore.slug}${session.tableNumber ? `?table=${session.tableNumber}` : ''}`;
          let menuText = `🍽️ *${targetStore.name} Menu* 🍽️\n\n👇 *Order via WhatsApp Text*:\n`;
          products.forEach((p, index) => {
            const priceRange = p.variations && Array.isArray(p.variations) && p.variations.length > 0
              ? `${new Intl.NumberFormat('id-ID').format(Math.min(...(p.variations as any[]).map((v:any) => v.price)))} - ${new Intl.NumberFormat('id-ID').format(Math.max(...(p.variations as any[]).map((v:any) => v.price)))}`
              : new Intl.NumberFormat('id-ID').format(p.price);
            menuText += `${index + 1}. ${p.name} - ${priceRange}\n`;
          });
          menuText += `\nReply "ItemQty" (e.g. '1 2').\nReply "ItemQty Done Qris/Bank" (Quick Checkout).\nReply 'Menu' to go back.`;
          await sendWhatsAppMessage(from, menuText, targetStore.id, { buttonText: "Order via Web", buttonUrl: menuUrl });
        } else if (textBody === '3') {
          await updateSession(from, targetStore.id, { step: 'PAYMENT_AMOUNT' });
          await sendWhatsAppMessage(from, `Please enter the amount you want to pay (e.g. 50000).`, targetStore.id);
        } else {
          await sendWhatsAppMessage(from, `Invalid option. Reply 1, 2, or 3.`, targetStore.id);
        }
        return NextResponse.json({ success: true });
      }

      if (session.step === 'PAYMENT_AMOUNT') {
        const cleanAmount = textBody.replace(/[^\d]/g, '');
        const amount = parseInt(cleanAmount);
        if (!isNaN(amount) && amount > 0) {
          try {
            const order = await prisma.order.create({
              data: { storeId: targetStore.id, customerPhone: from, totalAmount: amount, status: 'PENDING' }
            });
            const paymentLink = await createPaymentLink(order.id, amount, from, targetStore.id);
            await sendWhatsAppMessage(from, `Order #${order.id} Created.\nAmount: Rp ${new Intl.NumberFormat('id-ID').format(amount)}`, targetStore.id, { buttonText: "Pay Now", buttonUrl: paymentLink });
            await updateSession(from, targetStore.id, { step: 'START' });
          } catch (e) {
            await sendWhatsAppMessage(from, `Error creating order. Please try again.`, targetStore.id);
          }
        } else {
          await sendWhatsAppMessage(from, `Invalid amount. Please enter a number (e.g. 50000).`, targetStore.id);
        }
        return NextResponse.json({ success: true });
      }

      if (session.step && session.step.startsWith('ORDERING')) {
        const stepParts = session.step.split(':');
        const currentCategory = stepParts.length > 1 && stepParts[1] !== 'ALL' ? stepParts[1] : null;

        if (lowerText === 'done' || lowerText === 'checkout' || lowerText === 'done qris' || lowerText === 'done bank') {
          const cart = (session.cart as any[]) || [];
          if (cart.length === 0) {
            await sendWhatsAppMessage(from, `Your cart is empty. Reply 'Menu' to see items.`, targetStore.id);
            return NextResponse.json({ success: true });
          }

          const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
          let method = lowerText.includes('qris') ? 'qris' : lowerText.includes('bank') ? 'bank_transfer' : undefined;

          const taxAmount = total * (targetStore.taxPercent / 100);
          const serviceCharge = total * (targetStore.serviceChargePercent / 100);
          const subtotalWithTaxService = total + taxAmount + serviceCharge;

          let fee = 0;
          if (targetStore.feePaidBy === 'CUSTOMER') {
              if (method === 'qris' && targetStore.qrisFeePercent) fee = subtotalWithTaxService * (Number(targetStore.qrisFeePercent) / 100);
              else if (method === 'bank_transfer' && targetStore.manualTransferFee) fee = Number(targetStore.manualTransferFee);
          }
          
          const finalTotal = subtotalWithTaxService + fee;
          const order = await prisma.order.create({
            data: {
              storeId: targetStore.id,
              customerPhone: from,
              totalAmount: finalTotal,
              taxAmount: taxAmount,
              serviceCharge: serviceCharge,
              paymentFee: fee,
              status: 'PENDING',
              tableNumber: session.tableNumber,
              items: { create: cart.map(item => ({ productId: item.productId, quantity: item.qty, price: item.price })) }
            }
          });

          const paymentLink = await createPaymentLink(order.id, finalTotal, from, targetStore.id, method);
          let summary = "🧾 *Order Summary*\n";
          cart.forEach(item => { summary += `- ${item.name} x${item.qty} = ${new Intl.NumberFormat('id-ID').format(item.price * item.qty)}\n`; });
          summary += `\n------------------\nSubtotal: Rp ${new Intl.NumberFormat('id-ID').format(total)}\n`;
          if (taxAmount > 0) summary += `Tax (${targetStore.taxPercent}%): Rp ${new Intl.NumberFormat('id-ID').format(taxAmount)}\n`;
          if (serviceCharge > 0) summary += `Service (${targetStore.serviceChargePercent}%): Rp ${new Intl.NumberFormat('id-ID').format(serviceCharge)}\n`;
          if (fee > 0) summary += `Fee (${method === 'qris' ? 'QRIS' : 'Bank'}): Rp ${new Intl.NumberFormat('id-ID').format(fee)}\n`;
          summary += `\n*Total: Rp ${new Intl.NumberFormat('id-ID').format(finalTotal)}*`;

          await sendWhatsAppMessage(from, summary, targetStore.id, { buttonText: "Pay Now", buttonUrl: paymentLink });
          await updateSession(from, targetStore.id, { step: 'START', cart: [] });
          return NextResponse.json({ success: true });
        }

        const orderParts = textBody.split(',').map((p: string) => p.trim());
        const validOrders: { index: number, qty: number }[] = [];
        let quickCheckoutMethod: string | undefined = undefined;

        for (const part of orderParts) {
            const itemMatch = part.match(/^(\d+)\s+(\d+)(?:\s+done\s+(\w+))?$/i);
            if (itemMatch) {
                validOrders.push({ index: parseInt(itemMatch[1]) - 1, qty: parseInt(itemMatch[2]) });
                if (itemMatch[3]) quickCheckoutMethod = itemMatch[3].toLowerCase();
            }
        }
        
        const isCheckoutCommand = lowerText.includes('done') || lowerText.includes('checkout');
        if (isCheckoutCommand && !quickCheckoutMethod) {
            if (lowerText.includes('qris')) quickCheckoutMethod = 'qris';
            else if (lowerText.includes('bank')) quickCheckoutMethod = 'bank_transfer';
        }
        if (quickCheckoutMethod === 'bank') quickCheckoutMethod = 'bank_transfer';

        if (validOrders.length > 0) {
          const whereClause: any = { storeId: targetStore.id };
          if (currentCategory) whereClause.category = { equals: currentCategory, mode: 'insensitive' };
          const products = await prisma.product.findMany({ where: whereClause, take: 10, orderBy: { name: 'asc' } });
          const currentCart = (session.cart as any[]) || [];
          let addedItemsMsg = "";

          for (const order of validOrders) {
             if (order.index >= 0 && order.index < products.length && order.qty > 0) {
                const product = products[order.index];
                currentCart.push({ productId: product.id, name: product.name, price: product.price, qty: order.qty });
                addedItemsMsg += `- ${order.qty}x ${product.name}\n`;
             }
          }

          if (addedItemsMsg) {
             await updateSession(from, targetStore.id, { cart: currentCart });
             if (isCheckoutCommand) {
                 const total = currentCart.reduce((sum: number, item: any) => sum + (item.price * item.qty), 0);
                 const taxAmount = total * (targetStore.taxPercent / 100);
                 const serviceCharge = total * (targetStore.serviceChargePercent / 100);
                 const subtotalWithTaxService = total + taxAmount + serviceCharge;
                 let fee = 0;
                 if (targetStore.feePaidBy === 'CUSTOMER') {
                     if (quickCheckoutMethod === 'qris' && targetStore.qrisFeePercent) fee = subtotalWithTaxService * (Number(targetStore.qrisFeePercent) / 100);
                     else if (quickCheckoutMethod === 'bank_transfer' && targetStore.manualTransferFee) fee = Number(targetStore.manualTransferFee);
                 }
                 const finalTotal = subtotalWithTaxService + fee;
                 const order = await prisma.order.create({
                    data: {
                      storeId: targetStore.id,
                      customerPhone: from,
                      totalAmount: finalTotal,
                      taxAmount: taxAmount,
                      serviceCharge: serviceCharge,
                      paymentFee: fee,
                      status: 'PENDING',
                      tableNumber: session.tableNumber,
                      items: { create: currentCart.map((item: any) => ({ productId: item.productId, quantity: item.qty, price: item.price })) }
                    }
                 });
                 const paymentLink = await createPaymentLink(order.id, finalTotal, from, targetStore.id, quickCheckoutMethod);
                 let summary = "🧾 *Order Summary*\n";
                 currentCart.forEach((item: any) => { summary += `- ${item.name} x${item.qty} = ${new Intl.NumberFormat('id-ID').format(item.price * item.qty)}\n`; });
                 summary += `\n------------------\nSubtotal: Rp ${new Intl.NumberFormat('id-ID').format(total)}\n`;
                 if (taxAmount > 0) summary += `Tax (${targetStore.taxPercent}%): Rp ${new Intl.NumberFormat('id-ID').format(taxAmount)}\n`;
                 if (serviceCharge > 0) summary += `Service (${targetStore.serviceChargePercent}%): Rp ${new Intl.NumberFormat('id-ID').format(serviceCharge)}\n`;
                 if (fee > 0) summary += `Fee (${quickCheckoutMethod === 'qris' ? 'QRIS' : 'Bank'}): Rp ${new Intl.NumberFormat('id-ID').format(fee)}\n`;
                 summary += `\n*Total: Rp ${new Intl.NumberFormat('id-ID').format(finalTotal)}*`;
                 await sendWhatsAppMessage(from, summary, targetStore.id, { buttonText: "Pay Now", buttonUrl: paymentLink });
                 await updateSession(from, targetStore.id, { step: 'START', cart: [] });
                 return NextResponse.json({ success: true });
             } else {
                 await sendWhatsAppMessage(from, `Added to cart:\n${addedItemsMsg}\nReply with more items, or "Done Qris/Bank" to checkout.\nReply 'Menu' to go back.`, targetStore.id);
             }
          } else {
             await sendWhatsAppMessage(from, `Invalid item number(s). Please check the menu.`, targetStore.id);
          }
        } else if (isCheckoutCommand) {
             const cart = (session.cart as any[]) || [];
             if (cart.length === 0) {
                await sendWhatsAppMessage(from, `Your cart is empty. Reply 'Menu' to see items.`, targetStore.id);
                return NextResponse.json({ success: true });
             }
             await sendWhatsAppMessage(from, `I didn't understand. Reply '1 2' to order Item #1 Quantity 2, or 'Done' to finish.`, targetStore.id);
        } else {
          await sendWhatsAppMessage(from, `I didn't understand. Reply '1 2' to order Item #1 Quantity 2, or 'Done' to finish.`, targetStore.id);
        }
        return NextResponse.json({ success: true });
      }

      if (textBody?.toLowerCase().includes("would like to order")) {
        const totalMatch = textBody.match(/Total:\s*\*?Rp\s*([\d.]+)/i);
        if (totalMatch) {
           const amount = parseInt(totalMatch[1].replace(/\./g, ''));
           const order = await prisma.order.create({
            data: { storeId: targetStore.id, customerPhone: from, totalAmount: amount, status: 'PENDING', items: { create: [] } }
          });
          const paymentLink = await createPaymentLink(order.id, amount, from, targetStore.id);
          await sendWhatsAppMessage(from, `Order #${order.id} received!\nAmount: Rp ${new Intl.NumberFormat('id-ID').format(amount)}`, targetStore.id, {
              buttonText: "Pay Now",
              buttonUrl: paymentLink
          });
        }
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
