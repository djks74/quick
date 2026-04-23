"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Users, Store, Settings, Wallet, BarChart3, Globe, Sparkles, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import ThemeToggle from "@/components/ThemeToggle";

export default function SuperAdminNav({ totalStores }: { totalStores?: number }) {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-4">
      <nav className="flex items-center bg-white dark:bg-[#1A1D21] p-1 rounded-lg shadow-sm mr-2 border border-gray-100 dark:border-gray-800">
        <Link 
          href="/super-admin" 
          className={cn(
            "px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center transition-colors",
            pathname === "/super-admin" 
              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" 
              : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <Store className="w-3 h-3 mr-1.5" />
          Stores
        </Link>
        <Link 
          href="/super-admin/assistant" 
          className={cn(
            "px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center transition-colors",
            pathname === "/super-admin/assistant" 
              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" 
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <Sparkles className="w-3 h-3 mr-1.5 text-primary" />
          Assistant
        </Link>
        <Link 
          href="/super-admin/analytics" 
          className={cn(
            "px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center transition-colors",
            pathname === "/super-admin/analytics" 
              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" 
              : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <BarChart3 className="w-3 h-3 mr-1.5" />
          Stats
        </Link>
        <Link 
          href="/super-admin/traffic" 
          className={cn(
            "px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center transition-colors",
            pathname === "/super-admin/traffic" 
              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" 
              : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <Globe className="w-3 h-3 mr-1.5" />
          Traffic
        </Link>
        <Link 
          href="/super-admin/wa-usage" 
          className={cn(
            "px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center transition-colors",
            pathname === "/super-admin/wa-usage" 
              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" 
              : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <MessageSquare className="w-3 h-3 mr-1.5" />
          WhatsApp
        </Link>
        <Link 
          href="/super-admin/withdrawals" 
          className={cn(
            "px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center transition-colors",
            pathname === "/super-admin/withdrawals" 
              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" 
              : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <Wallet className="w-3 h-3 mr-1.5" />
          Payouts
        </Link>
        <Link 
          href="/super-admin/users" 
          className={cn(
            "px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center transition-colors",
            pathname === "/super-admin/users" 
              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" 
              : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <Users className="w-3 h-3 mr-1.5" />
          Users
        </Link>
        <Link 
          href="/super-admin/settings" 
          className={cn(
            "px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center transition-colors",
            pathname === "/super-admin/settings" 
              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" 
              : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <Settings className="w-3 h-3 mr-1.5" />
          System
        </Link>
      </nav>

      {totalStores !== undefined && (
        <div className="bg-white dark:bg-[#1A1D21] px-3 py-1.5 rounded-lg shadow-sm mr-2 border border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total</span>
          <p className="text-sm font-black dark:text-white">{totalStores}</p>
        </div>
      )}
      
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <button 
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center bg-white dark:bg-[#1A1D21] px-3 py-2 rounded-lg shadow-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border border-gray-100 dark:border-gray-800"
        >
          <LogOut className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
