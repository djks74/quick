"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit, ExternalLink, MoreVertical } from "lucide-react";
import { useRouter } from "next/navigation";

import { updateStorePlan } from "@/lib/super-admin";

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

    await updateStorePlan(editingStore.id, plan, fee);

    setLoading(false);
    setEditingStore(null);
    router.refresh();
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
          <tr>
            <th className="px-6 py-3">Store Name</th>
            <th className="px-6 py-3">Owner</th>
            <th className="px-6 py-3">Plan</th>
            <th className="px-6 py-3">Status</th>
            <th className="px-6 py-3">Orders</th>
            <th className="px-6 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((store) => (
            <tr key={store.id} className="bg-white border-b hover:bg-gray-50">
              <td className="px-6 py-4 font-medium text-gray-900">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                    {store.name.charAt(0)}
                  </div>
                  <div>
                    <div>{store.name}</div>
                    <a href={`/${store.slug}`} target="_blank" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      /{store.slug} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="text-gray-900">{store.owner.name}</div>
                <div className="text-gray-500 text-xs">{store.owner.email}</div>
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                  store.subscriptionPlan === 'PRO' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {store.subscriptionPlan}
                </span>
              </td>
              <td className="px-6 py-4">
                <span className="px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                  Active
                </span>
              </td>
              <td className="px-6 py-4">
                {store._count?.orders || 0}
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Link 
                    href={`/${store.slug}/admin`}
                    className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 hover:bg-blue-100"
                  >
                    Manage
                  </Link>
                  <button 
                    onClick={() => setEditingStore(store)}
                    className="text-gray-400 hover:text-blue-600 p-1"
                    title="Edit Subscription"
                  >
                    <Edit className="w-4 h-4" />
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
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold mb-4">Edit Store: {editingStore.name}</h2>
            <form onSubmit={handleUpdatePlan} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Subscription Plan</label>
                <select 
                  name="plan"
                  className="w-full border rounded-lg px-3 py-2"
                  defaultValue={editingStore.subscriptionPlan}
                >
                  <option value="ENTERPRISE">Enterprise</option>
                  <option value="FREE">Free</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Transaction Fee (%)</label>
                <input 
                  name="fee"
                  type="number" 
                  step="0.1"
                  className="w-full border rounded-lg px-3 py-2"
                  defaultValue={editingStore.transactionFeePercent}
                />
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button 
                  type="button"
                  onClick={() => setEditingStore(null)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
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
