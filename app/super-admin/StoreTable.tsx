"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit, ExternalLink, MoreVertical, Trash2, Loader2, Power, PowerOff } from "lucide-react";
import { useRouter } from "next/navigation";

import { updateStorePlan, deleteStore, setStoreWaBalance, joinStoreToCorporate, toggleStoreActive } from "@/lib/super-admin";

export default function StoreTable({ stores, users }: { stores: any[], users?: any[] }) {
  const router = useRouter();
  const [editingStore, setEditingStore] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [corporateOwnerId, setCorporateOwnerId] = useState("");

  const handleToggleActive = async (storeId: number, currentActive: boolean) => {
    setTogglingId(storeId);
    const res = await toggleStoreActive(storeId, !currentActive);
    if (res.success) {
      router.refresh();
    } else {
      alert(res.error || "Failed to update store status");
    }
    setTogglingId(null);
  };

  const handleJoinCorporate = async () => {
    if (!corporateOwnerId) return;
    if (!confirm(`Are you sure you want to move "${editingStore.name}" to the selected Corporate Account? The current owner (${editingStore.owner.email}) will become a Manager.`)) return;

    setLoading(true);
    const res = await joinStoreToCorporate(editingStore.id, parseInt(corporateOwnerId));
    if (res.success) {
      setEditingStore(null);
      setCorporateOwnerId("");
      router.refresh();
    } else {
      alert(res.error || "Failed to join store to corporate");
    }
    setLoading(false);
  };

  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const form = e.target as HTMLFormElement;
    const plan = (form.elements.namedItem('plan') as HTMLSelectElement).value;
    const fee = parseFloat((form.elements.namedItem('fee') as HTMLInputElement).value);
    const waBalanceRaw = (form.elements.namedItem('waBalance') as HTMLInputElement | null)?.value;
    const waReason = (form.elements.namedItem('waReason') as HTMLInputElement | null)?.value;

    const res = await updateStorePlan(editingStore.id, plan, fee);
    if (!res.success) {
      alert(res.error || "Failed to update plan");
      setLoading(false);
      return;
    }

    if (waBalanceRaw !== undefined) {
      const next = parseFloat(String(waBalanceRaw));
      if (Number.isFinite(next) && next >= 0 && Number(next) !== Number(editingStore.waBalance || 0)) {
        await setStoreWaBalance(editingStore.id, next, waReason);
      }
    }

    setLoading(false);
    setEditingStore(null);
    router.refresh();
  };

  const handleDeleteStore = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to PERMANENTLY delete "${name}"? This action cannot be undone and will delete all orders, products, and logs.`)) return;
    
    setDeletingId(id);
    try {
      const res = await deleteStore(id);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error || "Failed to delete store");
      }
    } catch (err) {
      alert("An unexpected error occurred during deletion.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-800/50 border-b dark:border-gray-800">
          <tr>
            <th className="px-6 py-3">Store Name</th>
            <th className="px-6 py-3">Owner</th>
            <th className="px-6 py-3">Plan</th>
            <th className="px-6 py-3">Status</th>
            <th className="px-6 py-3">Orders</th>
            <th className="px-6 py-3">WA Credit</th>
            <th className="px-6 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((store) => (
            <tr key={store.id} className="bg-white dark:bg-[#1A1D21] border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                    {store.name.charAt(0)}
                  </div>
                  <div>
                    <div className="dark:text-white">{store.name}</div>
                    <a href={`/${store.slug}`} target="_blank" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                      /{store.slug} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="text-gray-900 dark:text-gray-200">{store.owner.name}</div>
                <div className="text-gray-500 dark:text-gray-400 text-xs">{store.owner.email}</div>
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                  store.subscriptionPlan === 'CORPORATE'
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                    : store.subscriptionPlan === 'SOVEREIGN'
                    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                    : store.subscriptionPlan === 'ENTERPRISE'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    : store.subscriptionPlan === 'PRO' 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}>
                  {store.subscriptionPlan}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-col gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold text-center ${
                    store.isOpen
                      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                      : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                  }`}>
                    {store.isOpen ? "Open" : "Closed"}
                  </span>
                  <button
                    onClick={() => handleToggleActive(store.id, store.isActive)}
                    disabled={togglingId === store.id}
                    className={cn(
                      "flex items-center justify-center gap-1.5 px-2 py-1 rounded-full transition-all border",
                      store.isActive 
                        ? "text-green-600 bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800" 
                        : "text-red-600 bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800"
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
              </td>
              <td className="px-6 py-4 dark:text-gray-300">
                {store._count?.orders || 0}
              </td>
              <td className="px-6 py-4">
                <div className="text-gray-900 dark:text-gray-200 font-medium">
                  {new Intl.NumberFormat('id-ID').format(Number(store.waBalance || 0))}
                </div>
                <div className="text-gray-500 dark:text-gray-400 text-xs">
                  / msg: {new Intl.NumberFormat('id-ID').format(Number(store.waPricePerMessage || 0))}
                </div>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Link 
                    href={`/${store.slug}/admin`}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded border border-blue-100 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                  >
                    Manage
                  </Link>
                  <button 
                    onClick={() => setEditingStore(store)}
                    className="text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 p-1"
                    title="Edit Subscription"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDeleteStore(store.id, store.name)}
                    disabled={deletingId === store.id}
                    className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1 disabled:opacity-50"
                    title="Delete Store"
                  >
                    {deletingId === store.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Edit Modal */}
      {editingStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#1A1D21] border border-gray-200 dark:border-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold mb-4 dark:text-white">Edit Store: {editingStore.name}</h2>
            <form onSubmit={handleUpdatePlan} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">Subscription Plan</label>
                <select 
                  name="plan"
                  className="w-full border dark:border-gray-800 dark:bg-gray-800 rounded-lg px-3 py-2 dark:text-white"
                  defaultValue={editingStore.subscriptionPlan}
                >
                  <option value="CORPORATE">Corporate</option>
                  <option value="SOVEREIGN">Sovereign</option>
                  <option value="ENTERPRISE">Enterprise</option>
                  <option value="PRO">Pro</option>
                  <option value="FREE">Free</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">Transaction Fee (%)</label>
                <input 
                  name="fee"
                  type="number" 
                  step="0.1"
                  className="w-full border dark:border-gray-800 dark:bg-gray-800 rounded-lg px-3 py-2 dark:text-white"
                  defaultValue={editingStore.transactionFeePercent}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">WA Credit Balance</label>
                <input
                  name="waBalance"
                  type="number"
                  step="1"
                  min="0"
                  className="w-full border dark:border-gray-800 dark:bg-gray-800 rounded-lg px-3 py-2 dark:text-white"
                  defaultValue={Number(editingStore.waBalance || 0)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">WA Balance Reason (Optional)</label>
                <input
                  name="waReason"
                  type="text"
                  className="w-full border dark:border-gray-800 dark:bg-gray-800 rounded-lg px-3 py-2 dark:text-white"
                  placeholder="e.g. manual topup adjustment"
                />
              </div>

              {/* Join Corporate Section */}
              <div className="pt-6 border-t border-gray-100 dark:border-gray-800 space-y-4">
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-100 dark:border-purple-800">
                  <h3 className="text-xs font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 mb-2">Move to Corporate</h3>
                  <p className="text-[10px] text-purple-500 dark:text-purple-300 mb-4 leading-relaxed">
                    Transfer this store to a Corporate Account. The current owner will automatically become a Manager.
                  </p>
                  
                  <div className="space-y-3">
                    <select 
                      className="w-full border dark:border-gray-700 dark:bg-gray-900 rounded-lg px-3 py-2 text-xs dark:text-white"
                      value={corporateOwnerId}
                      onChange={(e) => setCorporateOwnerId(e.target.value)}
                    >
                      <option value="">Select Corporate Owner...</option>
                      {users?.filter(u => u.role === 'MERCHANT' && u.id !== editingStore.ownerId).map(user => (
                        <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
                      ))}
                    </select>
                    
                    <button 
                      type="button"
                      disabled={!corporateOwnerId || loading}
                      onClick={handleJoinCorporate}
                      className="w-full py-2 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 transition-all disabled:opacity-50"
                    >
                      Join to Corporate Account
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button 
                  type="button"
                  onClick={() => setEditingStore(null)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
