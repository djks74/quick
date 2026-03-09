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
  
  if (!settings) {
    throw new Error("Store not found");
  }

  const isEnterprise = settings.subscriptionPlan === 'ENTERPRISE';

  // 1. Manual Transfer
  if (method === 'manual') {
    // Platform Defaults
    let bankDetails = {
      bankName: 'BCA', 
      accountNumber: process.env.PLATFORM_BANK_NUMBER || '888888888', 
      accountName: process.env.PLATFORM_BANK_NAME || 'LCP Platform'
    };

    // Override if Enterprise
    if (isEnterprise && settings.bankAccount) {
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
    
    let serverKey = process.env.PAYMENT_GATEWAY_SECRET;
    let clientKey = process.env.PAYMENT_GATEWAY_CLIENT_KEY;

    // Override if Enterprise AND Keys are set
    if (isEnterprise && settings.paymentGatewaySecret && settings.paymentGatewayClientKey) {
       serverKey = settings.paymentGatewaySecret;
       clientKey = settings.paymentGatewayClientKey;
    }

    if (!serverKey || !clientKey) {
      console.error("Midtrans keys missing. Store:", storeId, "Is Enterprise:", isEnterprise);
      throw new Error("Midtrans keys not configured (Platform or Store)");
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
    
    let secretKey = process.env.XENDIT_SECRET_KEY; // Assuming separate env var for Xendit platform key

    // Reuse paymentGatewaySecret if explicitly for Xendit (needs clarity, assuming shared field for now or separate logic)
    // For Enterprise, we use paymentGatewaySecret as the API Key for whatever gateway they chose?
    // Let's assume paymentGatewaySecret holds Xendit Secret Key if Xendit is enabled.
    
    if (isEnterprise && settings.paymentGatewaySecret) {
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
  if (settings?.enableMidtrans) {
    try {
      const res = await processPayment(orderId, amount, customerPhone, 'midtrans', storeId);
      return res.paymentUrl;
    } catch (e) {
      console.error(e);
      return '#error';
    }
  }
  return `https://wa.me/${settings?.whatsapp}?text=Confirm+Payment+Order+${orderId}`;
}
