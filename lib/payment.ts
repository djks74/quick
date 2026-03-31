import { prisma } from "@/lib/prisma";
import midtransClient from "midtrans-client";

// Generate unique code for manual transfer (001-999)
function generateUniqueCode() {
  return Math.floor(Math.random() * 999) + 1;
}

export async function processPayment(orderId: number, amount: number, customerPhone: string, method: string, storeId: number, specificType?: string) {
  console.log(`Processing payment: Order ${orderId}, Amount ${amount}, Method ${method}, Store ${storeId}, Type ${specificType}`);
  
  const settings = await prisma.store.findUnique({ where: { id: storeId } });
  if (!settings) {
    throw new Error("Store not found");
  }

  let platformSettings = null;
  try {
    platformSettings = await prisma.platformSettings.findUnique({ where: { key: "default" } });
  } catch (e: any) {
    console.warn(`[PAYMENT] Could not fetch PlatformSettings (table might be missing): ${e.message}`);
  }
  
  // Use DB settings with env variables as fallback
  const platform = {
      midtransServerKey: platformSettings?.midtransServerKey || process.env.PAYMENT_GATEWAY_SECRET || process.env.MIDTRANS_SERVER_KEY,
      midtransClientKey: platformSettings?.midtransClientKey || process.env.PAYMENT_GATEWAY_CLIENT_KEY || process.env.MIDTRANS_CLIENT_KEY,
      bankName: platformSettings?.bankName || 'BCA',
      bankAccountNumber: platformSettings?.bankAccountNumber || process.env.PLATFORM_BANK_NUMBER,
      bankAccountName: platformSettings?.bankAccountName || process.env.PLATFORM_BANK_NAME
  };

  const canOverridePlatformConfig = settings.slug !== "demo"; // && settings.subscriptionPlan === "ENTERPRISE";
  // Removed strict Enterprise check so PRO stores can also attempt to load keys if present.
  // BUT we will rely on UI logic to prevent PRO users from editing them.
  // This ensures that if keys were copied (like we just implemented), they are used.

  // 1. Manual Transfer - DISABLED by user request
  /*
  if (method === 'manual') {
    // ... logic removed ...
  }
  */

  if (method === 'midtrans') {
    const hasPlatformKeys = Boolean(platform?.midtransServerKey && platform?.midtransClientKey);
    if (!settings.enableMidtrans && !hasPlatformKeys) {
      throw new Error("Midtrans payment is disabled for this store and platform keys are not configured.");
    }
    
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

    const normalizedAmount = Math.max(1, Math.round(Number(amount) || 0));
    if (!Number.isFinite(normalizedAmount) || normalizedAmount < 1) {
      throw new Error("Invalid payment amount");
    }
    if (normalizedAmount !== amount) {
      await prisma.order.update({
        where: { id: orderId },
        data: { totalAmount: normalizedAmount }
      });
    }

    const buildParameter = (useSpecificType: boolean) => {
      const parameter: any = {
        transaction_details: {
          order_id: `ORDER-${orderId}-${Date.now()}`,
          gross_amount: normalizedAmount
        },
        customer_details: {
          phone: customerPhone
        }
      };
      if (useSpecificType && specificType === 'qris') {
        parameter.enabled_payments = ['gopay', 'shopeepay', 'qris', 'other_qris'];
      } else if (useSpecificType && specificType === 'gopay') {
        parameter.enabled_payments = ['gopay'];
      } else if (useSpecificType && specificType === 'bank_transfer') {
        parameter.enabled_payments = ['bca_va', 'bni_va', 'bri_va', 'permata_va', 'other_va', 'echannel'];
      }
      return parameter;
    };

    const tryCreateTransaction = async (parameter: any) => {
      let lastError: any = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          return await snap.createTransaction(parameter);
        } catch (err: any) {
          lastError = err;
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }
      throw lastError;
    };

    try {
      let transaction: any;
      if (specificType === 'qris' || specificType === 'gopay' || specificType === 'bank_transfer') {
        try {
          transaction = await tryCreateTransaction(buildParameter(true));
        } catch (specificErr) {
          transaction = await tryCreateTransaction(buildParameter(false));
        }
      } else {
        transaction = await tryCreateTransaction(buildParameter(false));
      }
      
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

  throw new Error(`Payment method ${method} not supported or enabled`);
}

// Deprecated function kept for backward compatibility (WhatsApp flow)
export async function createPaymentLink(orderId: number, amount: number, customerPhone: string, storeId: number, specificType?: string) {
  const appBaseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://gercep.click").replace(/\/$/, "");
  const internalCheckoutUrl = `${appBaseUrl}/checkout/pay/${orderId}`;
  // Default to Midtrans if enabled, else manual mock
  const settings = await prisma.store.findUnique({ where: { id: storeId } });
  
  // Try Midtrans first
  if (settings?.enableMidtrans) {
    try {
      await processPayment(orderId, amount, customerPhone, 'midtrans', storeId, specificType);
      return internalCheckoutUrl;
    } catch (e) {
      console.error("Failed to generate Midtrans link:", e);
      // Fallback to manual? No, let's return error or fallback to WhatsApp confirmation
    }
  }
  
  // Fallback: WhatsApp Confirmation Link
  // Ensure we use the correct number format
  let waNumber = settings?.whatsapp;
  if (waNumber && waNumber.startsWith('0')) {
      waNumber = '62' + waNumber.substring(1);
  }
  
  return internalCheckoutUrl;
}
