"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Search, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  X, 
  CreditCard, 
  Banknote, 
  Smartphone,
  LogOut,
  User,
  Loader2,
  CheckCircle,
  Moon,
  Sun,
  MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { createPosOrder } from "@/lib/api";
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

interface PosClientProps {
  store: any;
  products: Product[];
  categories: Category[];
  user: any;
}

export default function PosClient({ store, products, categories, user }: PosClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [cashReceived, setCashReceived] = useState<string>("");
  const [tipAmount, setTipAmount] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<any>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [preCartNote, setPreCartNote] = useState("");
  const [noteText, setNoteText] = useState("");

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  // Calculations
  const taxPercent = parseFloat((store.taxPercent ?? 0).toString());
  const servicePercent = parseFloat((store.serviceChargePercent ?? 0).toString());
  const qrisFeePercent = parseFloat((store.qrisFeePercent ?? 0).toString());
  const transferFee = parseFloat((store.manualTransferFee ?? 0).toString());

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  // Tax & Service Charge
  const tax = subtotal * (taxPercent / 100);
  const serviceCharge = subtotal * (servicePercent / 100);
  
  // Payment Fees (POS - Only if Customer Pays, but POS usually handles fees differently or external EDC)
  // User request: Platform fee only on storefront/whatsapp. POS uses own EDC/QRIS.
  let paymentFee = 0;
  // if (store.feePaidBy === "CUSTOMER") {
  //   if (paymentMethod === "qris" && qrisFeePercent > 0) {
  //     paymentFee = (subtotal + tax + serviceCharge) * (qrisFeePercent / 100);
  //   } else if (paymentMethod === "transfer" && transferFee > 0) {
  //     paymentFee = transferFee;
  //   }
  // }

  const tip = parseFloat(tipAmount) || 0;
  const total = subtotal + tax + serviceCharge + paymentFee + tip;

  const addToCart = (product: Product, note?: string) => {
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
    // Keep selection or clear it? User flow: Click -> Add Note -> Add. Likely want to clear selection to prevent accidental double adds.
    // But for speed, maybe keep it? Let's clear to be safe and give feedback.
    setSelectedProduct(null);
  };

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
        paymentMethod: paymentMethod,
        cashReceived: cashReceived,
        customerPhone: "POS-CUSTOMER",
        taxAmount: tax,
        serviceCharge: serviceCharge,
        tipAmount: tip,
        paymentFee: paymentFee
      });

      if (result.error) {
        throw new Error(result.error);
      }
      
      setOrderSuccess({
        id: result.orderId,
        total: total,
        change: paymentMethod === 'cash' ? (parseFloat(cashReceived || '0') - total) : 0
      });
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
            {paymentMethod === 'cash' && (
              <div className="flex justify-between items-center text-green-600 dark:text-green-400">
                <span className="text-sm">Change</span>
                <span className="text-xl font-black">{formatPrice(orderSuccess.change)}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <button 
              onClick={() => window.print()} 
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
                setPaymentMethod("cash");
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
      {/* Header */}
      <header className={cn("border-b h-16 flex items-center justify-between px-6 shadow-sm z-10 transition-colors duration-300", isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 bg-[#2271b1] rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-900/20">
            {store.name.charAt(0)}
          </div>
          <div>
            <h1 className={cn("font-bold text-lg leading-tight", isDarkMode ? "text-white" : "text-gray-900")}>{store.name}</h1>
            <p className={cn("text-xs", isDarkMode ? "text-gray-400" : "text-gray-500")}>POS System • {user.role === 'CASHIER' ? 'Cashier' : 'Admin'}</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4 w-1/3">
          <div className="relative w-full">
            <input 
              type="text" 
              placeholder="Search products (barcode or name)..." 
              className={cn(
                "w-full pl-10 pr-4 py-2 border-transparent rounded-lg transition-all outline-none",
                isDarkMode 
                  ? "bg-gray-700 text-white placeholder-gray-400 focus:bg-gray-600 focus:border-[#2271b1]" 
                  : "bg-gray-100 text-gray-900 placeholder-gray-500 focus:bg-white focus:border-[#2271b1]"
              )}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={cn("p-2 rounded-full transition-colors", isDarkMode ? "hover:bg-gray-700 text-yellow-400" : "hover:bg-gray-100 text-gray-600")}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          
          <div className={cn("flex items-center space-x-2 text-sm font-medium px-3 py-1.5 rounded-full", isDarkMode ? "bg-gray-700 text-gray-200" : "bg-gray-50 text-gray-700")}>
            <User className="w-4 h-4" />
            <span>{user.name || user.email}</span>
          </div>
          <button 
            onClick={() => signOut({ callbackUrl: `/${store.slug}/login` })}
            className="p-2 text-gray-400 hover:text-red-600 transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Products */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Categories */}
          <div className={cn("border-b px-6 py-3 flex space-x-2 overflow-x-auto transition-colors duration-300", isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
            <button 
              onClick={() => setSelectedCategory("all")}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
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
                  "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
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
          <div className={cn("px-6 py-4 border-b transition-colors duration-300 flex items-center gap-4", isDarkMode ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200")}>
             <div className="flex-1 flex items-center gap-4">
                <div className={cn("flex-1 h-12 rounded-xl border-2 flex items-center px-4 transition-colors", 
                    selectedProduct 
                        ? isDarkMode ? "bg-gray-700 border-[#2271b1]" : "bg-white border-[#2271b1]"
                        : isDarkMode ? "bg-gray-800 border-gray-600" : "bg-gray-100 border-gray-200"
                )}>
                    {selectedProduct ? (
                        <span className={cn("font-bold truncate", isDarkMode ? "text-white" : "text-gray-900")}>{selectedProduct.name}</span>
                    ) : (
                        <span className="text-gray-400 italic">Select a product below...</span>
                    )}
                </div>
                
                <div className="relative flex-[1.5]">
                    <input 
                        type="text" 
                        placeholder="Add info / note..." 
                        disabled={!selectedProduct}
                        value={preCartNote}
                        onChange={(e) => setPreCartNote(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && selectedProduct) {
                                addToCart(selectedProduct, preCartNote);
                            }
                        }}
                        className={cn(
                            "w-full h-12 pl-10 pr-4 rounded-xl border-2 outline-none transition-all",
                            isDarkMode 
                                ? "bg-gray-700 border-gray-600 text-white focus:border-[#2271b1] disabled:opacity-50" 
                                : "bg-white border-gray-200 text-gray-900 focus:border-[#2271b1] disabled:bg-gray-50"
                        )}
                    />
                    <MessageSquare className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
                </div>

                <button 
                    onClick={() => selectedProduct && addToCart(selectedProduct, preCartNote)}
                    disabled={!selectedProduct}
                    className="h-12 px-8 bg-[#2271b1] hover:bg-[#135e96] text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95 flex items-center gap-2"
                >
                    <Plus className="w-6 h-6" />
                    <span>ADD</span>
                </button>
             </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            <div 
                className="grid gap-4"
                style={{ gridTemplateColumns: `repeat(${store.posGridColumns || 4}, minmax(0, 1fr))` }}
            >
              {filteredProducts.map(product => (
                <div 
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className={cn(
                    "rounded-xl shadow-sm border cursor-pointer transition-all group active:scale-95 duration-100 flex flex-col justify-between min-h-[120px] overflow-hidden relative",
                    selectedProduct?.id === product.id
                        ? "ring-2 ring-[#2271b1] ring-offset-2 scale-[0.98]"
                        : isDarkMode 
                            ? "bg-gray-800 border-gray-700 hover:border-[#2271b1]/50 hover:shadow-lg hover:shadow-blue-900/10" 
                            : "bg-white border-gray-200 hover:border-[#2271b1]/30 hover:shadow-md"
                  )}
                >
                  <div className="p-5 flex-1 flex flex-col justify-center">
                    <h3 className={cn("font-bold text-lg mb-2 leading-snug line-clamp-2", isDarkMode ? "text-gray-100" : "text-gray-900")}>{product.name}</h3>
                    <p className="text-[#2271b1] font-black text-2xl">{formatPrice(product.price)}</p>
                    {product.stock <= 0 && (
                        <span className="text-red-500 text-xs font-bold mt-1">Out of Stock</span>
                    )}
                  </div>
                  {/* Selection Indicator */}
                  {selectedProduct?.id === product.id && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-[#2271b1] rounded-full flex items-center justify-center text-white shadow-lg">
                          <CheckCircle className="w-4 h-4" />
                      </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Cart */}
        <div className={cn("w-96 border-l shadow-xl flex flex-col z-20 transition-colors duration-300", isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
          <div className={cn("p-4 border-b flex items-center justify-between", isDarkMode ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200")}>
            <h2 className={cn("font-bold text-lg flex items-center", isDarkMode ? "text-white" : "text-gray-900")}>
              <ShoppingCart className="w-5 h-5 mr-2" />
              Current Order
            </h2>
            <button 
              onClick={() => setCart([])}
              disabled={cart.length === 0}
              className="text-red-500 hover:text-red-700 text-sm font-medium disabled:opacity-50"
            >
              Clear All
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
                <ShoppingCart className="w-12 h-12 opacity-20" />
                <p>Cart is empty</p>
                <p className="text-xs text-center max-w-[200px]">Select items from the left to add to order</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.id} className={cn("p-3 rounded-lg border group", isDarkMode ? "bg-gray-700 border-gray-600" : "bg-gray-50 border-gray-100")}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex-1 min-w-0 pr-3">
                        <h4 className={cn("font-medium text-sm truncate", isDarkMode ? "text-white" : "text-gray-900")}>{item.name}</h4>
                        <p className="text-[#2271b1] font-bold text-sm">{formatPrice(item.price * item.quantity)}</p>
                    </div>
                    <div className={cn("flex items-center space-x-2 rounded-lg border p-1 shadow-sm", isDarkMode ? "bg-gray-800 border-gray-600" : "bg-white border-gray-200")}>
                        <button 
                        onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, -1); }}
                        className={cn("p-1 rounded", isDarkMode ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-600")}
                        >
                        <Minus className="w-3 h-3" />
                        </button>
                        <span className={cn("w-6 text-center font-bold text-sm", isDarkMode ? "text-white" : "text-gray-900")}>{item.quantity}</span>
                        <button 
                        onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, 1); }}
                        className={cn("p-1 rounded", isDarkMode ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-600")}
                        >
                        <Plus className="w-3 h-3" />
                        </button>
                    </div>
                    <button 
                        onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }}
                        className="ml-2 p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {/* Note Input */}
                  <div className="mt-2">
                    {editingNoteId === item.id ? (
                        <div className="flex items-center space-x-2">
                            <input 
                                type="text" 
                                className={cn(
                                    "flex-1 text-xs px-2 py-1 rounded border outline-none",
                                    isDarkMode ? "bg-gray-800 border-gray-600 text-white" : "bg-white border-gray-300 text-gray-900"
                                )}
                                placeholder="Add note..."
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                autoFocus
                                onBlur={() => updateItemNote(item.id, noteText)}
                                onKeyDown={(e) => e.key === 'Enter' && updateItemNote(item.id, noteText)}
                            />
                            <button 
                                onClick={() => updateItemNote(item.id, noteText)}
                                className="text-[#2271b1] text-xs font-bold"
                            >
                                Save
                            </button>
                        </div>
                    ) : (
                        <div 
                            onClick={() => { setEditingNoteId(item.id); setNoteText(item.note || ""); }}
                            className={cn(
                                "text-xs flex items-center cursor-pointer hover:underline",
                                item.note ? "text-orange-500 font-medium" : "text-gray-400 italic"
                            )}
                        >
                            <MessageSquare className="w-3 h-3 mr-1" />
                            {item.note || "Add note..."}
                        </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className={cn("p-4 border-t space-y-3", isDarkMode ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200")}>
            <div className={cn("space-y-1 text-sm", isDarkMode ? "text-gray-400" : "text-gray-600")}>
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {taxPercent > 0 && (
                  <div className="flex justify-between">
                    <span>Tax ({taxPercent}%)</span>
                    <span>{formatPrice(tax)}</span>
                  </div>
              )}
              {servicePercent > 0 && (
                  <div className="flex justify-between">
                    <span>Service ({servicePercent}%)</span>
                    <span>{formatPrice(serviceCharge)}</span>
                  </div>
              )}
              {/* {paymentFee > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Platform Fee</span>
                    <span>{formatPrice(paymentFee)}</span>
                  </div>
              )} */}
              {tip > 0 && (
                  <div className="flex justify-between text-blue-600">
                    <span>Tip</span>
                    <span>{formatPrice(tip)}</span>
                  </div>
              )}
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-gray-200">
              <span className="font-bold text-lg">Total</span>
              <span className="font-bold text-2xl text-[#2271b1]">{formatPrice(total)}</span>
            </div>
            <button 
              onClick={() => setIsCheckoutOpen(true)}
              disabled={cart.length === 0}
              className="w-full py-4 bg-[#2271b1] text-white font-bold rounded-xl shadow-lg hover:bg-[#135e96] transition-all active:scale-[0.98] disabled:opacity-50 disabled:shadow-none flex items-center justify-center space-x-2"
            >
              <span>Charge {formatPrice(total)}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Checkout Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={cn("rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]", isDarkMode ? "bg-gray-800 text-white" : "bg-white text-gray-900")}>
            <div className={cn("p-6 border-b flex items-center justify-between", isDarkMode ? "bg-gray-900 border-gray-700" : "bg-gray-50 border-gray-200")}>
              <h2 className="text-xl font-bold">Payment</h2>
              <button onClick={() => setIsCheckoutOpen(false)} className={cn("p-2 rounded-full", isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-200")}>
                <X className={cn("w-6 h-6", isDarkMode ? "text-gray-400" : "text-gray-500")} />
              </button>
            </div>
            
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* Payment Methods */}
              <div className={cn("w-full md:w-1/3 border-r p-4 space-y-2 overflow-y-auto", isDarkMode ? "bg-gray-900 border-gray-700" : "bg-gray-50 border-gray-200")}>
                <button 
                  onClick={() => setPaymentMethod("cash")}
                  className={cn(
                    "w-full p-4 rounded-xl flex items-center space-x-3 transition-all border-2",
                    paymentMethod === "cash" 
                      ? "border-[#2271b1] bg-[#2271b1]/10 text-[#2271b1] shadow-md" 
                      : isDarkMode ? "border-transparent hover:bg-gray-800 text-gray-400" : "border-transparent hover:bg-gray-100 text-gray-600"
                  )}
                >
                  <Banknote className="w-6 h-6" />
                  <span className="font-bold">Cash</span>
                </button>
                
                {store.enableManualTransfer && (
                  <button 
                    onClick={() => setPaymentMethod("transfer")}
                    className={cn(
                      "w-full p-4 rounded-xl flex items-center space-x-3 transition-all border-2",
                      paymentMethod === "transfer" 
                        ? "border-[#2271b1] bg-[#2271b1]/10 text-[#2271b1] shadow-md" 
                        : isDarkMode ? "border-transparent hover:bg-gray-800 text-gray-400" : "border-transparent hover:bg-gray-100 text-gray-600"
                    )}
                  >
                    <CreditCard className="w-6 h-6" />
                    <span className="font-bold">Bank Transfer</span>
                  </button>
                )}

                {(store.enableMidtrans || store.enableXendit) && (
                   <button 
                    onClick={() => setPaymentMethod("qris")}
                    className={cn(
                      "w-full p-4 rounded-xl flex items-center space-x-3 transition-all border-2",
                      paymentMethod === "qris" 
                        ? "border-[#2271b1] bg-[#2271b1]/10 text-[#2271b1] shadow-md" 
                        : isDarkMode ? "border-transparent hover:bg-gray-800 text-gray-400" : "border-transparent hover:bg-gray-100 text-gray-600"
                    )}
                  >
                    <Smartphone className="w-6 h-6" />
                    <span className="font-bold">QRIS / E-Wallet</span>
                  </button>
                )}
              </div>

              {/* Payment Details */}
              <div className="flex-1 p-6 flex flex-col overflow-y-auto">
                <div className="flex-1">
                    <div className="text-center mb-8">
                        <p className={cn("mb-1", isDarkMode ? "text-gray-400" : "text-gray-500")}>Total Amount</p>
                        <p className="text-4xl font-black text-[#2271b1]">{formatPrice(total)}</p>
                        <div className={cn("text-xs mt-2 space-y-1", isDarkMode ? "text-gray-500" : "text-gray-400")}>
                            {tax > 0 && <div>Includes Tax: {formatPrice(tax)}</div>}
                            {serviceCharge > 0 && <div>Includes Service: {formatPrice(serviceCharge)}</div>}
                            {/* {paymentFee > 0 && <div>Includes Platform Fee: {formatPrice(paymentFee)}</div>} */}
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className={cn("block text-sm font-bold mb-2", isDarkMode ? "text-gray-300" : "text-gray-700")}>Tip (Optional)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-3.5 text-gray-400 font-bold">Rp</span>
                            <input 
                                type="number" 
                                className={cn(
                                    "w-full pl-12 pr-4 py-3 border-2 rounded-xl focus:border-[#2271b1] outline-none",
                                    isDarkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-200"
                                )}
                                placeholder="0"
                                value={tipAmount}
                                onChange={(e) => setTipAmount(e.target.value)}
                            />
                        </div>
                    </div>

                    {paymentMethod === "cash" && (
                        <div className="space-y-6 max-w-xs mx-auto">
                            <div>
                                <label className={cn("block text-sm font-bold mb-2", isDarkMode ? "text-gray-300" : "text-gray-700")}>Cash Received</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-3.5 text-gray-400 font-bold">Rp</span>
                                    <input 
                                        type="number" 
                                        className={cn(
                                            "w-full pl-12 pr-4 py-3 text-lg font-bold border-2 rounded-xl focus:border-[#2271b1] outline-none transition-colors",
                                            isDarkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-200"
                                        )}
                                        placeholder="0"
                                        value={cashReceived}
                                        onChange={(e) => setCashReceived(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-2">
                                {[10000, 20000, 50000, 100000].map((amount) => (
                                    <button 
                                        key={amount}
                                        onClick={() => setCashReceived(amount.toString())}
                                        className={cn(
                                            "py-2 px-1 rounded-lg text-xs font-bold",
                                            isDarkMode ? "bg-gray-700 hover:bg-gray-600 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                                        )}
                                    >
                                        {amount / 1000}k
                                    </button>
                                ))}
                                <button 
                                    onClick={() => setCashReceived(total.toString())}
                                    className="py-2 px-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold col-span-2"
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

                    {paymentMethod === "transfer" && (
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

                    {paymentMethod === "qris" && (
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
                </div>

                <div className="mt-8">
                    <button 
                        onClick={handleCheckout}
                        disabled={isProcessing || (paymentMethod === 'cash' && parseFloat(cashReceived || '0') < total)}
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