import { getDetailedWaUsageByStore, getGlobalWaUsage } from "@/lib/wa-credit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import SuperAdminNav from "../SuperAdminNav";
import { MessageSquare, Wallet, Activity, TrendingUp, ArrowUpRight, Building2, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import WaUsageTable from "./components/WaUsageTable";

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
    <div className="space-y-8">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

        <WaUsageTable storeUsage={storeUsage} globalUsage={globalUsage} />
    </div>
  );
}
