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
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useShop } from "@/context/ShopContext";

const recentOrders = [
  { id: "ORD-125", customer: "John Doe", total: "$1,250.00", status: "Completed", date: "2 mins ago" },
  { id: "ORD-124", customer: "Budi Santoso", total: "$450.00", status: "Processing", date: "1 hour ago" },
  { id: "ORD-123", customer: "Sarah Smith", total: "$2,100.00", status: "Completed", date: "3 hours ago" },
  { id: "ORD-122", customer: "Mike Johnson", total: "$125.00", status: "Pending", date: "5 hours ago" },
  { id: "ORD-121", customer: "Alex Brown", total: "$890.00", status: "Cancelled", date: "1 day ago" },
];

export default function AdminDashboard() {
  const { cartTotal } = useShop();

  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Revenue</p>
            <h3 className="text-2xl font-black text-gray-900">$48,250.00</h3>
            <div className="flex items-center mt-2 text-green-500 text-xs font-bold">
              <TrendingUp className="w-3 h-3 mr-1" />
              <span>+12.5%</span>
              <span className="text-gray-400 ml-1 font-normal">vs last month</span>
            </div>
          </div>
          <div className="p-3 bg-green-50 rounded-xl text-green-600">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Orders</p>
            <h3 className="text-2xl font-black text-gray-900">842</h3>
            <div className="flex items-center mt-2 text-green-500 text-xs font-bold">
              <ArrowUpRight className="w-3 h-3 mr-1" />
              <span>+5.2%</span>
              <span className="text-gray-400 ml-1 font-normal">vs last month</span>
            </div>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <ShoppingCart className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Active Customers</p>
            <h3 className="text-2xl font-black text-gray-900">2,420</h3>
            <div className="flex items-center mt-2 text-red-500 text-xs font-bold">
              <ArrowDownRight className="w-3 h-3 mr-1" />
              <span>-1.8%</span>
              <span className="text-gray-400 ml-1 font-normal">vs last month</span>
            </div>
          </div>
          <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Products Sold</p>
            <h3 className="text-2xl font-black text-gray-900">1,256</h3>
            <div className="flex items-center mt-2 text-green-500 text-xs font-bold">
              <TrendingUp className="w-3 h-3 mr-1" />
              <span>+8.4%</span>
              <span className="text-gray-400 ml-1 font-normal">vs last month</span>
            </div>
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
                {recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900 text-sm">{order.id}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{order.customer}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                        order.status === "Completed" ? "bg-green-100 text-green-800" :
                        order.status === "Processing" ? "bg-blue-100 text-blue-800" :
                        order.status === "Pending" ? "bg-yellow-100 text-yellow-800" :
                        "bg-red-100 text-red-800"
                      )}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-900 text-sm">{order.total}</td>
                    <td className="px-6 py-4 text-right text-xs text-gray-400">{order.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Products / Activity */}
        <div className="space-y-8">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-bold text-gray-900 mb-6">Sales Activity</h3>
            <div className="space-y-6">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mr-4">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-gray-900">New Order #ORD-126</h4>
                  <p className="text-xs text-gray-500">2 minutes ago</p>
                </div>
                <span className="text-sm font-bold text-green-600">+$120.00</span>
              </div>
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600 mr-4">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-gray-900">Payment Received</h4>
                  <p className="text-xs text-gray-500">15 minutes ago</p>
                </div>
                <span className="text-sm font-bold text-green-600">+$450.00</span>
              </div>
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 mr-4">
                  <Package className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-gray-900">Stock Update</h4>
                  <p className="text-xs text-gray-500">1 hour ago</p>
                </div>
                <span className="text-xs font-bold text-gray-400">B58 Pipe</span>
              </div>
            </div>
          </div>

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
