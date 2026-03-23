import { getDetailedWaUsageByStore, getGlobalWaUsage } from "@/lib/wa-credit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import SuperAdminNav from "../SuperAdminNav";
import { MessageSquare, Wallet, Activity, TrendingUp, ArrowUpRight, Building2, Store } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function WaUsageReportPage() {
  const session = await getServerSession(authOptions);
  const user = (session as any)?.user;
  if (!session || user?.role !== "SUPER_ADMIN") {
    redirect("/login");
  }

  const [globalUsage, storeUsage] = await Promise.all([
    getGlobalWaUsage(),
    getDetailedWaUsageByStore()
  ]);

  const totalProfit = globalUsage.totalTopup - globalUsage.estimatedCost;
  const formatIDR = (num: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0F1113] p-8 transition-colors duration-300">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">WhatsApp Usage Report</h1>
            <p className="text-gray-500 dark:text-gray-400">Detailed merchant and corporate usage with profitability analysis.</p>
          </div>
          <SuperAdminNav />
        </header>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-[#1A1D21] p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center gap-2 text-blue-600 mb-2">
              <MessageSquare size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">Total Messages</span>
            </div>
            <div className="text-2xl font-bold dark:text-white">{globalUsage.totalUsageCount.toLocaleString()}</div>
            <div className="mt-1 text-[10px] text-gray-500">Delivered across all stores</div>
          </div>

          <div className="bg-white dark:bg-[#1A1D21] p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center gap-2 text-green-600 mb-2">
              <TrendingUp size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">Total Revenue</span>
            </div>
            <div className="text-2xl font-bold dark:text-white">{formatIDR(globalUsage.totalTopup)}</div>
            <div className="mt-1 text-[10px] text-gray-500">Customer top-ups received</div>
          </div>

          <div className="bg-white dark:bg-[#1A1D21] p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center gap-2 text-purple-600 mb-2">
              <Activity size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">Est. Meta Cost</span>
            </div>
            <div className="text-2xl font-bold dark:text-white">{formatIDR(globalUsage.estimatedCost)}</div>
            <div className="mt-1 text-[10px] text-gray-500 text-purple-500">Meta platform expense</div>
          </div>

          <div className="bg-white dark:bg-[#1A1D21] p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center gap-2 text-orange-600 mb-2">
              <Wallet size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">Net Profit</span>
            </div>
            <div className={cn("text-2xl font-bold", totalProfit >= 0 ? "text-green-600" : "text-red-600")}>
              {formatIDR(totalProfit)}
            </div>
            <div className="mt-1 text-[10px] text-gray-500">Revenue - Meta cost</div>
          </div>
        </div>

        {/* Detailed Table */}
        <div className="bg-white dark:bg-[#1A1D21] rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          <div className="p-6 border-b dark:border-gray-800 flex items-center justify-between">
            <h2 className="font-bold dark:text-white">Merchant & Corporate Breakdown</h2>
            <div className="flex items-center gap-2">
               <span className="flex items-center gap-1 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">
                  <Building2 size={10} /> Corporate
               </span>
               <span className="flex items-center gap-1 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">
                  <Store size={10} /> Store
               </span>
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
                {storeUsage.sort((a, b) => b.usageCount - a.usageCount).map((row) => (
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
      </div>
    </div>
  );
}
