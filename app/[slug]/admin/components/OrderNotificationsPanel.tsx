"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  id: number;
  orderId: number;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
};

function formatIsoHourMinute(iso: string) {
  if (!iso) return "--:--";
  const time = iso.split("T")[1];
  if (!time) return "--:--";
  return time.slice(0, 5);
}

export default function OrderNotificationsPanel({
  storeId,
  slug,
  initialNotifications = [],
}: {
  storeId: number;
  slug: string;
  initialNotifications?: Row[];
}) {
  const [items, setItems] = useState<Row[]>(initialNotifications);
  const unreadCount = useMemo(() => items.filter((i) => !i.isRead).length, [items]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/order-notifications?slug=${encodeURIComponent(String(slug || ""))}&limit=25`, { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to load notifications");
      }
      setItems(payload.notifications as any);
    } catch (error: any) {
      const message = String(error?.message || error || "");
      if (message.includes("Failed to find Server Action")) {
        window.location.reload();
      }
    }
  }, [slug, storeId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  const markRead = async (id: number) => {
    const res = await fetch("/api/admin/order-notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, id })
    }).catch(() => null);
    const payload = res ? await res.json().catch(() => null) : null;
    const ok = Boolean(payload?.success);
    if (ok) setItems((prev) => prev.map((p) => (p.id === id ? { ...p, isRead: true } : p)));
  };

  const markAllRead = async () => {
    // Optimistic UI update
    setItems((prev) => prev.map((p) => ({ ...p, isRead: true })));
    
    const res = await fetch("/api/admin/order-notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, action: "mark_all_read" })
    }).catch(() => null);
    const payload = res ? await res.json().catch(() => null) : null;
    const ok = Boolean(payload?.success);
    if (!ok) {
      // Rollback on failure
      refresh();
    } else {
      // Small delay to ensure DB consistency before refresh
      setTimeout(refresh, 500);
    }
  };

  return (
    <div className="bg-white dark:bg-[#1A1D21] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden transition-colors">
      <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("p-2 rounded-xl", unreadCount ? "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400" : "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400")}>
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-gray-900 dark:text-white">Notifications</div>
            <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
              {unreadCount ? `${unreadCount} unread` : "All caught up"}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={markAllRead}
          className="text-xs font-black uppercase tracking-widest text-primary dark:text-blue-400 hover:text-orange-700 dark:hover:text-blue-300"
          disabled={!unreadCount}
        >
          Mark all read
        </button>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-6 text-sm text-gray-500 dark:text-gray-400 italic">No notifications yet.</div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {items.map((n) => (
              <div key={n.id} className={cn("p-5 flex gap-4 items-start", !n.isRead ? "bg-orange-50/40 dark:bg-orange-900/10" : "")}>
                <div className={cn("w-2 h-2 rounded-full mt-1.5", !n.isRead ? "bg-orange-500" : "bg-gray-300 dark:bg-gray-700")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                       {n.type === 'NEW_ORDER' ? '🛒 Pesanan Baru' : (n.type === 'PAYMENT_SUCCESS' ? '✅ Pembayaran Lunas' : '🔔 Notifikasi Order')}
                    </div>
                    <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest shrink-0">
                      {formatIsoHourMinute(n.createdAt)}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                    {n.message || (n.type === 'NEW_ORDER' ? 'Ada pesanan baru masuk.' : 'Silakan cek detail pesanan.')}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                      Order #{n.orderId}
                    </div>
                    {!n.isRead && (
                      <button
                        type="button"
                        onClick={() => markRead(n.id)}
                        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary dark:text-blue-400 hover:text-orange-700 dark:hover:text-blue-300"
                      >
                        <Check className="w-3 h-3" />
                        Read
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
