"use client";

import { 
  Users, 
  Package, 
  ShoppingCart, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Activity,
  CreditCard,
  ShoppingBag
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getDashboardStats, getOrders } from "@/lib/api";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    activeCustomers: 0,
    productsSold: 0
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  useEffect(() => {
    async function loadDashboardData() {
      const [statsData, ordersData] = await Promise.all([
        getDashboardStats(),
        getOrders()
      ]);
      setStats(statsData);
      setRecentOrders(ordersData && Array.isArray(ordersData) ? ordersData.slice(0, 5) : []); // Show top 5 recent orders
    }
    loadDashboardData();
  }, []);

  return (
    <div className="space-y-8">
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
            <Link href="/admin/orders" className="text-xs font-bold text-primary hover:text-orange-700 uppercase tracking-wider">View All</Link>
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
                      <td className="px-6 py-4 text-sm text-gray-600">{order.customerName}</td>
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

        {/* Pro Tip / Info */}
        <div className="space-y-8">
          <div className="bg-primary/5 rounded-2xl border border-primary/10 p-6">
            <h3 className="font-bold text-primary mb-2">Pro Tip</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Connect your payment gateways in Settings to start accepting real payments. Enable Xendit or Midtrans for seamless transactions.
            </p>
            <Link href="/admin/settings" className="inline-block mt-4 text-xs font-black uppercase tracking-widest text-primary hover:text-orange-700">
              Go to Settings →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
