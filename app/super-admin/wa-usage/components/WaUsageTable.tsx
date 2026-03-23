'use client';

import { useState, useMemo } from 'react';
import { Building2, Store } from 'lucide-react';
import { cn } from "@/lib/utils";

type StoreUsage = {
  id: number;
  name: string;
  slug: string;
  corporateName: string;
  balance: number;
  usageCount: number;
  totalRevenue: number;
  totalMetaCost: number;
  profit: number;
};

type GlobalUsage = {
  totalBalance: number;
  totalUsageCount: number;
  totalTopup: number;
  estimatedCost: number;
};

export default function WaUsageTable({ 
  storeUsage, 
  globalUsage 
}: { 
  storeUsage: StoreUsage[], 
  globalUsage: GlobalUsage 
}) {
  const [filter, setFilter] = useState<'ALL' | 'CORPORATE' | 'INDEPENDENT'>('ALL');
  
  const filteredData = useMemo(() => {
    if (filter === 'ALL') return storeUsage;
    if (filter === 'CORPORATE') return storeUsage.filter(s => s.corporateName !== "Independent");
    return storeUsage.filter(s => s.corporateName === "Independent");
  }, [storeUsage, filter]);

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => b.usageCount - a.usageCount);
  }, [filteredData]);

  const formatIDR = (num: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);

  return (
    <div className="bg-white dark:bg-[#1A1D21] rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
      <div className="p-6 border-b dark:border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="font-bold dark:text-white">Merchant & Corporate Breakdown</h2>
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          <button
            onClick={() => setFilter('ALL')}
            className={cn(
              "px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all",
              filter === 'ALL' 
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            All
          </button>
          <button
            onClick={() => setFilter('CORPORATE')}
            className={cn(
              "px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
              filter === 'CORPORATE' 
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            <Building2 size={12} />
            Corporate
          </button>
          <button
            onClick={() => setFilter('INDEPENDENT')}
            className={cn(
              "px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
              filter === 'INDEPENDENT' 
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            <Store size={12} />
            Independent
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 dark:bg-black/20 text-[10px] font-black uppercase tracking-widest text-gray-500">
              <th className="px-6 py-4">Entity</th>
              <th className="px-6 py-4">Corporate</th>
              <th className="px-6 py-4 text-center">Usage</th>
              <th className="px-6 py-4 text-right">Revenue</th>
              <th className="px-6 py-4 text-right">Meta Cost</th>
              <th className="px-6 py-4 text-right">Profit</th>
              <th className="px-6 py-4 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-800">
            {sortedData.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-gray-900 dark:text-white">{row.name}</span>
                    <span className="text-[10px] text-gray-500 font-medium">/{row.slug}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-tight",
                    row.corporateName !== "Independent" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  )}>
                    {row.corporateName}
                  </span>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="flex flex-col items-center">
                    <span className="font-bold dark:text-white">{row.usageCount.toLocaleString()}</span>
                    <span className="text-[9px] text-gray-400 uppercase tracking-tighter">Messages</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right font-medium text-gray-900 dark:text-white">
                  {formatIDR(row.totalRevenue)}
                </td>
                <td className="px-6 py-4 text-right font-medium text-purple-600">
                  {formatIDR(row.totalMetaCost)}
                </td>
                <td className="px-6 py-4 text-right">
                  <span className={cn("font-bold", row.profit >= 0 ? "text-green-600" : "text-red-600")}>
                    {formatIDR(row.profit)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex flex-col items-end">
                    <span className="font-bold dark:text-white">{formatIDR(row.balance)}</span>
                    <div className="w-16 h-1 bg-gray-100 dark:bg-gray-800 rounded-full mt-1 overflow-hidden">
                       <div 
                         className={cn("h-full", row.balance < 10000 ? "bg-red-500" : "bg-green-500")}
                         style={{ width: `${Math.min(100, (row.balance / 50000) * 100)}%` }}
                       />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
