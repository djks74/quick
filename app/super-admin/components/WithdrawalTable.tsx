"use client";

import { useState } from "react";
import { 
  updateWithdrawalStatus
} from "@/lib/super-admin";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Wallet,
  Building2,
  User
} from "lucide-react";

export default function WithdrawalTable({ initialWithdrawals }: { initialWithdrawals: any[] }) {
  const [withdrawals, setWithdrawals] = useState(initialWithdrawals);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const handleStatusUpdate = async (id: number, status: string) => {
    if (!confirm(`Are you sure you want to mark this withdrawal as ${status}?`)) return;
    
    setProcessingId(id);
    const res = await updateWithdrawalStatus(id, status);
    if (res.success && res.data) {
      setWithdrawals((prev) =>
        prev.map((w) => (w.id === id ? { ...w, status: res.data.status, updatedAt: res.data.updatedAt } : w))
      );
    } else {
      alert(res.error || "Failed to update status");
    }
    setProcessingId(null);
  };

  return (
    <div className="bg-white dark:bg-[#1A1D21] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden transition-colors">
       <table className="w-full text-left">
          <thead>
             <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 transition-colors">
                <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Merchant / Store</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Bank Details</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">Actions</th>
             </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800 transition-colors">
             {withdrawals.length === 0 ? (
                <tr>
                   <td colSpan={5} className="px-6 py-12 text-center text-gray-400 dark:text-gray-500 italic">No withdrawal requests found.</td>
                </tr>
             ) : (
                withdrawals.map((w) => (
                   <tr key={w.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-6 py-4">
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-400">
                               <Building2 className="w-5 h-5" />
                            </div>
                            <div>
                               <p className="font-bold text-gray-900 dark:text-white text-sm">{w.store.name}</p>
                               <p className="text-xs text-gray-500 dark:text-gray-400 italic">/{w.store.slug}</p>
                            </div>
                         </div>
                      </td>
                      <td className="px-6 py-4">
                         <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs font-bold text-gray-900 dark:text-white">
                               <Wallet className="w-3 h-3" />
                               <span>{w.bankName}</span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400">{w.bankAccountNumber}</p>
                            <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 uppercase font-black">
                               <User className="w-2.5 h-2.5" />
                               <span>{w.bankAccountName}</span>
                            </div>
                         </div>
                      </td>
                      <td className="px-6 py-4">
                         <p className="font-black text-gray-900 dark:text-white">{formatCurrency(w.amount, "IDR")}</p>
                         <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase">{new Date(w.createdAt).toLocaleString()}</p>
                      </td>
                      <td className="px-6 py-4">
                         <span className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1",
                            w.status === 'PENDING' ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400" :
                            w.status === 'COMPLETED' ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" :
                            "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
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
                                  className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-all"
                                  title="Mark as Completed"
                               >
                                  <CheckCircle2 className="w-5 h-5" />
                               </button>
                               <button 
                                  onClick={() => handleStatusUpdate(w.id, 'REJECTED')}
                                  disabled={processingId === w.id}
                                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
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
  );
}
