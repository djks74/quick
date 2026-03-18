"use client";

import { useState, useEffect } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Trash2, ShoppingBag, ArrowRight, Minus, Plus, MessageCircle, CreditCard } from "lucide-react";
import Link from "next/link";
import { products as initialProducts } from "@/data/products";
import { getStoreSettings } from "@/lib/api";

export default function CartPage() {
  const [cartItems, setCartItems] = useState([
    { ...initialProducts[0], quantity: 1 },
    { ...initialProducts[1], quantity: 1 },
  ]);
  const [settings, setSettings] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    getStoreSettings('demo').then(setSettings);
  }, []);

  const updateQuantity = (id: number, delta: number) => {
    setCartItems(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeItem = (id: number) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
  };

  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shipping = subtotal > 500 ? 0 : 50;
  const total = subtotal + shipping;

  const handleWhatsAppCheckout = () => {
    const phone = settings?.whatsapp || "628123456789";
    const message = `menu`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handlePaymentGatewayCheckout = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cartItems,
          total: total,
          customerInfo: { phone: 'WEB_USER' } // Ideally collect phone first
        })
      });
      
      const data = await res.json();
      if (data.success && data.paymentUrl) {
        window.location.href = data.paymentUrl;
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

  return (
    <main className="min-h-screen flex flex-col bg-[#F0F3F7]">
      <Header />
      
      <div className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <h1 className="text-4xl font-black italic uppercase tracking-wider mb-12 text-gray-900">
          Your Shopping Cart
        </h1>

        {cartItems.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Cart Items List */}
            <div className="lg:col-span-8 space-y-4">
              {cartItems.map((item) => (
                <div key={item.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-6 group">
                  <div className="w-24 h-24 bg-gray-50 rounded-xl overflow-hidden flex-shrink-0">
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <h3 className="font-black italic text-gray-900 uppercase tracking-wider">{item.name}</h3>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{item.category}</p>
                    <div className="flex items-center space-x-4 mt-4">
                      <div className="flex items-center border border-gray-100 rounded-lg bg-gray-50 overflow-hidden">
                        <button 
                          onClick={() => updateQuantity(item.id, -1)}
                          className="p-2 hover:bg-gray-100 text-gray-400 hover:text-primary transition-colors"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="px-4 text-sm font-black italic">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.id, 1)}
                          className="p-2 hover:bg-gray-100 text-gray-400 hover:text-primary transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <button 
                        onClick={() => removeItem(item.id)}
                        className="text-red-500 hover:text-red-600 transition-colors p-2 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black italic text-gray-900">${(item.price * item.quantity).toLocaleString()}</p>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">${item.price.toLocaleString()} each</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-[#1d2327] rounded-2xl p-8 shadow-xl text-white space-y-6">
                <h2 className="text-xl font-black italic uppercase tracking-wider mb-8">Order Summary</h2>
                
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between text-gray-400 font-bold uppercase tracking-widest">
                    <span>Subtotal</span>
                    <span className="text-white">${subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-400 font-bold uppercase tracking-widest">
                    <span>Shipping</span>
                    <span className="text-white">{shipping === 0 ? "FREE" : `$${shipping}`}</span>
                  </div>
                  <div className="pt-4 border-t border-white/10 flex justify-between items-end">
                    <span className="text-xs font-black uppercase tracking-[0.3em] text-orange-600">Total Price</span>
                    <span className="text-3xl font-black italic">${total.toLocaleString()}</span>
                  </div>
                </div>

                <div className="space-y-3 mt-8">
                  {/* WhatsApp Checkout */}
                  <button 
                    onClick={handleWhatsAppCheckout}
                    className="w-full bg-[#25D366] text-white py-4 rounded-xl font-black uppercase tracking-widest text-sm shadow-lg shadow-[#25D366]/30 hover:bg-[#128C7E] transition-all flex items-center justify-center group"
                  >
                    <MessageCircle className="w-5 h-5 mr-2" />
                    Checkout via WhatsApp
                  </button>

                  {/* Payment Gateway Checkout */}
                  {settings?.paymentProvider !== 'manual' && (
                    <button 
                      onClick={handlePaymentGatewayCheckout}
                      disabled={isProcessing}
                      className="w-full bg-primary text-white py-4 rounded-xl font-black uppercase tracking-widest text-sm shadow-lg shadow-primary/30 hover:bg-orange-600 transition-all flex items-center justify-center group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessing ? (
                        "Processing..."
                      ) : (
                        <>
                          <CreditCard className="w-5 h-5 mr-2" />
                          Pay Now ({settings?.paymentProvider === 'midtrans' ? 'Midtrans' : 'Gateway'})
                        </>
                      )}
                    </button>
                  )}
                </div>
                
                <div className="text-center pt-4">
                  <Link href="/shop" className="text-xs text-gray-500 hover:text-white transition-colors font-bold uppercase tracking-widest">
                    Continue Shopping
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-16 text-center shadow-sm border border-gray-100 max-w-2xl mx-auto mt-20">
            <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-8">
              <ShoppingBag className="w-10 h-10 text-gray-300" />
            </div>
            <h2 className="text-2xl font-black italic text-gray-900 uppercase tracking-wider mb-4">Your cart is empty</h2>
            <p className="text-gray-500 mb-10 leading-relaxed max-w-sm mx-auto">
              Looks like you haven't added any high-performance parts to your cart yet. Let's get your build started!
            </p>
            <Link 
              href="/shop" 
              className="inline-flex items-center bg-primary text-white px-10 py-4 rounded-xl font-black uppercase tracking-widest text-sm shadow-lg shadow-primary/20 hover:bg-orange-600 transition-all group"
            >
              Start Shopping
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
