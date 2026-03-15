"use client";

import { useState } from "react";
import { 
  Search, 
  Eye, 
  Trash2, 
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  User,
  MapPin,
  CreditCard,
  Package,
  Phone,
  RefreshCw,
  X,
  AlertCircle,
  CheckCircle2,
  Clock,
  PauseCircle,
  XCircle,
  RefreshCcw,
  Ban
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { getOrderDetails } from "@/lib/api";

const statusIcons: Record<string, any> = {
  'completed': CheckCircle2,
  'paid': CheckCircle2,
  'processing': Clock,
  'on-hold': PauseCircle,
  'cancelled': XCircle,
  'refunded': RefreshCcw,
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

const shipmentStatusColors: Record<string, string> = {
  quote_ready: "bg-blue-100 text-blue-700",
  draft_created: "bg-indigo-100 text-indigo-700",
  courier_selected: "bg-purple-100 text-purple-700",
  booking_failed: "bg-red-100 text-red-700",
  confirmed: "bg-green-100 text-green-700",
  allocated: "bg-cyan-100 text-cyan-700",
  picking_up: "bg-yellow-100 text-yellow-700",
  on_going: "bg-amber-100 text-amber-700",
  delivered: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-700"
};

export default function OrdersTable({ initialOrders, slug, canForcePaid = false }: { initialOrders: any[], slug: string, canForcePaid?: boolean }) {
  const [orders, setOrders] = useState<any[]>(initialOrders);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);

  const formatShipmentStatus = (value?: string | null) => {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "-";
    return raw.replace(/_/g, " ");
  };

  const shipmentStatusClass = (value?: string | null) => {
    const raw = String(value || "").trim().toLowerCase();
    return shipmentStatusColors[raw] || "bg-gray-100 text-gray-700";
  };

  const filteredOrders = orders.filter(order => 
    order.customerPhone.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleForceMarkPaid = async (orderId: string) => {
    if (processingOrderId) return;
    setProcessingOrderId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/mark-paid`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        alert(data?.error || "Failed to mark order as paid");
        return;
      }
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: "paid",
                biteshipOrderId: data?.order?.biteshipOrderId ?? o.biteshipOrderId,
                shippingTrackingNo: data?.order?.shippingTrackingNo ?? o.shippingTrackingNo,
                shippingStatus: data?.order?.shippingStatus ?? o.shippingStatus
              }
            : o
        )
      );
      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev: any) =>
          prev
            ? {
                ...prev,
                status: "paid",
                biteshipOrderId: data?.order?.biteshipOrderId ?? prev.biteshipOrderId,
                shippingTrackingNo: data?.order?.shippingTrackingNo ?? prev.shippingTrackingNo,
                shippingStatus: data?.order?.shippingStatus ?? prev.shippingStatus
              }
            : prev
        );
      }
    } catch {
      alert("Failed to mark order as paid");
    } finally {
      setProcessingOrderId(null);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!confirm("Are you sure you want to cancel this order? This will also attempt to cancel the order on Biteship.")) return;
    if (processingOrderId) return;
    setProcessingOrderId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        alert(data?.error || "Failed to cancel order");
        return;
      }
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: "cancelled" }
            : o
        )
      );
      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev: any) =>
          prev ? { ...prev, status: "cancelled" } : prev
        );
      }
    } catch {
      alert("Failed to cancel order");
    } finally {
      setProcessingOrderId(null);
    }
  };

  const handleViewOrder = async (order: any) => {
    setSelectedOrder(order);
    setLoadingDetails(true);
    const details = await getOrderDetails(parseInt(order.id));
    setOrderDetails(details);
    setLoadingDetails(false);
  };

  return (
    <div className="space-y-4">
      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50 dark:bg-gray-800/50 p-3 border border-[#ccd0d4] dark:border-gray-800 transition-colors">
        <div className="flex items-center space-x-2">
          <select className="border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-2 py-1 text-sm focus:border-[#2271b1] dark:focus:border-blue-500 outline-none dark:text-white transition-colors">
            <option>All dates</option>
          </select>
          <button className="px-3 py-1 border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 hover:bg-[#f6f7f7] dark:hover:bg-gray-700 text-sm font-medium dark:text-gray-200 transition-colors">Filter</button>
        </div>
        <div className="relative">
          <input 
            type="text" 
            placeholder="Search orders..." 
            className="border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1 pl-8 text-sm focus:border-[#2271b1] dark:focus:border-blue-500 outline-none w-full md:w-64 dark:text-white transition-colors"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1.5" />
        </div>
      </div>

      {/* Orders Table */}
      <div className="border border-[#ccd0d4] dark:border-gray-800 overflow-x-auto transition-colors">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-white dark:bg-gray-800 border-b border-[#ccd0d4] dark:border-gray-800">
              <th className="px-4 py-3 font-semibold text-[#1d2327] dark:text-gray-200 w-10">
                <input type="checkbox" className="border-[#ccd0d4] dark:border-gray-700 dark:bg-gray-900" />
              </th>
              <th className="px-4 py-3 font-semibold text-[#1d2327] dark:text-gray-200">Order</th>
              <th className="px-4 py-3 font-semibold text-[#1d2327] dark:text-gray-200">Date</th>
              <th className="px-4 py-3 font-semibold text-[#1d2327] dark:text-gray-200">Status</th>
              <th className="px-4 py-3 font-semibold text-[#1d2327] dark:text-gray-200">Total</th>
              <th className="px-4 py-3 font-semibold text-[#1d2327] dark:text-gray-200 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length > 0 ? (
              filteredOrders.map((order) => {
                const StatusIcon = statusIcons[order.status] || AlertCircle;
                return (
                  <tr key={order.id} className="border-b border-[#f0f0f1] dark:border-gray-800 hover:bg-[#f6f7f7] dark:hover:bg-gray-800/50 transition-colors group">
                    <td className="px-4 py-4">
                      <input type="checkbox" className="border-[#ccd0d4] dark:border-gray-700 dark:bg-gray-900" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <button onClick={() => handleViewOrder(order)} className="text-[#2271b1] dark:text-blue-400 font-bold hover:text-[#135e96] dark:hover:text-blue-300 text-left">
                          #{order.id} {order.customerName}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-600 dark:text-gray-400">
                      {new Date(order.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1.5">
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium w-fit",
                          statusColors[order.status]
                        )}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </span>
                        {order.shippingProvider && (
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider w-fit",
                            shipmentStatusClass(order.shippingStatus)
                          )}>
                            Ship: {formatShipmentStatus(order.shippingStatus)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-medium dark:text-gray-200">
                      {formatCurrency(order.total, "IDR")}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canForcePaid && order.status === "pending" && (
                          <>
                            <button
                              onClick={() => handleForceMarkPaid(order.id)}
                              disabled={processingOrderId === order.id}
                              className="px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-60 disabled:cursor-not-allowed"
                              title="Mark as Paid"
                            >
                              {processingOrderId === order.id ? "Processing..." : "Mark Paid"}
                            </button>
                            <button
                              onClick={() => handleCancelOrder(order.id)}
                              disabled={processingOrderId === order.id}
                              className="px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-60 disabled:cursor-not-allowed"
                              title="Cancel Order"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {canForcePaid && order.status === "paid" && (
                          <button
                            onClick={() => handleCancelOrder(order.id)}
                            disabled={processingOrderId === order.id}
                            className="px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-60 disabled:cursor-not-allowed"
                            title="Cancel Order"
                          >
                            Cancel
                          </button>
                        )}
                        <button 
                          onClick={() => handleViewOrder(order)}
                          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-400 transition-colors" 
                          title="View Order"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-red-600 dark:text-red-400 transition-colors" title="Delete Order">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 italic">
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
           <div className="bg-white dark:bg-[#1A1D21] border dark:border-gray-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200">
              <div className="p-6 border-b dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 transition-colors">
                 <div>
                    <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                       Order #{selectedOrder.id}
                       <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                          statusColors[selectedOrder.status]
                       )}>
                          {selectedOrder.status}
                       </span>
                       {selectedOrder.shippingProvider && (
                         <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                            shipmentStatusClass(selectedOrder.shippingStatus)
                         )}>
                            Ship: {formatShipmentStatus(selectedOrder.shippingStatus)}
                         </span>
                       )}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-1">Placed on {new Date(selectedOrder.date).toLocaleString()}</p>
                 </div>
                 <button 
                    onClick={() => {
                       setSelectedOrder(null);
                       setOrderDetails(null);
                    }}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors"
                 >
                    <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
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
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800 transition-colors">
                             <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-3">
                                <User className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Customer Info</span>
                             </div>
                             <p className="text-sm font-bold text-gray-900 dark:text-white">{selectedOrder.customerName || "Walk-in Customer"}</p>
                             <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                <Phone className="w-3 h-3" />
                                <span>{selectedOrder.customerPhone}</span>
                             </div>
                          </div>

                          <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-2xl border border-orange-100 dark:border-orange-800 transition-colors">
                             <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-3">
                                <MapPin className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Service Info</span>
                             </div>
                             <p className="text-sm font-bold text-gray-900 dark:text-white">
                                {selectedOrder.orderType === "TAKEAWAY"
                                  ? "Takeaway / Delivery"
                                  : selectedOrder.tableNumber
                                    ? `Table: ${selectedOrder.tableNumber}`
                                    : "Direct Order / POS"}
                             </p>
                             <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                <CreditCard className="w-3 h-3" />
                                <span className="capitalize">{selectedOrder.paymentMethod || "Manual"}</span>
                             </div>
                             {selectedOrder.shippingProvider && (
                                <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
                                  <p>Courier: <span className="font-bold">{selectedOrder.shippingProvider} {selectedOrder.shippingService || ""}</span></p>
                                  <p>
                                    Status:
                                    <span className={cn(
                                      "ml-1 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                                      shipmentStatusClass(selectedOrder.shippingStatus)
                                    )}>
                                      {formatShipmentStatus(selectedOrder.shippingStatus)}
                                    </span>
                                  </p>
                                  <p>Biteship ID: <span className="font-bold">{selectedOrder.biteshipOrderId || "-"}</span></p>
                                  <p>Resi: <span className="font-bold">{selectedOrder.shippingTrackingNo || "-"}</span></p>
                                </div>
                             )}
                          </div>
                       </div>

                       <div>
                          <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 mb-4 transition-colors">
                             <span className="text-[10px] font-black uppercase tracking-widest">Order Items</span>
                          </div>
                          <div className="space-y-3">
                             {orderDetails?.items.map((item: any) => (
                                <div key={item.id} className="flex justify-between items-center p-3 border border-gray-50 dark:border-gray-800 rounded-xl bg-gray-50/30 dark:bg-gray-800/20 transition-colors">
                                   <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-800 flex items-center justify-center overflow-hidden transition-colors">
                                         {item.product.image ? (
                                            <img src={item.product.image} className="w-full h-full object-cover" />
                                         ) : (
                                            <Package className="w-4 h-4 text-gray-200 dark:text-gray-700" />
                                         )}
                                      </div>
                                      <div>
                                         <p className="text-sm font-bold text-gray-900 dark:text-white">{item.product.name}</p>
                                         <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{formatCurrency(item.price, "IDR")} x {item.quantity}</p>
                                      </div>
                                   </div>
                                   <p className="text-sm font-black text-gray-900 dark:text-white">{formatCurrency(item.price * item.quantity, "IDR")}</p>
                                </div>
                             ))}
                          </div>
                       </div>

                       <div className="pt-6 border-t border-dashed border-gray-200 dark:border-gray-800 space-y-2 transition-colors">
                          <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                             <span>Subtotal</span>
                             <span>{formatCurrency(selectedOrder.total - (selectedOrder.taxAmount || 0) - (selectedOrder.serviceCharge || 0) - (selectedOrder.paymentFee || 0), "IDR")}</span>
                          </div>
                          {selectedOrder.taxAmount > 0 && (
                             <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                                <span>Tax</span>
                                <span>{formatCurrency(selectedOrder.taxAmount, "IDR")}</span>
                             </div>
                          )}
                          {selectedOrder.serviceCharge > 0 && (
                             <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                                <span>Service Charge</span>
                                <span>{formatCurrency(selectedOrder.serviceCharge, "IDR")}</span>
                             </div>
                          )}
                          {selectedOrder.paymentFee > 0 && (
                             <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                                <span>Payment Fee</span>
                                <span className="text-orange-600 dark:text-orange-400">+{formatCurrency(selectedOrder.paymentFee, "IDR")}</span>
                             </div>
                          )}
                          {selectedOrder.shippingCost > 0 && (
                             <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                                <span>Shipping</span>
                                <span>+{formatCurrency(selectedOrder.shippingCost, "IDR")}</span>
                             </div>
                          )}
                          <div className="flex justify-between text-lg font-black text-gray-900 dark:text-white pt-2 transition-colors">
                             <span>Total</span>
                             <span className="text-blue-600 dark:text-blue-400">{formatCurrency(selectedOrder.total, "IDR")}</span>
                          </div>
                       </div>
                    </div>
                 )}
              </div>

              <div className="p-6 bg-gray-50 dark:bg-gray-800/50 border-t dark:border-gray-800 flex gap-3 transition-colors">
                 <button onClick={() => { setSelectedOrder(null); setOrderDetails(null); }} className="flex-1 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">Close</button>
                 <button className="flex-1 py-3 bg-blue-600 rounded-xl text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all">Print Invoice</button>
              </div>
           </div>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 py-2 transition-colors">
        <div>{filteredOrders.length} items</div>
        <div className="flex items-center space-x-1">
          <button className="p-1 border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed transition-colors"><ChevronLeft className="w-4 h-4" /></button>
          <div className="px-3 py-1 border border-[#ccd0d4] dark:border-gray-800 bg-[#f0f0f1] dark:bg-gray-800 font-medium dark:text-gray-200 transition-colors">1</div>
          <button className="p-1 border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 hover:bg-[#f6f7f7] dark:hover:bg-gray-700 transition-colors"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}
