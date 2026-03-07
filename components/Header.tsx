"use client";

import Link from "next/link";
import { Search, ShoppingCart, User, Menu, X } from "lucide-react";
import { useState } from "react";
import { useCurrency } from "@/context/CurrencyContext";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { currency } = useCurrency();

  return (
    <header className="bg-white shadow-md sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold text-primary flex items-center">
          LCP Auto Cars
          {/* Country flag indicator could go here */}
          {currency === "IDR" && <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded border border-red-200">ID</span>}
        </Link>
        
        {/* Desktop Navigation */}
        <nav className="hidden lg:flex space-x-6">
          <Link href="/" className="text-gray-700 hover:text-primary transition font-medium">Home</Link>
          <Link href="/hardware-licence" className="text-gray-700 hover:text-primary transition font-medium">Hardware & Licence</Link>
          <Link href="/custom-tunes" className="text-gray-700 hover:text-primary transition font-medium">Custom Tunes</Link>
          <Link href="/our-services" className="text-gray-700 hover:text-primary transition font-medium">Our Services</Link>
          <Link href="/dealers" className="text-gray-700 hover:text-primary transition font-medium">Dealers</Link>
        </nav>

        <div className="flex items-center space-x-4">
          <button className="text-gray-600 hover:text-primary hidden sm:block">
            <Search className="w-5 h-5" />
          </button>
          <button className="text-gray-600 hover:text-primary hidden sm:block">
            <User className="w-5 h-5" />
          </button>
          <button className="text-gray-600 hover:text-primary relative">
            <ShoppingCart className="w-5 h-5" />
            <span className="absolute -top-2 -right-2 bg-primary text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">0</span>
          </button>
          
          {/* Mobile Menu Button */}
          <button 
            className="lg:hidden text-gray-600 hover:text-primary"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="lg:hidden bg-white border-t border-gray-100 py-4 px-4 shadow-lg absolute w-full left-0">
          <nav className="flex flex-col space-y-4">
            <Link href="/" className="text-gray-700 hover:text-primary transition font-medium" onClick={() => setIsMenuOpen(false)}>Home</Link>
            <Link href="/hardware-licence" className="text-gray-700 hover:text-primary transition font-medium" onClick={() => setIsMenuOpen(false)}>Hardware & Licence</Link>
            <Link href="/custom-tunes" className="text-gray-700 hover:text-primary transition font-medium" onClick={() => setIsMenuOpen(false)}>Custom Tunes</Link>
            <Link href="/our-services" className="text-gray-700 hover:text-primary transition font-medium" onClick={() => setIsMenuOpen(false)}>Our Services</Link>
            <Link href="/dealers" className="text-gray-700 hover:text-primary transition font-medium" onClick={() => setIsMenuOpen(false)}>Dealers</Link>
          </nav>
        </div>
      )}
    </header>
  );
}
