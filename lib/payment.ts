import { prisma } from "@/lib/prisma";
import midtransClient from "midtrans-client";
import { Xendit } from "xendit-node";

// Generate unique code for manual transfer (001-999)
function generateUniqueCode() {
  return Math.floor(Math.random() * 999) + 1;
}

export async function processPayment(orderId: number, amount: number, customerPhone: string, method: string, storeId: number) {
  console.log(`Processing payment: Order ${orderId}, Amount ${amount}, Method ${method}, Store ${storeId}`);
  const settings = await prisma.store.findUnique({ where: { id: storeId } });
  
  // Use env variables as fallback since PlatformSettings might not be synced
  const platform = {
      midtransServerKey: process.env.PAYMENT_GATEWAY_SECRET || process.env.MIDTRANS_SERVER_KEY, // Try both env names
      midtransClientKey: process.env.PAYMENT_GATEWAY_CLIENT_KEY || process.env.MIDTRANS_CLIENT_KEY,
      xenditSecretKey: process.env.XENDIT_SECRET_KEY,
      bankName: 'BCA',
      bankAccountNumber: process.env.PLATFORM_BANK_NUMBER,
      bankAccountName: process.env.PLATFORM_BANK_NAME
  };
  
  if (!settings) {
    throw new Error("Store not found");
  }

  const canOverridePlatformConfig = settings.slug !== "demo" && settings.subscriptionPlan === "ENTERPRISE";

  // 1. Manual Transfer
  if (method === 'manual') {
    let bankDetails = {
      bankName: platform?.bankName || 'BCA', 
      accountNumber: platform?.bankAccountNumber || process.env.PLATFORM_BANK_NUMBER || '888888888', 
      accountName: platform?.bankAccountName || process.env.PLATFORM_BANK_NAME || 'LCP Platform'
    };

    // Override if Enterprise
    if (canOverridePlatformConfig && settings.bankAccount) {
      const storeBank = settings.bankAccount as any;
      if (storeBank.bankName && storeBank.accountNumber) {
        bankDetails = {
           bankName: storeBank.bankName,
           accountNumber: storeBank.accountNumber,
           accountName: storeBank.accountName || settings.name
        };
      }
    }

    const uniqueCode = generateUniqueCode();
    const finalAmount = amount + uniqueCode;
    
    // Update order with unique code
    await prisma.order.update({
      where: { id: orderId },
      data: { 
        uniqueCode: uniqueCode,
        totalAmount: finalAmount, // Update total to include unique code
        paymentMethod: 'manual',
        status: 'PENDING'
      }
    });

    return {
      success: true,
      type: 'manual',
      amount: finalAmount,
      uniqueCode: uniqueCode,
      bankName: bankDetails.bankName,
      accountNumber: bankDetails.accountNumber,
      accountName: bankDetails.accountName
    };
  }

  if (method === 'midtrans') {
    if (!settings.enableMidtrans) throw new Error("Midtrans payment is disabled for this store.");
    
    let serverKey = platform?.midtransServerKey || process.env.PAYMENT_GATEWAY_SECRET;
    let clientKey = platform?.midtransClientKey || process.env.PAYMENT_GATEWAY_CLIENT_KEY;

    if (canOverridePlatformConfig && settings.paymentGatewaySecret && settings.paymentGatewayClientKey) {
       serverKey = settings.paymentGatewaySecret;
       clientKey = settings.paymentGatewayClientKey;
    }

    // Add debug logs
    console.log(`[Midtrans] Store: ${storeId}, Plan: ${settings.subscriptionPlan}, Override: ${canOverridePlatformConfig}`);
    console.log(`[Midtrans] Keys Loaded: Server=${!!serverKey}, Client=${!!clientKey}`);
    
    // Debug environment variables safely (hide actual keys)
    console.log(`[Midtrans] Env Vars Check: 
      PAYMENT_GATEWAY_SECRET=${!!process.env.PAYMENT_GATEWAY_SECRET}, 
      MIDTRANS_SERVER_KEY=${!!process.env.MIDTRANS_SERVER_KEY},
      PAYMENT_GATEWAY_CLIENT_KEY=${!!process.env.PAYMENT_GATEWAY_CLIENT_KEY},
      MIDTRANS_CLIENT_KEY=${!!process.env.MIDTRANS_CLIENT_KEY}
    `);

    if (!serverKey || !clientKey) {
      console.error("Midtrans keys missing. Store:", storeId, "Can Override:", canOverridePlatformConfig);
      // Fallback to Env vars if Store keys are missing but Enterprise is active?
      if (canOverridePlatformConfig) {
          // If enterprise user didn't set keys, fallback to platform keys?
          // Or strictly require them?
          // Let's fallback to platform keys for now to avoid breakage
          serverKey = platform?.midtransServerKey || process.env.PAYMENT_GATEWAY_SECRET;
          clientKey = platform?.midtransClientKey || process.env.PAYMENT_GATEWAY_CLIENT_KEY;
          
          if (!serverKey || !clientKey) {
             console.error("[Midtrans] Fallback failed. No platform keys found.");
             throw new Error("Midtrans keys not configured (Platform or Store)");
          } else {
             console.log("[Midtrans] Falling back to Platform Keys for Enterprise Store");
          }
      } else {
         // Non-enterprise stores MUST use platform keys. 
         // Force copy from platform object if local variables are empty
         if (!serverKey) serverKey = platform?.midtransServerKey || process.env.PAYMENT_GATEWAY_SECRET;
         if (!clientKey) clientKey = platform?.midtransClientKey || process.env.PAYMENT_GATEWAY_CLIENT_KEY;

         if (!serverKey || !clientKey) {
            console.error("[Midtrans] Platform keys missing for non-enterprise store.");
            throw new Error("Midtrans keys not configured (Platform or Store)");
         }
      }
    }

    const isProduction = !serverKey.startsWith("SB-");

    const snap = new midtransClient.Snap({
      isProduction: isProduction,
      serverKey: serverKey,
      clientKey: clientKey
    });

    const parameter = {
      transaction_details: {
        order_id: `ORDER-${orderId}-${Date.now()}`, // Unique ID for Midtrans
        gross_amount: amount
      },
      customer_details: {
        phone: customerPhone
      }
    };

    try {
      const transaction = await snap.createTransaction(parameter);
      
      await prisma.order.update({
        where: { id: orderId },
        data: { 
          paymentMethod: 'midtrans',
          paymentUrl: transaction.redirect_url
        }
      });

      return {
        success: true,
        type: 'midtrans',
        paymentUrl: transaction.redirect_url,
        token: transaction.token
      };
    } catch (err: any) {
      console.error("Midtrans Transaction Error:", err?.message || err);
      throw new Error("Failed to create Midtrans transaction: " + (err?.message || "Unknown error"));
    }
  }

  if (method === 'xendit') {
    if (!settings.enableXendit) throw new Error("Xendit payment is disabled for this store.");
    
    let secretKey = platform?.xenditSecretKey || process.env.XENDIT_SECRET_KEY;
    
    if (canOverridePlatformConfig && settings.paymentGatewaySecret) {
       secretKey = settings.paymentGatewaySecret;
    }

    if (!secretKey) {
      throw new Error("Xendit API Key not configured");
    }

    const xendit = new Xendit({
      secretKey: secretKey,
    });

    const resp = await xendit.Invoice.createInvoice({
      data: {
        externalId: `ORDER-${orderId}-${Date.now()}`,
        amount: amount,
        payerEmail: 'guest@example.com', // Optional if phone provided
        description: `Payment for Order #${orderId}`,
        customer: {
          mobileNumber: customerPhone.startsWith('0') ? customerPhone.replace('0', '+62') : customerPhone
        }
      }
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { 
        paymentMethod: 'xendit',
        paymentUrl: resp.invoiceUrl
      }
    });

    return {
      success: true,
      type: 'xendit',
      paymentUrl: resp.invoiceUrl
    };
  }

  throw new Error(`Payment method ${method} not supported or enabled`);
}

// Deprecated function kept for backward compatibility (WhatsApp flow)
export async function createPaymentLink(orderId: number, amount: number, customerPhone: string, storeId: number) {
  // Default to Midtrans if enabled, else manual mock
  const settings = await prisma.store.findUnique({ where: { id: storeId } });
  
  // Try Midtrans first
  if (settings?.enableMidtrans) {
    try {
      const res = await processPayment(orderId, amount, customerPhone, 'midtrans', storeId);
      return res.paymentUrl;
    } catch (e) {
      console.error("Failed to generate Midtrans link:", e);
      // Fallback to manual? No, let's return error or fallback to WhatsApp confirmation
    }
  }

  // Try Xendit
  if (settings?.enableXendit) {
     try {
      const res = await processPayment(orderId, amount, customerPhone, 'xendit', storeId);
      return res.paymentUrl;
    } catch (e) {
      console.error("Failed to generate Xendit link:", e);
    }
  }
  
  // Fallback: WhatsApp Confirmation Link
  // Ensure we use the correct number format
  let waNumber = settings?.whatsapp;
  if (waNumber && waNumber.startsWith('0')) {
      waNumber = '62' + waNumber.substring(1);
  }
  
  return `https://wa.me/${waNumber}?text=Confirm+Payment+Order+${orderId}`;
}
