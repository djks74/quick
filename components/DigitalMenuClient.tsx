"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { 
  ShoppingCart, 
  Minus, 
  Plus, 
  Trash2, 
  CreditCard, 
  MessageCircle, 
  Phone, 
  Globe, 
  X,
  Search,
  ChevronRight,
  Info,
  Clock,
  ArrowRight,
  ChevronDown,
  Utensils,
  CupSoda,
  Package,
  Home,
  Loader2,
  CheckCircle2,
  MapPin,
  Navigation
} from "lucide-react";
import { siteConfig } from "@/config/site";
import { useSearchParams } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

interface Product {
  id: number;
  name: string;
  price: number;
  unit: string;
  image?: string;
  description?: string;
  category?: string;
  variations?: { name: string; price: number }[];
}

interface CartItem extends Product {
  quantity: number;
  selectedVariation?: { name: string; price: number };
}

interface Category {
  id: number;
  name: string;
  slug: string;
}

// Helper component for category-based animated icons
const CategoryIcon = ({ category, themeColor }: { category?: string, themeColor: string }) => {
  const name = category?.toLowerCase() || "";
  
  // Expanded logic to detect category type
  const isFood = name.includes("makan") || name.includes("food") || name.includes("nasi") || name.includes("mie") || name.includes("snack") || name.includes("ayam") || name.includes("satay") || name.includes("bread") || name.includes("cake") || name.includes("goreng") || name.includes("bakso") || name.includes("soto");
  const isDrink = name.includes("minum") || name.includes("drink") || name.includes("teh") || name.includes("kopi") || name.includes("coffee") || name.includes("juice") || name.includes("water") || name.includes("milk") || name.includes("soda") || name.includes("tea") || name.includes("ice") || name.includes("es");

  if (isFood) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-orange-50 dark:bg-orange-500/10 rounded-2xl group-hover:bg-orange-100 dark:group-hover:bg-orange-500/20 transition-colors">
        <Utensils className="w-8 h-8 text-orange-500 animate-bounce duration-2000" />
      </div>
    );
  }

  if (isDrink) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-blue-50 dark:bg-blue-500/10 rounded-2xl group-hover:bg-blue-100 dark:group-hover:bg-blue-500/20 transition-colors">
        <CupSoda className="w-8 h-8 text-blue-500 animate-pulse duration-1500" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-2xl group-hover:bg-gray-100 dark:group-hover:bg-gray-700 transition-colors">
      <Package className="w-8 h-8 text-gray-300 dark:text-gray-500" />
    </div>
  );
};

export default function DigitalMenuClient({ products, store, categories = [] }: { products: Product[], store: any, categories?: Category[] }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<number | null>(null);
  const [bankInfo, setBankInfo] = useState<any>(null);
  const [finalAmount, setFinalAmount] = useState<number>(0);
  const searchParams = useSearchParams();
  const tableNumber = searchParams.get('table');

  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  // Variation State
  const [variationModalOpen, setVariationModalOpen] = useState(false);
  const [productForVariation, setProductForVariation] = useState<Product | null>(null);
  const [selectedVariation, setSelectedVariation] = useState<{ name: string; price: number } | null>(null);
  
  // Check-In State
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [customerPhone, setCustomerPhone] = useState("");
  const [checkInStep, setCheckInStep] = useState<'input' | 'choice' | 'success'>('input');
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkInFallbackUrl, setCheckInFallbackUrl] = useState("");
  const [checkoutPhone, setCheckoutPhone] = useState("");
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'>(tableNumber ? 'DINE_IN' : 'TAKEAWAY');
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryLatitude, setDeliveryLatitude] = useState<number | null>(null);
  const [deliveryLongitude, setDeliveryLongitude] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [shippingQuotes, setShippingQuotes] = useState<any[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<any | null>(null);
  const [isFetchingQuotes, setIsFetchingQuotes] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'qris' | 'bank'>('qris');
  
  useEffect(() => {
    setMounted(true);

    // Auto-login from WhatsApp button (?phone=xxx)
    const phoneParam = searchParams.get('phone');
    if (phoneParam) {
      const storePhoneKey = `customerPhone:${store.id}`;
      localStorage.setItem(storePhoneKey, phoneParam);
      localStorage.setItem('customerPhone', phoneParam);
      setCustomerPhone(phoneParam);
      if (tableNumber) {
        localStorage.setItem(`checkin:${store.id}:${tableNumber}`, JSON.stringify({ phone: phoneParam, at: Date.now() }));
      }
      setShowCheckIn(false);
      return;
    }

    // Check-In Logic
    if (tableNumber) {
        const checkinKey = `checkin:${store.id}:${tableNumber}`;
        const storePhoneKey = `customerPhone:${store.id}`;
        const storedPhone = localStorage.getItem(storePhoneKey) || localStorage.getItem('customerPhone') || "";
        const rawCheckin = localStorage.getItem(checkinKey);
        let hasValidCheckin = false;
        if (rawCheckin) {
          try {
            const parsed = JSON.parse(rawCheckin);
            const at = Number(parsed?.at || 0);
            const phone = String(parsed?.phone || "");
            if (phone && at && (Date.now() - at) <= 15 * 60 * 1000) {
              hasValidCheckin = true;
              setCustomerPhone(phone);
            }
          } catch {
          }
        }
        if (!hasValidCheckin) {
          if (storedPhone) setCustomerPhone(storedPhone);
          setShowCheckIn(true);
        }
    }
  }, [tableNumber, store.id]);

  useEffect(() => {
    if (customerPhone) {
      setCheckoutPhone(customerPhone);
      return;
    }
    const stored = localStorage.getItem(`customerPhone:${store.id}`) || localStorage.getItem('customerPhone');
    if (stored) setCheckoutPhone(stored);
  }, [customerPhone, store.id]);

  useEffect(() => {
    if (orderType !== 'TAKEAWAY') {
      setShippingQuotes([]);
      setSelectedQuote(null);
    }
  }, [orderType]);

  const handleCheckIn = () => {
    if (!customerPhone) return;
    setIsSubmitting(true);
    setTimeout(() => {
        setCheckInStep('choice');
        setIsSubmitting(false);
    }, 600);
  };

  const handleChoice = async (choice: 'whatsapp' | 'web') => {
      const storePhoneKey = `customerPhone:${store.id}`;
      localStorage.setItem(storePhoneKey, customerPhone);
      localStorage.setItem('customerPhone', customerPhone);
      if (tableNumber) {
        localStorage.setItem(`checkin:${store.id}:${tableNumber}`, JSON.stringify({ phone: customerPhone, at: Date.now() }));
      }
      setIsCheckingIn(true);
      try {
          const res = await fetch('/api/check-in', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  phone: customerPhone,
                  storeId: store.id,
                  tableNumber,
                  type: choice
              })
          });
          
          const data = await res.json();
          const platformNumber = "62882003961609";
          const fallbackText = "Menu";
          const whatsappUrl = data?.messageSent
            ? `https://wa.me/${platformNumber}`
            : `https://wa.me/${platformNumber}?text=${encodeURIComponent(fallbackText)}`;
          setCheckInFallbackUrl(whatsappUrl);

          if (choice === 'whatsapp') {
              setCheckInStep('success');
          } else {
              // Directly on web, just close
              setShowCheckIn(false);
          }
      } catch (e) {
          console.error("Check-in trigger failed:", e);
          // Fallback if API fails
          if (choice === 'whatsapp') {
              const platformNumber = "62882003961609";
              const whatsappUrl = `https://wa.me/${platformNumber}?text=${encodeURIComponent("Menu")}`;
              setCheckInFallbackUrl(whatsappUrl);
              setCheckInStep('success');
              return;
          }
          setShowCheckIn(false);
      } finally {
          setIsCheckingIn(false);
      }
  };

  const addToCart = (product: Product, variation?: { name: string; price: number }) => {
    if (product.variations && product.variations.length > 0 && !variation) {
        setProductForVariation(product);
        setSelectedVariation(product.variations[0]);
        setVariationModalOpen(true);
        return;
    }

    const price = variation ? variation.price : product.price;
    const variationName = variation ? variation.name : undefined;

    setCart(prev => {
      const existing = prev.find(item => 
          item.id === product.id && 
          item.selectedVariation?.name === variationName
      );

      if (existing) {
        return prev.map(item => 
          (item.id === product.id && item.selectedVariation?.name === variationName)
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, { ...product, price, quantity: 1, selectedVariation: variation }];
    });
  };

  const updateQuantity = (productId: number, delta: number, variationName?: string) => {
    setCart(prev => prev.map(item => {
      if (item.id === productId && item.selectedVariation?.name === variationName) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const taxPercent = parseFloat(store.taxPercent?.toString() || "0");
  const servicePercent = parseFloat(store.serviceChargePercent?.toString() || "0");
  const qrisFeePercent = parseFloat((store.qrisFeePercent ?? 0).toString());
  const transferFee = parseFloat((store.manualTransferFee ?? 0).toString());
  const isCustomerPaysFee = store.feePaidBy === 'CUSTOMER';

  const roundIdr = (n: number) => Math.round(Number.isFinite(n) ? n : 0);

  const subtotal = useMemo(() => roundIdr(cart.reduce((acc, item) => acc + (Number(item.price) * Number(item.quantity)), 0)), [cart]);
  const tax = roundIdr(subtotal * (taxPercent / 100));
  const serviceCharge = roundIdr(subtotal * (servicePercent / 100));
  const totalPrice = subtotal + tax + serviceCharge;

  const calculatePlatformFee = (method: 'qris' | 'transfer') => {
      if (!isCustomerPaysFee) return 0;
      if (method === 'qris') return roundIdr(totalPrice * (qrisFeePercent / 100));
      if (method === 'transfer') return roundIdr(transferFee); 
      return 0;
  };

  const handleWhatsAppCheckout = (method: 'qris' | 'bank') => {
    if (cart.length === 0) return;
    if (!store.isOpen) {
        alert("Sorry, the store is currently closed and not accepting orders.");
        return;
    }
    let fee = isCustomerPaysFee ? (method === 'qris' ? calculatePlatformFee('qris') : calculatePlatformFee('transfer')) : 0;
    const finalTotal = totalPrice + fee;

    let message = tableNumber ? `check-in meja ${tableNumber}` : `menu`;
    message += method === "qris" ? `\n\nsaya mau bayar qris` : `\n\nsaya mau bayar bank`;
    const platformNumber = "62882003961609";
    const whatsappUrl = `https://wa.me/${platformNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const getEnabledShippingProviders = () => {
    const options: string[] = [];
    if (store.shippingEnableJne) options.push("JNE");
    if (store.shippingEnableGosend && !store.shippingJneOnly) options.push("GOSEND");
    return options;
  };

  const shareLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setDeliveryLatitude(latitude);
        setDeliveryLongitude(longitude);
        setIsLocating(false);
        // If we already have an address, re-fetch quotes automatically
        if (deliveryAddress.trim()) {
          fetchShippingQuotes(latitude, longitude);
        } else {
          alert("Location detected! Please also type your street address for the driver.");
        }
      },
      (error) => {
        setIsLocating(false);
        alert("Unable to retrieve your location. Please check your browser permissions.");
      }
    );
  };

  const fetchShippingQuotes = async (lat?: number | null, lng?: number | null) => {
    if (!store.enableTakeawayDelivery || orderType !== 'DELIVERY') return;
    if (!deliveryAddress.trim()) {
      setShippingQuotes([]);
      setSelectedQuote(null);
      return;
    }
    setIsFetchingQuotes(true);
    try {
      const res = await fetch('/api/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          destinationAddress: deliveryAddress.trim(),
          destinationLatitude: lat ?? deliveryLatitude,
          destinationLongitude: lng ?? deliveryLongitude
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !Array.isArray(data?.options)) {
        setShippingQuotes([]);
        setSelectedQuote(null);
        return;
      }

      const enabledProviders = getEnabledShippingProviders();
      const filtered = data.options.filter((opt: any) => enabledProviders.includes(String(opt.provider || "").toUpperCase()));
      setShippingQuotes(filtered);
      setSelectedQuote(filtered[0] || null);
    } catch {
      setShippingQuotes([]);
      setSelectedQuote(null);
    } finally {
      setIsFetchingQuotes(false);
    }
  };

  const currentShippingCost = orderType === 'DELIVERY' ? roundIdr(Number(selectedQuote?.fee || selectedQuote?.price || 0)) : 0;
  const platformFeeForDisplay = isCustomerPaysFee ? (paymentMethod === 'qris' ? calculatePlatformFee('qris') : calculatePlatformFee('transfer')) : 0;
  const finalTotalAmount = totalPrice + platformFeeForDisplay + currentShippingCost;

  const handleWebCheckout = async (method: 'qris' | 'bank') => {
    if (cart.length === 0) return;
    if (!store.isOpen) {
      alert("Sorry, the store is currently closed and not accepting orders.");
      return;
    }
    if (!checkoutPhone.trim()) {
      alert("Please fill your WhatsApp number first.");
      return;
    }

    if (orderType === 'DELIVERY') {
      if (!store.enableTakeawayDelivery) {
        alert("Delivery is not enabled for this store.");
        return;
      }
      if (!deliveryAddress.trim()) {
        alert("Please fill delivery address.");
        return;
      }
      if (!selectedQuote) {
        alert("Please select a shipping option.");
        return;
      }
    }

    setIsProcessing(true);
    try {
      const payload = {
        storeId: store.id,
        items: cart.map(item => ({
          id: item.id,
          quantity: item.quantity,
          price: item.price
        })),
        total: totalPrice + (isCustomerPaysFee ? (method === 'qris' ? calculatePlatformFee('qris') : calculatePlatformFee('transfer')) : 0) + currentShippingCost,
        orderType: orderType,
        customerInfo: {
          phone: checkoutPhone.trim(),
          tableNumber: tableNumber || undefined,
          shippingProvider: orderType === 'DELIVERY' ? selectedQuote?.provider : undefined,
          shippingService: orderType === 'DELIVERY' ? selectedQuote?.service : undefined,
          shippingAddress: orderType === 'DELIVERY' ? deliveryAddress.trim() : undefined,
          shippingCost: orderType === 'DELIVERY' ? currentShippingCost : 0,
          shippingEta: orderType === 'DELIVERY' ? selectedQuote?.etd || selectedQuote?.eta : undefined,
          destinationLatitude: orderType === 'DELIVERY' ? deliveryLatitude : undefined,
          destinationLongitude: orderType === 'DELIVERY' ? deliveryLongitude : undefined
        },
        paymentMethod: "midtrans",
        specificType: method === 'qris' ? 'qris' : 'bank_transfer'
      };

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        alert(data?.error || "Checkout failed");
        return;
      }

      // 1) Manual payment flow: redirect to internal payment page
      if (data?.isManual && data?.orderId) {
        window.location.href = `/checkout/pay/${data.orderId}`;
        return;
      }

      // 2) Gateway payment flow: prefer top-level paymentUrl (current API),
      //    but keep backward compatibility with nested fields if present.
      const paymentUrl =
        data?.paymentUrl ||
        data?.redirect_url ||
        data?.paymentResult?.paymentUrl ||
        data?.paymentResult?.invoiceUrl ||
        data?.paymentResult?.redirect_url;

      if (paymentUrl) {
        window.location.href = paymentUrl;
        return;
      }

      // 3) Fallback: if we only have order ID, send user to internal pay page
      const orderId = data?.orderId || data?.order?.id;
      if (orderId) {
        window.location.href = `/checkout/pay/${orderId}`;
        return;
      }

      alert("Payment link unavailable. Please try again.");
    } catch {
      alert("Checkout failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Hide System products (like Tagihan Manual)
      if (p.category === "System") return false;
      
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "All" || p.category?.toLowerCase() === selectedCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const themeColor = store?.themeColor || siteConfig.themeColor;

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#F8F9FB] dark:bg-[#0F1113] text-[#1A1C1E] dark:text-[#E8EAED] pb-32 font-sans selection:bg-opacity-30" style={{ '--theme-color': themeColor } as any}>
      {/* Dynamic Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#0F1113]/80 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center text-white font-black shadow-lg shadow-black/5" style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeColor}dd)` }}>
              {store.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight leading-none dark:text-white">{store.name}</h1>
              <div className="flex items-center gap-1.5 mt-1">
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  store.isOpen ? "bg-green-500 animate-pulse" : "bg-red-500"
                )} />
                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                  {store.isOpen ? "Open Now" : store.manualOpen === false ? "Closed (Manual)" : "Closed (Schedule)"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {tableNumber && (
              <div className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center gap-2 border border-gray-200/50 dark:border-gray-700/50">
                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter">Table</span>
                <span className="text-sm font-black text-gray-900 dark:text-white">{tableNumber}</span>
              </div>
            )}
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Link href="/" className="p-2.5 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors border border-gray-100 dark:border-gray-700">
                 <Home className="w-5 h-5" />
              </Link>
              <button 
                onClick={() => setIsCartOpen(true)}
                className="relative p-2.5 rounded-2xl bg-gray-900 text-white shadow-lg shadow-black/10 hover:scale-105 active:scale-95 transition-all"
                style={{ backgroundColor: themeColor }}
              >
                <ShoppingCart className="w-5 h-5" />
                {cart.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white dark:border-gray-900 animate-in zoom-in duration-300">
                    {cart.reduce((acc, item) => acc + item.quantity, 0)}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 pt-8 space-y-8">
        {/* Search Bar */}
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 dark:text-gray-600 group-focus-within:text-primary transition-colors" />
          <input 
            type="text"
            placeholder="Search our menu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white dark:bg-[#1A1D21] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-sm font-medium dark:text-white dark:placeholder:text-gray-600"
          />
        </div>

        {/* Category Scroll */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-6 px-6 sticky top-[81px] z-30 bg-[#F8F9FB]/95 dark:bg-[#0F1113]/95 backdrop-blur-md py-3">
          <button
            onClick={() => setSelectedCategory("All")}
            className={cn(
              "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
              selectedCategory === "All" 
                ? "bg-gray-900 text-white shadow-xl shadow-black/10 scale-105" 
                : "bg-white dark:bg-[#1A1D21] text-gray-400 dark:text-gray-500 border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700"
            )}
            style={selectedCategory === "All" ? { backgroundColor: themeColor } : {}}
          >
            All Menu
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.name)}
              className={cn(
                "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                selectedCategory === cat.name
                  ? "bg-gray-900 text-white shadow-xl shadow-black/10 scale-105"
                  : "bg-white dark:bg-[#1A1D21] text-gray-400 dark:text-gray-500 border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700"
              )}
              style={selectedCategory === cat.name ? { backgroundColor: themeColor } : {}}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product List */}
        <div className="grid gap-6">
          {filteredProducts.map((product) => {
            const cartItems = cart.filter(item => item.id === product.id);
            const totalQty = cartItems.reduce((acc, item) => acc + item.quantity, 0);

            return (
              <div key={product.id} className="group bg-white dark:bg-[#1A1D21] p-3.5 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl hover:shadow-black/5 transition-all duration-300 flex gap-4">
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gray-50 dark:bg-gray-800 flex-shrink-0 border border-gray-50 dark:border-gray-800 relative">
                  {product.image && product.image.startsWith('http') ? (
                    <Image 
                      src={product.image} 
                      alt={product.name} 
                      fill
                      unoptimized
                      className="object-cover group-hover:scale-110 transition-transform duration-500" 
                    />
                  ) : (
                    <CategoryIcon category={product.category || product.name} themeColor={themeColor} />
                  )}
                </div>
                <div className="flex-1 flex flex-col justify-between py-0.5">
                  <div>
                    <div className="flex justify-between items-start">
                      <h3 className="font-black text-gray-900 dark:text-white leading-tight text-sm">{product.name}</h3>
                      <span className="text-[9px] font-black text-gray-300 dark:text-gray-600 uppercase tracking-tighter">{product.unit}</span>
                    </div>
                    {product.description && (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1 leading-relaxed">{product.description}</p>
                    )}
                  </div>
                  
                  <div className="flex justify-between items-end mt-2">
                    <p className="font-black text-base text-[var(--theme-color)] dark:text-white">
                      {product.variations && product.variations.length > 0 
                        ? `${formatPrice(Math.min(...product.variations.map(v => v.price)))}`
                        : formatPrice(product.price)
                      }
                      {product.variations && product.variations.length > 0 && <span className="text-[9px] text-gray-300 dark:text-gray-600 ml-1 font-bold italic">Start from</span>}
                    </p>

                    {totalQty > 0 && !product.variations ? (
                      <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 p-0.5 rounded-xl border border-gray-100 dark:border-gray-700">
                        <button 
                          onClick={() => updateQuantity(product.id, -1)}
                          disabled={!store.isOpen}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white dark:bg-gray-700 shadow-sm text-gray-400 dark:text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-black text-gray-900 dark:text-white w-4 text-center text-xs">{totalQty}</span>
                        <button 
                          onClick={() => updateQuantity(product.id, 1)}
                          disabled={!store.isOpen}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white dark:bg-gray-700 shadow-sm text-gray-400 dark:text-gray-300 hover:text-green-500 transition-colors disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => addToCart(product)}
                        disabled={!store.isOpen}
                        className="px-4 py-2 rounded-xl bg-[var(--theme-color)] dark:bg-white text-white dark:text-gray-900 text-[9px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-black/5 disabled:opacity-50 disabled:bg-gray-400"
                      >
                        {store.isOpen ? (totalQty > 0 ? 'Add More' : 'Add to Cart') : 'Closed'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Floating Modern Cart */}
      {cart.length > 0 && (
        <div className="fixed bottom-8 left-6 right-6 z-50">
          <button 
            onClick={() => setIsCartOpen(true)}
            className="max-w-lg mx-auto w-full bg-gray-900 p-2 rounded-3xl shadow-2xl shadow-black/20 flex items-center gap-4 group"
            style={{ backgroundColor: themeColor }}
          >
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-white relative">
              <ShoppingCart className="w-6 h-6" />
              <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full text-[10px] font-black flex items-center justify-center border-2 border-gray-900" style={{ borderColor: themeColor }}>
                {cart.reduce((acc, item) => acc + item.quantity, 0)}
              </span>
            </div>
            <div className="flex-1 text-left">
              <p className="text-[10px] font-black text-white/50 uppercase tracking-widest">Your Order</p>
              <p className="text-white font-black text-lg">{formatPrice(totalPrice)}</p>
            </div>
            <div className="pr-4">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white group-hover:translate-x-1 transition-transform">
                <ArrowRight className="w-5 h-5" />
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Variation Modal */}
      {variationModalOpen && productForVariation && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#1A1D21] w-full max-w-md rounded-t-[40px] sm:rounded-[40px] p-8 space-y-8 animate-in slide-in-from-bottom duration-500">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black text-gray-900 dark:text-white">{productForVariation.name}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest mt-1">Select Variation</p>
              </div>
              <button onClick={() => setVariationModalOpen(false)} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <X className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              </button>
            </div>
            
            <div className="grid gap-3">
               {productForVariation.variations?.map((v, idx) => (
                 <button
                   key={idx}
                   onClick={() => setSelectedVariation(v)}
                   className={cn(
                     "w-full flex justify-between items-center p-5 rounded-3xl border-2 transition-all group",
                     selectedVariation?.name === v.name 
                       ? "bg-gray-50 dark:bg-gray-800 border-primary dark:border-white dark:[--selected-border-color:white]" 
                       : "border-gray-50 dark:border-gray-800 hover:border-gray-100 dark:hover:border-gray-700"
                   )}
                   style={selectedVariation?.name === v.name ? { 
                     borderColor: 'var(--selected-border-color, ' + themeColor + ')', 
                     backgroundColor: `${themeColor}08` 
                   } : {}}
                 >
                   <span className="font-black text-gray-900 dark:text-white">{v.name}</span>
                   <span className="font-black text-[var(--theme-color)] dark:text-white">{formatPrice(v.price)}</span>
                 </button>
               ))}
            </div>

            <button 
              onClick={() => {
                if (productForVariation && selectedVariation) {
                  addToCart(productForVariation, selectedVariation);
                  setVariationModalOpen(false);
                }
              }}
              className="w-full py-5 rounded-[24px] bg-gray-900 text-white text-sm font-black uppercase tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all"
              style={{ backgroundColor: themeColor }}
            >
              Add to Cart • {formatPrice(selectedVariation?.price || 0)}
            </button>
          </div>
        </div>
      )}

      {/* Cart Sheet */}
      {isCartOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex flex-col justify-end animate-in fade-in duration-300">
           <div className="bg-white dark:bg-[#1A1D21] w-full max-w-2xl mx-auto h-[90vh] rounded-t-[40px] flex flex-col animate-in slide-in-from-bottom duration-500 shadow-2xl">
              <div className="p-8 border-b border-gray-50 dark:border-gray-800 flex justify-between items-center">
                 <div>
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white">Your Tray</h2>
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest mt-1">{cart.length} Unique Items</p>
                 </div>
                 <button onClick={() => setIsCartOpen(false)} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <X className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                 <div className="p-8 space-y-6">
                 {cart.map((item, idx) => (
                    <div key={idx} className="flex gap-4 items-center animate-in slide-in-from-right duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                       <div className="w-16 h-16 rounded-2xl bg-gray-50 dark:bg-gray-800 overflow-hidden border border-gray-100 dark:border-gray-800 flex-shrink-0 relative">
                          {item.image && item.image.startsWith('http') ? (
                            <Image 
                              src={item.image} 
                              alt={item.name} 
                              fill
                              unoptimized
                              className="object-cover" 
                            />
                          ) : (
                            <CategoryIcon category={item.category || item.name} themeColor={themeColor} />
                          )}
                       </div>
                       <div className="flex-1">
                          <h4 className="font-black text-gray-900 dark:text-white text-sm">{item.name}{item.selectedVariation && <span className="text-gray-400 dark:text-gray-500 font-bold text-[10px] block uppercase">Variation: {item.selectedVariation.name}</span>}</h4>
                          <p className="text-xs font-black text-[var(--theme-color)] dark:text-white mt-1">{formatPrice(item.price)}</p>
                       </div>
                       <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 p-1 rounded-xl">
                          <button 
                            onClick={() => updateQuantity(item.id, -1, item.selectedVariation?.name)}
                            disabled={!store.isOpen}
                            className="w-7 h-7 bg-white dark:bg-gray-900 rounded-lg shadow-sm flex items-center justify-center text-gray-400 dark:text-gray-500 disabled:opacity-50"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-xs font-black w-4 text-center dark:text-white">{item.quantity}</span>
                          <button 
                            onClick={() => updateQuantity(item.id, 1, item.selectedVariation?.name)}
                            disabled={!store.isOpen}
                            className="w-7 h-7 bg-white dark:bg-gray-900 rounded-lg shadow-sm flex items-center justify-center text-gray-400 dark:text-gray-500 disabled:opacity-50"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                       </div>
                    </div>
                 ))}
                 </div>

                 <div className="p-8 bg-gray-50/50 dark:bg-[#0F1113]/50 rounded-t-[40px] space-y-6">
                 <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">WhatsApp Number</label>
                    <input
                      type="tel"
                      value={checkoutPhone}
                      onChange={(e) => setCheckoutPhone(e.target.value)}
                      placeholder="e.g. 62812xxxxxxx"
                      className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                 </div>

                 <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Order Type</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setOrderType('DINE_IN')}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                          orderType === 'DINE_IN'
                            ? "bg-gray-900 text-white border-gray-900 shadow-lg"
                            : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                        )}
                        style={orderType === 'DINE_IN' ? { backgroundColor: themeColor, borderColor: themeColor } : {}}
                      >
                        Dine In
                      </button>
                      <button
                        onClick={() => setOrderType('TAKEAWAY')}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                          orderType === 'TAKEAWAY'
                            ? "bg-gray-900 text-white border-gray-900 shadow-lg"
                            : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                        )}
                        style={orderType === 'TAKEAWAY' ? { backgroundColor: themeColor, borderColor: themeColor } : {}}
                      >
                        Takeaway
                      </button>
                      <button
                        onClick={() => setOrderType('DELIVERY')}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                          orderType === 'DELIVERY'
                            ? "bg-gray-900 text-white border-gray-900 shadow-lg"
                            : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                        )}
                        style={orderType === 'DELIVERY' ? { backgroundColor: themeColor, borderColor: themeColor } : {}}
                      >
                        Delivery
                      </button>
                    </div>
                 </div>

                 {orderType === 'DELIVERY' && (
                   <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Delivery Address</label>
                        <button 
                          onClick={shareLocation}
                          disabled={isLocating}
                          className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 hover:text-blue-700 transition-colors uppercase tracking-widest"
                        >
                          {isLocating ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Navigation className="w-3 h-3" />
                          )}
                          {deliveryLatitude ? "Location Set" : "Detect Location"}
                        </button>
                      </div>
                      <textarea
                        value={deliveryAddress}
                        onChange={(e) => {
                          setDeliveryAddress(e.target.value);
                          setSelectedQuote(null); // Clear selected quote on address change
                        }}
                        placeholder="Masukkan alamat lengkap + kode pos"
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[84px]"
                      />
                      {deliveryLatitude && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 animate-in fade-in zoom-in duration-300">
                           <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                           <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-tight">Coordinates captured for precise delivery</span>
                        </div>
                      )}
                      <button
                        onClick={() => fetchShippingQuotes()}
                        disabled={isFetchingQuotes || !deliveryAddress.trim()}
                        className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
                        style={{ backgroundColor: themeColor }}
                      >
                        {isFetchingQuotes ? "Checking Courier..." : "Check Shipping Options"}
                      </button>
                      {shippingQuotes.length > 0 && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Courier Service</label>
                          <div className="relative">
                            <select
                              value={selectedQuote ? `${selectedQuote.provider}|${selectedQuote.service}|${selectedQuote.fee || selectedQuote.price}` : ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                const next = shippingQuotes.find((opt: any) => `${opt.provider}|${opt.service}|${opt.fee || opt.price}` === val) || null;
                                setSelectedQuote(next);
                              }}
                              className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none appearance-none pr-10"
                            >
                              {shippingQuotes.map((opt: any, idx: number) => (
                                <option key={`${opt.provider}-${opt.service}-${idx}`} value={`${opt.provider}|${opt.service}|${opt.fee || opt.price}`}>
                                  {opt.provider} - {opt.service} • {formatPrice(Number(opt.fee || opt.price || 0))}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          </div>
                          {selectedQuote && (
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium px-1">
                              ETA: {selectedQuote.etd || selectedQuote.eta || "-"}
                            </p>
                          )}
                        </div>
                      )}
                   </div>
                 )}

                 <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Payment Method</label>
                    <div className="grid grid-cols-2 gap-2">
                       <button
                         onClick={() => setPaymentMethod('qris')}
                         className={cn(
                           "py-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all",
                           paymentMethod === 'qris'
                             ? "bg-gray-900 text-white border-gray-900"
                             : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                         )}
                         style={paymentMethod === 'qris' ? { backgroundColor: themeColor, borderColor: themeColor } : {}}
                       >
                          <span className="text-[10px] font-black uppercase tracking-widest">QRIS</span>
                          <span className="text-[8px] opacity-60 font-bold uppercase tracking-tighter">Auto-Verify</span>
                       </button>
                       <button
                         onClick={() => setPaymentMethod('bank')}
                         className={cn(
                           "py-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all",
                           paymentMethod === 'bank'
                             ? "bg-gray-900 text-white border-gray-900"
                             : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                         )}
                         style={paymentMethod === 'bank' ? { backgroundColor: themeColor, borderColor: themeColor } : {}}
                       >
                          <span className="text-[10px] font-black uppercase tracking-widest">Bank Transfer</span>
                          <span className="text-[8px] opacity-60 font-bold uppercase tracking-tighter">Manual / Virtual</span>
                       </button>
                    </div>
                 </div>

                 <div className="space-y-2">
                    {/* Item Breakdown */}
                    <div className="pb-4 mb-2 border-b border-gray-100 dark:border-gray-800 space-y-2">
                       <label className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1 block">Order Details</label>
                       {cart.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-start text-xs">
                             <div className="flex-1 pr-4">
                                <p className="font-bold text-gray-900 dark:text-white leading-tight">
                                   {item.name}
                                   {item.selectedVariation && (
                                      <span className="text-[10px] font-medium text-gray-500 block">
                                         Option: {item.selectedVariation.name}
                                      </span>
                                   )}
                                </p>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                                   {item.quantity} x {formatPrice(item.price)}
                                </p>
                             </div>
                             <span className="font-black text-gray-900 dark:text-white whitespace-nowrap">
                                {formatPrice(item.price * item.quantity)}
                             </span>
                          </div>
                       ))}
                    </div>

                    <div className="flex justify-between text-xs font-bold text-gray-400 dark:text-gray-500">
                       <span>Subtotal</span>
                       <span>{formatPrice(subtotal)}</span>
                    </div>
                    {tax > 0 && (
                       <div className="flex justify-between text-xs font-bold text-gray-400 dark:text-gray-500">
                          <span>Tax ({taxPercent}%)</span>
                          <span>{formatPrice(tax)}</span>
                       </div>
                    )}
                    {serviceCharge > 0 && (
                       <div className="flex justify-between text-xs font-bold text-gray-400 dark:text-gray-500">
                          <span>Service Charge ({servicePercent}%)</span>
                          <span>{formatPrice(serviceCharge)}</span>
                       </div>
                    )}
                    {orderType === 'DELIVERY' && selectedQuote && (
                       <div className="flex justify-between text-xs font-bold text-gray-400 dark:text-gray-500">
                          <span>Shipping ({selectedQuote.provider} {selectedQuote.service})</span>
                          <span>{formatPrice(currentShippingCost)}</span>
                       </div>
                    )}
                    <div className="flex justify-between items-end pt-4 border-t border-gray-100 dark:border-gray-800">
                       <span className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Total Amount</span>
                       <span className="text-3xl font-black text-gray-900 dark:text-white">{formatPrice(totalPrice + (orderType === 'DELIVERY' ? currentShippingCost : 0))}</span>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 gap-4">
                    <button 
                      onClick={() => handleWebCheckout(paymentMethod)}
                      disabled={!store.isOpen || isProcessing || (orderType === 'DELIVERY' && !selectedQuote)}
                      className="py-3 bg-[#25D366] text-white rounded-[24px] font-black uppercase tracking-widest shadow-xl shadow-green-500/20 flex flex-col items-center justify-center gap-0.5 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:grayscale"
                      style={{ backgroundColor: themeColor }}
                    >
                       <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4" />
                          <span className="text-xs">{isProcessing ? "Processing..." : `Pay via ${paymentMethod === 'qris' ? 'QRIS' : 'Bank Transfer'}`}</span>
                       </div>
                       <div className="flex flex-col items-center opacity-100">
                          <span className="text-base font-black leading-tight">
                             {formatPrice(totalPrice + calculatePlatformFee(paymentMethod === 'qris' ? 'qris' : 'transfer') + (orderType === 'DELIVERY' ? currentShippingCost : 0))}
                          </span>
                          {calculatePlatformFee(paymentMethod === 'qris' ? 'qris' : 'transfer') > 0 && (
                            <span className="text-[9px] font-bold uppercase tracking-widest leading-none">(Inc. Fee: {formatPrice(calculatePlatformFee(paymentMethod === 'qris' ? 'qris' : 'transfer'))})</span>
                          )}
                       </div>
                    </button>
                 </div>
                 <button
                   onClick={() => handleWhatsAppCheckout(paymentMethod)}
                   className="w-full py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400"
                 >
                   Fallback: Checkout {orderType === 'DINE_IN' ? 'Dine In' : (orderType === 'TAKEAWAY' ? 'Pickup' : 'Delivery')} via WhatsApp
                 </button>
                 {!store.isOpen && (
                   <p className="text-[10px] text-red-500 font-black text-center uppercase tracking-widest">
                     The store is currently closed. Checkout is disabled.
                   </p>
                 )}
              </div>
              </div>
           </div>
        </div>
      )}

      {/* Check-In Overlay */}
      {showCheckIn && (
        <div className="fixed inset-0 z-[200] bg-white dark:bg-[#0F1113] flex items-center justify-center p-8 text-center animate-in fade-in duration-500">
           <div className="max-w-xs w-full space-y-8">
              <div className="w-24 h-24 bg-gray-50 dark:bg-gray-800 rounded-[40px] flex items-center justify-center mx-auto shadow-2xl shadow-black/5 animate-bounce duration-2000">
                 <Phone className="w-10 h-10 text-primary" style={{ color: themeColor }} />
              </div>
              
              {checkInStep === 'input' ? (
                <>
                  <div className="space-y-2">
                    <h2 className="text-3xl font-black text-gray-900 dark:text-white">Welcome.</h2>
                    <p className="text-gray-400 dark:text-gray-500 text-sm font-medium">Please enter your WhatsApp number to view our menu.</p>
                  </div>
                  <input 
                    type="tel" 
                    placeholder="e.g. 62812..." 
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-[24px] px-6 py-5 text-center text-xl font-black focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-gray-200 dark:placeholder:text-gray-600 dark:text-white"
                  />
                  <button 
                    onClick={handleCheckIn}
                    disabled={!customerPhone || isSubmitting}
                    className="w-full py-5 rounded-[24px] font-black text-sm uppercase tracking-widest shadow-2xl disabled:opacity-30 transition-all active:scale-95 text-white dark:text-white flex items-center justify-center gap-2"
                    style={{ backgroundColor: themeColor }}
                  >
                    {isSubmitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        "Submit"
                    )}
                  </button>
                </>
              ) : checkInStep === 'choice' ? (
                <div className="space-y-6 animate-in zoom-in duration-300">
                   <div className="space-y-2">
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white">One more thing...</h2>
                    <p className="text-gray-400 dark:text-gray-500 text-sm font-medium">How would you like to order?</p>
                   </div>
                   <div className="grid gap-3">
                      <button 
                        onClick={() => handleChoice('whatsapp')} 
                        disabled={isCheckingIn}
                        className="w-full py-5 bg-[#25D366] text-white rounded-[24px] font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2"
                      >
                        {isCheckingIn ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            <MessageCircle className="w-5 h-5" /> Via WhatsApp
                          </>
                        )}
                      </button>
                      <button 
                        onClick={() => handleChoice('web')} 
                        disabled={isCheckingIn}
                        className="w-full py-5 bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 rounded-[24px] font-black text-sm uppercase tracking-widest border border-gray-100 dark:border-gray-700 flex items-center justify-center gap-2"
                      >
                        {isCheckingIn ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          "Directly on Web"
                        )}
                      </button>
                   </div>
                </div>
              ) : (
                <div className="space-y-6 animate-in zoom-in duration-300">
                   <div className="w-20 h-20 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto text-green-600 dark:text-green-400">
                      <CheckCircle2 className="w-10 h-10" />
                   </div>
                   <div className="space-y-2">
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white">Success!</h2>
                    <p className="text-gray-400 dark:text-gray-500 text-sm font-medium">Request sent. If no WhatsApp message arrives, open chat manually below.</p>
                   </div>
                   <button
                    onClick={() => {
                      if (checkInFallbackUrl) window.open(checkInFallbackUrl, '_blank');
                      setShowCheckIn(false);
                    }}
                    className="w-full py-4 bg-[#25D366] text-white rounded-[20px] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                   >
                    <MessageCircle className="w-4 h-4" /> Open WhatsApp Chat
                   </button>
                   <button
                    onClick={() => setShowCheckIn(false)}
                    className="w-full py-3 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-[20px] font-black text-xs uppercase tracking-widest border border-gray-100 dark:border-gray-700"
                   >
                    Continue on Web
                   </button>
                </div>
              )}
           </div>
        </div>
      )}
    </div>
  );
}
