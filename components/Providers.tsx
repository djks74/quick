"use client";

import { CurrencyProvider } from "@/context/CurrencyContext";
import { AdminProvider } from "@/lib/admin-context";
import { ShopProvider } from "@/context/ShopContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminProvider>
      <ShopProvider>
        <CurrencyProvider>
          {children}
        </CurrencyProvider>
      </ShopProvider>
    </AdminProvider>
  );
}
