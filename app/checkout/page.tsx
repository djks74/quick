"use client";

import { useState } from "react";
import { useShop } from "@/context/ShopContext";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { ArrowRight, Lock, Shield, Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function CheckoutPage() {
  const { cart, cartTotal, paymentSettings, clearCart } = useShop();
  const [step, setStep] = useState<"details" | "payment" | "success">("details");
  const [loading, setLoading] = useState(false);
  const [selectedGateway, setSelectedGateway] = useState<"midtrans" | "cod" | null>(null);
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [shippingProvider, setShippingProvider] = useState<"gosend" | "jne" | null>(null);
  const [shippingCost, setShippingCost] = useState<number | null>(null);
  const [calculatingShipping, setCalculatingShipping] = useState(false);

  const total = cartTotal + (shippingCost || 0);

  const calculateShipping = async () => {
    if (!address || !postalCode || !shippingProvider) return;
    setCalculatingShipping(true);
    try {
      // Simulate real-time shipping API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      const cost = shippingProvider === "gosend" ? 15000 : 9000;
      setShippingCost(cost);
    } catch (error) {
      console.error("Shipping calculation failed", error);
    } finally {
      setCalculatingShipping(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (!selectedGateway) return;
    
    setLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      setStep("success");
      clearCart();
    }, 2000);
  };

  if (cart.length === 0 && step !== "success") {
    return (
      <main className="min-h-screen flex flex-col bg-[#F0F3F7]">
        <Header />
        <div className="flex-grow flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Your cart is empty</h2>
            <Link href="/shop" className="text-primary font-bold hover:underline">Return to Shop</Link>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-[#F0F3F7]">
      <Header />
      
      <div className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        {step === "success" ? (
          <div className="max-w-2xl mx-auto bg-white p-12 rounded-3xl shadow-lg text-center border border-green-100">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
              <Check className="w-10 h-10" />
            </div>
            <h1 className="text-3xl font-black italic uppercase text-gray-900 mb-4">Order Confirmed!</h1>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">
              Thank you for your order. We have sent a confirmation email to your inbox. Your Order ID is <span className="font-bold text-gray-900">#ORD-{Math.floor(Math.random() * 10000)}</span>.
            </p>
            <Link 
              href="/"
              className="inline-block bg-primary text-white px-8 py-3 rounded-xl font-bold uppercase tracking-wider shadow-lg shadow-primary/20 hover:bg-orange-600 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Main Form */}
            <div className="lg:col-span-8 space-y-8">
              {/* Progress Steps */}
              <div className="flex items-center space-x-4 mb-8">
                <div className={cn("flex items-center space-x-2", step === "details" ? "text-primary" : "text-green-600")}>
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold border-2", step === "details" ? "border-primary bg-primary/10" : "border-green-600 bg-green-100")}>1</div>
                  <span className="font-bold uppercase tracking-wider text-xs">Details</span>
                </div>
                <div className="h-px w-12 bg-gray-200" />
                <div className={cn("flex items-center space-x-2", step === "payment" ? "text-primary" : "text-gray-400")}>
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold border-2", step === "payment" ? "border-primary bg-primary/10" : "border-gray-200")}>2</div>
                  <span className="font-bold uppercase tracking-wider text-xs">Payment</span>
                </div>
              </div>

              {step === "details" && (
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-left-4">
                  <h2 className="text-xl font-black italic uppercase tracking-wider mb-6">Shipping Details</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-500 uppercase">First Name</label>
                      <input type="text" className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-500 uppercase">Last Name</label>
                      <input type="text" className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-bold text-gray-500 uppercase">Email Address</label>
                      <input type="email" className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-bold text-gray-500 uppercase">Street Address</label>
                      <input 
                        type="text" 
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-500 uppercase">City</label>
                      <input type="text" className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-500 uppercase">Postal Code</label>
                      <input 
                        type="text" 
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" 
                      />
                    </div>
                    <div className="md:col-span-2 space-y-4 pt-4 border-t border-gray-100">
                      <h3 className="text-sm font-bold uppercase tracking-wider">Select Shipping Courier</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className={cn(
                          "flex items-center p-4 border rounded-xl cursor-pointer transition-all",
                          shippingProvider === "gosend" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-gray-200 hover:border-gray-300"
                        )}>
                          <input 
                            type="radio" 
                            name="shipping" 
                            className="hidden" 
                            checked={shippingProvider === "gosend"} 
                            onChange={() => { setShippingProvider("gosend"); setShippingCost(null); }} 
                          />
                          <div className="flex-1">
                            <span className="font-bold text-gray-900 block">GoSend Instant</span>
                            <span className="text-xs text-gray-500">Local delivery (same day)</span>
                          </div>
                        </label>
                        <label className={cn(
                          "flex items-center p-4 border rounded-xl cursor-pointer transition-all",
                          shippingProvider === "jne" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-gray-200 hover:border-gray-300"
                        )}>
                          <input 
                            type="radio" 
                            name="shipping" 
                            className="hidden" 
                            checked={shippingProvider === "jne"} 
                            onChange={() => { setShippingProvider("jne"); setShippingCost(null); }} 
                          />
                          <div className="flex-1">
                            <span className="font-bold text-gray-900 block">JNE Reguler</span>
                            <span className="text-xs text-gray-500">Outside the city (2-3 days)</span>
                          </div>
                        </label>
                      </div>
                      
                      {shippingProvider && !shippingCost && (
                        <button
                          onClick={calculateShipping}
                          disabled={calculatingShipping || !address || !postalCode}
                          className="w-full bg-gray-900 text-white py-2 rounded-lg text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                        >
                          {calculatingShipping ? "Calculating..." : "Calculate Shipping Price"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-8 flex justify-end">
                    <button 
                      onClick={() => setStep("payment")}
                      disabled={!shippingCost}
                      className="bg-primary text-white px-8 py-3 rounded-xl font-bold uppercase tracking-wider shadow-lg shadow-primary/20 hover:bg-orange-600 transition-colors flex items-center disabled:bg-gray-400 disabled:shadow-none"
                    >
                      Continue to Payment
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </button>
                  </div>
                </div>
              )}

              {step === "payment" && (
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-right-4">
                  <h2 className="text-xl font-black italic uppercase tracking-wider mb-6">Select Payment Method</h2>
                  
                  <div className="space-y-4">
                    {paymentSettings.midtransEnabled && (
                      <label className={cn(
                        "flex items-center p-4 border rounded-xl cursor-pointer transition-all",
                        selectedGateway === "midtrans" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-gray-200 hover:border-gray-300"
                      )}>
                        <input 
                          type="radio" 
                          name="gateway" 
                          className="hidden" 
                          checked={selectedGateway === "midtrans"} 
                          onChange={() => setSelectedGateway("midtrans")} 
                        />
                        <div className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center mr-4">
                          {selectedGateway === "midtrans" && <div className="w-3 h-3 rounded-full bg-primary" />}
                        </div>
                        <div className="flex-1">
                          <span className="font-bold text-gray-900 block">Midtrans</span>
                          <span className="text-xs text-gray-500">GoPay, ShopeePay, Bank Transfer</span>
                        </div>
                        <div className="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded">SNAP</div>
                      </label>
                    )}

                    <label className={cn(
                      "flex items-center p-4 border rounded-xl cursor-pointer transition-all",
                      selectedGateway === "cod" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-gray-200 hover:border-gray-300"
                    )}>
                      <input 
                        type="radio" 
                        name="gateway" 
                        className="hidden" 
                        checked={selectedGateway === "cod"} 
                        onChange={() => setSelectedGateway("cod")} 
                      />
                      <div className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center mr-4">
                        {selectedGateway === "cod" && <div className="w-3 h-3 rounded-full bg-primary" />}
                      </div>
                      <div className="flex-1">
                        <span className="font-bold text-gray-900 block">Cash on Delivery</span>
                        <span className="text-xs text-gray-500">Pay when you receive your order</span>
                      </div>
                    </label>
                  </div>

                  {!paymentSettings.midtransEnabled && (
                    <div className="mt-4 p-4 bg-yellow-50 text-yellow-800 text-xs rounded-lg border border-yellow-100">
                      No payment gateways are enabled in Admin Settings. Only COD is available or please contact support.
                    </div>
                  )}

                  <div className="mt-8 flex justify-between">
                    <button 
                      onClick={() => setStep("details")}
                      className="text-gray-500 font-bold hover:text-gray-900"
                    >
                      Back to Details
                    </button>
                    <button 
                      onClick={handlePlaceOrder}
                      disabled={!selectedGateway || loading}
                      className="bg-primary text-white px-8 py-3 rounded-xl font-bold uppercase tracking-wider shadow-lg shadow-primary/20 hover:bg-orange-600 transition-all flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? "Processing..." : `Pay $${total.toLocaleString()}`}
                      {!loading && <Lock className="w-4 h-4 ml-2" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Order Summary Sidebar */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 sticky top-24">
                <h3 className="font-black italic uppercase tracking-wider text-gray-900 mb-4">Order Summary</h3>
                <div className="space-y-4 max-h-64 overflow-y-auto custom-scrollbar mb-4">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-start space-x-4">
                      <img src={item.image} alt={item.name} className="w-16 h-16 object-cover rounded-lg bg-gray-50" />
                      <div className="flex-1">
                        <h4 className="text-sm font-bold text-gray-900 line-clamp-2">{item.name}</h4>
                        <p className="text-xs text-gray-500 mt-1">Qty: {item.quantity} × ${item.price.toLocaleString()}</p>
                      </div>
                      <span className="font-bold text-sm">${(item.price * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                
                <div className="border-t border-gray-100 pt-4 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span>
                    <span>${cartTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Shipping</span>
                    <span>{shippingCost === null ? "Calculated at next step" : shippingCost === 0 ? "Free" : `$${shippingCost.toLocaleString()}`}</span>
                  </div>
                  <div className="flex justify-between text-gray-900 font-black text-lg pt-2 border-t border-gray-100 mt-2">
                    <span>Total</span>
                    <span>${total.toLocaleString()}</span>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-center space-x-2 text-xs text-gray-400">
                  <Shield className="w-3 h-3" />
                  <span>Secure Checkout with SSL Encryption</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
