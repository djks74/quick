"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit, ExternalLink, MoreVertical, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { updateStorePlan, deleteStore, setStoreWaBalance } from "@/lib/super-admin";

export default function StoreTable({ stores }: { stores: any[] }) {
  const router = useRouter();
  const [editingStore, setEditingStore] = useState<any>(null);
  const [loading, setLoading] = useState(false);

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
    if (!confirm(`Are you sure you want to PERMANENTLY delete "${name}"? This action cannot be undone.`)) return;
    
    setLoading(true);
    const res = await deleteStore(id);
    if (res.success) {
      router.refresh();
    } else {
      alert("Failed to delete store");
    }
    setLoading(false);
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
                  store.subscriptionPlan === 'PRO' 
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' 
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}>
                  {store.subscriptionPlan}
                </span>
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                  store.isOpen
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                    : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                }`}>
                  {store.isOpen ? "Active" : "Closed"}
                </span>
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
                    className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1"
                    title="Delete Store"
                  >
                    <Trash2 className="w-4 h-4" />
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
