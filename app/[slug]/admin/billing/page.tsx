"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { 
  CreditCard, 
  Zap, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight,
  ShieldCheck,
  Sparkles,
  Building2,
  Calendar,
  History,
  Settings,
  ArrowUpRight,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getStoreBySlug } from "@/lib/api";
import AdminSpinner from "../components/AdminSpinner";
import SubscriptionGate from "@/components/SubscriptionGate";

export default function BillingPage() {
  const { slug } = useParams();
  const [store, setStore] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    async function loadStore() {
      if (!slug) return;
      const data = await getStoreBySlug(slug as string);
      setStore(data);
      setIsLoading(false);
    }
    loadStore();
  }, [slug]);

  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(true);

  useEffect(() => {
    async function loadInvoices() {
      if (!slug) return;
      try {
        const res = await fetch(`/api/wa/topup?storeId=${store?.id}`);
        if (res.ok) {
          const data = await res.json();
          setInvoices(data.logs || []);
        }
      } catch (e) {
        console.error("Failed to load invoices", e);
      } finally {
        setIsLoadingInvoices(false);
      }
    }
    if (store) loadInvoices();
  }, [slug, store]);
  if (!store) return <div>Store not found</div>;

  const plan = store.subscriptionPlan || "FREE";
  
  const planInfo: any = {
    FREE: { icon: Zap, color: "text-gray-400", bg: "bg-gray-100", desc: "Basic features for testing." },
    PRO: { icon: Zap, color: "text-green-500", bg: "bg-green-100", desc: "Everything you need to start selling." },
    ENTERPRISE: { icon: ShieldCheck, color: "text-blue-600", bg: "bg-blue-100", desc: "Advanced tools for growing businesses." },
    SOVEREIGN: { icon: Sparkles, color: "text-orange-500", bg: "bg-orange-100", desc: "Full ecosystem with custom integrations." },
    CORPORATE: { icon: Building2, color: "text-purple-600", bg: "bg-purple-100", desc: "Multi-outlet support for large businesses." }
  };

  const currentPlan = planInfo[plan] || planInfo.FREE;

  return (
    <div className="space-y-8 max-w-5xl">
      {showUpgrade && <SubscriptionGate store={store} onClose={() => setShowUpgrade(false)} />}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1d2327]">Billing & Subscription</h1>
          <p className="text-sm text-gray-500">Manage your subscription, invoices, and payment methods.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-full text-xs font-black uppercase tracking-widest border border-green-100">
          <CheckCircle2 className="w-4 h-4" />
          Subscription Running
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Current Plan Card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-[#ccd0d4] rounded-xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-[#ccd0d4] bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", currentPlan.bg)}>
                  <currentPlan.icon className={cn("w-6 h-6", currentPlan.color)} />
                </div>
                <div>
                  <h3 className="font-bold text-[#1d2327]">Current Plan: {plan}</h3>
                  <p className="text-xs text-gray-500">{currentPlan.desc}</p>
                </div>
              </div>
              {plan !== 'CORPORATE' && (
                <button 
                  onClick={() => {
                    if (plan === 'SOVEREIGN') {
                      window.open("https://wa.me/62882003961609?text=Hi%20Gercep,%20I'm%20interested%20in%20upgrading%20to%20the%20Corporate%20Plan.", "_blank");
                    } else {
                      setShowUpgrade(true);
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20"
                >
                  {plan === 'SOVEREIGN' ? 'Call Us for Corporate' : 'Upgrade Plan'}
                </button>
              )}
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">Renewal Date:</span>
                  <span className="font-bold text-[#1d2327]">April 21, 2026</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CreditCard className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">Payment Method:</span>
                  <span className="font-bold text-[#1d2327]">Automatic (Midtrans)</span>
                </div>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-blue-700 font-bold text-sm">
                  <AlertCircle className="w-4 h-4" />
                  Subscription Note
                </div>
                <p className="text-xs text-blue-600 leading-relaxed">
                  Your subscription includes priority support and unlimited products. Changes to your plan will be applied immediately.
                </p>
              </div>
            </div>
          </div>

          {/* Features Included */}
          <div className="bg-white border border-[#ccd0d4] rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-[#1d2327]">Plan Features</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                "Commerce Assistant Enabled",
                "WhatsApp Order Integration",
                "Real-time Inventory Sync",
                "Dynamic QRIS Payments",
                "Custom Theme & Branding",
                "Advanced Sales Analytics"
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs font-medium text-gray-600">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Cards */}
        <div className="space-y-6">
          {/* Billing Info */}
          <div className="bg-white border border-[#ccd0d4] rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-[#1d2327] flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Billing Info
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Account Name</p>
                <p className="text-sm font-bold text-[#1d2327]">{store.name}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Billing Email</p>
                <p className="text-sm font-bold text-[#1d2327]">{store.whatsapp || "N/A"}</p>
              </div>
            </div>
          </div>

          {/* Recent Invoices */}
          <div className="bg-white border border-[#ccd0d4] rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-[#1d2327] flex items-center gap-2">
              <History className="w-4 h-4" />
              Recent Top-ups
            </h3>
            <div className="space-y-4">
              {isLoadingInvoices ? (
                 <div className="flex justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                 </div>
              ) : invoices.length === 0 ? (
                 <p className="text-[10px] text-gray-500 text-center py-4 uppercase font-black tracking-widest">No top-ups yet.</p>
              ) : (
                <>
                  {invoices.slice(0, 5).map((log, idx) => (
                    <div key={idx} className="flex items-center justify-between group cursor-pointer">
                      <div>
                        <p className="text-xs font-bold text-[#1d2327]">
                           {log.type === 'TOPUP' ? 'Credit Top-up' : 'Usage Charge'}
                        </p>
                        <p className="text-[10px] text-gray-500">
                           {new Date(log.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="text-right">
                         <p className={cn("text-xs font-black", log.type === 'TOPUP' ? "text-green-600" : "text-red-600")}>
                            {log.type === 'TOPUP' ? '+' : '-'} Rp {log.amount.toLocaleString()}
                         </p>
                         <p className="text-[8px] text-gray-400 uppercase tracking-tighter">Balance: Rp {log.balanceAfter.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                  {invoices.length > 5 && (
                    <button className="w-full py-2 border border-gray-200 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-colors">
                      View All Activity ({invoices.length})
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
