"use client";

import { useState } from "react";
import { 
  Search,
  AlertCircle,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  MessageCircle
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function LedgerTable({ initialLedger, storeId, waDashboard }: { initialLedger: any[]; storeId: number; waDashboard: any }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [topupLoadingAmount, setTopupLoadingAmount] = useState<number | null>(null);

  const filteredLedger = initialLedger.filter(item => 
    item.id.toString().includes(searchQuery) ||
    item.customerPhone.includes(searchQuery)
  );

  const totalEarnings = initialLedger.reduce((acc, curr) => acc + (curr.totalAmount - (curr.paymentFee || 0) - (curr.transactionFee || 0)), 0);
  const totalFees = initialLedger.reduce((acc, curr) => acc + (curr.paymentFee || 0) + (curr.transactionFee || 0), 0);
  const waBalance = Number(waDashboard?.balance || 0);
  const waMessagePrice = Number(waDashboard?.pricePerMessage || 350);
  const waRemainingMessages = Number(waDashboard?.remainingMessages || 0);
  const lowCreditThreshold = Number(waDashboard?.lowCreditThreshold || 10000);
  const gaugePercent = Math.min(100, Math.round((waBalance / 149000) * 100));

  const requestTopup = async (amount: number) => {
    setTopupLoadingAmount(amount);
    try {
      const res = await fetch("/api/wa/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, amount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create top-up payment");
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank");
      }
    } catch (error: any) {
      alert(error.message || "Top-up failed");
    } finally {
      setTopupLoadingAmount(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl p-6 shadow-sm transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center"
              style={{ background: `conic-gradient(#f97316 ${gaugePercent}%, #1f2937 ${gaugePercent}% 100%)` }}
            >
              <div className="w-16 h-16 rounded-full bg-[#0F1113] text-white flex items-center justify-center text-xs font-black">
                {gaugePercent}%
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">WhatsApp Credit</p>
              <h2 className="text-2xl font-black text-gray-900 dark:text-white">{formatCurrency(waBalance, "IDR")}</h2>
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                ~{waRemainingMessages} messages left @ {formatCurrency(waMessagePrice, "IDR")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[50000, 100000, 250000].map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => requestTopup(amount)}
                disabled={topupLoadingAmount !== null}
                className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-widest disabled:opacity-60 inline-flex items-center gap-2"
              >
                {topupLoadingAmount === amount ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Top-up {formatCurrency(amount, "IDR")}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-800/30">
            <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Latest WA Usage</p>
            <div className="space-y-2">
              {(waDashboard?.recentLogs || []).slice(0, 5).map((log: any) => (
                <div key={log.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageCircle className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    <span className="truncate text-gray-700 dark:text-gray-300 font-bold">{log.description}</span>
                  </div>
                  <span className={log.amount >= 0 ? "text-green-500 font-black" : "text-orange-500 font-black"}>
                    {log.amount >= 0 ? "+" : ""}{formatCurrency(log.amount, "IDR")}
                  </span>
                </div>
              ))}
              {(waDashboard?.recentLogs || []).length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 font-bold">No usage yet.</p>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-800/30">
            <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Low Credit Alert</p>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
              {waBalance <= lowCreditThreshold
                ? `Balance is low. Top up now to keep automated receipts sending.`
                : `Balance is healthy. We'll alert you when it reaches ${formatCurrency(lowCreditThreshold, "IDR")}.`}
            </p>
          </div>
        </div>
      </div>

      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl p-6 shadow-sm transition-colors">
            <div className="flex items-center gap-3 mb-4">
               <div className="w-8 h-8 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center justify-center text-green-600 dark:text-green-400">
                  <TrendingUp className="w-5 h-5" />
               </div>
               <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Net Earnings</span>
            </div>
            <h2 className="text-3xl font-black text-gray-900 dark:text-white">{formatCurrency(totalEarnings, "IDR")}</h2>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 font-medium">Total from all paid orders</p>
         </div>

         <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl p-6 shadow-sm transition-colors">
            <div className="flex items-center gap-3 mb-4">
               <div className="w-8 h-8 bg-orange-50 dark:bg-orange-900/20 rounded-lg flex items-center justify-center text-orange-600 dark:text-orange-400">
                  <ArrowUpRight className="w-5 h-5" />
               </div>
               <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Total Fees</span>
            </div>
            <h2 className="text-3xl font-black text-gray-900 dark:text-white">{formatCurrency(totalFees, "IDR")}</h2>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 font-medium">QRIS, Bank & Platform Fees</p>
         </div>

         <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl p-6 shadow-sm transition-colors">
            <div className="flex items-center gap-3 mb-4">
               <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <ArrowDownLeft className="w-5 h-5" />
               </div>
               <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Orders</span>
            </div>
            <h2 className="text-3xl font-black text-gray-900 dark:text-white">{initialLedger.length}</h2>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 font-medium">Total paid transactions</p>
         </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden transition-colors">
         <div className="p-6 border-b border-gray-50 dark:border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors">
            <h2 className="text-xl font-black text-gray-900 dark:text-white">Transaction History</h2>
            
            <div className="flex gap-2 w-full sm:w-auto">
               <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <input 
                    type="text"
                    placeholder="Search Order ID..."
                    className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:border-blue-500 transition-all dark:text-white"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
               </div>
            </div>
         </div>

         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead>
                  <tr className="bg-gray-50/50 dark:bg-gray-800/30 transition-colors">
                     <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Order ID</th>
                     <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Date</th>
                     <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Amount</th>
                     <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Fees</th>
                     <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Net</th>
                     <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right">Status</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50 dark:divide-gray-800 transition-colors">
                  {filteredLedger.length === 0 ? (
                    <tr>
                       <td colSpan={6} className="px-6 py-12 text-center">
                          <AlertCircle className="w-12 h-12 text-gray-100 dark:text-gray-800 mx-auto mb-4" />
                          <p className="text-sm text-gray-400 dark:text-gray-500 italic font-medium">No transactions found</p>
                       </td>
                    </tr>
                  ) : (
                    filteredLedger.map((item) => {
                       const fees = (item.paymentFee || 0) + (item.transactionFee || 0);
                       const net = item.totalAmount - fees;
                       return (
                        <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                           <td className="px-6 py-4">
                              <span className="font-bold text-gray-900 dark:text-white text-sm">#{item.id}</span>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{item.customerPhone}</p>
                           </td>
                           <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400 font-medium">
                              {new Date(item.updatedAt).toLocaleDateString()}
                           </td>
                           <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-white">
                              {formatCurrency(item.totalAmount, "IDR")}
                           </td>
                           <td className="px-6 py-4">
                              <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{formatCurrency(fees, "IDR")}</span>
                              {item.paymentMethod && (
                                 <p className="text-[9px] text-gray-400 dark:text-gray-500 font-black uppercase tracking-tight mt-0.5">{item.paymentMethod}</p>
                              )}
                           </td>
                           <td className="px-6 py-4 text-sm font-black text-green-600 dark:text-green-400">
                              {formatCurrency(net, "IDR")}
                           </td>
                           <td className="px-6 py-4 text-right">
                              <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full text-[9px] font-black uppercase tracking-widest">
                                 {item.status}
                              </span>
                           </td>
                        </tr>
                       );
                    })
                  )}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
}
