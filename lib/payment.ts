import { merchantConfig } from "@/config/merchant";

// Mock Payment Link Generator (Midtrans/Xendit style)
export async function createPaymentLink(orderId: number, amount: number, customerPhone: string) {
  // In a real implementation, you would call Midtrans/Xendit API here using merchantConfig.paymentGatewaySecret
  
  // For now, we return a simulated payment page or deep link
  // If using Midtrans Snap:
  // const snap = new midtransClient.Snap({ ... });
  // const transaction = await snap.createTransaction({ ... });
  // return transaction.redirect_url;

  // Returning a "Pay via WhatsApp" deep link for Bank Transfer instruction as a simple fallback
  // Or a mock URL for demo purposes
  
  const paymentUrl = `https://simulator.sandbox.midtrans.com/payment/interface?order_id=${orderId}&amount=${amount}`;
  return paymentUrl;
}

