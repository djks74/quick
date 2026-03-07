"use client";

import Link from "next/link";
import { Mail, Phone, MapPin, Instagram, Facebook, Twitter, Youtube } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-[#1d2327] text-white pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          {/* Column 1: Brand Info */}
          <div className="space-y-6">
            <Link href="/" className="flex items-center">
              <span className="text-2xl font-black italic text-white">LCP<span className="text-primary">AUTO</span></span>
            </Link>
            <p className="text-gray-400 text-sm leading-relaxed">
              Your premier partner for high-performance automotive tuning and premium car parts. Based in Jakarta, serving enthusiasts worldwide.
            </p>
            <div className="flex items-center space-x-4">
              <Link href="#" className="p-2 bg-gray-800 rounded-full hover:bg-primary transition-all"><Instagram className="w-4 h-4" /></Link>
              <Link href="#" className="p-2 bg-gray-800 rounded-full hover:bg-primary transition-all"><Facebook className="w-4 h-4" /></Link>
              <Link href="#" className="p-2 bg-gray-800 rounded-full hover:bg-primary transition-all"><Twitter className="w-4 h-4" /></Link>
              <Link href="#" className="p-2 bg-gray-800 rounded-full hover:bg-primary transition-all"><Youtube className="w-4 h-4" /></Link>
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div className="space-y-6">
            <h4 className="text-sm font-black uppercase tracking-widest text-primary">Quick Links</h4>
            <ul className="space-y-3 text-sm text-gray-400">
              <li><Link href="/shop" className="hover:text-white transition-colors">Shop All Parts</Link></li>
              <li><Link href="/tuning" className="hover:text-white transition-colors">Tuning Services</Link></li>
              <li><Link href="/about" className="hover:text-white transition-colors">Our Story</Link></li>
              <li><Link href="/contact" className="hover:text-white transition-colors">Contact Support</Link></li>
              <li><Link href="/shipping" className="hover:text-white transition-colors">Shipping & Returns</Link></li>
            </ul>
          </div>

          {/* Column 3: Contact Info */}
          <div className="space-y-6">
            <h4 className="text-sm font-black uppercase tracking-widest text-primary">Contact Us</h4>
            <ul className="space-y-4 text-sm text-gray-400">
              <li className="flex items-start space-x-3">
                <MapPin className="w-5 h-5 text-primary flex-shrink-0" />
                <span>Jl. Sudirman No. 45, Jakarta Selatan, 12190</span>
              </li>
              <li className="flex items-center space-x-3">
                <Phone className="w-5 h-5 text-primary flex-shrink-0" />
                <span>+62 21 555 1234</span>
              </li>
              <li className="flex items-center space-x-3">
                <Mail className="w-5 h-5 text-primary flex-shrink-0" />
                <span>info@lcpautocars.com</span>
              </li>
            </ul>
          </div>

          {/* Column 4: Newsletter */}
          <div className="space-y-6">
            <h4 className="text-sm font-black uppercase tracking-widest text-primary">Newsletter</h4>
            <p className="text-sm text-gray-400">Subscribe to get latest tuning news and special offers.</p>
            <form className="flex space-x-2">
              <input 
                type="email" 
                placeholder="Your email" 
                className="flex-1 bg-gray-800 border-none px-4 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
              />
              <button className="bg-primary text-white px-4 py-2 text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-primary/20">
                Join
              </button>
            </form>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between text-xs text-gray-500 space-y-4 md:space-y-0 uppercase tracking-widest font-bold">
          <p>© 2024 LCP AUTO CARS. ALL RIGHTS RESERVED.</p>
          <div className="flex space-x-6">
            <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
