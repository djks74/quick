import Stripe from "stripe";
// import midtransClient from "midtrans-client"; // Midtrans is popular in ID

// Initialize Stripe (simulated with placeholder key)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2025-02-24-preview",
});

export async function createPaymentSession(amount: number, currency: "USD" | "IDR" = "USD") {
  // If currency is IDR, we could use Midtrans logic here
  // For this demo, we'll use Stripe logic as default
  
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: "LCP Auto Cars Order",
            },
            unit_amount: Math.round(amount * 100), // convert to cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/cancel`,
    });

    return { id: session.id, url: session.url };
  } catch (error) {
    console.error("Payment session error:", error);
    // Simulate a successful response for demo if key is missing
    return { 
      id: "demo_session_" + Date.now(), 
      url: "https://checkout.stripe.com/demo", 
      demo: true 
    };
  }
}
