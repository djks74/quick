"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { Product } from "@/lib/types";
import { products } from "@/data/products";

export interface Slide {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  buttonText: string;
  buttonLink: string;
}

export interface HeaderSettings {
  height: string;
  backgroundColor: string;
  textColor: string;
  fontSize: string;
}

export interface PaymentSettings {
  midtransEnabled: boolean;
  midtransServerKey: string;
  midtransClientKey: string;
}

interface CartItem extends Product {
  quantity: number;
}

interface ShopContextType {
  // Slider
  slides: Slide[];
  setSlides: (slides: Slide[]) => void;
  addSlide: (slide: Slide) => void;
  removeSlide: (id: number) => void;
  updateSlide: (id: number, slide: Slide) => void;

  // Header
  headerSettings: HeaderSettings;
  setHeaderSettings: (settings: HeaderSettings) => void;

  // Payment
  paymentSettings: PaymentSettings;
  setPaymentSettings: (settings: PaymentSettings) => void;

  // Cart
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (id: number) => void;
  updateCartQuantity: (id: number, delta: number) => void;
  clearCart: () => void;
  cartTotal: number;
}

const ShopContext = createContext<ShopContextType | undefined>(undefined);

const initialSlides: Slide[] = [
  {
    id: 1,
    title: "B58 ENGINE STAGE 2 TUNE",
    subtitle: "PERFORMANCE UNLEASHED",
    description: "Experience massive power gains and improved drivability for your BMW B58 engine.",
    image: "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?q=80&w=2070&auto=format&fit=crop",
    buttonText: "Shop Now",
    buttonLink: "/shop"
  },
  {
    id: 2,
    title: "CUSTOM TUNING SERVICES",
    subtitle: "TAILORED EXCELLENCE",
    description: "Our expert team provides precision tuning for high-performance cars.",
    image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?q=80&w=2070&auto=format&fit=crop",
    buttonText: "Book Now",
    buttonLink: "/tuning"
  }
];

const initialHeaderSettings: HeaderSettings = {
  height: "80px",
  backgroundColor: "#ffffff",
  textColor: "#666666",
  fontSize: "14px"
};

const initialPaymentSettings: PaymentSettings = {
  midtransEnabled: false,
  midtransServerKey: "",
  midtransClientKey: ""
};

export function ShopProvider({ children }: { children: React.ReactNode }) {
  // State
  const [slides, setSlidesState] = useState<Slide[]>(initialSlides);
  const [headerSettings, setHeaderSettingsState] = useState<HeaderSettings>(initialHeaderSettings);
  const [paymentSettings, setPaymentSettingsState] = useState<PaymentSettings>(initialPaymentSettings);
  const [cart, setCart] = useState<CartItem[]>([]);

  const parseStored = <T,>(key: string, fallback: T): T => {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const normalized = raw.trim();
    if (!normalized || normalized === "undefined" || normalized === "null") return fallback;
    try {
      return JSON.parse(normalized) as T;
    } catch {
      localStorage.removeItem(key);
      return fallback;
    }
  };

  // Load from LocalStorage
  useEffect(() => {
    setSlidesState(parseStored<Slide[]>("shop_slides", initialSlides));
    setHeaderSettingsState(parseStored<HeaderSettings>("shop_header", initialHeaderSettings));
    setPaymentSettingsState(parseStored<PaymentSettings>("shop_payment", initialPaymentSettings));
    setCart(parseStored<CartItem[]>("shop_cart", []));
  }, []);

  // Save to LocalStorage helpers
  const setSlides = (newSlides: Slide[]) => {
    setSlidesState(newSlides);
    localStorage.setItem("shop_slides", JSON.stringify(newSlides));
  };

  const setHeaderSettings = (settings: HeaderSettings) => {
    setHeaderSettingsState(settings);
    localStorage.setItem("shop_header", JSON.stringify(settings));
  };

  const setPaymentSettings = (settings: PaymentSettings) => {
    setPaymentSettingsState(settings);
    localStorage.setItem("shop_payment", JSON.stringify(settings));
  };

  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart);
    localStorage.setItem("shop_cart", JSON.stringify(newCart));
  };

  // Slider Actions
  const addSlide = (slide: Slide) => setSlides([...slides, slide]);
  const removeSlide = (id: number) => setSlides(slides.filter(s => s.id !== id));
  const updateSlide = (id: number, slide: Slide) => setSlides(slides.map(s => s.id === id ? slide : s));

  // Cart Actions
  const addToCart = (product: Product, quantity = 1) => {
    const existing = cart.find(c => c.id === product.id);
    if (existing) {
      saveCart(cart.map(c => c.id === product.id ? { ...c, quantity: c.quantity + quantity } : c));
    } else {
      saveCart([...cart, { ...product, quantity }]);
    }
  };

  const removeFromCart = (id: number) => saveCart(cart.filter(c => c.id !== id));
  
  const updateCartQuantity = (id: number, delta: number) => {
    saveCart(cart.map(c => {
      if (c.id === id) {
        return { ...c, quantity: Math.max(1, c.quantity + delta) };
      }
      return c;
    }));
  };

  const clearCart = () => saveCart([]);

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <ShopContext.Provider value={{
      slides, setSlides, addSlide, removeSlide, updateSlide,
      headerSettings, setHeaderSettings,
      paymentSettings, setPaymentSettings,
      cart, addToCart, removeFromCart, updateCartQuantity, clearCart, cartTotal
    }}>
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const context = useContext(ShopContext);
  if (context === undefined) {
    throw new Error("useShop must be used within a ShopProvider");
  }
  return context;
}
