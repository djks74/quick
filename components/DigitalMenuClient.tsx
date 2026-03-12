"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
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
  Home
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
      <div className="relative w-full h-full flex items-center justify-center bg-orange-50 dark:bg-orange-950/30 rounded-2xl group-hover:bg-orange-100 dark:group-hover:bg-orange-900/40 transition-colors">
        <Utensils className="w-8 h-8 text-orange-500 animate-bounce duration-2000" style={{ color: themeColor }} />
      </div>
    );
  }

  if (isDrink) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-blue-50 dark:bg-blue-950/30 rounded-2xl group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 transition-colors">
        <CupSoda className="w-8 h-8 text-blue-500 animate-pulse duration-1500" style={{ color: themeColor }} />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-2xl group-hover:bg-gray-100 dark:group-hover:bg-gray-700 transition-colors">
      <Package className="w-8 h-8 text-gray-300 dark:text-gray-600" />
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
  
  useEffect(() => {
    setMounted(true);
    // Check-In Logic
    if (tableNumber) {
        const stored = localStorage.getItem('customerPhone');
        if (!stored) {
            setShowCheckIn(true);
        } else {
            setCustomerPhone(stored);
        }
    }
  }, [tableNumber]);

  const handleCheckIn = () => {
    if (!customerPhone) return;
    setCheckInStep('choice');
  };

  const handleChoice = async (choice: 'whatsapp' | 'web') => {
      localStorage.setItem('customerPhone', customerPhone);
      try {
          await fetch('/api/check-in', {
              method: 'POST',
              body: JSON.stringify({
                  phone: customerPhone,
                  storeId: store.id,
                  tableNumber,
                  type: choice
              })
          });
      } catch (e) {
          console.error("Check-in trigger failed:", e);
      }

      if (choice === 'whatsapp') {
          setCheckInStep('success');
      } else {
          setShowCheckIn(false);
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

  const subtotal = useMemo(() => cart.reduce((acc, item) => acc + (item.price * item.quantity), 0), [cart]);
  const tax = subtotal * (taxPercent / 100);
  const serviceCharge = subtotal * (servicePercent / 100);
  const totalPrice = subtotal + tax + serviceCharge;

  const calculatePlatformFee = (method: 'qris' | 'transfer') => {
      if (!isCustomerPaysFee) return 0;
      if (method === 'qris') return totalPrice * (qrisFeePercent / 100);
      if (method === 'transfer') return transferFee; 
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

    let message = `Hello ${store?.name}, I'd like to order`;
    if (tableNumber) message += ` for *Table ${tableNumber}*`;
    message += `:\n\n`;
    cart.forEach(item => {
      message += `- ${item.quantity}x ${item.name}${item.selectedVariation ? ` (${item.selectedVariation.name})` : ''} @ ${formatPrice(item.price)}\n`;
    });
    if (tax > 0) message += `Tax (${taxPercent}%): ${formatPrice(tax)}\n`;
    if (serviceCharge > 0) message += `Service Charge (${servicePercent}%): ${formatPrice(serviceCharge)}\n`;
    if (fee > 0) message += `Fee: ${formatPrice(fee)}\n`;
    message += `\nTotal: *${formatPrice(finalTotal)}*`;
    const whatsappUrl = `https://wa.me/${store?.whatsapp || siteConfig.whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
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
                  {store.isOpen ? "Open Now" : "Closed"}
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
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
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
                    <p className="font-black text-primary text-base" style={{ color: themeColor }}>
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
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white dark:bg-gray-900 shadow-sm text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors disabled:opacity-50"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-black text-gray-900 dark:text-white w-4 text-center text-xs">{totalQty}</span>
                        <button 
                          onClick={() => updateQuantity(product.id, 1)}
                          disabled={!store.isOpen}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white dark:bg-gray-900 shadow-sm text-gray-400 dark:text-gray-500 hover:text-green-500 transition-colors disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => addToCart(product)}
                        disabled={!store.isOpen}
                        className="px-4 py-2 rounded-xl bg-gray-900 dark:bg-white dark:text-gray-900 text-white text-[9px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-black/5 disabled:opacity-50 disabled:bg-gray-400"
                        style={store.isOpen ? { backgroundColor: themeColor } : {}}
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
                       ? "bg-gray-50 dark:bg-gray-800 border-primary" 
                       : "border-gray-50 dark:border-gray-800 hover:border-gray-100 dark:hover:border-gray-700"
                   )}
                   style={selectedVariation?.name === v.name ? { borderColor: themeColor, backgroundColor: `${themeColor}08` } : {}}
                 >
                   <span className="font-black text-gray-900 dark:text-white">{v.name}</span>
                   <span className="font-black text-primary" style={{ color: themeColor }}>{formatPrice(v.price)}</span>
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

              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                 {cart.map((item, idx) => (
                    <div key={idx} className="flex gap-4 items-center animate-in slide-in-from-right duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                       <div className="w-16 h-16 rounded-2xl bg-gray-50 dark:bg-gray-800 overflow-hidden border border-gray-100 dark:border-gray-800 flex-shrink-0 relative">
                          {item.image && item.image.startsWith('http') ? (
                            <img src={item.image} className="w-full h-full object-cover" />
                          ) : (
                            <CategoryIcon category={item.category || item.name} themeColor={themeColor} />
                          )}
                       </div>
                       <div className="flex-1">
                          <h4 className="font-black text-gray-900 dark:text-white text-sm">{item.name}{item.selectedVariation && <span className="text-gray-400 dark:text-gray-500 font-bold text-[10px] block uppercase">Variation: {item.selectedVariation.name}</span>}</h4>
                          <p className="text-xs font-black text-primary mt-1" style={{ color: themeColor }}>{formatPrice(item.price)}</p>
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
                 <div className="space-y-2">
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
                    <div className="flex justify-between items-end pt-4 border-t border-gray-100 dark:border-gray-800">
                       <span className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Total Amount</span>
                       <span className="text-3xl font-black text-gray-900 dark:text-white">{formatPrice(totalPrice)}</span>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button 
                      onClick={() => handleWhatsAppCheckout('qris')}
                      disabled={!store.isOpen}
                      className="py-3 bg-[#25D366] text-white rounded-[24px] font-black uppercase tracking-widest shadow-xl shadow-green-500/20 flex flex-col items-center justify-center gap-0.5 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:grayscale"
                    >
                       <div className="flex items-center gap-2">
                          <MessageCircle className="w-4 h-4" />
                          <span className="text-xs">Pay via QRIS</span>
                       </div>
                       <div className="flex flex-col items-center opacity-100">
                          <span className="text-base font-black leading-tight">
                             {formatPrice(totalPrice + calculatePlatformFee('qris'))}
                          </span>
                          {calculatePlatformFee('qris') > 0 && (
                            <span className="text-[9px] font-bold uppercase tracking-widest leading-none">(Inc. Fee: {formatPrice(calculatePlatformFee('qris'))})</span>
                          )}
                       </div>
                    </button>
                    <button 
                      onClick={() => handleWhatsAppCheckout('bank')}
                      disabled={!store.isOpen}
                      className="py-3 bg-blue-600 text-white rounded-[24px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 flex flex-col items-center justify-center gap-0.5 hover:scale-[1.02] transition-transform disabled:opacity-50"
                    >
                       <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4" />
                          <span className="text-xs">Bank Transfer</span>
                       </div>
                       <div className="flex flex-col items-center opacity-100">
                          <span className="text-base font-black leading-tight">
                             {formatPrice(totalPrice + calculatePlatformFee('transfer'))}
                          </span>
                          {calculatePlatformFee('transfer') > 0 && (
                            <span className="text-[9px] font-bold uppercase tracking-widest leading-none">(Inc. Fee: {formatPrice(calculatePlatformFee('transfer'))})</span>
                          )}
                       </div>
                    </button>
                 </div>
                 {!store.isOpen && (
                   <p className="text-[10px] text-red-500 font-black text-center uppercase tracking-widest">
                     The store is currently closed. Checkout is disabled.
                   </p>
                 )}
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
                    disabled={!customerPhone}
                    className="w-full py-5 bg-gray-900 dark:bg-white dark:text-gray-900 text-white rounded-[24px] font-black text-sm uppercase tracking-widest shadow-2xl disabled:opacity-30 transition-all active:scale-95"
                    style={{ backgroundColor: themeColor }}
                  >
                    Enter Store
                  </button>
                </>
              ) : (
                <div className="space-y-6 animate-in zoom-in duration-300">
                   <div className="space-y-2">
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white">One more thing...</h2>
                    <p className="text-gray-400 dark:text-gray-500 text-sm font-medium">How would you like to receive order updates?</p>
                   </div>
                   <div className="grid gap-3">
                      <button onClick={() => handleChoice('whatsapp')} className="w-full py-5 bg-[#25D366] text-white rounded-[24px] font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2"><MessageCircle className="w-5 h-5" /> Via WhatsApp</button>
                      <button onClick={() => handleChoice('web')} className="w-full py-5 bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 rounded-[24px] font-black text-sm uppercase tracking-widest border border-gray-100 dark:border-gray-700">Directly on Web</button>
                   </div>
                </div>
              )}
           </div>
        </div>
      )}
    </div>
  );
}
