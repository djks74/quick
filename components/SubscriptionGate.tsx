"use client";

import { useState } from "react";
import { CheckCircle2, MessageCircle, ShoppingBag, ShieldCheck, Zap, Sparkles, X } from "lucide-react";

export default function SubscriptionGate({ store, onClose }: { store: any, onClose?: () => void }) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleSubscribe = async (plan: string) => {
    setLoading(plan);
    try {
      console.log("Generating checkout for store:", store.id, "Plan:", plan);
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.id, plan })
      });
      const data = await res.json();
      console.log("Checkout response:", data);
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        alert(`Failed to generate payment link: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error("Subscription Error:", err);
      alert("An error occurred. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const plans = [
    {
      id: 'PRO',
      name: 'PRO',
      price: '99.000',
      icon: Zap,
      color: 'bg-green-500',
      features: [
        "AI Chat Assistant",
        "WhatsApp Checkout",
        "POS System",
        "Custom Domain",
        "Basic Reports"
      ]
    },
    {
      id: 'ENTERPRISE',
      name: 'ENTERPRISE',
      price: '299.000',
      icon: ShieldCheck,
      color: 'bg-blue-600',
      recommended: true,
      features: [
        "Everything in PRO",
        "Advanced Analytics",
        "Ingredient Tracking",
        "Inventory Management",
        "Priority Support"
      ]
    },
    {
      id: 'SOVEREIGN',
      name: 'SOVEREIGN',
      price: '999.000',
      icon: Sparkles,
      color: 'bg-orange-500',
      features: [
        "Everything in Enterprise",
        "Custom WA Number",
        "Own Gemini API Key",
        "Product Sync API",
        "Custom Midtrans Keys"
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-900/90 backdrop-blur-xl p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#1A1D21] rounded-[2.5rem] shadow-2xl max-w-5xl w-full overflow-hidden animate-in fade-in zoom-in duration-300 border dark:border-white/10 transition-colors relative my-auto">
        
        {onClose && (
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white transition-colors z-50"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="p-8 md:p-12">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white mb-4">Choose Your Plan</h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-lg mx-auto">Select the plan that best fits your business needs. Upgrade or cancel anytime.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div 
                key={plan.id}
                className={`relative flex flex-col p-8 rounded-[2rem] border transition-all duration-300 ${
                  plan.recommended 
                    ? 'border-blue-600 dark:border-blue-500 bg-blue-50/30 dark:bg-blue-900/10 scale-105 z-10 shadow-xl' 
                    : 'border-gray-100 dark:border-white/5 bg-white dark:bg-gray-800/40 hover:border-gray-300 dark:hover:border-white/20'
                }`}
              >
                {plan.recommended && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest">
                    RECOMMENDED
                  </div>
                )}

                <div className="mb-6">
                  <div className={`w-12 h-12 rounded-2xl ${plan.color} flex items-center justify-center text-white mb-4 shadow-lg`}>
                    <plan.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-black text-gray-900 dark:text-white transition-colors">Rp {plan.price}</span>
                    <span className="text-gray-500 dark:text-gray-400 text-xs transition-colors">/month</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className={`w-4 h-4 flex-shrink-0 mt-0.5 ${plan.recommended ? 'text-blue-500' : 'text-green-500'}`} />
                      <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button 
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={!!loading}
                  className={`w-full py-4 rounded-2xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50 ${
                    plan.recommended 
                      ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-500/30' 
                      : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90'
                  }`}
                >
                  {loading === plan.id ? (
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></span>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      {plan.id === 'PRO' ? 'Get Started' : plan.id === 'SOVEREIGN' ? 'Go Sovereign' : 'Upgrade Now'}
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>

          <p className="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-12 leading-relaxed transition-colors">
            By subscribing, you agree to our Terms of Service and Privacy Policy. 
            Access to store management will be granted immediately after payment.
          </p>
        </div>
      </div>
    </div>
  );
}
