"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Settings, 
  LogOut,
  ChevronRight,
  ChevronDown,
  Layers,
  Plus,
  Home,
  MousePointer2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/lib/admin-context";
import { signOut } from "next-auth/react";

interface SidebarItem {
  name: string;
  href?: string;
  icon: any;
  children?: { name: string; href: string }[];
}

export default function AdminShell({
  children,
  store,
  isSuperAdmin
}: {
  children: React.ReactNode;
  store: any;
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const { layoutStyle, siteName } = useAdmin();
  const [openMenus, setOpenMenus] = useState<string[]>(["Products", "Orders", "Pages", "Appearance"]);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  
  const slug = store.slug;
  const baseUrl = `/${slug}/admin`;

  const sidebarItems: SidebarItem[] = [
    { name: "Dashboard", href: baseUrl, icon: LayoutDashboard },
    { 
      name: "Products", 
      icon: Package,
      children: [
        { name: "All Products", href: `${baseUrl}/products` },
        { name: "Categories", href: `${baseUrl}/products?view=categories` },
      ]
    },
    { 
      name: "Orders", 
      href: `${baseUrl}/orders`,
      icon: ShoppingCart,
    },
    // Settings hidden for non-Super Admin
    ...(isSuperAdmin ? [{ 
      name: "Settings", 
      href: `${baseUrl}/settings`, 
      icon: Settings 
    }] : []),
    { 
      name: "Tables", 
      href: `${baseUrl}/tables`, 
      icon: Layers 
    },
  ];

  const toggleMenu = (name: string) => {
    setOpenMenus(prev => 
      prev.includes(name) 
        ? prev.filter(m => m !== name) 
        : [...prev, name]
    );
  };

  const isModern = layoutStyle === "modern";
  const isMinimal = layoutStyle === "minimal";

  return (
    <div className={cn(
      "flex flex-col min-h-screen",
      isModern ? "bg-[#f8fafc]" : isMinimal ? "bg-white" : "bg-[#f0f0f1]"
    )}>
      {/* WordPress Top Admin Bar */}
      <header className={cn(
        "h-[32px] flex items-center justify-between px-4 fixed top-0 w-full z-[100] text-sm transition-colors",
        isModern ? "bg-white border-b border-gray-200 text-gray-600" : 
        isMinimal ? "bg-white/80 backdrop-blur-md border-b border-gray-100 text-gray-800" : 
        "bg-[#1d2327] text-[#c3c4c7]"
      )}>
        <div className="flex items-center h-full">
          {/* Site Name Link */}
          <Link href={`/${slug}`} target="_blank" className={cn(
            "flex items-center space-x-2 px-3 h-full transition-colors group",
            isModern ? "hover:bg-gray-50 text-primary" : 
            isMinimal ? "hover:bg-gray-50 text-gray-900" : 
            "hover:bg-[#2c3338] hover:text-[#72aee6]"
          )}>
            <Home className="w-4 h-4" />
            <span className="font-medium">{store.name}</span>
          </Link>

          {/* + New Dropdown */}
          <div className="relative h-full">
            <button 
              onMouseEnter={() => setIsNewMenuOpen(true)}
              onMouseLeave={() => setIsNewMenuOpen(false)}
              className={cn(
                "flex items-center space-x-1 px-3 h-full transition-colors",
                isModern ? "hover:bg-gray-50" : 
                isMinimal ? "hover:bg-gray-50" : 
                "hover:bg-[#2c3338] hover:text-[#72aee6]"
              )}
            >
              <Plus className="w-4 h-4" />
              <span>New</span>
            </button>
            {isNewMenuOpen && (
              <div 
                onMouseEnter={() => setIsNewMenuOpen(true)}
                onMouseLeave={() => setIsNewMenuOpen(false)}
                className={cn(
                  "absolute top-full left-0 w-40 shadow-xl py-1 border-t",
                  isModern || isMinimal ? "bg-white border-gray-200" : "bg-[#2c3338] border-[#3c434a]"
                )}
              >
                <Link href={`${baseUrl}/products?action=new`} className={cn("block px-4 py-1.5", isModern || isMinimal ? "hover:bg-gray-50 text-gray-700" : "hover:text-[#72aee6]")}>Product</Link>
                <Link href={`${baseUrl}/orders?action=new`} className={cn("block px-4 py-1.5", isModern || isMinimal ? "hover:bg-gray-50 text-gray-700" : "hover:text-[#72aee6]")}>Order</Link>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center h-full space-x-2">
          {/* Super Admin Back Link */}
          {isSuperAdmin && (
            <Link 
              href="/super-admin" 
              className={cn(
                "px-3 py-1 rounded-md text-xs font-bold mr-2 transition-colors",
                isModern || isMinimal 
                  ? "bg-red-100 text-red-700 hover:bg-red-200" 
                  : "bg-red-600 text-white hover:bg-red-700"
              )}
            >
              Back to Console
            </Link>
          )}

          {/* User Profile */}
          <div className="relative h-full">
            <button 
              onMouseEnter={() => setIsUserMenuOpen(true)}
              onMouseLeave={() => setIsUserMenuOpen(false)}
              className={cn(
                "flex items-center space-x-2 px-3 h-full transition-colors",
                isModern || isMinimal ? "hover:bg-gray-50" : "hover:bg-[#2c3338] hover:text-[#72aee6]"
              )}
            >
              <span>Howdy, <span className={cn("font-bold", isModern || isMinimal ? "text-primary" : "text-white")}>Admin</span></span>
              <div className="w-5 h-5 rounded bg-gray-500 flex items-center justify-center text-[10px] text-white">A</div>
            </button>
            {isUserMenuOpen && (
              <div 
                onMouseEnter={() => setIsUserMenuOpen(true)}
                onMouseLeave={() => setIsUserMenuOpen(false)}
                className={cn(
                  "absolute top-full right-0 w-48 shadow-xl p-4 border-t text-center",
                  isModern || isMinimal ? "bg-white border-gray-200" : "bg-[#2c3338] border-[#3c434a]"
                )}
              >
                <div className="w-16 h-16 rounded bg-gray-500 mx-auto mb-2 flex items-center justify-center text-2xl text-white">A</div>
                <p className={cn("font-bold mb-1", isModern || isMinimal ? "text-gray-900" : "text-white")}>admin</p>
                <div className={cn("border-t pt-2", isModern || isMinimal ? "border-gray-100" : "border-[#3c434a]")}>
                  <button 
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className={cn("text-xs flex items-center justify-center w-full space-x-1", isModern || isMinimal ? "text-gray-600 hover:text-primary" : "hover:text-[#72aee6]")}
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 pt-[32px]">
        {/* Sidebar */}
        <aside className={cn(
          "w-[160px] flex flex-col fixed inset-y-0 left-0 z-50 mt-[32px] text-sm overflow-y-auto custom-scrollbar transition-all",
          isModern ? "bg-white border-r border-gray-200 text-gray-600" : 
          isMinimal ? "bg-white/50 backdrop-blur-md border-r border-gray-100 text-gray-800" : 
          "bg-[#2c3338] text-white"
        )}>
          <nav className="flex-1 py-2">
            {sidebarItems.map((item) => {
              const hasChildren = !!item.children;
              const isOpen = openMenus.includes(item.name);
              const isActive = item.href === pathname || item.children?.some(child => child.href === pathname);

              return (
                <div key={item.name} className="relative group">
                  {hasChildren ? (
                    <>
                      <button
                        onClick={() => toggleMenu(item.name)}
                        className={cn(
                          "w-full flex items-center px-3 py-2 transition-colors duration-100",
                          isActive 
                            ? (isModern || isMinimal ? "bg-primary/10 text-primary font-bold" : "bg-[#2271b1] text-white") 
                            : (isModern || isMinimal ? "text-gray-600 hover:bg-gray-50 hover:text-primary" : "text-[#f0f0f1] hover:bg-[#1d2327] hover:text-[#72aee6]")
                        )}
                      >
                        <item.icon className="w-4 h-4 mr-2" />
                        <span className="flex-1 text-left">{item.name}</span>
                        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </button>
                      
                      {/* Submenu */}
                      {isOpen && (
                        <div className={cn(
                          "py-1.5",
                          isModern || isMinimal ? "bg-gray-50/50" : "bg-[#1d2327]"
                        )}>
                          {item.children?.map((child) => (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={cn(
                                "block pl-9 pr-3 py-1.5 text-xs transition-colors",
                                pathname === child.href 
                                  ? (isModern || isMinimal ? "text-primary font-bold" : "text-white font-bold") 
                                  : (isModern || isMinimal ? "text-gray-500 hover:text-primary" : "text-[#c3c4c7] hover:text-[#72aee6]")
                              )}
                            >
                              {child.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      href={item.href || "#"}
                      className={cn(
                        "flex items-center px-3 py-2 transition-colors duration-100",
                        pathname === item.href 
                          ? (isModern || isMinimal ? "bg-primary/10 text-primary font-bold border-l-4 border-primary" : "bg-[#1d2327] text-white border-l-4 border-[#72aee6]") 
                          : (isModern || isMinimal ? "text-gray-600 border-l-4 border-transparent hover:bg-gray-50 hover:text-primary" : "text-[#f0f0f1] border-l-4 border-transparent hover:bg-[#1d2327] hover:text-[#72aee6]")
                      )}
                    >
                      <item.icon className="w-4 h-4 mr-2" />
                      <span>{item.name}</span>
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>
          
          <button className={cn(
            "p-3 flex items-center space-x-2 border-t",
            isModern || isMinimal ? "text-gray-400 hover:text-primary border-gray-100" : "text-[#c3c4c7] hover:text-white border-[#3c434a]"
          )}>
            <MousePointer2 className="w-4 h-4" />
            <span className="text-xs">Collapse menu</span>
          </button>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 ml-[160px] p-6 min-h-screen">
          <div className="max-w-[1200px] mx-auto">
            <header className="mb-6 flex items-center justify-between">
              <h1 className={cn(
                "text-2xl font-normal flex items-center",
                isModern || isMinimal ? "text-gray-900" : "text-[#1d2327]"
              )}>
                {pathname.split("/").pop()?.replace("-", " ") || "Dashboard"}
              </h1>
            </header>

            <div className={cn(
              "shadow-sm p-6 min-h-[600px] transition-all",
              isModern ? "bg-white rounded-xl border border-gray-100" : 
              isMinimal ? "bg-white/70 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-none" : 
              "bg-white border border-[#ccd0d4]"
            )}>
              {children}
            </div>
          </div>
        </main>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #2c3338;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #50575e;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #646970;
        }
      `}</style>
    </div>
  );
}
