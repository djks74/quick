"use client";

import { CurrencyProvider } from "@/context/CurrencyContext";
import { AdminProvider } from "@/lib/admin-context";
import { ShopProvider } from "@/context/ShopContext";
import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AdminProvider>
        <ShopProvider>
          <CurrencyProvider>
            {children}
          </CurrencyProvider>
        </ShopProvider>
      </AdminProvider>
    </SessionProvider>
  );
}
