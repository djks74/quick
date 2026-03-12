"use client";

import { useState } from "react";
import { Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleStoreStatus } from "@/lib/api";

export default function StoreStatusToggle({ initialStore }: { initialStore: any }) {
  const [store, setStore] = useState(initialStore);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleToggleStatus = async () => {
    if (!store || isUpdating) return;
    
    setIsUpdating(true);
    const newStatus = !store.isOpen;
    const result = await toggleStoreStatus(store.id, newStatus);
    
    if (result) {
      setStore(result);
    }
    setIsUpdating(false);
  };

  return (
    <div className="bg-white dark:bg-[#1A1D21] p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between transition-colors">
      <div className="flex items-center gap-4">
        <div className={cn(
          "p-3 rounded-xl transition-colors",
          store?.isOpen 
            ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" 
            : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
        )}>
          <Power className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-black text-gray-900 dark:text-white">
            {store?.isOpen ? "Store is Open" : "Store is Closed"}
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">
            {store?.isOpen 
              ? "Customers can currently place orders." 
              : "The storefront will show 'Closed' and block new orders."}
          </p>
        </div>
      </div>
      
      <button
        onClick={handleToggleStatus}
        disabled={isUpdating}
        className={cn(
          "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-50",
          store?.isOpen 
            ? "bg-red-600 text-white shadow-red-500/20 hover:bg-red-700" 
            : "bg-green-600 text-white shadow-green-500/20 hover:bg-green-700"
        )}
      >
        {isUpdating ? "Updating..." : store?.isOpen ? "Close Store" : "Open Store"}
      </button>
    </div>
  );
}
