"use client";

import Link from "next/link";
import { Search, ShoppingCart, User, Menu, X } from "lucide-react";
import { useState } from "react";
import { useAdmin } from "@/lib/admin-context";
import { useShop } from "@/context/ShopContext";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { siteName } = useAdmin();
  const { headerSettings, cartTotal } = useShop();

  return (
    <header 
      className="w-full border-b border-gray-100 sticky top-0 z-[50] transition-colors"
      style={{ 
        backgroundColor: headerSettings.backgroundColor,
        height: headerSettings.height
      }}
    >
      {/* Top Bar (Optional) */}
      <div className="bg-[#1d2327] text-white py-1.5 px-4 text-[11px] text-center uppercase tracking-widest font-bold">
        Free Shipping on all Tuning Parts over $500
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex justify-between items-center h-full">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0 flex items-center">
            <span className="text-2xl font-black italic text-[#1d2327]">
              {siteName.split(' ')[0]}<span className="text-primary">{siteName.split(' ').slice(1).join('') || 'AUTO'}</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex space-x-8 items-center h-full">
            {["Shop", "Tuning", "Services", "About", "Contact"].map((item) => (
              <Link 
                key={item} 
                href={`/${item.toLowerCase()}`} 
                className="font-bold hover:text-primary uppercase tracking-wider transition-colors flex items-center h-full"
                style={{ 
                  color: headerSettings.textColor,
                  fontSize: headerSettings.fontSize
                }}
              >
                {item}
              </Link>
            ))}
          </nav>

          {/* Icons */}
          <div className="flex items-center space-x-5">
            <button className="hover:text-primary transition-colors" style={{ color: headerSettings.textColor }}>
              <Search className="w-5 h-5" />
            </button>
            <Link href="/account" className="hover:text-primary transition-colors" style={{ color: headerSettings.textColor }}>
              <User className="w-5 h-5" />
            </Link>
            <Link href="/cart" className="relative hover:text-primary transition-colors" style={{ color: headerSettings.textColor }}>
              <ShoppingCart className="w-5 h-5" />
              <span className="absolute -top-2 -right-2 bg-primary text-white text-[10px] font-bold px-1.5 rounded-full h-4 flex items-center justify-center">
                {cartTotal > 99 ? '99+' : cartTotal}
              </span>
            </Link>
            
            {/* Mobile menu button */}
            <button 
              className="md:hidden text-text-muted"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 p-4 space-y-4 animate-in slide-in-from-top-5 duration-200">
          {["Shop", "Tuning", "Services", "About", "Contact"].map((item) => (
            <Link 
              key={item} 
              href={`/${item.toLowerCase()}`} 
              className="block text-sm font-bold text-text-muted hover:text-primary uppercase tracking-wider"
              onClick={() => setIsMenuOpen(false)}
            >
              {item}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
