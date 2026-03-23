import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import SuperAdminNav from "../SuperAdminNav";
import { getPlatformWaUsageSummary } from "@/lib/wa-credit";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";
import { 
  TrendingUp, 
  Users, 
  ShoppingBag, 
  DollarSign,
  Activity
} from "lucide-react";

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session as any).user?.role !== "SUPER_ADMIN") {
    redirect("/login");
  }

  await ensureStoreSettingsSchema();

  // Aggregate Stats
  const [
    totalStores,
    totalUsers,
    totalOrders,
    orderStats,
    recentTrafficCount,
    allOrders,
    enterpriseStoreCount,
    totalWaMessages,
    platformWaUsage
  ] = await Promise.all([
    prisma.store.count(),
    prisma.user.count(),
    prisma.order.count(),
    prisma.order.aggregate({
      where: { status: "PAID" },
      _sum: { totalAmount: true, transactionFee: true }
    }),
    (prisma as any).trafficLog.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    }),
    prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { store: true }
    }),
    prisma.store.count({
      where: { subscriptionPlan: { in: ["PRO", "ENTERPRISE"] } }
    }),
    prisma.waUsageLog.count({
      where: { type: "MESSAGE" }
    }),
    getPlatformWaUsageSummary(30)
  ]);

  const formatMoney = (val: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(val || 0))}`;

  const paymentProfit = orderStats._sum.transactionFee || 0;
  const enterpriseProfit = enterpriseStoreCount * 249000;
  const waProfit = totalWaMessages * 200; // 350 charge - 150 cost
  const platformWaCost = platformWaUsage.cost || 0;
  const totalPlatformProfit = paymentProfit + enterpriseProfit + waProfit - platformWaCost;

  const stats = [
    { label: "Total Revenue (Paid)", value: formatMoney(orderStats._sum.totalAmount || 0), icon: DollarSign, color: "text-green-600 bg-green-100 dark:bg-green-900/20" },
    { label: "Platform Profit", value: formatMoney(totalPlatformProfit), icon: TrendingUp, color: "text-blue-600 bg-blue-100 dark:bg-blue-900/20" },
    { label: "Platform WA (30d)", value: `${platformWaUsage.count} msg`, icon: Activity, color: "text-indigo-600 bg-indigo-100 dark:bg-indigo-900/20" },
    { label: "Total Orders", value: totalOrders.toString(), icon: ShoppingBag, color: "text-orange-600 bg-orange-100 dark:bg-orange-900/20" },
    { label: "24h Traffic", value: recentTrafficCount.toString(), icon: Users, color: "text-purple-600 bg-blue-100 dark:bg-purple-900/20" },
  ];

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <div key={i} className="bg-white dark:bg-[#1A1D21] p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${stat.color}`}>
                  <stat.icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{stat.label}</p>
                  <p className="text-2xl font-bold dark:text-white">{stat.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Transactions */}
          <div className="bg-white dark:bg-[#1A1D21] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="font-bold dark:text-white text-lg">Recent Transactions</h2>
              <span className="text-xs text-primary font-bold uppercase tracking-wider">Last 10</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50">
                    <th className="px-6 py-3">Store</th>
                    <th className="px-6 py-3">Amount</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {allOrders.map((order: any) => (
                    <tr key={order.id} className="text-sm">
                      <td className="px-6 py-4 dark:text-gray-300 font-medium">{order.store.name}</td>
                      <td className="px-6 py-4 dark:text-white font-bold">{formatMoney(order.totalAmount)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                          order.status === 'PAID' ? 'bg-green-100 text-green-700 dark:bg-green-900/30' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="space-y-6">
             <div className="bg-white dark:bg-[#1A1D21] p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
                <h3 className="font-bold dark:text-white mb-4 flex items-center gap-2">
                   <TrendingUp className="w-5 h-5 text-primary" />
                   Profit Breakdown
                </h3>
                <div className="space-y-4">
                   <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Payments (0.3% / 1k)</span>
                      <span className="font-bold text-green-600">{formatMoney(paymentProfit)}</span>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Enterprise Subs (Rp 249k)</span>
                      <span className="font-bold text-blue-600">{formatMoney(enterpriseProfit)}</span>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">WA Profit (Rp 200/msg)</span>
                      <span className="font-bold text-purple-600">{formatMoney(waProfit)}</span>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Platform WA Cost ({platformWaUsage.days}d)</span>
                      <span className="font-bold text-red-600">- {formatMoney(platformWaCost)}</span>
                   </div>
                   <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
                      <span className="text-sm font-bold dark:text-white">Total Platform Profit</span>
                      <span className="font-bold text-lg text-primary">{formatMoney(totalPlatformProfit)}</span>
                   </div>
                </div>
             </div>

             <div className="bg-white dark:bg-[#1A1D21] p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
                <h3 className="font-bold dark:text-white mb-4 flex items-center gap-2">
                   <Users className="w-5 h-5 text-primary" />
                   Growth Overview
                </h3>
                <div className="space-y-4">
                   <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Total Merchants</span>
                      <span className="font-bold dark:text-white">{totalStores}</span>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Total Registered Users</span>
                      <span className="font-bold dark:text-white">{totalUsers}</span>
                   </div>
                </div>
             </div>

             <div className="bg-gradient-to-br from-primary to-orange-600 p-6 rounded-xl shadow-lg text-white">
                <h3 className="font-bold mb-2 text-lg">Platform Health</h3>
                <p className="text-white/80 text-sm mb-4">Real-time system activity monitoring is active.</p>
                <div className="flex items-center gap-2 bg-white/20 w-fit px-3 py-1 rounded-full text-xs font-bold">
                   <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                   All Systems Operational
                </div>
             </div>
          </div>
        </div>
    </div>
  );
}
