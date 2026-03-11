"use client";

import Link from "next/link";
import { MessageCircle, ShoppingBag, Store, ArrowRight, Globe } from "lucide-react";
import { useState } from "react";

const translations = {
  en: {
    login: "Login",
    badge: "WhatsApp Integration Ready",
    title_start: "Launch Your",
    title_highlight: "Digital Menu",
    title_end: "in Seconds",
    description: "One system for your shop, your chat, and your deliveries. Accept orders via WhatsApp, manage your physical store with our POS, and track every shipment effortlessly.",
    view_demo: "View Demo Store",
    create_store: "Create Your Store",
    easy_setup: "Easy Setup",
    instant_launch: "Instant Launch",
    easy_payment: "Easy Payment",
    order_via_whatsapp: "Order via WhatsApp",
    new_order: "New Order",
    whatsapp_features: "Manage products, update pricing, and fulfill orders—all directly within WhatsApp."
  },
  id: {
    login: "Masuk",
    badge: "Integrasi WhatsApp Siap",
    title_start: "Luncurkan",
    title_highlight: "Menu Digital",
    title_end: "dalam Detik",
    description: "Satu sistem untuk toko, chat, dan pengiriman Anda. Terima pesanan via WhatsApp, kelola toko fisik dengan POS kami, dan lacak setiap pengiriman dengan mudah.",
    view_demo: "Lihat Demo Toko",
    create_store: "Buat Toko Anda",
    easy_setup: "Setup Mudah",
    instant_launch: "Luncurkan Instan",
    easy_payment: "Pembayaran Mudah",
    order_via_whatsapp: "Pesan via WhatsApp",
    new_order: "Pesanan Baru",
    whatsapp_features: "Kelola produk, perbarui harga, dan penuhi pesanan—semuanya langsung di dalam WhatsApp."
  }
};

export default function Home() {
  const [lang, setLang] = useState<'en' | 'id'>('en');
  const t = translations[lang];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Navbar */}
      <nav className="w-full px-6 py-4 flex justify-between items-center backdrop-blur-sm bg-white/30 sticky top-0 z-50">
        <div className="flex items-center gap-2 text-blue-600 font-bold text-xl">
          <Store className="w-6 h-6" />
          <span>QuickMenu</span>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setLang(lang === 'en' ? 'id' : 'en')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 hover:bg-white text-sm font-medium text-gray-600 transition-colors"
          >
            <Globe className="w-4 h-4" />
            {lang === 'en' ? 'ID' : 'EN'}
          </button>
          
          <Link 
            href="/login" 
            className="px-6 py-2 bg-white text-gray-700 font-medium rounded-full shadow-sm hover:shadow-md transition-all hover:text-blue-600"
          >
            {t.login}
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col lg:flex-row items-center justify-center p-6 lg:p-20 gap-12 max-w-7xl mx-auto w-full">
        
        {/* Left Content */}
        <div className="flex-1 space-y-8 text-center lg:text-left animate-fade-in-up">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium animate-pulse">
              <MessageCircle className="w-4 h-4" />
              <span>{t.badge}</span>
            </div>
            
            <h1 className="text-5xl lg:text-7xl font-extrabold text-gray-900 tracking-tight leading-tight">
              {t.title_start} <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">{t.title_highlight}</span> {t.title_end}
            </h1>
            
            <p className="text-xl text-gray-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
              {t.description}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <Link 
              href="/demo" 
              className="group px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg hover:shadow-blue-500/30 flex items-center justify-center gap-2"
            >
              {t.view_demo}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link 
              href="/register" 
              className="px-8 py-4 bg-white text-gray-800 border-2 border-gray-100 rounded-2xl font-bold hover:bg-gray-50 hover:border-gray-200 transition-all shadow-sm hover:shadow-md flex items-center justify-center"
            >
              {t.create_store}
            </Link>
          </div>
          
          <div className="pt-8 flex items-center justify-center lg:justify-start gap-8 text-gray-400 text-sm font-medium">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span>{t.easy_setup}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span>{t.instant_launch}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span>{t.easy_payment}</span>
            </div>
          </div>

          <div className="pt-4 flex flex-col gap-3">
             <div className="flex items-center justify-center lg:justify-start gap-3 p-4 bg-white/50 backdrop-blur-sm rounded-2xl border border-white shadow-sm hover:shadow-md transition-all group max-w-xl mx-auto lg:mx-0">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600 group-hover:scale-110 transition-transform">
                   <MessageCircle className="w-6 h-6" />
                </div>
                <div className="flex-1 text-left">
                   <p className="text-gray-800 font-bold text-lg leading-snug">
                      {t.whatsapp_features}
                   </p>
                </div>
             </div>
          </div>
        </div>

        {/* Right Content - Animated Visual */}
        <div className="flex-1 relative w-full max-w-lg lg:max-w-xl">
          <div className="relative z-10 animate-float">
            {/* Main Phone/Card Container */}
            <div className="bg-white rounded-[2.5rem] shadow-2xl border-8 border-gray-900 overflow-hidden aspect-[9/19] max-h-[600px] mx-auto relative bg-gradient-to-b from-gray-50 to-white">
              
              {/* Phone Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-gray-900 rounded-b-2xl z-20"></div>
              
              {/* Screen Content */}
              <div className="p-6 space-y-6 pt-12">
                {/* Header */}
                <div className="flex justify-between items-center">
                  <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
                  <div className="w-24 h-4 bg-gray-200 rounded animate-pulse"></div>
                  <ShoppingBag className="w-6 h-6 text-gray-400" />
                </div>
                
                {/* Hero Image Placeholder */}
                <div className="w-full aspect-video bg-blue-100 rounded-xl flex items-center justify-center">
                  <Store className="w-12 h-12 text-blue-300" />
                </div>
                
                {/* Product List */}
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-4 p-3 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                      <div className="w-16 h-16 bg-gray-100 rounded-lg flex-shrink-0"></div>
                      <div className="flex-1 space-y-2">
                        <div className="w-3/4 h-4 bg-gray-100 rounded"></div>
                        <div className="w-1/2 h-4 bg-gray-100 rounded"></div>
                      </div>
                      <div className="flex items-end">
                         <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">+</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Bottom WhatsApp Button */}
              <div className="absolute bottom-6 left-6 right-6">
                <div className="bg-[#25D366] text-white p-4 rounded-xl shadow-lg flex items-center justify-center gap-2 font-bold transform hover:scale-105 transition-transform cursor-pointer">
                  <MessageCircle className="w-6 h-6" />
                  {t.order_via_whatsapp}
                </div>
              </div>
            </div>
          </div>
          
          {/* Decorative Floating Elements */}
          <div className="absolute top-20 -right-10 w-20 h-20 bg-yellow-400 rounded-full blur-xl opacity-20 animate-pulse"></div>
          <div className="absolute bottom-20 -left-10 w-32 h-32 bg-blue-500 rounded-full blur-2xl opacity-20 animate-pulse delay-700"></div>
          
          {/* Floating Badge */}
          <div className="absolute top-1/3 -right-4 lg:-right-12 bg-white p-4 rounded-2xl shadow-xl animate-float delay-1000 hidden sm:block">
             <div className="flex items-center gap-3">
               <div className="p-2 bg-green-100 rounded-full text-green-600">
                 <MessageCircle className="w-6 h-6" />
               </div>
               <div>
                 <p className="text-xs text-gray-500 font-medium">{t.new_order}</p>
                 <p className="text-sm font-bold text-gray-900">+ Rp 240.000</p>
               </div>
             </div>
          </div>
        </div>
      </main>
    </div>
  );
}