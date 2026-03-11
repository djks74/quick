"use client";

import { useState, useEffect } from "react";
import { ShoppingCart, Minus, Plus, Trash2, CreditCard, MessageCircle, Phone, Globe, X } from "lucide-react";
import { siteConfig } from "@/config/site";
import { useSearchParams } from "next/navigation";

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

export default function DigitalMenuClient({ products, store, categories = [] }: { products: Product[], store: any, categories?: Category[] }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [settings, setSettings] = useState<any>(store);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<number | null>(null);
  const [bankInfo, setBankInfo] = useState<any>(null);
  const [finalAmount, setFinalAmount] = useState<number>(0);
  const searchParams = useSearchParams();
  const tableNumber = searchParams.get('table');

  const [mounted, setMounted] = useState(false);
  
  // Category State
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
  
  useEffect(() => {
    setMounted(true);
    if (store) {
        setSettings(store);
    }
    
    // Check-In Logic
    if (tableNumber) {
        const stored = localStorage.getItem('customerPhone');
        if (!stored) {
            setShowCheckIn(true);
        } else {
            setCustomerPhone(stored);
        }
    }
  }, [store, tableNumber]);

  const handleCheckIn = () => {
    if (!customerPhone) return;
    setCheckInStep('choice');
  };

  const handleChoice = async (choice: 'whatsapp' | 'web') => {
      localStorage.setItem('customerPhone', customerPhone);
      
      // Call API to trigger server message
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
          // Show Success, Don't Redirect
          setCheckInStep('success');
      } else {
          setShowCheckIn(false);
      }
  };

  const addToCart = (product: Product, variation?: { name: string; price: number }) => {
    // If product has variations and none selected, open modal
    if (product.variations && product.variations.length > 0 && !variation) {
        setProductForVariation(product);
        setSelectedVariation(product.variations[0]);
        setVariationModalOpen(true);
        return;
    }

    const price = variation ? variation.price : product.price;
    const variationName = variation ? variation.name : undefined;

    setCart(prev => {
      // Find exact match (Same ID AND Same Variation)
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

  const confirmVariation = () => {
    if (productForVariation && selectedVariation) {
        addToCart(productForVariation, selectedVariation);
        setVariationModalOpen(false);
        setProductForVariation(null);
        setSelectedVariation(null);
    }
  };

  const removeFromCart = (productId: number, variationName?: string) => {
    setCart(prev => prev.filter(item => 
        !(item.id === productId && item.selectedVariation?.name === variationName)
    ));
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
  
  // Calculate Platform Fee (only for display estimation)
  const qrisFeePercent = parseFloat((store.qrisFeePercent ?? 0).toString());
  const transferFee = parseFloat((store.manualTransferFee ?? 0).toString());
  const isCustomerPaysFee = store.feePaidBy === 'CUSTOMER';

  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const tax = subtotal * (taxPercent / 100);
  const serviceCharge = subtotal * (servicePercent / 100);
  const totalPrice = subtotal + tax + serviceCharge;

  // Function to calculate fee based on potential payment method
  const calculatePlatformFee = (method: 'qris' | 'transfer') => {
      if (!isCustomerPaysFee) return 0;
      if (method === 'qris') return totalPrice * (qrisFeePercent / 100);
      if (method === 'transfer') return transferFee;
      return 0;
  };

  const handleWhatsAppCheckout = (method: 'qris' | 'bank') => {
    if (cart.length === 0) return;

    // Calculate specific fee for this method
    let fee = 0;
    if (isCustomerPaysFee) {
        if (method === 'qris' && qrisFeePercent > 0) {
            fee = totalPrice * (qrisFeePercent / 100);
        } else if (method === 'bank' && transferFee > 0) {
            fee = transferFee;
        }
    }
    
    const finalTotal = totalPrice + fee;

    // Construct WhatsApp message
    let message = `Hello ${store?.name || siteConfig.name}, I would like to order`;
    if (tableNumber) {
      message += ` for *Table ${tableNumber}*`;
    }
    message += `:\n\n`;
    
    cart.forEach(item => {
      message += `- ${item.quantity}x ${item.name} @ ${formatPrice(item.price)}\n`;
    });
    
    if (tax > 0) {
        message += `Tax (${taxPercent}%): ${formatPrice(tax)}\n`;
    }
    if (serviceCharge > 0) {
        message += `Service Charge (${servicePercent}%): ${formatPrice(serviceCharge)}\n`;
    }
    
    // Fee line
    if (fee > 0) {
        message += `Platform Fee (${method === 'qris' ? 'QRIS' : 'Bank Transfer'}): ${formatPrice(fee)}\n`;
    }

    message += `\nTotal: *${formatPrice(finalTotal)}*`;
    message += `\n\nPayment Method: *${method === 'qris' ? 'QRIS' : 'Bank Transfer'}*`;
    message += `\nPlease process my order. Thank you!`;

    // Encode for URL
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${settings?.whatsapp || siteConfig.whatsappNumber}?text=${encodedMessage}`;
    
    // Open WhatsApp
    window.open(whatsappUrl, '_blank');
  };

  const handlePaymentGatewayCheckout = async (provider: string, type: 'qris' | 'bank_transfer' | 'manual' = 'manual') => {
    setIsProcessing(true);
    try {
      // Calculate Payment Fee
      let paymentFee = 0;
      if (isCustomerPaysFee) {
          if (provider === 'manual' && transferFee > 0) {
              paymentFee = transferFee;
          } else if ((provider === 'midtrans' || provider === 'xendit')) {
              // Fee depends on the specific TYPE chosen (QRIS or Bank)
              if (type === 'qris' && qrisFeePercent > 0) {
                  paymentFee = totalPrice * (qrisFeePercent / 100);
              } else if (type === 'bank_transfer' && transferFee > 0) {
                  // For Midtrans Bank Transfer, usually it's a fixed fee + % or just fixed.
                  // But based on your request: "if choose bank it will charged 5000"
                  // So we apply the manualTransferFee (5000) logic here too?
                  // OR do we use a separate "Payment Gateway Bank Fee"?
                  // Let's assume we use the same `transferFee` (5000) for now as requested.
                  paymentFee = transferFee;
              }
          }
      }
      
      const finalTotal = totalPrice + paymentFee;

      // If manual transfer, show bank details directly
      if (provider === 'manual') {
          // Construct order details for simulation (since we don't have real order ID yet)
          // In real app, you might want to create order first via API then show details
          const res = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storeId: store.id,
              items: cart,
              total: finalTotal,
              paymentFee: paymentFee,
              customerInfo: { phone: customerPhone || 'WEB_USER', tableNumber: tableNumber },
              paymentMethod: 'manual'
            })
          });
          const data = await res.json();
          if (data.success) {
              setLastOrderId(data.orderId);
              setBankInfo(data.bankInfo);
              setFinalAmount(data.amount);
              setShowBankDetails(true);
              setIsCartOpen(false);
              setCart([]);
          } else {
              alert('Checkout failed: ' + (data.error || 'Unknown error'));
          }
          setIsProcessing(false);
          return;
      }

      // If gateway (Midtrans/Xendit), create transaction with specific type
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id, // Pass storeId
          items: cart,
          total: finalTotal, // Include fee
          paymentFee: paymentFee, // Pass fee breakdown if API supports it
          customerInfo: { phone: customerPhone || 'WEB_USER', tableNumber: tableNumber },
          paymentMethod: 'gateway', // Generic gateway trigger
          specificType: type // Pass the specific type (qris/bank_transfer) to backend
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
         if (data.paymentUrl) {
          window.location.href = data.paymentUrl;
        }
      } else {
        alert('Checkout failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error(error);
      alert('Checkout failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const themeColor = settings?.themeColor || siteConfig.themeColor;

  return (
    <div className="min-h-screen bg-gray-50 pb-24" style={{ '--theme-color': themeColor } as any}>
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white shadow-sm px-4 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900" style={{ color: themeColor }}>
            {settings?.name || siteConfig.name}
          </h1>
          <p className="text-sm text-gray-500">WhatsApp Order: {settings?.whatsapp || siteConfig.whatsappNumber}</p>
        </div>
        <div className="flex gap-2 items-center">
          <a href="/" className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
            Home
          </a>
        </div>
      </header>

      {/* Menu Grid */}
      <main className="max-w-md mx-auto p-4 space-y-4">
        
        {/* Category Tabs */}
        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sticky top-[72px] z-10 bg-gray-50/95 backdrop-blur-sm py-2">
            <button
              onClick={() => setSelectedCategory("All")}
              className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                selectedCategory === "All" 
                  ? "bg-black text-white" 
                  : "bg-white text-gray-600 border border-gray-200"
              }`}
              style={selectedCategory === "All" ? { backgroundColor: themeColor } : {}}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.name)}
                className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                  selectedCategory === cat.name
                    ? "bg-black text-white"
                    : "bg-white text-gray-600 border border-gray-200"
                }`}
                style={selectedCategory === cat.name ? { backgroundColor: themeColor } : {}}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">
             {selectedCategory === "All" ? "Menu" : selectedCategory}
          </h2>
          <span className="text-xs text-gray-400 font-medium">
            {products.filter(p => selectedCategory === "All" || p.category?.toLowerCase() === selectedCategory.toLowerCase()).length} Items
          </span>
        </div>
        
        <div className="grid gap-4">
          {products
            .filter(p => selectedCategory === "All" || p.category?.toLowerCase() === selectedCategory.toLowerCase())
            .map((product) => {
            // Check if product is in cart (sum of all variations)
            const cartItems = cart.filter(item => item.id === product.id);
            const totalQty = cartItems.reduce((acc, item) => acc + item.quantity, 0);
            
            return (
              <div key={product.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">{product.name}</h3>
                  <p className="text-sm text-gray-500">{product.unit}</p>
                  <p className="text-primary font-bold mt-1" style={{ color: themeColor }}>
                    {product.variations && product.variations.length > 0 
                      ? `${formatPrice(Math.min(...product.variations.map(v => v.price)))} - ${formatPrice(Math.max(...product.variations.map(v => v.price)))}`
                      : formatPrice(product.price)
                    }
                  </p>
                </div>
                
                {totalQty > 0 && !product.variations ? (
                   <div className="flex items-center space-x-3 bg-gray-50 rounded-lg p-1">
                      <button 
                        onClick={() => updateQuantity(product.id, -1)}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-white shadow-sm text-gray-600 hover:text-red-500 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="font-bold text-gray-900 w-4 text-center">{totalQty}</span>
                      <button 
                        onClick={() => updateQuantity(product.id, 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-white shadow-sm text-gray-600 hover:text-green-500 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                   </div>
                ) : (
                  <button 
                    onClick={() => addToCart(product)}
                    className="px-4 py-2 rounded-lg text-white font-medium text-sm transition-opacity hover:opacity-90 shadow-md shadow-primary/20"
                    style={{ backgroundColor: themeColor }}
                  >
                    {totalQty > 0 ? 'Add More' : 'Add'}
                  </button>
                )}
              </div>
            );
          })}

          {products.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <p className="mb-2">Welcome to {settings?.name}!</p>
              <p className="text-xs">No products available yet.</p>
            </div>
          )}
        </div>
      </main>
      
      {/* Floating Cart Button */}
      {totalItems > 0 && (
        <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto z-20">
          <button 
            onClick={() => setIsCartOpen(true)}
            className="w-full py-3 rounded-xl text-white font-bold shadow-lg flex justify-between px-6 items-center transform active:scale-95 transition-all duration-200"
            style={{ backgroundColor: themeColor }}
          >
            <div className="flex items-center space-x-2">
              <div className="bg-white/20 px-2 py-0.5 rounded text-sm">
                {totalItems}
              </div>
              <span className="text-sm font-medium">Items</span>
            </div>
            <span className="text-lg">View Order</span>
            <span className="text-sm font-medium">{formatPrice(totalPrice)}</span>
          </button>
        </div>
      )}

      {/* Check-In Modal */}
      {showCheckIn && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center space-y-6">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto text-blue-600">
                    <MessageCircle className="w-8 h-8" />
                </div>
                
                {checkInStep === 'input' ? (
                    <>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Welcome to {settings?.name}!</h2>
                            <p className="text-gray-500 text-sm mt-1">Please enter your WhatsApp number to start.</p>
                        </div>
                        <input 
                            type="tel" 
                            placeholder="e.g. 628123456789" 
                            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg text-center focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                        />
                        <button 
                            onClick={handleCheckIn}
                            disabled={!customerPhone}
                            className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold shadow-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            Start
                        </button>
                    </>
                ) : checkInStep === 'choice' ? (
                    <>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">How would you like to order?</h2>
                            <p className="text-gray-500 text-sm mt-1">We've sent a welcome message to your WhatsApp.</p>
                        </div>
                        <div className="space-y-3">
                            <button 
                                onClick={() => handleChoice('whatsapp')}
                                className="w-full py-4 rounded-xl bg-[#25D366] text-white font-bold shadow-lg hover:bg-[#1dbf57] transition-colors flex items-center justify-center gap-2"
                            >
                                <MessageCircle className="w-5 h-5" />
                                Order via WhatsApp
                            </button>
                            <button 
                                onClick={() => handleChoice('web')}
                                className="w-full py-4 rounded-xl bg-white border-2 border-gray-200 text-gray-900 font-bold hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                            >
                                <Globe className="w-5 h-5" />
                                Order via Website
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Message Sent!</h2>
                            <p className="text-gray-500 text-sm mt-1">Please check your WhatsApp to continue ordering.</p>
                        </div>
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600 animate-in zoom-in duration-300">
                            <MessageCircle className="w-8 h-8" />
                        </div>
                        <button 
                            onClick={() => setShowCheckIn(false)}
                            className="w-full py-3 rounded-xl bg-gray-900 text-white font-bold shadow-lg hover:bg-black transition-colors"
                        >
                            Close
                        </button>
                    </>
                )}
            </div>
        </div>
      )}

      {/* Cart Modal / Sheet */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center items-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md h-[80vh] sm:h-auto sm:rounded-2xl flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Cart Header */}
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 sm:rounded-t-2xl">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Your Order
              </h2>
              <button 
                onClick={() => setIsCartOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-medium"
              >
                Close
              </button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {cart.map((item, idx) => (
                <div key={`${item.id}-${item.selectedVariation?.name || 'base'}-${idx}`} className="flex justify-between items-start border-b border-gray-100 pb-4 last:border-0">
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900">
                        {item.name}
                        {item.selectedVariation && <span className="text-sm font-normal text-gray-500"> ({item.selectedVariation.name})</span>}
                    </h4>
                    <p className="text-xs text-gray-500">{formatPrice(item.price)} x {item.quantity}</p>
                    <p className="text-sm font-bold text-primary mt-1" style={{ color: themeColor }}>
                      {formatPrice(item.price * item.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3 bg-gray-50 rounded-lg p-1">
                      <button 
                        onClick={() => updateQuantity(item.id, -1, item.selectedVariation?.name)}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-white shadow-sm text-gray-600 hover:text-red-500 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="font-bold text-gray-900 w-4 text-center">{item.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.id, 1, item.selectedVariation?.name)}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-white shadow-sm text-gray-600 hover:text-green-500 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                   </div>
                </div>
              ))}
            </div>

            {/* Cart Footer */}
            <div className="p-4 border-t bg-gray-50 sm:rounded-b-2xl space-y-3">
              <div className="space-y-1 text-sm text-gray-600 mb-4">
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
                        <span>Service Charge ({servicePercent}%)</span>
                        <span>{formatPrice(serviceCharge)}</span>
                      </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t border-gray-200 mt-2">
                    <span className="text-gray-900 font-bold">Total Amount</span>
                    <span className="text-xl font-bold text-gray-900">{formatPrice(totalPrice)}</span>
                  </div>
                  {store.feePaidBy === 'CUSTOMER' && (
                      <p className="text-[10px] text-gray-400 italic mt-1 text-right">
                        *Excl. payment fees (if applicable)
                      </p>
                  )}
              </div>
              
              {/* WhatsApp Payment Buttons (Replaces Generic Checkout) */}
              {/* {(settings?.enableWhatsApp !== false) && (
                  <div className="space-y-2">
                    <button 
                      onClick={() => handleWhatsAppCheckout('qris')}
                      className="w-full py-3.5 rounded-xl text-white font-bold shadow-lg flex justify-between px-6 items-center gap-2 transform active:scale-95 transition-all duration-200"
                      style={{ backgroundColor: '#25D366' }}
                    >
                      <div className="flex items-center gap-2">
                        <MessageCircle className="w-5 h-5" />
                        <span>Pay via QRIS</span>
                      </div>
                      {isCustomerPaysFee && calculatePlatformFee('qris') > 0 && <span className="text-xs bg-black/10 px-2 py-1 rounded">+{formatPrice(calculatePlatformFee('qris'))}</span>}
                    </button>

                    <button 
                      onClick={() => handleWhatsAppCheckout('bank')}
                      className="w-full py-3.5 rounded-xl text-white font-bold shadow-lg flex justify-between px-6 items-center gap-2 transform active:scale-95 transition-all duration-200 bg-emerald-600"
                    >
                      <div className="flex items-center gap-2">
                        <MessageCircle className="w-5 h-5" />
                        <span>Pay via Bank Transfer</span>
                      </div>
                      {isCustomerPaysFee && calculatePlatformFee('transfer') > 0 && <span className="text-xs bg-black/10 px-2 py-1 rounded">+{formatPrice(calculatePlatformFee('transfer'))}</span>}
                    </button>
                  </div>
              )} */}

              {/* Midtrans Button (Should be SPLIT into 2 buttons: QRIS and Bank) */}
              {settings?.enableMidtrans && (
                <div className="space-y-2">
                    {/* QRIS Option */}
                    <button 
                      onClick={() => handlePaymentGatewayCheckout('midtrans', 'qris')}
                      disabled={isProcessing}
                      className="w-full py-3.5 rounded-xl text-white font-bold shadow-lg flex justify-between px-6 items-center gap-2 transform active:scale-95 transition-all duration-200 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5" />
                        <span>Pay via QRIS (Midtrans)</span>
                      </div>
                      {isCustomerPaysFee && calculatePlatformFee('qris') > 0 && (
                          <span className="text-xs bg-black/10 px-2 py-1 rounded">+{formatPrice(calculatePlatformFee('qris'))}</span>
                      )}
                    </button>

                    {/* Bank Transfer Option */}
                    <button 
                      onClick={() => handlePaymentGatewayCheckout('midtrans', 'bank_transfer')}
                      disabled={isProcessing}
                      className="w-full py-3.5 rounded-xl text-white font-bold shadow-lg flex justify-between px-6 items-center gap-2 transform active:scale-95 transition-all duration-200 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5" />
                        <span>Pay via Bank (Midtrans)</span>
                      </div>
                      {isCustomerPaysFee && calculatePlatformFee('transfer') > 0 && (
                          <span className="text-xs bg-black/10 px-2 py-1 rounded">+{formatPrice(calculatePlatformFee('transfer'))}</span>
                      )}
                    </button>
                </div>
              )}

              {/* Xendit Buttons (Split by Method) */}
              {settings?.enableXendit && (
                <div className="space-y-2">
                     {/* QRIS Option */}
                    <button 
                      onClick={() => handlePaymentGatewayCheckout('xendit', 'qris')}
                      disabled={isProcessing}
                      className="w-full py-3.5 rounded-xl text-white font-bold shadow-lg flex justify-between px-6 items-center gap-2 transform active:scale-95 transition-all duration-200 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5" />
                        <span>Pay via QRIS (Xendit)</span>
                      </div>
                      {isCustomerPaysFee && calculatePlatformFee('qris') > 0 && (
                          <span className="text-xs bg-black/10 px-2 py-1 rounded">+{formatPrice(calculatePlatformFee('qris'))}</span>
                      )}
                    </button>

                     {/* Bank Option */}
                     <button 
                      onClick={() => handlePaymentGatewayCheckout('xendit', 'bank_transfer')}
                      disabled={isProcessing}
                      className="w-full py-3.5 rounded-xl text-white font-bold shadow-lg flex justify-between px-6 items-center gap-2 transform active:scale-95 transition-all duration-200 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5" />
                        <span>Pay via Bank (Xendit)</span>
                      </div>
                      {isCustomerPaysFee && calculatePlatformFee('transfer') > 0 && (
                          <span className="text-xs bg-black/10 px-2 py-1 rounded">+{formatPrice(calculatePlatformFee('transfer'))}</span>
                      )}
                    </button>
                </div>
              )}

              {/* Manual Transfer Button */}
              {settings?.enableManualTransfer && (
                <button 
                  onClick={() => handlePaymentGatewayCheckout('manual')}
                  disabled={isProcessing}
                  className="w-full py-3.5 rounded-xl text-white font-bold shadow-lg flex justify-between px-6 items-center gap-2 transform active:scale-95 transition-all duration-200 bg-gray-600 hover:bg-gray-700"
                >
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    <span>Manual Bank Transfer</span>
                  </div>
                  {isCustomerPaysFee && calculatePlatformFee('transfer') > 0 && (
                      <span className="text-xs bg-black/10 px-2 py-1 rounded">+{formatPrice(calculatePlatformFee('transfer'))}</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bank Details Modal */}
      {showBankDetails && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600 mb-2">
              <ShoppingCart className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Order #{lastOrderId} Placed!</h2>
            <p className="text-gray-500 text-sm">Please transfer the total amount to:</p>
            
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <p className="font-bold text-gray-900 text-lg">{bankInfo?.accountNumber || '1234567890'}</p>
              <p className="text-sm text-gray-500 uppercase tracking-wider font-bold">
                {bankInfo?.bankName || 'BCA'} - {bankInfo?.accountName || 'PT Laku Keras'}
              </p>
              <div className="mt-2 pt-2 border-t border-gray-200">
                 <p className="text-xs text-gray-400">Total Amount (Exact)</p>
                 <p className="text-lg font-bold text-primary" style={{ color: themeColor }}>
                   {formatPrice(finalAmount || totalPrice)}
                 </p>
                 <p className="text-[10px] text-red-500 italic mt-1">
                   *Please transfer the EXACT amount including unique code
                 </p>
              </div>
            </div>

            <button 
              onClick={() => { setShowBankDetails(false); window.location.reload(); }}
              className="w-full py-3 rounded-xl bg-gray-900 text-white font-bold shadow-lg"
            >
              Close & New Order
            </button>
          </div>
        </div>
      )}

      {/* Variation Selection Modal */}
      {variationModalOpen && productForVariation && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{productForVariation.name}</h3>
                <p className="text-gray-500 text-sm">Select Variation</p>
              </div>
              <button onClick={() => setVariationModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
               {productForVariation.variations?.map((v, idx) => (
                 <button
                   key={idx}
                   onClick={() => setSelectedVariation(v)}
                   className={`w-full flex justify-between items-center p-4 rounded-xl border-2 transition-all ${
                     selectedVariation?.name === v.name 
                       ? "bg-gray-50" 
                       : "border-gray-100 hover:border-gray-200"
                   }`}
                   style={selectedVariation?.name === v.name ? { borderColor: themeColor, backgroundColor: `${themeColor}10` } : {}}
                 >
                   <span className="font-medium text-gray-900">{v.name}</span>
                   <span className="font-bold" style={{ color: themeColor }}>{formatPrice(v.price)}</span>
                 </button>
               ))}
            </div>

            <button 
              onClick={confirmVariation}
              disabled={!selectedVariation}
              className="w-full py-3.5 rounded-xl text-white font-bold shadow-lg transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: themeColor }}
            >
              Add to Order - {formatPrice(selectedVariation?.price || 0)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
