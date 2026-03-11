"use client";

import { useState, useEffect } from "react";
import { 
  getAllWithdrawals, 
  updateWithdrawalStatus,
  getAllStores 
} from "@/lib/super-admin";
import SuperAdminNav from "../SuperAdminNav";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Wallet,
  Building2,
  User,
  AlertCircle
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function SuperAdminWithdrawals() {
  const router = useRouter();
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [totalStores, setTotalStores] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);

  useEffect(() => {
    async function loadData() {
      const [w, s] = await Promise.all([getAllWithdrawals(), getAllStores()]);
      setWithdrawals(w);
      setTotalStores(s.length);
      setLoading(false);
    }
    loadData();
  }, []);

  const handleStatusUpdate = async (id: number, status: string) => {
    if (!confirm(`Are you sure you want to mark this withdrawal as ${status}?`)) return;
    
    setProcessingId(id);
    const res = await updateWithdrawalStatus(id, status);
    if (res.success) {
      const w = await getAllWithdrawals();
      setWithdrawals(w);
    } else {
      alert(res.error || "Failed to update status");
    }
    setProcessingId(null);
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Withdrawal Requests</h1>
            <p className="text-gray-500">Manage merchant payouts and bank transfers.</p>
          </div>
          <SuperAdminNav totalStores={totalStores} />
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
           <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                 <Clock className="w-5 h-5 text-orange-500" />
                 <span className="text-sm text-gray-500 font-medium">Pending Payouts</span>
              </div>
              <p className="text-2xl font-bold">
                 {formatCurrency(withdrawals.filter(w => w.status === 'PENDING').reduce((acc, curr) => acc + curr.amount, 0), "IDR")}
              </p>
           </div>
           <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                 <CheckCircle2 className="w-5 h-5 text-green-500" />
                 <span className="text-sm text-gray-500 font-medium">Completed Today</span>
              </div>
              <p className="text-2xl font-bold text-green-600">
                 {formatCurrency(withdrawals.filter(w => w.status === 'COMPLETED' && new Date(w.updatedAt).toDateString() === new Date().toDateString()).reduce((acc, curr) => acc + curr.amount, 0), "IDR")}
              </p>
           </div>
           <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                 <AlertCircle className="w-5 h-5 text-blue-500" />
                 <span className="text-sm text-gray-500 font-medium">Queue Size</span>
              </div>
              <p className="text-2xl font-bold">{withdrawals.filter(w => w.status === 'PENDING').length} Requests</p>
           </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
           <table className="w-full text-left">
              <thead>
                 <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Merchant / Store</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Bank Details</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                 {withdrawals.length === 0 ? (
                    <tr>
                       <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">No withdrawal requests found.</td>
                    </tr>
                 ) : (
                    withdrawals.map((w) => (
                       <tr key={w.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                             <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                                   <Building2 className="w-5 h-5" />
                                </div>
                                <div>
                                   <p className="font-bold text-gray-900 text-sm">{w.store.name}</p>
                                   <p className="text-xs text-gray-500 italic">/{w.store.slug}</p>
                                </div>
                             </div>
                          </td>
                          <td className="px-6 py-4">
                             <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
                                   <Wallet className="w-3 h-3" />
                                   <span>{w.bankName}</span>
                                </div>
                                <p className="text-xs text-gray-600">{w.bankAccountNumber}</p>
                                <div className="flex items-center gap-1 text-[10px] text-gray-400 uppercase font-black">
                                   <User className="w-2.5 h-2.5" />
                                   <span>{w.bankAccountName}</span>
                                </div>
                             </div>
                          </td>
                          <td className="px-6 py-4">
                             <p className="font-black text-gray-900">{formatCurrency(w.amount, "IDR")}</p>
                             <p className="text-[10px] text-gray-400 font-bold uppercase">{new Date(w.createdAt).toLocaleString()}</p>
                          </td>
                          <td className="px-6 py-4">
                             <span className={cn(
                                "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1",
                                w.status === 'PENDING' ? "bg-orange-100 text-orange-600" :
                                w.status === 'COMPLETED' ? "bg-green-100 text-green-600" :
                                "bg-red-100 text-red-600"
                             )}>
                                {w.status === 'PENDING' && <Clock className="w-3 h-3" />}
                                {w.status}
                             </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                             {w.status === 'PENDING' && (
                                <div className="flex justify-end gap-2">
                                   <button 
                                      onClick={() => handleStatusUpdate(w.id, 'COMPLETED')}
                                      disabled={processingId === w.id}
                                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-all"
                                      title="Mark as Completed"
                                   >
                                      <CheckCircle2 className="w-5 h-5" />
                                   </button>
                                   <button 
                                      onClick={() => handleStatusUpdate(w.id, 'REJECTED')}
                                      disabled={processingId === w.id}
                                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                      title="Reject Request"
                                   >
                                      <XCircle className="w-5 h-5" />
                                   </button>
                                </div>
                             )}
                          </td>
                       </tr>
                    ))
                 )}
              </tbody>
           </table>
        </div>
      </div>
    </div>
  );
}
