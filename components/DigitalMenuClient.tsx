
"use client";

import { useState, useEffect } from "react";
import { ShoppingCart, Minus, Plus, Trash2 } from "lucide-react";
import { siteConfig } from "@/config/site";
import { useSearchParams } from "next/navigation";

interface Product {
  id: number;
  name: string;
  price: number;
  unit: string;
}

interface CartItem extends Product {
  quantity: number;
}

export default function DigitalMenuClient({ products }: { products: Product[] }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const searchParams = useSearchParams();
  const tableNumber = searchParams.get('table');

  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === productId) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
  const totalPrice = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const handleCheckout = () => {
    if (cart.length === 0) return;

    // Construct WhatsApp message
    let message = `Hello ${siteConfig.name}, I would like to order`;
    if (tableNumber) {
      message += ` for *Table ${tableNumber}*`;
    }
    message += `:\n\n`;
    
    cart.forEach(item => {
      message += `- ${item.quantity}x ${item.name} @ ${formatPrice(item.price)}\n`;
    });
    message += `\nTotal: *${formatPrice(totalPrice)}*`;
    message += `\n\nPlease send the payment link. Thank you!`;

    // Encode for URL
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodedMessage}`;
    
    // Open WhatsApp
    window.open(whatsappUrl, '_blank');
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

  return (
    <div className="min-h-screen bg-gray-50 pb-24" style={{ '--theme-color': siteConfig.themeColor } as any}>
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white shadow-sm px-4 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900" style={{ color: siteConfig.themeColor }}>
            {siteConfig.name}
          </h1>
          <p className="text-sm text-gray-500">WhatsApp Order: {siteConfig.whatsappNumber}</p>
        </div>
        <a href="/admin" className="text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-gray-600">
            Owner Login
        </a>
      </header>

      {/* Menu Grid */}
      <main className="max-w-md mx-auto p-4 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">Menu</h2>
          <span className="text-xs text-gray-400 font-medium">{products.length} Items Available</span>
        </div>
        
        <div className="grid gap-4">
          {products.map((product) => {
            const inCart = cart.find(item => item.id === product.id);
            
            return (
              <div key={product.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-gray-900">{product.name}</h3>
                  <p className="text-sm text-gray-500">{product.unit}</p>
                  <p className="text-primary font-bold mt-1" style={{ color: siteConfig.themeColor }}>
                    {formatPrice(product.price)}
                  </p>
                </div>
                
                {inCart ? (
                   <div className="flex items-center space-x-3 bg-gray-50 rounded-lg p-1">
                      <button 
                        onClick={() => updateQuantity(product.id, -1)}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-white shadow-sm text-gray-600 hover:text-red-500 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="font-bold text-gray-900 w-4 text-center">{inCart.quantity}</span>
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
                    style={{ backgroundColor: siteConfig.themeColor }}
                  >
                    Add
                  </button>
                )}
              </div>
            );
          })}

          {products.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <p className="mb-2">Welcome to {siteConfig.name}!</p>
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
            style={{ backgroundColor: siteConfig.themeColor }}
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
              {cart.map(item => (
                <div key={item.id} className="flex justify-between items-start border-b border-gray-100 pb-4 last:border-0">
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900">{item.name}</h4>
                    <p className="text-xs text-gray-500">{formatPrice(item.price)} x {item.quantity}</p>
                    <p className="text-sm font-bold text-primary mt-1" style={{ color: siteConfig.themeColor }}>
                      {formatPrice(item.price * item.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3 bg-gray-50 rounded-lg p-1">
                      <button 
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-white shadow-sm text-gray-600 hover:text-red-500 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="font-bold text-gray-900 w-4 text-center">{item.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-white shadow-sm text-gray-600 hover:text-green-500 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                   </div>
                </div>
              ))}
            </div>

            {/* Cart Footer */}
            <div className="p-4 border-t bg-gray-50 sm:rounded-b-2xl">
              <div className="flex justify-between items-center mb-4">
                <span className="text-gray-600 font-medium">Total Amount</span>
                <span className="text-xl font-bold text-gray-900">{formatPrice(totalPrice)}</span>
              </div>
              <button 
                onClick={handleCheckout}
                className="w-full py-3.5 rounded-xl text-white font-bold shadow-lg flex justify-center items-center gap-2 transform active:scale-95 transition-all duration-200"
                style={{ backgroundColor: '#25D366' }} // WhatsApp Green
              >
                <span>Checkout via WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
