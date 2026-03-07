"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type AdminLayoutStyle = "wordpress" | "modern" | "minimal";

interface AdminContextType {
  layoutStyle: AdminLayoutStyle;
  setLayoutStyle: (style: AdminLayoutStyle) => void;
  siteName: string;
  setSiteName: (name: string) => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [layoutStyle, setLayoutStyleState] = useState<AdminLayoutStyle>("wordpress");
  const [siteName, setSiteNameState] = useState("LCP Auto Cars");

  // Load from localStorage on mount
  useEffect(() => {
    const savedLayout = localStorage.getItem("admin_layout_style") as AdminLayoutStyle;
    if (savedLayout) setLayoutStyleState(savedLayout);
    
    const savedSiteName = localStorage.getItem("admin_site_name");
    if (savedSiteName) setSiteNameState(savedSiteName);
  }, []);

  const setLayoutStyle = (style: AdminLayoutStyle) => {
    setLayoutStyleState(style);
    localStorage.setItem("admin_layout_style", style);
  };

  const setSiteName = (name: string) => {
    setSiteNameState(name);
    localStorage.setItem("admin_site_name", name);
  };

  return (
    <AdminContext.Provider value={{ layoutStyle, setLayoutStyle, siteName, setSiteName }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
}
