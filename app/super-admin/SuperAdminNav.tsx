"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Users, Store, Settings, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SuperAdminNav({ totalStores }: { totalStores?: number }) {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-4">
      <nav className="flex items-center bg-white p-1 rounded-lg shadow-sm mr-4">
        <Link 
          href="/super-admin" 
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors",
            pathname === "/super-admin" ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          )}
        >
          <Store className="w-4 h-4 mr-2" />
          Stores
        </Link>
        <Link 
          href="/super-admin/withdrawals" 
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors",
            pathname === "/super-admin/withdrawals" ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          )}
        >
          <Wallet className="w-4 h-4 mr-2" />
          Withdrawals
        </Link>
        <Link 
          href="/super-admin/users" 
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors",
            pathname === "/super-admin/users" ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          )}
        >
          <Users className="w-4 h-4 mr-2" />
          Users
        </Link>
        <Link 
          href="/super-admin/settings" 
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors",
            pathname === "/super-admin/settings" ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          )}
        >
          <Settings className="w-4 h-4 mr-2" />
          Settings
        </Link>
      </nav>

      {totalStores !== undefined && (
        <div className="bg-white px-4 py-2 rounded-lg shadow-sm">
          <span className="text-sm text-gray-500">Total Stores</span>
          <p className="text-xl font-bold">{totalStores}</p>
        </div>
      )}
      
      <button 
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="flex items-center bg-white px-4 py-3 rounded-lg shadow-sm text-gray-700 hover:text-red-600 hover:bg-red-50 transition-colors"
      >
        <LogOut className="w-4 h-4 mr-2" />
        <span className="font-medium">Logout</span>
      </button>
    </div>
  );
}
