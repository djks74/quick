"use client";

import { useState } from "react";
import { 
  Filter,
  Download,
  Search,
  AlertCircle,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function LedgerTable({ initialLedger }: { initialLedger: any[] }) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredLedger = initialLedger.filter(item => 
    item.id.toString().includes(searchQuery) ||
    item.customerPhone.includes(searchQuery)
  );

  const totalEarnings = initialLedger.reduce((acc, curr) => acc + (curr.totalAmount - (curr.paymentFee || 0) - (curr.transactionFee || 0)), 0);
  const totalFees = initialLedger.reduce((acc, curr) => acc + (curr.paymentFee || 0) + (curr.transactionFee || 0), 0);

  return (
    <div className="space-y-8">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
               <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center text-green-600">
                  <TrendingUp className="w-5 h-5" />
               </div>
               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Net Earnings</span>
            </div>
            <h2 className="text-3xl font-black text-gray-900">{formatCurrency(totalEarnings, "IDR")}</h2>
            <p className="text-[10px] text-gray-400 mt-2 font-medium">Total from all paid orders</p>
         </div>

         <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
               <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600">
                  <ArrowUpRight className="w-5 h-5" />
               </div>
               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Fees</span>
            </div>
            <h2 className="text-3xl font-black text-gray-900">{formatCurrency(totalFees, "IDR")}</h2>
            <p className="text-[10px] text-gray-400 mt-2 font-medium">QRIS, Bank & Platform Fees</p>
         </div>

         <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
               <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                  <ArrowDownLeft className="w-5 h-5" />
               </div>
               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Orders</span>
            </div>
            <h2 className="text-3xl font-black text-gray-900">{initialLedger.length}</h2>
            <p className="text-[10px] text-gray-400 mt-2 font-medium">Total paid transactions</p>
         </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
         <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-xl font-black text-gray-900">Transaction History</h2>
            
            <div className="flex gap-2 w-full sm:w-auto">
               <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    type="text"
                    placeholder="Search Order ID..."
                    className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
               </div>
            </div>
         </div>

         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead>
                  <tr className="bg-gray-50/50">
                     <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Order ID</th>
                     <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                     <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Amount</th>
                     <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Fees</th>
                     <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Net</th>
                     <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Status</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                  {filteredLedger.length === 0 ? (
                    <tr>
                       <td colSpan={6} className="px-6 py-12 text-center">
                          <AlertCircle className="w-12 h-12 text-gray-100 mx-auto mb-4" />
                          <p className="text-sm text-gray-400 italic font-medium">No transactions found</p>
                       </td>
                    </tr>
                  ) : (
                    filteredLedger.map((item) => {
                       const fees = (item.paymentFee || 0) + (item.transactionFee || 0);
                       const net = item.totalAmount - fees;
                       return (
                        <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                           <td className="px-6 py-4">
                              <span className="font-bold text-gray-900 text-sm">#{item.id}</span>
                              <p className="text-[10px] text-gray-400 font-medium">{item.customerPhone}</p>
                           </td>
                           <td className="px-6 py-4 text-xs text-gray-500 font-medium">
                              {new Date(item.updatedAt).toLocaleDateString()}
                           </td>
                           <td className="px-6 py-4 text-sm font-bold text-gray-900">
                              {formatCurrency(item.totalAmount, "IDR")}
                           </td>
                           <td className="px-6 py-4">
                              <span className="text-xs font-bold text-orange-600">{formatCurrency(fees, "IDR")}</span>
                              {item.paymentMethod && (
                                 <p className="text-[9px] text-gray-400 font-black uppercase tracking-tight mt-0.5">{item.paymentMethod}</p>
                              )}
                           </td>
                           <td className="px-6 py-4 text-sm font-black text-green-600">
                              {formatCurrency(net, "IDR")}
                           </td>
                           <td className="px-6 py-4 text-right">
                              <span className="px-2 py-0.5 bg-green-100 text-green-600 rounded-full text-[9px] font-black uppercase tracking-widest">
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
