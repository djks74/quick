import { TrendingUp, TrendingDown, Wallet, Package, ShoppingCart, Percent } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type ProductRow = {
  productId: number;
  productName: string;
  quantitySold: number;
  revenue: number;
  estimatedCogs: number;
  estimatedProfit: number;
  estimatedMargin: number;
};

type ProfitAnalyticsData = {
  totalOrders: number;
  totalItemsSold: number;
  grossRevenue: number;
  totalFees: number;
  netAfterFees: number;
  estimatedCogs: number;
  estimatedNetProfit: number;
  estimatedMargin: number;
  avgOrderValue: number;
  topProducts: ProductRow[];
  generatedAt: string;
};

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

export default function ProfitAnalytics({ analytics }: { analytics: ProfitAnalyticsData }) {
  const isProfitPositive = analytics.estimatedNetProfit >= 0;
  const marginPositive = analytics.estimatedMargin >= 0;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl p-5 shadow-sm transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Gross Revenue</p>
          </div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white">{formatCurrency(analytics.grossRevenue, "IDR")}</h2>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 font-medium">All paid and completed orders</p>
        </div>

        <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl p-5 shadow-sm transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Estimated COGS</p>
          </div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white">{formatCurrency(analytics.estimatedCogs, "IDR")}</h2>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 font-medium">Based on recipe ingredient costs</p>
        </div>

        <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl p-5 shadow-sm transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isProfitPositive ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"}`}>
              {isProfitPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            </div>
            <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Estimated Net Profit</p>
          </div>
          <h2 className={`text-2xl font-black ${isProfitPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {formatCurrency(analytics.estimatedNetProfit, "IDR")}
          </h2>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 font-medium">Revenue - fees - estimated COGS</p>
        </div>

        <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl p-5 shadow-sm transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${marginPositive ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400" : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"}`}>
              <Percent className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Net Margin</p>
          </div>
          <h2 className={`text-2xl font-black ${marginPositive ? "text-indigo-600 dark:text-indigo-400" : "text-red-600 dark:text-red-400"}`}>
            {formatPercent(analytics.estimatedMargin)}
          </h2>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 font-medium">Percentage of revenue kept as profit</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl p-5 shadow-sm transition-colors">
          <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Orders</p>
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xl font-black text-gray-900 dark:text-white">{analytics.totalOrders}</h3>
          </div>
        </div>
        <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl p-5 shadow-sm transition-colors">
          <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Items Sold</p>
          <h3 className="text-xl font-black text-gray-900 dark:text-white">{analytics.totalItemsSold}</h3>
        </div>
        <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl p-5 shadow-sm transition-colors">
          <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Total Fees</p>
          <h3 className="text-xl font-black text-gray-900 dark:text-white">{formatCurrency(analytics.totalFees, "IDR")}</h3>
        </div>
        <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl p-5 shadow-sm transition-colors">
          <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Average Order Value</p>
          <h3 className="text-xl font-black text-gray-900 dark:text-white">{formatCurrency(analytics.avgOrderValue, "IDR")}</h3>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1A1D21] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden transition-colors">
        <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-800">
          <h2 className="text-lg font-black text-gray-900 dark:text-white">Top Products by Revenue</h2>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium">
            Generated at {new Date(analytics.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-gray-800/30">
                <th className="px-6 py-3 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Product</th>
                <th className="px-6 py-3 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Qty</th>
                <th className="px-6 py-3 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Revenue</th>
                <th className="px-6 py-3 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Est. COGS</th>
                <th className="px-6 py-3 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Est. Profit</th>
                <th className="px-6 py-3 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {analytics.topProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400 dark:text-gray-500 font-medium">
                    No paid order data yet.
                  </td>
                </tr>
              ) : (
                analytics.topProducts.map((product) => (
                  <tr key={product.productId} className="hover:bg-gray-50/40 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-900 dark:text-white">{product.productName}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300 font-bold">{product.quantitySold}</td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(product.revenue, "IDR")}</td>
                    <td className="px-6 py-4 text-sm font-bold text-orange-600 dark:text-orange-400">{formatCurrency(product.estimatedCogs, "IDR")}</td>
                    <td className={`px-6 py-4 text-sm font-black ${product.estimatedProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {formatCurrency(product.estimatedProfit, "IDR")}
                    </td>
                    <td className={`px-6 py-4 text-right text-sm font-black ${product.estimatedMargin >= 0 ? "text-indigo-600 dark:text-indigo-400" : "text-red-600 dark:text-red-400"}`}>
                      {formatPercent(product.estimatedMargin)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/70 dark:bg-blue-900/10 px-4 py-3">
        <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
          Margin is estimated from current ingredient cost settings and paid/completed orders.
        </p>
      </div>
    </div>
  );
}
