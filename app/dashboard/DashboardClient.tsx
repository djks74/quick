"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Store, 
  Plus, 
  ChevronRight, 
  Zap, 
  Users, 
  CreditCard, 
  Building2,
  Wallet,
  X,
  Loader2,
  Power,
  PowerOff,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import ThemeToggle from "@/components/ThemeToggle";
import { toggleStoreActive } from "@/lib/api";
import { signOut } from "next-auth/react";

export default function DashboardClient({ stores, user }: { stores: any[], user: any }) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [sourceStoreId, setSourceStoreId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const isCorporate = stores.some(s => s.subscriptionPlan === "CORPORATE");
  const activePlan = stores[0]?.subscriptionPlan || "FREE";

  const handleToggleActive = async (e: React.MouseEvent, storeId: number, currentActive: boolean) => {
    e.preventDefault();
    e.stopPropagation();

    setTogglingId(storeId);
    try {
      const res = await toggleStoreActive(storeId, !currentActive);
      if (res) {
        router.refresh();
      } else {
        alert("Failed to update store status.");
      }
    } catch (err) {
      alert("An unexpected error occurred.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError("");

    try {
      const res = await fetch("/api/stores/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: newStoreName,
          sourceStoreId: sourceStoreId || undefined
        })
      });

      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        router.push(`/${data.slug}/admin`);
      } else {
        setError(data.error || "Failed to create store.");
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0F1113] transition-colors duration-300">
      {/* Navbar */}
      <nav className="w-full px-6 py-4 flex justify-between items-center backdrop-blur-sm bg-white/30 dark:bg-black/30 sticky top-0 z-50 border-b border-white/20 dark:border-white/10">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-black dark:bg-white rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white dark:text-black" />
          </div>
          <span className="font-black text-xl tracking-tighter text-black dark:text-white uppercase">Gercep</span>
        </Link>
        
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-black uppercase tracking-widest border border-blue-100 dark:border-blue-800">
            <Building2 className="w-3 h-3" />
            {isCorporate ? "Corporate" : "Merchant"}
          </div>
          
          <div className="relative">
            <button 
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-xs font-bold dark:text-white hover:ring-2 hover:ring-blue-500 transition-all"
            >
              {user.name?.charAt(0).toUpperCase()}
            </button>

            {isUserMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setIsUserMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#1A1D21] rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-4 border-b border-gray-50 dark:border-white/5">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{user.name}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="font-bold uppercase tracking-widest text-[10px]">Sign Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6 lg:p-12 space-y-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">Dashboard</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 font-medium">Manage your multi-outlet business ecosystem.</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/30 flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Outlet
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-white/10 shadow-sm space-y-4">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">Total Outlets</p>
              <p className="text-3xl font-black text-gray-900 dark:text-white">{stores.length}</p>
            </div>
          </div>
          <div className="p-6 rounded-3xl bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-white/10 shadow-sm space-y-4">
            <div className="w-12 h-12 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-2xl flex items-center justify-center">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">Total Revenue</p>
              <p className="text-3xl font-black text-gray-900 dark:text-white">Rp 0</p>
            </div>
          </div>
          <div className="p-6 rounded-3xl bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-white/10 shadow-sm space-y-4">
            <div className="w-12 h-12 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-2xl flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">Total Staff</p>
              <p className="text-3xl font-black text-gray-900 dark:text-white">0</p>
            </div>
          </div>
        </div>

        {/* Outlet List */}
        <div className="space-y-6">
          <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Your Outlets</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.map((store) => (
              <Link 
                key={store.id} 
                href={`/${store.slug}/admin`}
                className="group p-6 rounded-3xl bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-white/10 shadow-sm hover:shadow-xl hover:border-blue-500/30 transition-all space-y-6 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full group-hover:bg-blue-500/10 transition-colors" />
                
                <div className="flex justify-between items-start">
                  <div className="w-12 h-12 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Store className="w-6 h-6 text-gray-400 group-hover:text-blue-500 transition-colors" />
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      store.subscriptionPlan === 'CORPORATE' ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
                      store.subscriptionPlan === 'SOVEREIGN' ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" :
                      store.subscriptionPlan === 'ENTERPRISE' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                    )}>
                      {store.subscriptionPlan}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{store.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">/{store.slug}</p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-50 dark:border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", store.isOpen ? "bg-green-500" : "bg-red-500")} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{store.isOpen ? "Open" : "Closed"}</span>
                    </div>
                    <button
                      onClick={(e) => handleToggleActive(e, store.id, store.isActive)}
                      disabled={togglingId === store.id}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-md transition-all",
                        store.isActive 
                          ? "text-green-600 bg-green-50 dark:bg-green-900/20" 
                          : "text-red-600 bg-red-50 dark:bg-red-900/20"
                      )}
                    >
                      {togglingId === store.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : store.isActive ? (
                        <Power className="w-3 h-3" />
                      ) : (
                        <PowerOff className="w-3 h-3" />
                      )}
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {store.isActive ? "Active" : "Disabled"}
                      </span>
                    </button>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Staff Management Section */}
        {isCorporate && (
          <div className="p-8 rounded-[2.5rem] bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-white/10 shadow-sm space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-purple-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                  <Users className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Staff Management</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Manage Managers and Cashiers across all outlets.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {stores.slice(0, 3).map(store => (
                <div key={store.id} className="p-6 rounded-3xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-white/5 flex items-center justify-between group">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">{store.name}</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">Manage Staff</p>
                  </div>
                  <Link 
                    href={`/${store.slug}/admin/users`}
                    className="w-10 h-10 bg-white dark:bg-gray-800 rounded-xl flex items-center justify-center text-gray-400 group-hover:text-purple-600 transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                  </Link>
                </div>
              ))}
              <div className="p-6 rounded-3xl bg-purple-50 dark:bg-purple-900/10 border border-dashed border-purple-200 dark:border-purple-800/50 flex items-center justify-center text-center">
                <p className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest">
                  Staff are assigned per outlet.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Billing & Subscription Section */}
        <div className="p-8 rounded-[2.5rem] bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-white/10 shadow-sm space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <CreditCard className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Billing & Subscription</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Manage your active plan and payment methods.</p>
              </div>
            </div>
            <div className="px-6 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full text-xs font-black uppercase tracking-widest border border-green-100 dark:border-green-800">
              Subscription Running
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="p-6 rounded-3xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-white/5 space-y-4">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">Current Plan</p>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-gray-900 dark:text-white">{activePlan}</span>
                {isCorporate && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-md text-[10px] font-black uppercase tracking-widest">Multi-Outlet Enabled</span>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Your subscription is active and will renew on April 21, 2026.</p>
            </div>
            
            <div className="flex flex-col justify-center gap-4">
              <button className="w-full py-4 bg-white dark:bg-gray-800 border-2 border-blue-600 text-blue-600 dark:text-blue-400 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all">
                Change Plan
              </button>
              <button className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl font-black uppercase tracking-widest text-xs hover:opacity-90 transition-all">
                Update Billing Info
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Create Store Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-[#1A1D21] rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100 dark:border-white/10">
            <div className="p-8 space-y-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center">
                    <Store className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Add New Outlet</h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleCreateStore} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Store Name</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Gercep Coffee Grogol"
                    className="w-full px-5 py-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-white/10 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all dark:text-white font-bold"
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Copy Menu From (Optional)</label>
                  <select 
                    className="w-full px-5 py-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-white/10 focus:border-blue-500 outline-none transition-all dark:text-white font-bold appearance-none"
                    value={sourceStoreId}
                    onChange={(e) => setSourceStoreId(e.target.value)}
                  >
                    <option value="">Start with New Menu</option>
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {error && (
                  <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-bold">
                    {error}
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={isCreating}
                  className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2"
                >
                  {isCreating ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      Create Outlet
                    </>
                  )}
                </button>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 text-center font-medium">
                  {isCorporate ? "Your CORPORATE plan allows unlimited outlets." : "New outlets start on the FREE plan."}
                </p>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
