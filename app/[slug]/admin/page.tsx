import { 
  Users, 
  Package, 
  ShoppingCart, 
  DollarSign,
  Power,
  Clock
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { getDashboardStats, getOrders, getStoreBySlug } from "@/lib/api";
import StoreStatusToggle from "./components/StoreStatusToggle";

export default async function AdminDashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  
  const storeData = await getStoreBySlug(slug);
  if (!storeData) return null;
  
  const storeId = storeData.id;
  const [stats, ordersData] = await Promise.all([
    getDashboardStats(storeId),
    getOrders(storeId)
  ]);
  
  const recentOrders = ordersData && Array.isArray(ordersData) ? ordersData.slice(0, 5) : [];

  return (
    <div className="space-y-8">
      {/* Store Status Toggle */}
      <StoreStatusToggle initialStore={storeData} />

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Revenue</p>
            <h3 className="text-2xl font-black text-gray-900">{formatCurrency(stats.totalRevenue, "IDR")}</h3>
          </div>
          <div className="p-3 bg-green-50 rounded-xl text-green-600">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Orders</p>
            <h3 className="text-2xl font-black text-gray-900">{stats.totalOrders}</h3>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <ShoppingCart className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Active Customers</p>
            <h3 className="text-2xl font-black text-gray-900">{stats.activeCustomers}</h3>
          </div>
          <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Products Sold</p>
            <h3 className="text-2xl font-black text-gray-900">{stats.productsSold}</h3>
          </div>
          <div className="p-3 bg-orange-50 rounded-xl text-orange-600">
            <Package className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-gray-900">Recent Orders</h3>
            <Link href={`/${slug}/admin/orders`} className="text-xs font-bold text-primary hover:text-orange-700 uppercase tracking-wider">View All</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Order ID</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Customer</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Total</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentOrders.length > 0 ? (
                  recentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-900 text-sm">#{order.id}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{order.customerPhone}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                          order.status === "completed" ? "bg-green-100 text-green-800" :
                          order.status === "processing" ? "bg-blue-100 text-blue-800" :
                          order.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                          "bg-red-100 text-red-800"
                        )}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-900 text-sm">{formatCurrency(order.total, "IDR")}</td>
                      <td className="px-6 py-4 text-right text-xs text-gray-400">{new Date(order.date).toLocaleDateString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500 italic">
                      No recent orders found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
