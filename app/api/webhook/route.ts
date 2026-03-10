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
    const platform = await prisma.platformSettings.findUnique({ where: { key: "default" } });
    const platformPhoneNumberId = platform?.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID;

    if (message && phoneNumberId) {
      const from = message.from;

      // 0. MERCHANT CHECK
      // Check if sender is a registered Merchant
      let user = await prisma.user.findUnique({
        where: { phoneNumber: from },
        include: { stores: true }
      });

      // Check if Merchant is in "User Mode"
      // We can use a special session flag or just check if they are explicitly asking for User actions
      // Simpler approach: If they type "User Mode", we ignore merchant handler for this session?
      // Or we can check if they are scanning a QR code (Table ...) -> Force User Mode
      
      const isMerchant = user && (user.role === 'MERCHANT' || user.role === 'SUPER_ADMIN');
      let forceUserMode = false;

      // Detect User Intent that overrides Merchant Mode
      if (isMerchant) {
          const lower = message.text?.body?.toLowerCase() || "";
          // 1. Explicit Switch
          if (lower === 'user mode' || lower === 'mode user') {
             // We need to store this state. using WhatsAppSession?
             // Let's use a special storeId=0 session to store global user prefs?
             // Or just let them fall through for this message?
             // Better: If they type "User Mode", we send them a message "You are now in User Mode. Type 'Admin Mode' to switch back."
             // And we need to persist this.
             // For now, let's just allow specific commands to bypass.
          }
          
          // 2. Scanning QR (Table ...)
          if (lower.startsWith('table') || lower.startsWith('meja')) {
             forceUserMode = true;
          }
          
          // 3. Explicit "Buy" or "Order" command? 
          // Merchant might want to "Add Product", so "Add" is ambiguous.
          // "Menu" is ambiguous (Merchant Menu vs Store Menu).
          
          // Let's check session. If they have an active "User Session" recently updated?
          // This is complex because Merchant Handler doesn't use WhatsAppSession table much yet.
      }


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

      // Use a special session for Merchant Mode Toggle
      let merchantSession = null;
      if (isMerchant) {
        // Use storeId 0 for "Platform/User Context" session
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
      } 
      
      // Force Shared Number logic if Env var matches or Platform ID matches
      // Also fallback to Shared Logic if NO store is found by ID (meaning it's the shared number)
      if (!targetStore || (platformPhoneNumberId && phoneNumberId === platformPhoneNumberId)) {
         // 2. If matches Platform ID, try to infer context from recent session
         console.log('Received message on Shared Platform Number');
         isSharedNumber = true;
         const from = message.from;
         
         const recentSession = await prisma.whatsAppSession.findFirst({
            where: { phoneNumber: from },
            orderBy: { updatedAt: 'desc' }
         });
         
        if (recentSession && recentSession.storeId) {
            // Check if store exists
            const s = await prisma.store.findUnique({ where: { id: recentSession.storeId } });
            if (s) targetStore = s;
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
      
      // Handle "Check-in Table X" or "Table X" -> Enforce QR Scan / Welcome
      // Regex to match "Check-in Table [Number]" or "Table [Number]" or "Meja [Number]"
      const checkInMatch = textBody.match(/(?:check-in|table|meja)\s*(?:table|meja)?\s*(.+)/i);
      
      if (checkInMatch) {
        const tableNum = checkInMatch[1].replace(/table|meja/gi, '').trim(); // Clean up if double words
        
        // Update session with table number
        await updateSession(from, targetStore.id, { tableNumber: tableNum, step: 'MENU_SELECTION' });

        await sendWhatsAppMessage(from, 
          `👋 Welcome to *${targetStore.name}* at Table *${tableNum}*!\n\n` +
          `1. View Menu (Web)\n` +
          `2. Order via WhatsApp\n` +
          `3. Quick Pay\n\n` +
          `Reply with number to select.`,
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

      // Handle "Stores" -> Switch Store (Shared Number Only)
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

      // Handle "Menu" -> Jump to Ordering or Category Selection
      if (lowerText === 'menu') {
        console.log('DEBUG: Menu command received for store', targetStore.name);
        try {
            const categories = await prisma.category.findMany({
                where: { storeId: targetStore.id },
                orderBy: { name: 'asc' }
            });
            console.log('DEBUG: Categories found', categories.length);

            // If store has categories, ask user to select one
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

            // If NO categories, show all items (Default Behavior)
            await updateSession(from, targetStore.id, { step: 'ORDERING' });
            const products = await prisma.product.findMany({ 
              where: { storeId: targetStore.id },
              take: 10,
              orderBy: { name: 'asc' }
            });
            console.log('DEBUG: Products found', products.length);

            if (products.length === 0) {
                 await sendWhatsAppMessage(from, `Sorry, this store has no products yet.`, targetStore.id);
                 return NextResponse.json({ success: true });
            }

            const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://quick.mythoz.com'}/${targetStore.slug}${session.tableNumber ? `?table=${session.tableNumber}` : ''}`;

            let menuText = `🍽️ *${targetStore.name} Menu* 🍽️\n\n`;
            menuText += `📱 *Recommended*: Order via Web\n${menuUrl}\n\n`;
            menuText += `👇 *Or Order via Text*:\n`;
            
            products.forEach((p, index) => {
              const priceRange = p.variations && Array.isArray(p.variations) && p.variations.length > 0
                ? `${new Intl.NumberFormat('id-ID').format(Math.min(...(p.variations as any[]).map((v:any) => v.price)))} - ${new Intl.NumberFormat('id-ID').format(Math.max(...(p.variations as any[]).map((v:any) => v.price)))}`
                : new Intl.NumberFormat('id-ID').format(p.price);

              menuText += `${index + 1}. ${p.name} - ${priceRange}\n`;
            });
            menuText += `\nReply with "ItemNumber Quantity" (e.g. '1 2').\nReply 'Done' to checkout.`;

            await sendWhatsAppMessage(from, menuText, targetStore.id);
            return NextResponse.json({ success: true });
        } catch (err) {
            console.error('DEBUG: Error in Menu Handler', err);
            await sendWhatsAppMessage(from, `Error fetching menu. Please try again.`, targetStore.id);
            return NextResponse.json({ success: true });
        }
      }

      // 2. STATE BASED HANDLING

      // Step: CATEGORY_SELECTION
      if (session.step === 'CATEGORY_SELECTION') {
          const index = parseInt(textBody) - 1; // User input 1-based
          
          if (isNaN(index)) {
             await sendWhatsAppMessage(from, `Invalid selection. Please reply with a number.`, targetStore.id);
             return NextResponse.json({ success: true });
          }

          let selectedCategoryName = null;
          
          if (index === 0) {
              // "1. All Menu"
              selectedCategoryName = null; // Show all
          } else {
              // Specific Category
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

          // Fetch Products based on Category
          const whereClause: any = { storeId: targetStore.id };
          if (selectedCategoryName) {
              whereClause.category = selectedCategoryName;
          }

          const products = await prisma.product.findMany({ 
            where: whereClause,
            take: 10,
            orderBy: { name: 'asc' }
          });

          if (products.length === 0) {
             await sendWhatsAppMessage(from, `No items found in this category.`, targetStore.id);
             // Stay in CATEGORY_SELECTION? Or go back?
             return NextResponse.json({ success: true });
          }

          // Save selected products to session? No, just list them and switch to ORDERING
          // Wait, if we switch to ORDERING, how do we know which products correspond to "1", "2"?
          // The current ORDERING logic assumes we fetched "take: 10" and ordered by name asc.
          // If the user selects a category, the "index" 1 might correspond to a different product than if they selected "All".
          // We need to store the CONTEXT of the menu shown.
          // For MVP, we can just rely on the fact that if they reply "1 2" immediately after seeing the list, 
          // we should re-fetch the SAME list to resolve the ID.
          // BUT `ORDERING` step logic does a fresh fetch:
          /*
            const products = await prisma.product.findMany({ 
                where: { storeId: targetStore.id },
                take: 10,
                orderBy: { name: 'asc' }
            });
          */
          // This is a BUG in my previous design if we add filtering!
          // We must store the filter in the session or re-apply it.
          // Let's add `filterCategory` to the session metadata (using `cart` field or `step` encoded?)
          // Schema: `cart Json?`. We can store `{ items: [], category: "Food" }`.

          // Let's update session with the category filter context
          // Note: `cart` field is currently used as an Array of items.
          // I should ideally migrate `cart` to be an Object `{ items: [], filter: ... }` but that breaks existing code.
          // Hack: Store filter in `tableNumber`? No.
          // Hack: Store filter in a temporary cache? No.
          // Solution: Use `cart` field but be careful.
          // Or just use `step` like `ORDERING:Food`.
          
          const stepValue = selectedCategoryName ? `ORDERING:${selectedCategoryName}` : `ORDERING:ALL`;
          await updateSession(from, targetStore.id, { step: stepValue });

          const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://quick.mythoz.com'}/${targetStore.slug}${session.tableNumber ? `?table=${session.tableNumber}` : ''}`;
          
          let title = selectedCategoryName ? `${selectedCategoryName}` : `All Menu`;
          let menuText = `🍽️ *${title}* 🍽️\n\n`;
          menuText += `📱 *Web*: ${menuUrl}\n\n`;
          
          products.forEach((p, idx) => {
             const priceRange = p.variations && Array.isArray(p.variations) && p.variations.length > 0
                ? `${new Intl.NumberFormat('id-ID').format(Math.min(...(p.variations as any[]).map((v:any) => v.price)))} - ${new Intl.NumberFormat('id-ID').format(Math.max(...(p.variations as any[]).map((v:any) => v.price)))}`
                : new Intl.NumberFormat('id-ID').format(p.price);
             menuText += `${idx + 1}. ${p.name} - ${priceRange}\n`;
          });
          menuText += `\nReply "ItemQty" (e.g. '1 2').\nReply 'Done' to pay.\nReply 'Menu' to change category.`;
          
          await sendWhatsAppMessage(from, menuText, targetStore.id);
          return NextResponse.json({ success: true });
      }
      if (session.step === 'STORE_SELECTION') {
        const index = parseInt(textBody) - 1;
        const stores = await prisma.store.findMany({
          take: 10,
          orderBy: { name: 'asc' }
        });

        if (index >= 0 && index < stores.length) {
          const selectedStore = stores[index];
          // Create/Update session for this store
          // Actually, we need to update the session to point to this NEW storeId
          // BUT `getSession` uses `phoneNumber_storeId` composite key.
          // So we are creating a NEW session for the new store, or switching context?
          // The `recentSession` logic in `POST` looks for *any* session by phone number, ordered by `updatedAt`.
          // So if we create/update a session for the new store, it will become the "recent" one.
          
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
               data: { updatedAt: new Date(), step: 'START' } // Bump timestamp
             });
          }

          await sendWhatsAppMessage(from, `✅ Switched to *${selectedStore.name}*.\nReply 'Menu' to order.`, selectedStore.id);
        } else {
          await sendWhatsAppMessage(from, `Invalid selection. Please reply with a number.`, targetStore.id);
        }
        return NextResponse.json({ success: true });
      }

      // 2. STATE BASED HANDLING

      // Step: MENU_SELECTION (After scanning table)
      if (session.step === 'MENU_SELECTION') {
        if (textBody === '1') {
          // Web Menu
          const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://quick.mythoz.com'}/${targetStore.slug}?table=${session.tableNumber}`;
          await sendWhatsAppMessage(from, `Please order here: ${menuUrl}`, targetStore.id);
          await updateSession(from, targetStore.id, { step: 'START' }); // Reset
        } else if (textBody === '2') {
          // WhatsApp Menu
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
          
          const menuUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://quick.mythoz.com'}/${targetStore.slug}${session.tableNumber ? `?table=${session.tableNumber}` : ''}`;

          let menuText = `🍽️ *${targetStore.name} Menu* 🍽️\n\n`;
          menuText += `📱 *Recommended*: Order via Web\n${menuUrl}\n\n`;
          menuText += `👇 *Or Order via Text*:\n`;

          products.forEach((p, index) => {
            const priceRange = p.variations && Array.isArray(p.variations) && p.variations.length > 0
              ? `${new Intl.NumberFormat('id-ID').format(Math.min(...(p.variations as any[]).map((v:any) => v.price)))} - ${new Intl.NumberFormat('id-ID').format(Math.max(...(p.variations as any[]).map((v:any) => v.price)))}`
              : new Intl.NumberFormat('id-ID').format(p.price);

            menuText += `${index + 1}. ${p.name} - ${priceRange}\n`;
          });
          menuText += `\nReply with "ItemNumber Quantity" (e.g. '1 2').\nReply 'Done' to checkout.`;
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
      if (session.step && session.step.startsWith('ORDERING')) {
        const stepParts = session.step.split(':');
        const currentCategory = stepParts.length > 1 && stepParts[1] !== 'ALL' ? stepParts[1] : null;

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

          // Fetch products with SAME filter
          const whereClause: any = { storeId: targetStore.id };
          if (currentCategory) {
              whereClause.category = currentCategory;
          }

          const products = await prisma.product.findMany({ 
            where: whereClause,
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
