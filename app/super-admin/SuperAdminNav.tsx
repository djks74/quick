"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Users, Store, Settings, Wallet, BarChart3, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import ThemeToggle from "@/components/ThemeToggle";

export default function SuperAdminNav({ totalStores }: { totalStores?: number }) {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-4">
      <nav className="flex items-center bg-white dark:bg-[#1A1D21] p-1 rounded-lg shadow-sm mr-4 border border-gray-100 dark:border-gray-800">
        <Link 
          href="/super-admin" 
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors",
            pathname === "/super-admin" 
              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" 
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <Store className="w-4 h-4 mr-2" />
          Stores
        </Link>
        <Link 
          href="/super-admin/analytics" 
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors",
            pathname === "/super-admin/analytics" 
              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" 
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Analytics
        </Link>
        <Link 
          href="/super-admin/traffic" 
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors",
            pathname === "/super-admin/traffic" 
              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" 
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <Globe className="w-4 h-4 mr-2" />
          Traffic
        </Link>
        <Link 
          href="/super-admin/withdrawals" 
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors",
            pathname === "/super-admin/withdrawals" 
              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" 
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <Wallet className="w-4 h-4 mr-2" />
          Withdrawals
        </Link>
        <Link 
          href="/super-admin/users" 
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors",
            pathname === "/super-admin/users" 
              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" 
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <Users className="w-4 h-4 mr-2" />
          Users
        </Link>
        <Link 
          href="/super-admin/settings" 
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors",
            pathname === "/super-admin/settings" 
              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white" 
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <Settings className="w-4 h-4 mr-2" />
          Settings
        </Link>
      </nav>

      {totalStores !== undefined && (
        <div className="bg-white dark:bg-[#1A1D21] px-4 py-2 rounded-lg shadow-sm border border-gray-100 dark:border-gray-800">
          <span className="text-sm text-gray-500 dark:text-gray-400">Total Stores</span>
          <p className="text-xl font-bold dark:text-white">{totalStores}</p>
        </div>
      )}
      
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <button 
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center bg-white dark:bg-[#1A1D21] px-4 py-2.5 rounded-lg shadow-sm text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border border-gray-100 dark:border-gray-800"
        >
          <LogOut className="w-4 h-4 mr-2" />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
}
