import { prisma } from "@/lib/prisma";
import midtransClient from "midtrans-client";
import { Xendit } from "xendit-node";

// Generate unique code for manual transfer (001-999)
function generateUniqueCode() {
  return Math.floor(Math.random() * 999) + 1;
}

export async function processPayment(orderId: number, amount: number, customerPhone: string, method: string) {
  const settings = await prisma.storeSettings.findFirst();
  
  // 1. Manual Transfer
  if (method === 'manual') {
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
      bankName: 'BCA', // Placeholder, should be in settings
      accountNumber: '1234567890',
      accountName: settings?.storeName || 'PT Laku Keras'
    };
  }

  // 2. Midtrans
  if (method === 'midtrans' && settings?.enableMidtrans) {
    if (!settings.paymentGatewaySecret || !settings.paymentGatewayClientKey) {
      throw new Error("Midtrans keys not configured");
    }

    const isProduction = !settings.paymentGatewaySecret.startsWith("SB-");

    const snap = new midtransClient.Snap({
      isProduction: isProduction,
      serverKey: settings.paymentGatewaySecret,
      clientKey: settings.paymentGatewayClientKey
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
  }

  // 3. Xendit
  if (method === 'xendit' && settings?.enableXendit) {
    if (!settings.paymentGatewaySecret) {
      throw new Error("Xendit API Key not configured");
    }

    const xendit = new Xendit({
      secretKey: settings.paymentGatewaySecret,
    });

    const { Invoice } = xendit;
    const invoiceSpecificOptions = {};
    const invoice = new Invoice(invoiceSpecificOptions);

    const resp = await invoice.createInvoice({
      externalId: `ORDER-${orderId}-${Date.now()}`,
      amount: amount,
      payerEmail: 'guest@example.com', // Optional if phone provided
      description: `Payment for Order #${orderId}`,
      customer: {
        mobileNumber: customerPhone.startsWith('0') ? customerPhone.replace('0', '+62') : customerPhone
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
export async function createPaymentLink(orderId: number, amount: number, customerPhone: string) {
  // Default to Midtrans if enabled, else manual mock
  const settings = await prisma.storeSettings.findFirst();
  if (settings?.enableMidtrans) {
    try {
      const res = await processPayment(orderId, amount, customerPhone, 'midtrans');
      return res.paymentUrl;
    } catch (e) {
      console.error(e);
      return '#error';
    }
  }
  return `https://wa.me/${settings?.whatsapp}?text=Confirm+Payment+Order+${orderId}`;
}
