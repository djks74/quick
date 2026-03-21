"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Store, 
  Settings, 
  Layers,
  LogOut,
  Power,
  ChevronRight,
  ChevronDown,
  Plus,
  Zap,
  Sparkles,
  Home,
  MousePointer2,
  Wallet,
  History,
  Trash2,
  Bell,
  Check,
  Menu,
  Puzzle,
  Users,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/lib/admin-context";
import { signOut } from "next-auth/react";
import SubscriptionGate from "@/components/SubscriptionGate";
import ThemeToggle from "@/components/ThemeToggle";
import { getOrderNotifications, markAllOrderNotificationsRead, markOrderNotificationRead } from "@/lib/api";

interface SidebarItem {
  name: string;
  href?: string;
  icon: any;
  children?: { name: string; href: string }[];
  isNotifications?: boolean;
  onClick?: () => void;
}

export default function AdminShell({
  children,
  store,
  isSuperAdmin,
  userRole
}: {
  children: React.ReactNode;
  store: any;
  isSuperAdmin?: boolean;
  userRole?: string;
}) {
  const pathname = usePathname();
  const { layoutStyle, siteName } = useAdmin();
  const [openMenus, setOpenMenus] = useState<string[]>(["Products", "Orders", "Pages", "Appearance"]);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isFloatingNotificationsOpen, setIsFloatingNotificationsOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showSubscriptionGate, setShowSubscriptionGate] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [toastItems, setToastItems] = useState<any[]>([]);
  const notificationsReadyRef = useRef(false);
  const knownNotificationIdsRef = useRef<Set<number>>(new Set());
  
  const slug = store.slug;
  const baseUrl = `/${slug}/admin`;
  const unreadNotifications = useMemo(() => notifications.filter((n) => !n.readAt).length, [notifications]);

  const isOwner = userRole === 'MERCHANT' || userRole === 'SUPER_ADMIN';
  const isTrial = !isSuperAdmin && !['ENTERPRISE', 'SOVEREIGN', 'PRO', 'CORPORATE'].includes(store.subscriptionPlan);

  useEffect(() => {
    if (isTrial) {
      setShowSubscriptionGate(true);
    }
  }, [isTrial]);

  const sidebarItems: SidebarItem[] = [
    { name: "Dashboard", href: baseUrl, icon: LayoutDashboard },
    ...(store.subscriptionPlan !== 'FREE' ? [
      { 
        name: "Products", 
        icon: Package,
        children: [
          { name: "All Products", href: `${baseUrl}/products` },
          { name: "Categories", href: `${baseUrl}/products?view=categories` },
        ]
      }
    ] : []),
    ...(store.subscriptionPlan !== 'FREE' && store.subscriptionPlan !== 'PRO' ? [
      {
        name: "Ingredients",
        icon: Layers,
        children: [
          { name: "All Items", href: `${baseUrl}/inventory` },
          { name: "Stock Manager", href: `${baseUrl}/inventory/scan` },
        ]
      }
    ] : []),
    { 
      name: "Orders", 
      href: `${baseUrl}/orders`,
      icon: ShoppingCart,
    },
    {
      name: "Notifications",
      icon: Bell,
      isNotifications: true
    },
    {
      name: "Finance",
      icon: Wallet,
      children: [
        { name: "Report", href: `${baseUrl}/finance/ledger` },
        ...(store.subscriptionPlan !== 'FREE' && store.subscriptionPlan !== 'PRO' ? [
          { name: "Analytics", href: `${baseUrl}/finance/profit` }
        ] : []),
        { name: "Withdrawals", href: `${baseUrl}/finance/withdrawals` },
      ]
    },
    { 
      name: "Settings", 
      href: `${baseUrl}/settings`, 
      icon: Settings 
    },
    ...(isOwner || isSuperAdmin ? [
      {
        name: "Billing",
        href: `${baseUrl}/billing`,
        icon: Zap
      }
    ] : []),
    ...(store.subscriptionPlan !== 'FREE' ? [
      { 
        name: "Tables", 
        href: `${baseUrl}/tables`, 
        icon: Layers 
      }
    ] : []),
    ...(isOwner || isSuperAdmin ? [
      {
        name: "Staff",
        href: `${baseUrl}/users`,
        icon: Users
      }
    ] : [])
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
  const pageName = pathname.split("/").pop()?.replace("-", " ") || "Dashboard";
  const pageTitle = pageName.toLowerCase() === "ledger" ? "Report" : pageName;

  const pushToast = (item: any) => {
    const toastId = `${item.id}-${Date.now()}`;
    setToastItems((prev) => [{ ...item, toastId }, ...prev].slice(0, 4));
    setTimeout(() => {
      setToastItems((prev) => prev.filter((t) => t.toastId !== toastId));
    }, 5000);
  };

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const rows = await getOrderNotifications(store.id, 25);
      if (!mounted) return;
      const nextRows = rows as any[];
      if (!notificationsReadyRef.current) {
        notificationsReadyRef.current = true;
        knownNotificationIdsRef.current = new Set(nextRows.map((n) => n.id));
        setNotifications(nextRows);
        return;
      }
      const newItems = nextRows.filter((n) => !knownNotificationIdsRef.current.has(n.id));
      knownNotificationIdsRef.current = new Set(nextRows.map((n) => n.id));
      newItems.slice(0, 3).forEach(pushToast);
      setNotifications(rows as any[]);
    };
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [store.id]);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [pathname]);

  const markOneRead = async (id: number) => {
    const ok = await markOrderNotificationRead(id);
    if (ok) setNotifications(prev => prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
  };

  const markAllRead = async () => {
    const ok = await markAllOrderNotificationsRead(store.id);
    if (ok) setNotifications(prev => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
  };

  return (
    <div className={cn(
      "flex flex-col min-h-screen transition-colors duration-300",
      isModern ? "bg-[#f8fafc] dark:bg-[#0F1113]" : 
      isMinimal ? "bg-white dark:bg-[#0F1113]" : 
      "bg-[#f0f0f1] dark:bg-[#0F1113]"
    )}>
      {showSubscriptionGate && <SubscriptionGate store={store} onClose={() => setShowSubscriptionGate(false)} />}
      {/* WordPress Top Admin Bar */}
      <header className={cn(
        "h-10 md:h-[32px] flex items-center justify-between px-2 md:px-4 fixed top-0 w-full z-[100] text-sm transition-all",
        isModern ? "bg-white dark:bg-[#1A1D21] border-b border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400" : 
        isMinimal ? "bg-white/80 dark:bg-[#1A1D21]/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200" : 
        "bg-[#1d2327] dark:bg-[#0F1113] text-[#c3c4c7] dark:text-gray-400 border-b dark:border-gray-800"
      )}>
        <div className="flex items-center h-full">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen((v) => !v)}
            className={cn(
              "md:hidden p-2 rounded-md mr-1",
              isModern || isMinimal ? "hover:bg-gray-100 dark:hover:bg-gray-800" : "hover:bg-[#2c3338] dark:hover:bg-gray-800"
            )}
          >
            {isMobileSidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          {/* Site Name Link */}
          <Link href={`/${slug}`} target="_blank" className={cn(
            "flex items-center space-x-2 px-2 md:px-3 h-full transition-colors group max-w-[210px] md:max-w-none",
            isModern ? "hover:bg-gray-50 dark:hover:bg-gray-800 text-primary dark:text-blue-400" : 
            isMinimal ? "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-900 dark:text-white" : 
            "hover:bg-[#2c3338] dark:hover:bg-gray-800 hover:text-[#72aee6] dark:hover:text-blue-400"
          )}>
            <Home className="w-4 h-4" />
            <span className="font-medium truncate">{store.name}</span>
          </Link>

          {/* + New Dropdown */}
          <div className="relative h-full hidden md:block">
            <button 
              onMouseEnter={() => setIsNewMenuOpen(true)}
              onMouseLeave={() => setIsNewMenuOpen(false)}
              className={cn(
                "flex items-center space-x-1 px-3 h-full transition-colors",
                isModern ? "hover:bg-gray-50 dark:hover:bg-gray-800" : 
                isMinimal ? "hover:bg-gray-50 dark:hover:bg-gray-800" : 
                "hover:bg-[#2c3338] dark:hover:bg-gray-800 hover:text-[#72aee6] dark:hover:text-blue-400"
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
                  isModern || isMinimal ? "bg-white dark:bg-[#1A1D21] border-gray-200 dark:border-gray-800" : "bg-[#2c3338] dark:bg-[#1A1D21] border-[#3c434a] dark:border-gray-800"
                )}
              >
                {store.subscriptionPlan !== 'FREE' && (
                  <Link href={`${baseUrl}/products?action=new`} className={cn("block px-4 py-1.5", isModern || isMinimal ? "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300" : "hover:text-[#72aee6] dark:hover:text-blue-400")}>Product</Link>
                )}
                <Link href={`${baseUrl}/orders?action=new`} className={cn("block px-4 py-1.5", isModern || isMinimal ? "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300" : "hover:text-[#72aee6] dark:hover:text-blue-400")}>Order</Link>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center h-full space-x-1 md:space-x-2">
          {/* Theme Toggle */}
          <div className="scale-75 origin-right">
            <ThemeToggle />
          </div>

          {/* Super Admin Back Link */}
          {isSuperAdmin && (
            <Link 
              href="/super-admin" 
              className={cn(
                "hidden md:inline-flex px-3 py-1 rounded-md text-xs font-bold mr-2 transition-colors",
                isModern || isMinimal 
                  ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50" 
                  : "bg-red-600 text-white hover:bg-red-700"
              )}
            >
              Back to Console
            </Link>
          )}

          {/* User Profile */}
          <div className="relative h-full">
            <button 
              onClick={() => setIsUserMenuOpen((v) => !v)}
              onMouseEnter={() => setIsUserMenuOpen(true)}
              onMouseLeave={() => setIsUserMenuOpen(false)}
              className={cn(
                "flex items-center space-x-2 px-2 md:px-3 h-full transition-colors",
                isModern || isMinimal ? "hover:bg-gray-50 dark:hover:bg-gray-800" : "hover:bg-[#2c3338] dark:hover:bg-gray-800 hover:text-[#72aee6] dark:hover:text-blue-400"
              )}
            >
              <span className="hidden md:inline">Howdy, <span className={cn("font-bold", isModern || isMinimal ? "text-primary dark:text-blue-400" : "text-white")}>Admin</span></span>
              <div className="w-5 h-5 rounded bg-gray-500 flex items-center justify-center text-[10px] text-white">A</div>
            </button>
            {isUserMenuOpen && (
              <div 
                onMouseEnter={() => setIsUserMenuOpen(true)}
                onMouseLeave={() => setIsUserMenuOpen(false)}
                className={cn(
                  "absolute top-full right-0 w-48 shadow-xl p-4 border-t text-center",
                  isModern || isMinimal ? "bg-white dark:bg-[#1A1D21] border-gray-200 dark:border-gray-800" : "bg-[#2c3338] dark:bg-[#1A1D21] border-[#3c434a] dark:border-gray-800"
                )}
              >
                <div className="w-16 h-16 rounded bg-gray-500 mx-auto mb-2 flex items-center justify-center text-2xl text-white">A</div>
                <p className={cn("font-bold mb-1", isModern || isMinimal ? "text-gray-900 dark:text-white" : "text-white")}>admin</p>
                <div className={cn("border-t pt-2 flex flex-col gap-2", isModern || isMinimal ? "border-gray-100 dark:border-gray-800" : "border-[#3c434a] dark:border-gray-800")}>
                  {(isOwner || isSuperAdmin) && (
                    <Link 
                      href="/dashboard" 
                      className={cn("text-xs flex items-center justify-center w-full space-x-1", isModern || isMinimal ? "text-gray-600 dark:text-gray-400 hover:text-primary dark:hover:text-blue-400" : "hover:text-[#72aee6] dark:hover:text-blue-400")}
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      <LayoutDashboard className="w-3 h-3" />
                      <span>Multi-Outlet Dashboard</span>
                    </Link>
                  )}
                  <button 
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      signOut({ callbackUrl: '/login' });
                    }}
                    className={cn("text-xs flex items-center justify-center w-full space-x-1", isModern || isMinimal ? "text-gray-600 dark:text-gray-400 hover:text-primary dark:hover:text-blue-400" : "hover:text-[#72aee6] dark:hover:text-blue-400")}
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

      <div className="flex flex-1 pt-10 md:pt-[32px]">
        {isMobileSidebarOpen && (
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
          />
        )}
        {/* Sidebar */}
        <aside className={cn(
          "w-[260px] md:w-[160px] flex flex-col fixed inset-y-0 left-0 z-50 mt-10 md:mt-[32px] text-sm overflow-y-auto custom-scrollbar transition-all transform md:translate-x-0",
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          isModern ? "bg-white dark:bg-[#1A1D21] border-r border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400" : 
          isMinimal ? "bg-white/50 dark:bg-[#1A1D21]/50 backdrop-blur-md border-r border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200" : 
          "bg-[#2c3338] dark:bg-[#0F1113] text-white dark:text-gray-300"
        )}>
          <nav className="flex-1 py-2">
            {sidebarItems.map((item) => {
              if (item.isNotifications) {
                return (
                  <div key={item.name} className="relative group">
                    <button
                      onClick={() => setIsNotificationsOpen(v => !v)}
                      className={cn(
                        "w-full flex items-center px-3 py-2 transition-colors duration-100",
                        isNotificationsOpen
                          ? (isModern || isMinimal ? "bg-primary/10 dark:bg-blue-900/20 text-primary dark:text-blue-400 font-bold" : "bg-[#2271b1] dark:bg-blue-600 text-white")
                          : (isModern || isMinimal ? "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-primary dark:hover:text-blue-400" : "text-[#f0f0f1] dark:text-gray-400 hover:bg-[#1d2327] dark:hover:bg-gray-800 hover:text-[#72aee6] dark:hover:text-blue-400")
                      )}
                    >
                      <item.icon className="w-4 h-4 mr-2" />
                      <span className="flex-1 text-left">{item.name}</span>
                      {unreadNotifications > 0 && (
                        <span className="text-[10px] font-black rounded-full px-1.5 py-0.5 bg-orange-500 text-white mr-2">
                          {unreadNotifications > 9 ? "9+" : unreadNotifications}
                        </span>
                      )}
                      {isNotificationsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                    {isNotificationsOpen && (
                      <div className={cn(
                        "py-1.5",
                        isModern || isMinimal ? "bg-gray-50/50 dark:bg-gray-900/30" : "bg-[#1d2327] dark:bg-black/20"
                      )}>
                        <div className="px-3 pb-2 flex items-center justify-between">
                          <span className={cn("text-[10px] font-black uppercase tracking-widest", isModern || isMinimal ? "text-gray-400 dark:text-gray-500" : "text-[#c3c4c7] dark:text-gray-500")}>
                            {unreadNotifications ? `${unreadNotifications} unread` : "All read"}
                          </span>
                          <button
                            type="button"
                            onClick={markAllRead}
                            disabled={!unreadNotifications}
                            className={cn(
                              "text-[10px] font-black uppercase tracking-widest",
                              isModern || isMinimal
                                ? "text-primary dark:text-blue-400 disabled:text-gray-300 dark:disabled:text-gray-600"
                                : "text-[#72aee6] dark:text-blue-400 disabled:text-gray-500"
                            )}
                          >
                            Mark all
                          </button>
                        </div>
                        {notifications.length === 0 ? (
                          <div className={cn("px-3 py-2 text-xs italic", isModern || isMinimal ? "text-gray-500 dark:text-gray-500" : "text-[#c3c4c7] dark:text-gray-500")}>
                            No notifications
                          </div>
                        ) : (
                          notifications.slice(0, 6).map((n) => (
                            <div key={n.id} className={cn("px-3 py-2 border-t", isModern || isMinimal ? "border-gray-100 dark:border-gray-800" : "border-[#3c434a] dark:border-gray-800")}>
                              <div className={cn("text-[11px] font-bold", isModern || isMinimal ? "text-gray-800 dark:text-gray-200" : "text-white dark:text-gray-300")}>
                                {n.title}
                              </div>
                              <div className={cn("text-[10px] mt-1", isModern || isMinimal ? "text-gray-500 dark:text-gray-500" : "text-[#c3c4c7] dark:text-gray-500")}>
                                {n.source} • #{n.orderId}
                              </div>
                              {!n.readAt && (
                                <button
                                  type="button"
                                  onClick={() => markOneRead(n.id)}
                                  className={cn("mt-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest", isModern || isMinimal ? "text-primary dark:text-blue-400" : "text-[#72aee6] dark:text-blue-400")}
                                >
                                  <Check className="w-3 h-3" />
                                  Read
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              }
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
                            ? (isModern || isMinimal ? "bg-primary/10 dark:bg-blue-900/20 text-primary dark:text-blue-400 font-bold" : "bg-[#2271b1] dark:bg-blue-600 text-white") 
                            : (isModern || isMinimal ? "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-primary dark:hover:text-blue-400" : "text-[#f0f0f1] dark:text-gray-400 hover:bg-[#1d2327] dark:hover:bg-gray-800 hover:text-[#72aee6] dark:hover:text-blue-400")
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
                          isModern || isMinimal ? "bg-gray-50/50 dark:bg-gray-900/30" : "bg-[#1d2327] dark:bg-black/20"
                        )}>
                          {item.children?.map((child) => (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={() => setIsMobileSidebarOpen(false)}
                              className={cn(
                                "block pl-9 pr-3 py-1.5 text-xs transition-colors",
                                pathname === child.href 
                                  ? (isModern || isMinimal ? "text-primary dark:text-blue-400 font-bold" : "text-white font-bold") 
                                  : (isModern || isMinimal ? "text-gray-500 dark:text-gray-500 hover:text-primary dark:hover:text-blue-400" : "text-[#c3c4c7] dark:text-gray-500 hover:text-[#72aee6] dark:hover:text-blue-400")
                              )}
                            >
                              {child.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  ) : item.onClick ? (
                    <button
                      onClick={() => {
                        setIsMobileSidebarOpen(false);
                        item.onClick?.();
                      }}
                      className={cn(
                        "w-full flex items-center px-3 py-2 transition-colors duration-100",
                        pathname === item.href 
                          ? (isModern || isMinimal ? "bg-primary/10 dark:bg-blue-900/20 text-primary dark:text-blue-400 font-bold border-l-4 border-primary dark:border-blue-400" : "bg-[#1d2327] dark:bg-blue-900/20 text-white border-l-4 border-[#72aee6] dark:border-blue-400") 
                          : (isModern || isMinimal ? "text-gray-600 dark:text-gray-400 border-l-4 border-transparent hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-primary dark:hover:text-blue-400" : "text-[#f0f0f1] dark:text-gray-400 border-l-4 border-transparent hover:bg-[#1d2327] dark:hover:bg-gray-800 hover:text-[#72aee6] dark:hover:text-blue-400")
                      )}
                    >
                      <item.icon className="w-4 h-4 mr-2" />
                      <span>{item.name}</span>
                    </button>
                  ) : (
                    <Link
                      href={item.href || "#"}
                      onClick={() => setIsMobileSidebarOpen(false)}
                      className={cn(
                        "flex items-center px-3 py-2 transition-colors duration-100",
                        pathname === item.href 
                          ? (isModern || isMinimal ? "bg-primary/10 dark:bg-blue-900/20 text-primary dark:text-blue-400 font-bold border-l-4 border-primary dark:border-blue-400" : "bg-[#1d2327] dark:bg-blue-900/20 text-white border-l-4 border-[#72aee6] dark:border-blue-400") 
                          : (isModern || isMinimal ? "text-gray-600 dark:text-gray-400 border-l-4 border-transparent hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-primary dark:hover:text-blue-400" : "text-[#f0f0f1] dark:text-gray-400 border-l-4 border-transparent hover:bg-[#1d2327] dark:hover:bg-gray-800 hover:text-[#72aee6] dark:hover:text-blue-400")
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
          
          <div className={cn(
            "p-4 border-t space-y-2",
            isModern || isMinimal ? "border-gray-100 dark:border-gray-800" : "border-[#3c434a] dark:border-gray-800"
          )}>
            {(isOwner || isSuperAdmin) && (
              <Link 
                href="/dashboard" 
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors",
                  isModern || isMinimal 
                    ? "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-primary dark:hover:text-blue-400" 
                    : "text-[#f0f0f1] dark:text-gray-400 hover:bg-[#1d2327] dark:hover:bg-gray-800 hover:text-[#72aee6] dark:hover:text-blue-400"
                )}
                onClick={() => setIsMobileSidebarOpen(false)}
              >
                <LayoutDashboard className="w-4 h-4 opacity-70" />
                <span>Multi-Outlet Dashboard</span>
              </Link>
            )}
            <button 
              onClick={() => signOut({ callbackUrl: '/login' })}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors",
                isModern || isMinimal
                  ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  : "text-red-400 hover:text-red-300 hover:bg-red-900/20"
              )}
            >
              <Power className="w-4 h-4" />
               <span>Sign Out</span>
             </button>
           </div>
         </aside>

        {/* Main Content Area */}
        <main className="flex-1 ml-0 md:ml-[160px] p-3 md:p-6 min-h-screen">
          <div className="max-w-[1200px] mx-auto">
            <header className="mb-6 flex items-center justify-between">
              <h1 className={cn(
                "text-xl md:text-2xl font-normal flex items-center",
                isModern || isMinimal ? "text-gray-900 dark:text-white" : "text-[#1d2327] dark:text-gray-300"
              )}>
                {pageTitle}
              </h1>
            </header>

            <div className={cn(
              "shadow-sm p-4 md:p-6 min-h-[600px] transition-all",
              isModern ? "bg-white dark:bg-[#1A1D21] rounded-xl border border-gray-100 dark:border-gray-800" : 
              isMinimal ? "bg-white/70 dark:bg-[#1A1D21]/70 backdrop-blur-sm rounded-2xl border border-gray-100 dark:border-gray-800 shadow-none" : 
              "bg-white dark:bg-[#1A1D21] border border-[#ccd0d4] dark:border-gray-800"
            )}>
              {children}
            </div>
          </div>
        </main>
      </div>

      <div className="fixed top-12 right-2 md:right-6 z-[130] space-y-2">
        {toastItems.map((t) => (
          <div
            key={t.toastId}
            className="w-[calc(100vw-1rem)] sm:w-[300px] rounded-xl border border-orange-200 dark:border-orange-800 bg-white dark:bg-[#1A1D21] shadow-xl p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-gray-900 dark:text-white">{t.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.body}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-orange-600 dark:text-orange-400 mt-1">
                  {t.source} • Order #{t.orderId}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setToastItems((prev) => prev.filter((x) => x.toastId !== t.toastId))}
                className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="fixed bottom-24 right-4 md:bottom-28 md:right-6 z-[120]">
        <button
          type="button"
          onClick={() => setIsFloatingNotificationsOpen((v) => !v)}
          className="relative w-12 h-12 rounded-full bg-primary dark:bg-blue-600 text-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
        >
          <Bell className="w-5 h-5" />
          {unreadNotifications > 0 && (
            <span className="absolute -top-1 -right-1 text-[10px] font-black rounded-full px-1.5 py-0.5 bg-orange-500 text-white">
              {unreadNotifications > 9 ? "9+" : unreadNotifications}
            </span>
          )}
        </button>
        {isFloatingNotificationsOpen && (
          <div className="absolute bottom-14 right-0 w-[calc(100vw-1rem)] max-w-[340px] max-h-[420px] overflow-y-auto rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1D21] shadow-2xl">
            <div className="p-3 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
              <div>
                <div className="text-sm font-bold text-gray-900 dark:text-white">Notifications</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  {unreadNotifications ? `${unreadNotifications} unread` : "All read"}
                </div>
              </div>
              <button
                type="button"
                onClick={markAllRead}
                disabled={!unreadNotifications}
                className="text-[10px] font-black uppercase tracking-widest text-primary dark:text-blue-400 disabled:text-gray-300 dark:disabled:text-gray-600"
              >
                Mark all
              </button>
            </div>
            {notifications.length === 0 ? (
              <div className="p-3 text-xs italic text-gray-500 dark:text-gray-500">No notifications</div>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <div key={n.id} className={cn("p-3 border-b border-gray-100 dark:border-gray-800", !n.readAt ? "bg-orange-50/40 dark:bg-orange-900/10" : "")}>
                  <div className="text-[12px] font-bold text-gray-800 dark:text-gray-200">{n.title}</div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{n.body}</div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">
                    {n.source} • #{n.orderId}
                  </div>
                  {!n.readAt && (
                    <button
                      type="button"
                      onClick={() => markOneRead(n.id)}
                      className="mt-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary dark:text-blue-400"
                    >
                      <Check className="w-3 h-3" />
                      Read
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
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
