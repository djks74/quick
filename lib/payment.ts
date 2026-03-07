import { prisma } from "./prisma";

// Payment Link Generator
export async function createPaymentLink(orderId: number, amount: number, customerPhone: string) {
  const settings = await prisma.storeSettings.findFirst();
  const secretKey = settings?.paymentGatewaySecret || process.env.PAYMENT_GATEWAY_SECRET;

  // If Xendit/Midtrans key is present, use it (Mock implementation of the call)
  if (secretKey) {
    // Example: Call Xendit
    // const res = await fetch('https://api.xendit.co/v2/invoices', ...)
    // return res.invoice_url;
    
    // For now, returning a mock success link that would verify payment
    // In production, this URL would be the actual Payment Gateway URL
    return `https://checkout.xendit.co/web/mock/${orderId}`; 
  }

  // Fallback: Return a manual bank transfer instruction page (internal to our app)
  // or a simulation link
  return `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/checkout/pay/${orderId}`;
}

