"use client";

import { useSearchParams, useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { getOrders, getStoreBySlug, getOrderDetails } from "@/lib/api";
import { 
  Search, 
  Filter, 
  MoreVertical, 
  ExternalLink, 
  Eye, 
  Trash2, 
  ChevronLeft, 
  ChevronRight,
  User,
  Calendar,
  CreditCard,
  MapPin,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  PauseCircle,
  RefreshCw,
  Ban,
  X,
  Package,
  Phone,
  Hash
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

const statusIcons: Record<string, any> = {
  'completed': CheckCircle2,
  'paid': CheckCircle2,
  'processing': Clock,
  'on-hold': PauseCircle,
  'cancelled': XCircle,
  'refunded': RefreshCw,
  'failed': Ban,
  'pending': AlertCircle,
};

const statusColors: Record<string, string> = {
  'completed': 'bg-green-100 text-green-700',
  'paid': 'bg-green-100 text-green-700',
  'processing': 'bg-blue-100 text-blue-700',
  'on-hold': 'bg-orange-100 text-orange-700',
  'cancelled': 'bg-gray-100 text-gray-700',
  'refunded': 'bg-gray-100 text-gray-700',
  'failed': 'bg-red-100 text-red-700',
  'pending': 'bg-orange-100 text-orange-700',
};

export default function AdminOrders() {
  const searchParams = useSearchParams();
  const { slug } = useParams();
  const action = searchParams.get("action");
  const [orders, setOrders] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    async function loadOrders() {
      if (!slug) return;
      const store = await getStoreBySlug(slug as string);
      if (!store) return;
      
      const data = await getOrders(store.id);
      setOrders(data);
    }
    loadOrders();
  }, [slug]);

  const handleViewOrder = async (order: any) => {
    setSelectedOrder(order);
    setLoadingDetails(true);
    const details = await getOrderDetails(parseInt(order.id));
    setOrderDetails(details);
    setLoadingDetails(false);
  };

  if (action === "new") {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-medium border-b pb-4 mb-4">Add New Order</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Customer Name</label>
              <input type="text" className="w-full border border-[#ccd0d4] px-3 py-2 focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1] outline-none" placeholder="e.g. John Smith" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Customer Email</label>
              <input type="email" className="w-full border border-[#ccd0d4] px-3 py-2 focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1] outline-none" placeholder="e.g. john@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Shipping Address</label>
              <textarea className="w-full border border-[#ccd0d4] px-3 py-2 focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1] outline-none h-32" placeholder="Full address details..."></textarea>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select className="w-full border border-[#ccd0d4] px-3 py-2 focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1] outline-none">
                <option value="pending">Pending Payment</option>
                <option value="processing">Processing</option>
                <option value="on-hold">On Hold</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Order Items</label>
              <div className="border border-[#ccd0d4] p-4 bg-gray-50 text-center text-sm text-gray-500">
                <button className="text-[#2271b1] hover:underline">Add items to order</button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end pt-6 border-t">
          <button className="px-6 py-2 bg-[#2271b1] text-white font-medium hover:bg-[#135e96] transition-colors rounded shadow-sm">
            Create Order
          </button>
        </div>
      </div>
    );
  }

  const filteredOrders = orders.filter(order => 
    order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50 p-3 border border-[#ccd0d4]">
        <div className="flex items-center space-x-2">
          <select className="border border-[#ccd0d4] bg-white px-2 py-1 text-sm focus:border-[#2271b1] outline-none">
            <option>All dates</option>
            <option>March 2024</option>
            <option>February 2024</option>
          </select>
          <select className="border border-[#ccd0d4] bg-white px-2 py-1 text-sm focus:border-[#2271b1] outline-none">
            <option>Filter by customer</option>
          </select>
          <button className="px-3 py-1 border border-[#ccd0d4] bg-white hover:bg-[#f6f7f7] text-sm font-medium">Filter</button>
        </div>
        <div className="relative">
          <input 
            type="text" 
            placeholder="Search orders..." 
            className="border border-[#ccd0d4] bg-white px-3 py-1 pl-8 text-sm focus:border-[#2271b1] outline-none w-full md:w-64"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1.5" />
        </div>
      </div>

      {/* Orders Table */}
      <div className="border border-[#ccd0d4] overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-white border-b border-[#ccd0d4]">
              <th className="px-4 py-3 font-semibold text-[#1d2327] w-10">
                <input type="checkbox" className="border-[#ccd0d4]" />
              </th>
              <th className="px-4 py-3 font-semibold text-[#1d2327]">Order</th>
              <th className="px-4 py-3 font-semibold text-[#1d2327]">Date</th>
              <th className="px-4 py-3 font-semibold text-[#1d2327]">Status</th>
              <th className="px-4 py-3 font-semibold text-[#1d2327]">Total</th>
              <th className="px-4 py-3 font-semibold text-[#1d2327] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length > 0 ? (
              filteredOrders.map((order) => {
                const StatusIcon = statusIcons[order.status] || AlertCircle;
                return (
                  <tr key={order.id} className="border-b border-[#f0f0f1] hover:bg-[#f6f7f7] transition-colors group">
                    <td className="px-4 py-4">
                      <input type="checkbox" className="border-[#ccd0d4]" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <Link href={`/${slug}/admin/orders/${order.id}`} className="text-[#2271b1] font-bold hover:text-[#135e96]">
                          #{order.id} {order.customerName}
                        </Link>
                        <span className="text-xs text-gray-500 mt-1">{order.customerEmail}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-600">
                      {new Date(order.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium",
                        statusColors[order.status]
                      )}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-medium">
                      {formatCurrency(order.total, "IDR")}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleViewOrder(order)}
                          className="p-1 hover:bg-gray-200 rounded text-gray-600" 
                          title="View Order"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-1 hover:bg-gray-200 rounded text-red-600" title="Delete Order">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button className="p-1 hover:bg-gray-200 rounded text-gray-600">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500 italic">
                  No orders found matching your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
           <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200">
              <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                 <div>
                    <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                       Order #{selectedOrder.id}
                       <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                          statusColors[selectedOrder.status]
                       )}>
                          {selectedOrder.status}
                       </span>
                    </h2>
                    <p className="text-xs text-gray-500 font-medium mt-1">Placed on {new Date(selectedOrder.date).toLocaleString()}</p>
                 </div>
                 <button 
                    onClick={() => {
                       setSelectedOrder(null);
                       setOrderDetails(null);
                    }}
                    className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                 >
                    <X className="w-5 h-5 text-gray-500" />
                 </button>
              </div>

              <div className="p-8 overflow-y-auto max-h-[70vh] custom-scrollbar">
                 {loadingDetails ? (
                    <div className="flex flex-col items-center justify-center py-12">
                       <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-4" />
                       <p className="text-sm text-gray-400 font-bold uppercase tracking-widest">Loading details...</p>
                    </div>
                 ) : (
                    <div className="space-y-8">
                       {/* Customer Info */}
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                             <div className="flex items-center gap-2 text-blue-600 mb-3">
                                <User className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Customer Info</span>
                             </div>
                             <p className="text-sm font-bold text-gray-900">{selectedOrder.customerName || "Walk-in Customer"}</p>
                             <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                <Phone className="w-3 h-3" />
                                <span>{selectedOrder.customerPhone}</span>
                             </div>
                          </div>

                          <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100">
                             <div className="flex items-center gap-2 text-orange-600 mb-3">
                                <MapPin className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Service Info</span>
                             </div>
                             <p className="text-sm font-bold text-gray-900">
                                {selectedOrder.tableNumber ? `Table: ${selectedOrder.tableNumber}` : "Direct Order / POS"}
                             </p>
                             <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                <CreditCard className="w-3 h-3" />
                                <span className="capitalize">{selectedOrder.paymentMethod || "Manual"}</span>
                             </div>
                          </div>
                       </div>

                       {/* Items List */}
                       <div>
                          <div className="flex items-center gap-2 text-gray-400 mb-4">
                             <Package className="w-4 h-4" />
                             <span className="text-[10px] font-black uppercase tracking-widest">Order Items</span>
                          </div>
                          <div className="space-y-3">
                             {orderDetails?.items.map((item: any) => (
                                <div key={item.id} className="flex justify-between items-center p-3 border border-gray-50 rounded-xl bg-gray-50/30">
                                   <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-white rounded-lg border border-gray-100 flex items-center justify-center overflow-hidden">
                                         {item.product.image ? (
                                            <img src={item.product.image} className="w-full h-full object-cover" />
                                         ) : (
                                            <Package className="w-4 h-4 text-gray-200" />
                                         )}
                                      </div>
                                      <div>
                                         <p className="text-sm font-bold text-gray-900">{item.product.name}</p>
                                         <p className="text-[10px] text-gray-400 font-medium">{formatCurrency(item.price, "IDR")} x {item.quantity}</p>
                                      </div>
                                   </div>
                                   <p className="text-sm font-black text-gray-900">{formatCurrency(item.price * item.quantity, "IDR")}</p>
                                </div>
                             ))}
                          </div>
                       </div>

                       {/* Totals Breakdown */}
                       <div className="pt-6 border-t border-dashed border-gray-200 space-y-2">
                          <div className="flex justify-between text-sm text-gray-500">
                             <span>Subtotal</span>
                             <span>{formatCurrency(selectedOrder.total - (selectedOrder.taxAmount || 0) - (selectedOrder.serviceCharge || 0) - (selectedOrder.paymentFee || 0), "IDR")}</span>
                          </div>
                          {selectedOrder.taxAmount > 0 && (
                             <div className="flex justify-between text-sm text-gray-500">
                                <span>Tax</span>
                                <span>{formatCurrency(selectedOrder.taxAmount, "IDR")}</span>
                             </div>
                          )}
                          {selectedOrder.serviceCharge > 0 && (
                             <div className="flex justify-between text-sm text-gray-500">
                                <span>Service Charge</span>
                                <span>{formatCurrency(selectedOrder.serviceCharge, "IDR")}</span>
                             </div>
                          )}
                          {selectedOrder.paymentFee > 0 && (
                             <div className="flex justify-between text-sm text-gray-500">
                                <span>Payment Fee</span>
                                <span className="text-orange-600">+{formatCurrency(selectedOrder.paymentFee, "IDR")}</span>
                             </div>
                          )}
                          <div className="flex justify-between text-lg font-black text-gray-900 pt-2">
                             <span>Total</span>
                             <span className="text-blue-600">{formatCurrency(selectedOrder.total, "IDR")}</span>
                          </div>
                       </div>
                    </div>
                 )}
              </div>

              <div className="p-6 bg-gray-50 border-t flex gap-3">
                 <button 
                    onClick={() => {
                       setSelectedOrder(null);
                       setOrderDetails(null);
                    }}
                    className="flex-1 py-3 bg-white border border-gray-200 rounded-xl text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-100 transition-all"
                 >
                    Close
                 </button>
                 <button className="flex-1 py-3 bg-blue-600 rounded-xl text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all">
                    Print Invoice
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Pagination Simulation */}
      <div className="flex items-center justify-between text-sm text-gray-600 py-2">
        <div>{filteredOrders.length} items</div>
        <div className="flex items-center space-x-1">
          <button className="p-1 border border-[#ccd0d4] bg-white text-gray-400 cursor-not-allowed">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-3 py-1 border border-[#ccd0d4] bg-[#f0f0f1] font-medium">1</div>
          <button className="p-1 border border-[#ccd0d4] bg-white hover:bg-[#f6f7f7]">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
