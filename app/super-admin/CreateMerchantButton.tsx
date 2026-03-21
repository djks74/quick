"use client";

import { useState } from "react";
import { Plus, X, Loader2, Store, User, Mail, Phone, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { createMerchant, createStore } from "@/lib/super-admin";
import { useRouter } from "next/navigation";

export default function CreateMerchantButton({ users }: { users?: any[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"NEW" | "EXISTING">("NEW");
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    storeName: "",
    plan: "CORPORATE",
    ownerId: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    let res;
    if (mode === "NEW") {
      res = await createMerchant({
        name: formData.name,
        email: formData.email,
        phoneNumber: formData.phoneNumber,
        storeName: formData.storeName,
        plan: formData.plan
      });
    } else {
      res = await createStore({
        ownerId: parseInt(formData.ownerId),
        name: formData.storeName,
        plan: formData.plan
      });
    }

    if (res.success) {
      setIsOpen(false);
      setFormData({ name: "", email: "", phoneNumber: "", storeName: "", plan: "CORPORATE", ownerId: "" });
      router.refresh();
    } else {
      setError(res.error || "Failed to process request");
    }
    setLoading(false);
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/30 flex items-center gap-2 text-sm"
      >
        <Plus className="w-4 h-4" />
        Create Merchant
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-[#1A1D21] rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100 dark:border-white/10 animate-in fade-in zoom-in duration-200">
            <div className="p-8 space-y-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center">
                    <Zap className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Store Creation</h3>
                </div>
                <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Tab Switcher */}
              <div className="flex bg-gray-50 dark:bg-gray-800/50 p-1 rounded-2xl border border-gray-100 dark:border-white/5">
                <button 
                  onClick={() => setMode("NEW")}
                  className={cn(
                    "flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all",
                    mode === "NEW" ? "bg-white dark:bg-gray-800 text-blue-600 shadow-sm" : "text-gray-400"
                  )}
                >
                  New Account
                </button>
                <button 
                  onClick={() => setMode("EXISTING")}
                  className={cn(
                    "flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all",
                    mode === "EXISTING" ? "bg-white dark:bg-gray-800 text-blue-600 shadow-sm" : "text-gray-400"
                  )}
                >
                  Existing User
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-4">
                  {mode === "NEW" ? (
                    <>
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                          type="text" 
                          required
                          placeholder="Full Name"
                          className="w-full pl-12 pr-5 py-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-white/10 focus:border-blue-500 outline-none transition-all dark:text-white font-bold text-sm"
                          value={formData.name}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                        />
                      </div>

                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                          type="email" 
                          required
                          placeholder="Email Address"
                          className="w-full pl-12 pr-5 py-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-white/10 focus:border-blue-500 outline-none transition-all dark:text-white font-bold text-sm"
                          value={formData.email}
                          onChange={(e) => setFormData({...formData, email: e.target.value})}
                        />
                      </div>

                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                          type="tel" 
                          required
                          placeholder="WhatsApp Number (e.g. 628...)"
                          className="w-full pl-12 pr-5 py-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-white/10 focus:border-blue-500 outline-none transition-all dark:text-white font-bold text-sm"
                          value={formData.phoneNumber}
                          onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Select Existing User</label>
                      <select 
                        required
                        className="w-full px-5 py-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-white/10 focus:border-blue-500 outline-none transition-all dark:text-white font-bold text-sm appearance-none"
                        value={formData.ownerId}
                        onChange={(e) => setFormData({...formData, ownerId: e.target.value})}
                      >
                        <option value="">Choose User...</option>
                        {users?.map(user => (
                          <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="relative">
                    <Store className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      type="text" 
                      required
                      placeholder="Store Name"
                      className="w-full pl-12 pr-5 py-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-white/10 focus:border-blue-500 outline-none transition-all dark:text-white font-bold text-sm"
                      value={formData.storeName}
                      onChange={(e) => setFormData({...formData, storeName: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Subscription Plan</label>
                    <select 
                      className="w-full px-5 py-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-white/10 focus:border-blue-500 outline-none transition-all dark:text-white font-bold text-sm appearance-none"
                      value={formData.plan}
                      onChange={(e) => setFormData({...formData, plan: e.target.value})}
                    >
                      <option value="CORPORATE">CORPORATE (Multi-Outlet)</option>
                      <option value="SOVEREIGN">SOVEREIGN</option>
                      <option value="ENTERPRISE">ENTERPRISE</option>
                      <option value="PRO">PRO</option>
                      <option value="FREE">FREE</option>
                    </select>
                  </div>
                </div>

                {error && (
                  <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-bold">
                    {error}
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      {mode === "NEW" ? "Create Account" : "Create Store"}
                    </>
                  )}
                </button>
                {mode === "NEW" && (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 text-center font-medium">
                    The merchant will use 'gercep123' as their default password.
                  </p>
                )}
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
