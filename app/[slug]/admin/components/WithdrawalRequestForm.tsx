"use client";

import { useState } from "react";
import { 
  Wallet, 
  History, 
  ArrowUpRight,
  Clock,
  AlertCircle
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { requestWithdrawal, getStoreWithdrawals } from "@/lib/finance";
import { getStoreBySlug } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function WithdrawalRequestForm({ initialStore, initialWithdrawals, slug }: { initialStore: any, initialWithdrawals: any[], slug: string }) {
  const [store, setStore] = useState(initialStore);
  const [withdrawals, setWithdrawals] = useState(initialWithdrawals);
  const [isRequesting, setIsRequesting] = useState(false);
  const [amount, setAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store) return;
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert("Invalid amount");
      return;
    }

    if (numAmount > store.balance) {
      alert("Insufficient balance");
      return;
    }

    setIsRequesting(true);
    const res = await requestWithdrawal({
      storeId: store.id,
      amount: numAmount,
      bankName,
      bankAccountNumber,
      bankAccountName
    });

    if (res.success) {
      alert("Withdrawal requested successfully. Processing time: 3 x 24 hours.");
      // Refresh data
      const s = await getStoreBySlug(slug);
      if (s) setStore(s);
      const w = await getStoreWithdrawals(store.id);
      setWithdrawals(w);
      // Clear form
      setAmount("");
    } else {
      alert(res.error || "Failed to request withdrawal");
    }
    setIsRequesting(false);
  };

  return (
    <div className="space-y-8">
      {/* Balance Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-blue-600 rounded-2xl p-8 text-white relative overflow-hidden shadow-xl">
           <div className="relative z-10">
              <p className="text-blue-100 text-sm font-medium mb-1 opacity-80 uppercase tracking-widest">Available Balance</p>
              <h2 className="text-4xl font-black mb-8">{formatCurrency(store?.balance || 0, "IDR")}</h2>
              
              <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10">
                    <Clock className="w-4 h-4 text-blue-200" />
                    <span className="text-xs font-bold text-blue-50">3 x 24h Processing</span>
                 </div>
              </div>
           </div>
           <Wallet className="absolute -bottom-10 -right-10 w-64 h-64 text-white/10 rotate-12" />
        </div>

        {/* Quick Stats */}
        <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl p-6 shadow-sm transition-colors">
           <h3 className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4">Summary</h3>
           <div className="space-y-4">
              <div className="flex justify-between items-center">
                 <span className="text-sm text-gray-500 dark:text-gray-400">Pending</span>
                 <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
                    {formatCurrency(withdrawals.filter(w => w.status === 'PENDING').reduce((acc, curr) => acc + curr.amount, 0), "IDR")}
                 </span>
              </div>
              <div className="flex justify-between items-center border-t pt-4 border-gray-50 dark:border-gray-800 transition-colors">
                 <span className="text-sm text-gray-500 dark:text-gray-400">Completed</span>
                 <span className="text-sm font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(withdrawals.filter(w => w.status === 'COMPLETED').reduce((acc, curr) => acc + curr.amount, 0), "IDR")}
                 </span>
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Request Form */}
        <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl p-8 shadow-sm transition-colors">
          <div className="flex items-center gap-3 mb-6">
             <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                <ArrowUpRight className="w-6 h-6" />
             </div>
             <h2 className="text-xl font-black text-gray-900 dark:text-white">Request Withdrawal</h2>
          </div>

          <form onSubmit={handleRequest} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Amount (Rp)</label>
              <input 
                type="number"
                required
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:border-blue-500 transition-all font-bold text-lg dark:text-white"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div>
                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Bank Name</label>
                  <input 
                    type="text"
                    required
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:border-blue-500 transition-all text-sm font-bold dark:text-white"
                    placeholder="BCA, Mandiri, etc."
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                  />
               </div>
               <div>
                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Account Number</label>
                  <input 
                    type="text"
                    required
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:border-blue-500 transition-all text-sm font-bold dark:text-white"
                    placeholder="1234567890"
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                  />
               </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Account Holder Name</label>
              <input 
                type="text"
                required
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:border-blue-500 transition-all text-sm font-bold uppercase dark:text-white"
                placeholder="AS SEEN ON BANK BOOK"
                value={bankAccountName}
                onChange={(e) => setBankAccountName(e.target.value)}
              />
            </div>

            <button 
              type="submit"
              disabled={isRequesting}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-sm uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 mt-4"
            >
              {isRequesting ? "Processing..." : "Submit Request"}
            </button>
          </form>
        </div>

        {/* History */}
        <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl p-8 shadow-sm transition-colors">
          <div className="flex items-center gap-3 mb-6">
             <div className="w-10 h-10 bg-gray-50 dark:bg-gray-800 rounded-xl flex items-center justify-center text-gray-600 dark:text-gray-400 transition-colors">
                <History className="w-6 h-6" />
             </div>
             <h2 className="text-xl font-black text-gray-900 dark:text-white">Recent History</h2>
          </div>

          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {withdrawals.length === 0 ? (
              <div className="text-center py-12">
                 <AlertCircle className="w-12 h-12 text-gray-100 dark:text-gray-800 mx-auto mb-4" />
                 <p className="text-sm text-gray-400 dark:text-gray-500 italic font-medium">No withdrawals found</p>
              </div>
            ) : (
              withdrawals.map((w) => (
                <div key={w.id} className="p-4 border border-gray-50 dark:border-gray-800 rounded-xl hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-black text-gray-900 dark:text-white text-sm">{formatCurrency(w.amount, "IDR")}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-tight">{new Date(w.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest",
                      w.status === 'PENDING' ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400" :
                      w.status === 'COMPLETED' ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" :
                      "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                    )}>
                      {w.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                     <span className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded transition-colors">{w.bankName}</span>
                     <span>•</span>
                     <span>{w.bankAccountNumber}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
