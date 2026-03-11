"use client";

import { useState } from "react";
import { CreditCard, CheckCircle2, MessageCircle, ShoppingBag, ShieldCheck } from "lucide-react";

export default function SubscriptionGate({ store }: { store: any }) {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.id })
      });
      const data = await res.json();
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        alert("Failed to generate payment link. Please contact support.");
      }
    } catch (err) {
      console.error("Subscription Error:", err);
      alert("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-900/80 backdrop-blur-md p-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col md:flex-row animate-in fade-in zoom-in duration-300">
        
        {/* Left Side: Branding/Visual */}
        <div className="md:w-5/12 bg-blue-600 p-8 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-3xl font-extrabold leading-tight mb-4">Upgrade to Enterprise</h2>
            <p className="text-blue-100 text-sm mb-8">Unlock the full power of QuickMenu and start accepting orders via WhatsApp today.</p>
            
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-blue-300 flex-shrink-0" />
                <span className="text-xs">Accept Orders via WhatsApp</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-blue-300 flex-shrink-0" />
                <span className="text-xs">Full POS System Access</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-blue-300 flex-shrink-0" />
                <span className="text-xs">Custom Store Settings</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-blue-300 flex-shrink-0" />
                <span className="text-xs">Direct Payment Gateway</span>
              </li>
            </ul>
          </div>

          <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
          
          <div className="relative z-10 pt-8 border-t border-white/20">
             <p className="text-xs opacity-70 italic">Trusted by 500+ Merchants</p>
          </div>
        </div>

        {/* Right Side: Checkout Action */}
        <div className="md:w-7/12 p-8 md:p-12 flex flex-col justify-center bg-white">
          <div className="mb-8">
            <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold mb-4 uppercase tracking-wider">Monthly Plan</span>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-gray-900">Rp 299.000</span>
              <span className="text-gray-500 text-sm">/month</span>
            </div>
            <p className="text-gray-500 text-xs mt-2">Billed monthly. Cancel anytime.</p>
          </div>

          <div className="space-y-4 mb-8">
             <div className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-blue-600">
                   <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                   <p className="text-sm font-bold text-gray-900">Secure Payment</p>
                   <p className="text-[10px] text-gray-500 uppercase font-medium tracking-tight">Processed by Midtrans</p>
                </div>
             </div>
          </div>

          <button 
            onClick={handleSubscribe}
            disabled={loading}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg hover:shadow-blue-500/30 flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {loading ? (
              <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                Pay Now
              </>
            )}
          </button>

          <p className="text-center text-[10px] text-gray-400 mt-6 leading-relaxed">
            By subscribing, you agree to our Terms of Service and Privacy Policy. 
            Access to store management will be granted immediately after payment.
          </p>
        </div>
      </div>
    </div>
  );
}
