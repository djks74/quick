"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { 
  Search, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  X, 
  Camera,
  CreditCard, 
  Banknote, 
  Smartphone,
  LogOut,
  User,
  Loader2,
  CheckCircle,
  Moon,
  Sun,
  MessageSquare,
  Bell,
  Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { createPosOrder, getOrderNotifications, markAllOrderNotificationsRead, markOrderNotificationRead } from "@/lib/api";
// import useSound from 'use-sound'; // Removed to fix build error, using native Audio API instead

// Simple sound player
const playBeep = () => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  const playTone = (freq: number, startTime: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.value = 0.1;
    osc.start(startTime);
    osc.stop(startTime + duration);
  };

  const now = ctx.currentTime;
  // "Nit-nit" sound (two short high-pitched beeps)
  playTone(1500, now, 0.08);
  playTone(1500, now + 0.15, 0.08);
};

// Types
interface Product {
  id: number;
  name: string;
  price: number;
  image: string | null;
  category: string;
  stock: number;
  barcode?: string | null;
}

interface CartItem extends Product {
  quantity: number;
  note?: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface PosPaymentMethod {
  id: string;
  name: string;
  mode: "cash" | "card" | "qris" | "transfer" | "other";
}

interface PosClientProps {
  store: any;
  products: Product[];
  categories: Category[];
  user: any;
}

interface CompletedOrderState {
  id: number;
  storeName: string;
  createdAt: string;
  paymentMethodName: string;
  paymentMode: PosPaymentMethod["mode"];
  subtotal: number;
  discountAmount: number;
  tax: number;
  serviceCharge: number;
  tip: number;
  total: number;
  cashReceived: number;
  change: number;
  items: Array<{
    id: number;
    name: string;
    quantity: number;
    price: number;
    note?: string;
  }>;
}

function formatIsoHourMinute(iso: string) {
  if (!iso) return "--:--";
  const time = iso.split("T")[1];
  if (!time) return "--:--";
  return time.slice(0, 5);
}

export default function PosClient({ store, products, categories, user }: PosClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [cashReceived, setCashReceived] = useState<string>("");
  const [discountType, setDiscountType] = useState<"nominal" | "percent">("nominal");
  const [discountValue, setDiscountValue] = useState<string>("");
  const [tipAmount, setTipAmount] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<CompletedOrderState | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [preCartNote, setPreCartNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [lastSeenCreatedAt, setLastSeenCreatedAt] = useState<string | null>(null);
  const [scanFlash, setScanFlash] = useState<null | "ok" | "err">(null);
  const [isCameraScanOpen, setIsCameraScanOpen] = useState(false);
  const [cameraScanError, setCameraScanError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const lastDetectedRef = useRef<{ value: string; at: number } | null>(null);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  const refreshNotifications = useCallback(async (silent = false) => {
    const rows = await getOrderNotifications(store.id, 25);
    const newestCreatedAt = rows?.[0]?.createdAt || null;
    if (!silent && lastSeenCreatedAt && newestCreatedAt) {
      const hasNewUnread = rows.some((r: any) => !r.isRead && r.createdAt > lastSeenCreatedAt);
      if (hasNewUnread) playBeep();
    }
    if (!lastSeenCreatedAt && newestCreatedAt) setLastSeenCreatedAt(newestCreatedAt);
    if (lastSeenCreatedAt && newestCreatedAt) setLastSeenCreatedAt(newestCreatedAt);
    setNotifications(rows as any);
  }, [store.id, lastSeenCreatedAt]);

  useEffect(() => {
    refreshNotifications(true);
    const t = setInterval(() => refreshNotifications(false), 10000);
    return () => clearInterval(t);
  }, [refreshNotifications]);

  const markNotifRead = async (id: number) => {
    const ok = await markOrderNotificationRead(id);
    if (ok) setNotifications((prev) => prev.map((p: any) => (p.id === id ? { ...p, isRead: true } : p)));
  };

  const markAllNotifRead = async () => {
    const ok = await markAllOrderNotificationsRead(store.id);
    if (ok) setNotifications((prev) => prev.map((p: any) => ({ ...p, isRead: true })));
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        product.name.toLowerCase().includes(q) ||
        (product.barcode ? String(product.barcode).toLowerCase().includes(q) : false);
      const matchesCategory = selectedCategory === "all" || 
        product.category?.toLowerCase() === selectedCategory.toLowerCase() ||
        (categories.find(c => c.slug === selectedCategory)?.name.toLowerCase() === product.category?.toLowerCase());
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory, categories]);

  // Calculations
  const taxPercent = parseFloat((store.taxPercent ?? 0).toString());
  const servicePercent = parseFloat((store.serviceChargePercent ?? 0).toString());
  const qrisFeePercent = parseFloat((store.qrisFeePercent ?? 0).toString());
  const transferFee = parseFloat((store.manualTransferFee ?? 0).toString());

  const roundIdr = (n: number) => Math.round(Number.isFinite(n) ? n : 0);

  const subtotal = roundIdr(cart.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0));
  const parsedDiscountValue = parseFloat(discountValue) || 0;
  const discountAmount = roundIdr(Math.max(
    0,
    discountType === "percent"
      ? Math.min(subtotal, subtotal * (Math.min(100, parsedDiscountValue) / 100))
      : Math.min(subtotal, parsedDiscountValue)
  ));
  const discountedSubtotal = Math.max(0, subtotal - discountAmount);
  
  // Tax & Service Charge
  const tax = roundIdr(discountedSubtotal * (taxPercent / 100));
  const serviceCharge = roundIdr(discountedSubtotal * (servicePercent / 100));
  
  // Payment Fees (POS - Only if Customer Pays, but POS usually handles fees differently or external EDC)
  // User request: Platform fee only on storefront/whatsapp. POS uses own EDC/QRIS.
  let paymentFee = 0;
  // if (store.feePaidBy === "CUSTOMER") {
  //   if (activePaymentMode === "qris" && qrisFeePercent > 0) {
  //     paymentFee = (discountedSubtotal + tax + serviceCharge) * (qrisFeePercent / 100);
  //   } else if (activePaymentMode === "transfer" && transferFee > 0) {
  //     paymentFee = transferFee;
  //   }
  // }

  const tip = roundIdr(parseFloat(tipAmount) || 0);
  const total = roundIdr(discountedSubtotal + tax + serviceCharge + paymentFee + tip);

  const configuredPosMethods = useMemo<PosPaymentMethod[]>(() => {
    if (!Array.isArray(store.posPaymentMethods)) return [];
    return store.posPaymentMethods
      .map((item: any) => {
        const name = String(item?.name || "").trim();
        const mode = String(item?.mode || "other");
        if (!name) return null;
        return {
          id: String(item?.id || `pm-${name.toLowerCase().replace(/\s+/g, "-")}`),
          name,
          mode: (["cash", "card", "qris", "transfer", "other"].includes(mode) ? mode : "other") as PosPaymentMethod["mode"]
        };
      })
      .filter(Boolean) as PosPaymentMethod[];
  }, [store.posPaymentMethods]);

  const legacyFallbackMethods = useMemo<PosPaymentMethod[]>(() => {
    const methods: PosPaymentMethod[] = [{ id: "cash", name: "Cash", mode: "cash" }];
    // Manual Transfer is disabled by user request
    // if (store.enableManualTransfer) methods.push({ id: "transfer", name: "Bank Transfer", mode: "transfer" });
    if (store.enableMidtrans) methods.push({ id: "qris", name: "QRIS / E-Wallet", mode: "qris" });
    return methods;
  }, [store.enableMidtrans]);

  const paymentMethods = configuredPosMethods.length > 0 ? configuredPosMethods : legacyFallbackMethods;
  const activePaymentMethod = paymentMethods.find((method) => method.id === paymentMethod) || paymentMethods[0];
  const activePaymentMode = activePaymentMethod?.mode || "cash";

  useEffect(() => {
    if (!activePaymentMethod) return;
    if (!paymentMethods.some((method) => method.id === paymentMethod)) {
      setPaymentMethod(activePaymentMethod.id);
      setCashReceived("");
    }
  }, [activePaymentMethod, paymentMethod, paymentMethods]);

  const addToCart = useCallback((product: Product, note?: string) => {
    playBeep();
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id && item.note === note);
      if (existing) {
        return prev.map(item => 
          item.id === product.id && item.note === note
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, { ...product, quantity: 1, note }];
    });
    setPreCartNote("");
    setSelectedProduct(null);
  }, []);

  const processScannedBarcode = useCallback((rawCode: string) => {
    const code = String(rawCode || "").trim();
    if (!code) return false;
    const matches = products.filter((p) => p.barcode && String(p.barcode).trim() === code);
    if (matches.length >= 1) {
      addToCart(matches[0]);
      setScanFlash("ok");
      setTimeout(() => setScanFlash(null), 180);
      setSearchQuery("");
      return true;
    }
    setScanFlash("err");
    setTimeout(() => setScanFlash(null), 220);
    return false;
  }, [addToCart, products]);

  useEffect(() => {
    let buffer = "";
    let lastTime = 0;
    const maxGapMs = 90;
    const minLen = 4;

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      if (key === "Enter") {
        const now = Date.now();
        if (buffer.length >= minLen && now - lastTime <= 250) {
          const handled = processScannedBarcode(buffer);
          buffer = "";
          lastTime = 0;
          if (handled) {
            e.preventDefault();
            e.stopPropagation();
          }
        } else {
          buffer = "";
          lastTime = 0;
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (key.length !== 1) return;

      const now = Date.now();
      if (now - lastTime > maxGapMs) buffer = "";
      buffer += key;
      lastTime = now;
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [processScannedBarcode]);

  const stopCameraScan = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (videoRef.current) {
      try {
        (videoRef.current as any).srcObject = null;
      } catch {}
    }
    if (cameraStreamRef.current) {
      for (const t of cameraStreamRef.current.getTracks()) {
        try {
          t.stop();
        } catch {}
      }
    }
    cameraStreamRef.current = null;
    detectorRef.current = null;
  }, []);

  useEffect(() => {
    if (!isCameraScanOpen) {
      stopCameraScan();
      setCameraScanError(null);
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        if (typeof window === "undefined") return;
        if (!(window as any).BarcodeDetector) {
          setCameraScanError("Camera barcode scan is not supported on this browser.");
          return;
        }

        detectorRef.current = new (window as any).BarcodeDetector({
          formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e"]
        });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false
        });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        cameraStreamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        (v as any).srcObject = stream;
        await v.play().catch(() => null);

        const loop = async () => {
          if (cancelled || !isCameraScanOpen) return;
          const detector = detectorRef.current;
          const vid = videoRef.current;
          if (detector && vid && vid.readyState >= 2) {
            try {
              const barcodes = await detector.detect(vid);
              const raw = String(barcodes?.[0]?.rawValue || "").trim();
              if (raw) {
                const now = Date.now();
                const last = lastDetectedRef.current;
                const isRepeat = last && last.value === raw && now - last.at < 900;
                if (!isRepeat) {
                  lastDetectedRef.current = { value: raw, at: now };
                  const handled = processScannedBarcode(raw);
                  if (!handled) {
                    setCameraScanError(`Barcode not found: ${raw}`);
                    setTimeout(() => setCameraScanError(null), 1200);
                  } else {
                    setCameraScanError(null);
                  }
                }
              }
            } catch {}
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (e: any) {
        setCameraScanError(String(e?.message || "Failed to start camera"));
      }
    };

    start();

    return () => {
      cancelled = true;
      stopCameraScan();
    };
  }, [isCameraScanOpen, processScannedBarcode, stopCameraScan]);

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId: number, delta: number) => {
    playBeep();
    setCart(prev => prev.map(item => {
      if (item.id === productId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }));
  };

  const updateItemNote = (productId: number, note: string) => {
    setCart(prev => prev.map(item => 
      item.id === productId ? { ...item, note } : item
    ));
    setEditingNoteId(null);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    
    setIsProcessing(true);
    
    try {
      const result = await createPosOrder(store.id, {
        items: cart,
        total: total,
        paymentMethod: activePaymentMethod?.name || paymentMethod,
        cashReceived: cashReceived,
        customerPhone: "POS-CUSTOMER",
        taxAmount: tax,
        serviceCharge: serviceCharge,
        discountAmount: discountAmount,
        tipAmount: tip,
        paymentFee: paymentFee
      });

      if (result.error) {
        throw new Error(result.error);
      }
      
      const completedOrder: CompletedOrderState = {
        id: Number(result.orderId),
        storeName: store.name,
        createdAt: new Date().toISOString(),
        paymentMethodName: activePaymentMethod?.name || "Payment",
        paymentMode: activePaymentMode,
        subtotal,
        discountAmount,
        tax,
        serviceCharge,
        tip,
        total,
        cashReceived: parseFloat(cashReceived || "0") || 0,
        change: activePaymentMode === 'cash' ? (parseFloat(cashReceived || '0') - total) : 0,
        items: cart.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          note: item.note
        }))
      };
      setOrderSuccess(completedOrder);
      setCart([]);
      setIsCheckoutOpen(false);
    } catch (error) {
      console.error("Checkout failed", error);
      alert("Checkout failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(price);
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const handlePrintReceipt = () => {
    if (!orderSuccess) return;
    const receiptWindow = window.open("", "_blank", "width=420,height=800");
    if (!receiptWindow) {
      window.print();
      return;
    }

    const itemRows = orderSuccess.items
      .map(
        (item) => `
          <tr>
            <td style="padding:4px 0;vertical-align:top;">${escapeHtml(item.name)} x${item.quantity}${item.note ? `<div style="font-size:11px;color:#666;">${escapeHtml(item.note)}</div>` : ""}</td>
            <td style="padding:4px 0;text-align:right;vertical-align:top;">${formatPrice(item.price * item.quantity)}</td>
          </tr>
        `
      )
      .join("");

    const summaryRows = `
      <tr><td style="padding:3px 0;">Subtotal</td><td style="padding:3px 0;text-align:right;">${formatPrice(orderSuccess.subtotal)}</td></tr>
      ${orderSuccess.discountAmount > 0 ? `<tr><td style="padding:3px 0;">Discount</td><td style="padding:3px 0;text-align:right;">-${formatPrice(orderSuccess.discountAmount)}</td></tr>` : ""}
      ${orderSuccess.tax > 0 ? `<tr><td style="padding:3px 0;">Tax</td><td style="padding:3px 0;text-align:right;">${formatPrice(orderSuccess.tax)}</td></tr>` : ""}
      ${orderSuccess.serviceCharge > 0 ? `<tr><td style="padding:3px 0;">Service</td><td style="padding:3px 0;text-align:right;">${formatPrice(orderSuccess.serviceCharge)}</td></tr>` : ""}
      ${orderSuccess.tip > 0 ? `<tr><td style="padding:3px 0;">Tip</td><td style="padding:3px 0;text-align:right;">${formatPrice(orderSuccess.tip)}</td></tr>` : ""}
      <tr><td style="padding:8px 0 4px 0;font-weight:700;border-top:1px dashed #999;">Total</td><td style="padding:8px 0 4px 0;text-align:right;font-weight:700;border-top:1px dashed #999;">${formatPrice(orderSuccess.total)}</td></tr>
      ${orderSuccess.paymentMode === "cash" ? `<tr><td style="padding:3px 0;">Cash</td><td style="padding:3px 0;text-align:right;">${formatPrice(orderSuccess.cashReceived)}</td></tr><tr><td style="padding:3px 0;">Change</td><td style="padding:3px 0;text-align:right;">${formatPrice(orderSuccess.change)}</td></tr>` : ""}
    `;

    receiptWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Receipt #${orderSuccess.id}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111; margin: 0; padding: 16px; }
            .receipt { max-width: 360px; margin: 0 auto; }
            .title { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
            .meta { font-size: 12px; color: #555; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            .footer { margin-top: 14px; text-align: center; font-size: 12px; color: #666; }
            @media print { body { padding: 0; } .receipt { max-width: none; width: 100%; } }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="title">${escapeHtml(orderSuccess.storeName)}</div>
            <div class="meta">Order #${orderSuccess.id}<br/>${new Date(orderSuccess.createdAt).toLocaleString()}<br/>Payment: ${escapeHtml(orderSuccess.paymentMethodName)}</div>
            <table>${itemRows}</table>
            <table style="margin-top:8px;">${summaryRows}</table>
            <div class="footer">Thank you</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `);
    receiptWindow.document.close();
  };

  const CartContent = ({ isMobile, onClose }: { isMobile?: boolean, onClose?: () => void }) => (
    <div className="flex flex-col h-full">
      <div className={cn("p-4 border-b flex items-center justify-between", isDarkMode ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200")}>
        <h2 className={cn("font-bold text-lg flex items-center", isDarkMode ? "text-white" : "text-gray-900")}>
          <ShoppingCart className="w-5 h-5 mr-2 text-[#2271b1]" />
          Current Order
        </h2>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setCart([])}
            disabled={cart.length === 0}
            className="text-red-500 hover:text-red-700 text-xs font-bold disabled:opacity-50 uppercase tracking-tight"
          >
            Clear
          </button>
          {isMobile && (
            <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
            <ShoppingCart className="w-12 h-12 opacity-10" />
            <p className="text-sm font-medium">Your cart is empty</p>
          </div>
        ) : (
          cart.map(item => (
            <div key={item.id} className={cn("p-3 rounded-2xl border group transition-all", isDarkMode ? "bg-gray-700/50 border-gray-600" : "bg-white border-gray-100 shadow-sm")}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1 min-w-0 pr-2">
                    <h4 className={cn("font-bold text-sm truncate", isDarkMode ? "text-white" : "text-gray-900")}>{item.name}</h4>
                    <p className="text-[#2271b1] font-black text-sm">{formatPrice(item.price * item.quantity)}</p>
                </div>
                <div className={cn("flex items-center space-x-2 rounded-xl border p-1", isDarkMode ? "bg-gray-800 border-gray-600" : "bg-gray-50 border-gray-200")}>
                    <button 
                    onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, -1); }}
                    className={cn("p-1 rounded-lg", isDarkMode ? "hover:bg-gray-700 text-gray-400" : "hover:bg-white text-gray-600 shadow-sm")}
                    >
                    <Minus className="w-3 h-3" />
                    </button>
                    <span className={cn("w-6 text-center font-black text-sm", isDarkMode ? "text-white" : "text-gray-900")}>{item.quantity}</span>
                    <button 
                    onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, 1); }}
                    className={cn("p-1 rounded-lg", isDarkMode ? "hover:bg-gray-700 text-gray-400" : "hover:bg-white text-gray-600 shadow-sm")}
                    >
                    <Plus className="w-3 h-3" />
                    </button>
                </div>
                <button 
                    onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }}
                    className="ml-2 p-2 text-gray-400 hover:text-red-500 transition-colors"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <div className="mt-2">
                {editingNoteId === item.id ? (
                    <div className="flex items-center space-x-2">
                        <input 
                            type="text" 
                            className={cn(
                                "flex-1 text-xs px-3 py-1.5 rounded-lg border outline-none",
                                isDarkMode ? "bg-gray-800 border-gray-600 text-white" : "bg-gray-50 border-gray-200 text-gray-900"
                            )}
                            placeholder="Add note..."
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            autoFocus
                            onBlur={() => updateItemNote(item.id, noteText)}
                            onKeyDown={(e) => e.key === 'Enter' && updateItemNote(item.id, noteText)}
                        />
                    </div>
                ) : (
                    <div 
                        onClick={() => { setEditingNoteId(item.id); setNoteText(item.note || ""); }}
                        className={cn(
                            "text-[10px] flex items-center cursor-pointer hover:underline font-bold uppercase tracking-widest",
                            item.note ? "text-orange-500" : "text-gray-400"
                        )}
                    >
                        <MessageSquare className="w-3 h-3 mr-1.5" />
                        {item.note || "Add Note"}
                    </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className={cn("p-6 border-t space-y-4", isDarkMode ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200")}>
        <div className={cn("space-y-2 text-xs font-bold", isDarkMode ? "text-gray-400" : "text-gray-500")}>
          <div className="flex justify-between">
            <span className="uppercase tracking-widest">Subtotal</span>
            <span className="text-gray-900 dark:text-white">{formatPrice(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
              <div className="flex justify-between text-red-500">
                <span className="uppercase tracking-widest">
                  Discount {discountType === "percent" ? `(${Math.min(100, parsedDiscountValue)}%)` : ""}
                </span>
                <span>-{formatPrice(discountAmount)}</span>
              </div>
          )}
          {taxPercent > 0 && (
              <div className="flex justify-between">
                <span className="uppercase tracking-widest">Tax ({taxPercent}%)</span>
                <span className="text-gray-900 dark:text-white">{formatPrice(tax)}</span>
              </div>
          )}
          {servicePercent > 0 && (
              <div className="flex justify-between">
                <span className="uppercase tracking-widest">Service ({servicePercent}%)</span>
                <span className="text-gray-900 dark:text-white">{formatPrice(serviceCharge)}</span>
              </div>
          )}
          {tip > 0 && (
              <div className="flex justify-between text-blue-600 dark:text-blue-400">
                <span className="uppercase tracking-widest">Tip</span>
                <span>{formatPrice(tip)}</span>
              </div>
          )}
        </div>
        <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
          <span className="font-black text-sm uppercase tracking-widest">Total</span>
          <span className="font-black text-3xl text-[#2271b1]">{formatPrice(total)}</span>
        </div>
        <button 
          onClick={() => {
            setIsCheckoutOpen(true);
            if (isMobile && onClose) onClose();
          }}
          disabled={cart.length === 0}
          className="w-full py-5 bg-[#2271b1] text-white font-black rounded-2xl shadow-xl shadow-blue-500/20 hover:bg-[#135e96] transition-all active:scale-[0.98] disabled:opacity-50 disabled:shadow-none flex items-center justify-center space-x-2 text-sm uppercase tracking-widest"
        >
          <span>Charge {formatPrice(total)}</span>
        </button>
      </div>
    </div>
  );

  if (orderSuccess) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
        <div className={cn(
          "rounded-2xl shadow-2xl w-full max-w-md p-8 text-center space-y-6 transition-colors duration-300 border",
          isDarkMode ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-900"
        )}>
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto transition-colors">
            <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-3xl font-black">Order Completed!</h2>
            <p className={cn("text-sm font-medium mt-1", isDarkMode ? "text-gray-400" : "text-gray-500")}>Order #{orderSuccess.id}</p>
          </div>
          
          <div className={cn("border-t border-b py-6 space-y-3 transition-colors", isDarkMode ? "border-gray-700" : "border-gray-100")}>
            <div className="flex justify-between items-center">
              <span className={cn("text-sm", isDarkMode ? "text-gray-400" : "text-gray-600")}>Total Amount</span>
              <span className="text-xl font-black text-[#2271b1]">{formatPrice(orderSuccess.total)}</span>
            </div>
            {orderSuccess.paymentMode === 'cash' && (
              <div className="flex justify-between items-center text-green-600 dark:text-green-400">
                <span className="text-sm">Change</span>
                <span className="text-xl font-black">{formatPrice(orderSuccess.change)}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <button 
              onClick={handlePrintReceipt}
              className={cn(
                "px-6 py-4 border rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95",
                isDarkMode 
                  ? "border-gray-700 bg-gray-700 hover:bg-gray-600 text-white" 
                  : "border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
              )}
            >
              Print Receipt
            </button>
            <button 
              onClick={() => {
                setOrderSuccess(null);
                setCashReceived("");
                setPaymentMethod(paymentMethods[0]?.id || "cash");
                setDiscountType("nominal");
                setDiscountValue("");
                setTipAmount("");
              }} 
              className="px-6 py-4 bg-[#2271b1] hover:bg-[#135e96] text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-blue-500/20"
            >
              New Order
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-screen flex flex-col overflow-hidden transition-colors duration-300", isDarkMode ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900")}>
      {isCameraScanOpen && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
          <div className={cn("w-full max-w-md rounded-2xl overflow-hidden border shadow-2xl", isDarkMode ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200")}>
            <div className={cn("p-4 flex items-center justify-between border-b", isDarkMode ? "border-gray-800" : "border-gray-100")}>
              <div className={cn("font-black text-sm uppercase tracking-widest", isDarkMode ? "text-white" : "text-gray-900")}>
                Scan Barcode
              </div>
              <button
                type="button"
                onClick={() => setIsCameraScanOpen(false)}
                className={cn("p-2 rounded-lg", isDarkMode ? "hover:bg-gray-800 text-gray-200" : "hover:bg-gray-100 text-gray-700")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative bg-black">
              <video ref={videoRef} className="w-full aspect-[3/4] object-cover" playsInline muted />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[70%] h-[38%] rounded-2xl border-2 border-white/70" />
              </div>
              {cameraScanError && (
                <div className="absolute left-3 right-3 bottom-3 px-3 py-2 rounded-xl bg-black/70 text-white text-xs font-bold">
                  {cameraScanError}
                </div>
              )}
            </div>

            <div className={cn("p-4 text-[11px] font-bold", isDarkMode ? "text-gray-300" : "text-gray-600")}>
              Point the camera at a product barcode. Items will be added automatically.
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <header className={cn("border-b h-16 md:h-20 flex items-center justify-between px-4 md:px-6 shadow-sm z-10 transition-colors duration-300", isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
        <div className="flex items-center space-x-3 md:space-x-4">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-[#2271b1] rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-900/20">
            {store.name.charAt(0)}
          </div>
          <div className="hidden sm:block">
            <h1 className={cn("font-bold text-sm md:text-lg leading-tight", isDarkMode ? "text-white" : "text-gray-900")}>{store.name}</h1>
            <p className={cn("text-[10px] md:text-xs", isDarkMode ? "text-gray-400" : "text-gray-500")}>POS System • {user.role === 'CASHIER' ? 'Cashier' : 'Admin'}</p>
          </div>
        </div>
        
        <div className="flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <input 
              type="text" 
              placeholder="Search / Scan barcode..." 
              className={cn(
                "w-full pl-9 pr-12 py-2 border-transparent rounded-lg transition-all outline-none text-sm",
                scanFlash === "ok" ? "ring-2 ring-green-500" : "",
                scanFlash === "err" ? "ring-2 ring-red-500" : "",
                isDarkMode 
                  ? "bg-gray-700 text-white placeholder-gray-400 focus:bg-gray-600 focus:border-[#2271b1]" 
                  : "bg-gray-100 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-[#2271b1]"
              )}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const handled = processScannedBarcode(searchQuery);
                  if (handled) e.preventDefault();
                }
              }}
              autoFocus
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <button
              type="button"
              onClick={() => setIsCameraScanOpen(true)}
              className={cn(
                "absolute right-2 top-1.5 p-2 rounded-lg transition-colors",
                isDarkMode ? "hover:bg-gray-600 text-gray-200" : "hover:bg-white text-gray-700"
              )}
              title="Scan with camera"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2 md:space-x-4">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={cn("p-2 rounded-full transition-colors", isDarkMode ? "hover:bg-gray-700 text-yellow-400" : "hover:bg-gray-100 text-gray-600")}
          >
            {isDarkMode ? <Sun className="w-4 h-4 md:w-5 md:h-5" /> : <Moon className="w-4 h-4 md:w-5 md:h-5" />}
          </button>

          <div className="relative">
            <button
              onClick={() => setNotificationsOpen((v) => !v)}
              className={cn(
                "p-2 rounded-full transition-colors relative",
                isDarkMode ? "hover:bg-gray-700 text-gray-200" : "hover:bg-gray-100 text-gray-700"
              )}
              title="Notifications"
            >
              <Bell className="w-4 h-4 md:w-5 md:h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-black rounded-full px-1.5 py-0.5">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <div className={cn(
                "absolute right-0 top-12 w-80 md:w-96 rounded-2xl shadow-2xl border overflow-hidden z-50",
                isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
              )}>
                <div className={cn("p-4 flex items-center justify-between border-b", isDarkMode ? "border-gray-700" : "border-gray-100")}>
                  <div>
                    <div className={cn("font-black text-sm", isDarkMode ? "text-white" : "text-gray-900")}>Notifications</div>
                    <div className={cn("text-[10px] font-black uppercase tracking-widest", isDarkMode ? "text-gray-400" : "text-gray-400")}>
                      {unreadCount ? `${unreadCount} unread` : "All caught up"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={markAllNotifRead}
                    disabled={!unreadCount}
                    className={cn("text-[10px] font-black uppercase tracking-widest", isDarkMode ? "text-blue-400 disabled:text-gray-600" : "text-[#2271b1] disabled:text-gray-300")}
                  >
                    Mark all read
                  </button>
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className={cn("p-4 text-sm italic", isDarkMode ? "text-gray-400" : "text-gray-500")}>No notifications yet.</div>
                  ) : (
                    <div className={cn("divide-y", isDarkMode ? "divide-gray-700" : "divide-gray-100")}>
                      {notifications.map((n: any) => (
                        <div key={n.id} className={cn("p-4", !n.isRead ? (isDarkMode ? "bg-orange-900/10" : "bg-orange-50/60") : "")}>
                          <div className="flex items-start justify-between gap-2">
                            <div className={cn("text-sm font-bold", isDarkMode ? "text-white" : "text-gray-900")}>
                               {n.type === 'NEW_ORDER' ? '🛒 Pesanan Baru' : (n.type === 'PAYMENT_SUCCESS' ? '✅ Pembayaran Lunas' : '🔔 Notifikasi Order')}
                            </div>
                            <div className={cn("text-[10px] font-black uppercase tracking-widest shrink-0", isDarkMode ? "text-gray-400" : "text-gray-400")}>
                              {formatIsoHourMinute(n.createdAt)}
                            </div>
                          </div>
                          <div className={cn("text-xs mt-1", isDarkMode ? "text-gray-300" : "text-gray-600")}>{n.message}</div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className={cn("text-[10px] font-black uppercase tracking-widest", isDarkMode ? "text-gray-400" : "text-gray-400")}>
                              Order #{n.orderId}
                            </div>
                            {!n.isRead && (
                              <button
                                type="button"
                                onClick={() => markNotifRead(n.id)}
                                className={cn("inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest", isDarkMode ? "text-blue-400" : "text-[#2271b1]")}
                              >
                                <Check className="w-3 h-3" />
                                Read
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div className={cn("hidden md:flex items-center space-x-2 text-sm font-medium px-3 py-1.5 rounded-full", isDarkMode ? "bg-gray-700 text-gray-200" : "bg-gray-50 text-gray-700")}>
            <User className="w-4 h-4" />
            <span className="max-w-[100px] truncate">{user.name || user.email}</span>
          </div>
          <button 
            onClick={() => signOut({ callbackUrl: `/login` })}
            className="p-2 text-gray-400 hover:text-red-600 transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Products */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Categories */}
          <div className={cn("border-b px-4 md:px-6 py-3 flex space-x-2 overflow-x-auto transition-colors duration-300 scrollbar-hide", isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
            <button 
              onClick={() => setSelectedCategory("all")}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-colors",
                selectedCategory === "all" 
                  ? "bg-[#2271b1] text-white shadow-md shadow-blue-500/20" 
                  : isDarkMode 
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600" 
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              All Items
            </button>
            {categories.map(cat => (
              <button 
                key={cat.id}
                onClick={() => setSelectedCategory(cat.slug)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-colors",
                  selectedCategory === cat.slug 
                    ? "bg-[#2271b1] text-white shadow-md shadow-blue-500/20" 
                    : isDarkMode 
                      ? "bg-gray-700 text-gray-300 hover:bg-gray-600" 
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Action Bar (Selection & Note) */}
          <div className={cn("px-4 md:px-6 py-3 border-b transition-colors duration-300 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 md:gap-4", isDarkMode ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200")}>
             <div className="flex-1 flex items-center gap-2 md:gap-4">
                <div className={cn("flex-1 h-10 md:h-12 rounded-xl border-2 flex items-center px-3 md:px-4 transition-colors text-xs md:text-sm", 
                    selectedProduct 
                        ? isDarkMode ? "bg-gray-700 border-[#2271b1]" : "bg-white border-[#2271b1]"
                        : isDarkMode ? "bg-gray-800 border-gray-600" : "bg-gray-100 border-gray-200"
                )}>
                    {selectedProduct ? (
                        <span className={cn("font-bold truncate", isDarkMode ? "text-white" : "text-gray-900")}>{selectedProduct.name}</span>
                    ) : (
                        <span className="text-gray-400 italic">Select item...</span>
                    )}
                </div>
                
                <div className="relative flex-[1.5]">
                    <input 
                        type="text" 
                        placeholder="Add info..." 
                        disabled={!selectedProduct}
                        value={preCartNote}
                        onChange={(e) => setPreCartNote(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && selectedProduct) {
                                addToCart(selectedProduct, preCartNote);
                            }
                        }}
                        className={cn(
                            "w-full h-10 md:h-12 pl-9 md:pl-10 pr-4 rounded-xl border-2 outline-none transition-all text-xs md:text-sm",
                            isDarkMode 
                                ? "bg-gray-700 border-gray-600 text-white focus:border-[#2271b1] disabled:opacity-50" 
                                : "bg-white border-gray-200 text-gray-900 focus:border-[#2271b1] disabled:bg-gray-50"
                        )}
                    />
                    <MessageSquare className="w-4 h-4 text-gray-400 absolute left-3 top-3 md:top-4" />
                </div>

                <button 
                    onClick={() => selectedProduct && addToCart(selectedProduct, preCartNote)}
                    disabled={!selectedProduct}
                    className="h-10 md:h-12 px-4 md:px-8 bg-[#2271b1] hover:bg-[#135e96] text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95 flex items-center gap-1 md:gap-2 text-xs md:text-sm"
                >
                    <Plus className="w-4 h-4 md:w-6 md:h-6" />
                    <span>ADD</span>
                </button>
             </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
              {filteredProducts.map(product => (
                <div 
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className={cn(
                    "rounded-xl shadow-sm border cursor-pointer transition-all group active:scale-95 duration-100 flex flex-col justify-between min-h-[100px] md:min-h-[120px] overflow-hidden relative p-3 md:p-5",
                    selectedProduct?.id === product.id
                        ? "ring-2 ring-[#2271b1] ring-offset-2 scale-[0.98]"
                        : isDarkMode 
                            ? "bg-gray-800 border-gray-700 hover:border-[#2271b1]/50 hover:shadow-lg hover:shadow-blue-900/10" 
                            : "bg-white border-gray-200 hover:border-[#2271b1]/30 hover:shadow-md"
                  )}
                >
                  <div className="flex-1 flex flex-col justify-center">
                    <h3 className={cn("font-bold text-xs md:text-base mb-1 md:mb-2 leading-tight line-clamp-2", isDarkMode ? "text-gray-100" : "text-gray-900")}>{product.name}</h3>
                    <p className="text-[#2271b1] font-black text-sm md:text-xl">{formatPrice(product.price)}</p>
                    {product.stock <= 0 && (
                        <span className="text-red-500 text-[10px] font-bold mt-1">Out of Stock</span>
                    )}
                  </div>
                  {/* Selection Indicator */}
                  {selectedProduct?.id === product.id && (
                      <div className="absolute top-1 right-1 md:top-2 md:right-2 w-5 h-5 md:w-6 md:h-6 bg-[#2271b1] rounded-full flex items-center justify-center text-white shadow-lg">
                          <CheckCircle className="w-3 h-3 md:w-4 md:h-4" />
                      </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Floating Mobile Cart Button */}
          {cart.length > 0 && (
            <div className="md:hidden fixed bottom-6 right-6 z-40">
              <button
                onClick={() => setIsMobileCartOpen(true)}
                className="w-16 h-16 bg-[#2271b1] text-white rounded-full shadow-2xl flex items-center justify-center relative animate-in zoom-in duration-300"
              >
                <ShoppingCart className="w-8 h-8" />
                <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full text-[10px] font-black flex items-center justify-center border-2 border-white dark:border-gray-900">
                  {cart.reduce((acc, item) => acc + item.quantity, 0)}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Cart (Desktop Sidebar) */}
        <div className={cn("hidden md:flex w-80 lg:w-96 border-l shadow-xl flex-col z-20 transition-colors duration-300", isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
          <CartContent />
        </div>
      </div>

      {/* Mobile Cart Sheet */}
      {isMobileCartOpen && (
        <div className="md:hidden fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-300">
          <div className={cn("w-full h-[85vh] rounded-t-[32px] flex flex-col animate-in slide-in-from-bottom duration-500", isDarkMode ? "bg-gray-800" : "bg-white")}>
            <div className="flex items-center justify-center py-4">
              <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full" />
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
               <CartContent isMobile onClose={() => setIsMobileCartOpen(false)} />
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={cn("rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[88vh]", isDarkMode ? "bg-gray-800 text-white" : "bg-white text-gray-900")}>
            <div className={cn("p-4 border-b flex items-center justify-between", isDarkMode ? "bg-gray-900 border-gray-700" : "bg-gray-50 border-gray-200")}>
              <h2 className="text-lg font-bold">Payment</h2>
              <button onClick={() => setIsCheckoutOpen(false)} className={cn("p-2 rounded-full", isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-200")}>
                <X className={cn("w-6 h-6", isDarkMode ? "text-gray-400" : "text-gray-500")} />
              </button>
            </div>
            
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* Payment Methods */}
              <div className={cn("w-full md:w-1/3 border-r p-3 space-y-1.5 overflow-y-auto", isDarkMode ? "bg-gray-900 border-gray-700" : "bg-gray-50 border-gray-200")}>
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setPaymentMethod(method.id)}
                    className={cn(
                      "w-full p-2.5 rounded-xl flex items-center space-x-2 transition-all border-2",
                      paymentMethod === method.id
                        ? "border-[#2271b1] bg-[#2271b1]/10 text-[#2271b1] shadow-md"
                        : isDarkMode ? "border-transparent hover:bg-gray-800 text-gray-400" : "border-transparent hover:bg-gray-100 text-gray-600"
                    )}
                  >
                    {method.mode === "cash" && <Banknote className="w-4 h-4" />}
                    {method.mode === "qris" && <Smartphone className="w-4 h-4" />}
                    {(method.mode === "card" || method.mode === "transfer" || method.mode === "other") && <CreditCard className="w-4 h-4" />}
                    <span className="font-bold text-sm">{method.name}</span>
                  </button>
                ))}
              </div>

              {/* Payment Details */}
              <div className="flex-1 p-4 flex flex-col overflow-y-auto">
                <div className="flex-1">
                    <div className="text-center mb-4">
                        <p className={cn("mb-1", isDarkMode ? "text-gray-400" : "text-gray-500")}>Total Amount</p>
                        <p className="text-3xl font-black text-[#2271b1]">{formatPrice(total)}</p>
                        <div className={cn("text-[11px] mt-1 space-y-0.5", isDarkMode ? "text-gray-500" : "text-gray-400")}>
                            {tax > 0 && <div>Includes Tax: {formatPrice(tax)}</div>}
                            {serviceCharge > 0 && <div>Includes Service: {formatPrice(serviceCharge)}</div>}
                            {/* {paymentFee > 0 && <div>Includes Platform Fee: {formatPrice(paymentFee)}</div>} */}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-1 gap-2 mb-3">
                      <div>
                        <label className={cn("block text-xs font-bold mb-1", isDarkMode ? "text-gray-300" : "text-gray-700")}>Discount</label>
                        <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                            <button
                                type="button"
                                onClick={() => setDiscountType("nominal")}
                                className={cn(
                                    "py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border",
                                    discountType === "nominal"
                                        ? "border-[#2271b1] bg-[#2271b1]/10 text-[#2271b1]"
                                        : isDarkMode ? "border-gray-600 text-gray-300" : "border-gray-200 text-gray-600"
                                )}
                            >
                                Rp
                            </button>
                            <button
                                type="button"
                                onClick={() => setDiscountType("percent")}
                                className={cn(
                                    "py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border",
                                    discountType === "percent"
                                        ? "border-[#2271b1] bg-[#2271b1]/10 text-[#2271b1]"
                                        : isDarkMode ? "border-gray-600 text-gray-300" : "border-gray-200 text-gray-600"
                                )}
                            >
                                %
                            </button>
                            <button
                                type="button"
                                onClick={() => setDiscountValue("")}
                                className={cn(
                                    "py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border",
                                    isDarkMode ? "border-gray-600 text-gray-300" : "border-gray-200 text-gray-600"
                                )}
                            >
                                Reset
                            </button>
                        </div>
                        <div className="relative">
                            {discountType === "nominal" ? (
                              <span className="absolute left-4 top-3.5 text-gray-400 font-bold">Rp</span>
                            ) : (
                              <span className="absolute left-4 top-3.5 text-gray-400 font-bold">%</span>
                            )}
                            <input
                                type="number"
                                className={cn(
                                    "w-full pl-10 pr-3 py-2 text-sm border-2 rounded-xl focus:border-[#2271b1] outline-none",
                                    isDarkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-200"
                                )}
                                placeholder="0"
                                value={discountValue}
                                onChange={(e) => setDiscountValue(e.target.value)}
                            />
                        </div>
                        {discountAmount > 0 && (
                          <p className="text-[11px] font-bold text-red-500 mt-1">-{formatPrice(discountAmount)}</p>
                        )}
                      </div>
                      <div>
                                <label className={cn("block text-xs font-bold mb-1", isDarkMode ? "text-gray-300" : "text-gray-700")}>Tip</label>
                        <div className="relative">
                            <span className="absolute left-4 top-3.5 text-gray-400 font-bold">Rp</span>
                            <input 
                                type="number" 
                                className={cn(
                                    "w-full pl-10 pr-3 py-2 text-sm border-2 rounded-xl focus:border-[#2271b1] outline-none",
                                    isDarkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-200"
                                )}
                                placeholder="0"
                                value={tipAmount}
                                onChange={(e) => setTipAmount(e.target.value)}
                            />
                        </div>
                      </div>
                    </div>

                    {activePaymentMode === "cash" && (
                        <div className="space-y-3 max-w-[220px] mx-auto">
                            <div>
                                <label className={cn("block text-xs font-bold mb-1", isDarkMode ? "text-gray-300" : "text-gray-700")}>Cash Received</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-3.5 text-gray-400 font-bold">Rp</span>
                                    <input 
                                        type="number" 
                                        className={cn(
                                            "w-full pl-10 pr-3 py-2 text-base font-bold border-2 rounded-xl focus:border-[#2271b1] outline-none transition-colors",
                                            isDarkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-200"
                                        )}
                                        placeholder="0"
                                        value={cashReceived}
                                        onChange={(e) => setCashReceived(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-1">
                                {[10000, 20000, 50000, 100000].map((amount) => (
                                    <button 
                                        key={amount}
                                        onClick={() => {
                                            const current = parseFloat(cashReceived || "0") || 0;
                                            setCashReceived((current + amount).toString());
                                        }}
                                        className={cn(
                                            "py-1.5 px-1 rounded-lg text-[11px] font-bold min-w-0",
                                            isDarkMode ? "bg-gray-700 hover:bg-gray-600 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                                        )}
                                    >
                                        {amount / 1000}k
                                    </button>
                                ))}
                                <button
                                    onClick={() => setCashReceived("")}
                                    className={cn(
                                        "py-1.5 px-1 rounded-lg text-[11px] font-bold min-w-0",
                                        isDarkMode ? "bg-gray-700 hover:bg-gray-600 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                                    )}
                                >
                                    Reset Cash
                                </button>
                                <button 
                                    onClick={() => setCashReceived(total.toString())}
                                    className="py-1.5 px-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[11px] font-bold col-span-2"
                                >
                                    Exact Amount
                                </button>
                            </div>

                            {parseFloat(cashReceived || '0') >= total && (
                                <div className={cn("p-4 rounded-xl border flex justify-between items-center", isDarkMode ? "bg-green-900/20 border-green-800" : "bg-green-50 border-green-100")}>
                                    <span className={cn("font-medium", isDarkMode ? "text-green-400" : "text-green-800")}>Change Due</span>
                                    <span className={cn("font-bold text-xl", isDarkMode ? "text-green-400" : "text-green-700")}>
                                        {formatPrice(parseFloat(cashReceived) - total)}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {activePaymentMode === "transfer" && (
                         <div className="text-center space-y-4">
                            <div className={cn("p-4 rounded-xl inline-block", isDarkMode ? "bg-gray-700" : "bg-gray-100")}>
                                <CreditCard className="w-12 h-12 text-gray-400 mx-auto" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg">{store.bankAccount?.bankName || "Bank Transfer"}</h3>
                                <p className="text-2xl font-mono my-2">{store.bankAccount?.accountNumber || "88888888"}</p>
                                <p className="text-gray-500">{store.bankAccount?.accountName || "Platform Account"}</p>
                            </div>
                            <div className="bg-yellow-50 text-yellow-800 p-3 rounded-lg text-sm">
                                Confirm transfer receipt manually before completing order.
                            </div>
                         </div>
                    )}

                    {activePaymentMode === "qris" && (
                         <div className="text-center space-y-4">
                            <div className={cn("border-2 p-4 rounded-xl inline-block w-48 h-48 flex items-center justify-center", isDarkMode ? "bg-white border-gray-600" : "bg-white border-gray-200")}>
                                <Smartphone className="w-16 h-16 text-gray-300" />
                                {/* Here you would generate the QR Code */}
                            </div>
                            <p className="text-sm text-gray-500">Scan QRIS to pay</p>
                            <button className="text-[#2271b1] text-sm font-bold hover:underline">
                                Generate New QR
                            </button>
                         </div>
                    )}
                    {(activePaymentMode === "card" || activePaymentMode === "other") && (
                         <div className="text-center space-y-4">
                            <div className={cn("p-4 rounded-xl inline-block", isDarkMode ? "bg-gray-700" : "bg-gray-100")}>
                                <CreditCard className="w-12 h-12 text-gray-400 mx-auto" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg">{activePaymentMethod?.name || "Card / Other"}</h3>
                                <p className="text-sm text-gray-500 mt-2">Process payment on your terminal/device, then complete this order.</p>
                            </div>
                         </div>
                    )}
                </div>

                <div className="mt-4 sticky bottom-0 bg-inherit pt-2">
                    <button 
                        onClick={handleCheckout}
                        disabled={isProcessing || (activePaymentMode === 'cash' && parseFloat(cashReceived || '0') < total)}
                        className="w-full py-4 bg-[#2271b1] text-white font-bold text-lg rounded-xl shadow-lg hover:bg-[#135e96] transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            `Complete Payment • ${formatPrice(total)}`
                        )}
                    </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShoppingBagIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
    )
}
