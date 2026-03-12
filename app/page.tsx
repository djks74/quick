"use client";

import Link from "next/link";
import { 
  MessageCircle, 
  ShoppingBag, 
  Store, 
  ArrowRight, 
  Globe, 
  QrCode, 
  Zap, 
  Smartphone, 
  CreditCard, 
  LayoutDashboard, 
  CheckCircle2, 
  Users, 
  ShieldCheck, 
  TrendingUp,
  MessageSquare
} from "lucide-react";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

const steps = [
  {
    phase: "Phase 1",
    title: "Merchant Setup",
    subtitle: "Launch your digital presence in minutes.",
    icon: Store,
    color: "blue",
    features: [
      "No-code store creation",
      "Custom brand colors & logo",
      "Instant menu/product upload",
      "Table-specific QR generation"
    ],
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=800"
  },
  {
    phase: "Phase 2",
    title: "The Scan Experience",
    subtitle: "Zero friction for your customers.",
    icon: QrCode,
    color: "orange",
    features: [
      "No app download required",
      "Instant access via QR scan",
      "Interactive digital menu",
      "Direct WhatsApp ordering"
    ],
    image: "https://images.unsplash.com/photo-1595079676339-1534801ad6cf?auto=format&fit=crop&q=80&w=800"
  },
  {
    phase: "Phase 3",
    title: "Automated Payments",
    subtitle: "Secure and real-time verification.",
    icon: CreditCard,
    color: "green",
    features: [
      "Dynamic QRIS generation",
      "Instant payment callbacks",
      "Zero manual verification",
      "Auto-update order status"
    ],
    image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&q=80&w=800"
  },
  {
    phase: "Phase 4",
    title: "Admin Mastery",
    subtitle: "Control everything from one place.",
    icon: LayoutDashboard,
    color: "purple",
    features: [
      "Real-time order tracking",
      "Sales & revenue analytics",
      "Customer behavior insights",
      "Withdrawal management"
    ],
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800"
  }
];

const colorVariants: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600 border-blue-100",
  orange: "bg-orange-50 text-orange-600 border-orange-100",
  green: "bg-green-50 text-green-600 border-green-100",
  purple: "bg-purple-50 text-purple-600 border-purple-100",
};

const iconVariants: Record<string, string> = {
  blue: "bg-blue-600 shadow-blue-500/20",
  orange: "bg-orange-600 shadow-orange-500/20",
  green: "bg-green-600 shadow-green-500/20",
  purple: "bg-purple-600 shadow-purple-500/20",
};

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
    whatsapp_features: "Manage products, update pricing, and fulfill orders—all directly within WhatsApp.",
    scan_demo: "Scan to try Demo"
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
    whatsapp_features: "Kelola produk, perbarui harga, dan penuhi pesanan—semuanya langsung di dalam WhatsApp.",
    scan_demo: "Scan untuk coba Demo"
  }
};

export default function Home() {
  const [lang, setLang] = useState<'en' | 'id'>('en');
  const t = translations[lang];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Navbar */}
      <nav className="w-full px-6 py-4 flex justify-between items-center backdrop-blur-sm bg-white/30 sticky top-0 z-50">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <span className="font-black text-xl tracking-tighter text-black">QUICK</span>
        </Link>
        
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

      {/* Interactive Flow */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto space-y-32">
          {steps.map((step, idx) => (
            <div key={idx} className={cn(
              "flex flex-col md:flex-row items-center gap-12 md:gap-20",
              idx % 2 !== 0 && "md:flex-row-reverse"
            )}>
              {/* Visual Side */}
              <div className="flex-1 w-full relative">
                <div className={cn(
                  "absolute -inset-4 rounded-[40px] blur-2xl opacity-20",
                  `bg-${step.color}-500`
                )} />
                <div className="relative rounded-[32px] overflow-hidden border-8 border-white shadow-2xl shadow-black/10">
                  <img src={step.image} alt={step.title} className="w-full aspect-[4/3] object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-8 left-8 text-white">
                    <p className="text-xs font-black uppercase tracking-widest opacity-80 mb-2">{step.phase}</p>
                    <h3 className="text-2xl font-black">{step.title}</h3>
                  </div>
                </div>
              </div>

              {/* Text Side */}
              <div className="flex-1 space-y-8">
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center text-white",
                  iconVariants[step.color]
                )}>
                  <step.icon className="w-8 h-8" />
                </div>
                
                <div>
                  <h2 className="text-4xl font-black text-gray-900 mb-4">{step.title}</h2>
                  <p className="text-lg text-gray-500 font-medium">{step.subtitle}</p>
                </div>

                <div className="space-y-4">
                  {step.features.map((feature, fIdx) => (
                    <div key={fIdx} className="flex items-center gap-3">
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center",
                        colorVariants[step.color]
                      )}>
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-gray-700">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Floating QR Demo (Visible on all devices) */}
      <div className="fixed bottom-6 left-6 sm:bottom-8 sm:left-8 z-40 flex flex-col items-center gap-2 sm:gap-3 animate-fade-in">
        <div className="bg-white p-3 sm:p-4 rounded-[1.5rem] sm:rounded-[2rem] shadow-2xl border border-gray-100 group hover:scale-105 transition-transform duration-300">
           <div className="relative">
              <div className="block sm:hidden">
                 <QRCodeSVG 
                   value="https://quick.mythoz.com/demo?table=toko" 
                   size={80}
                   level="H"
                   includeMargin={false}
                   imageSettings={{
                     src: "/favicon.ico",
                     x: undefined,
                     y: undefined,
                     height: 16,
                     width: 16,
                     excavate: true,
                   }}
                 />
               </div>
               <div className="hidden sm:block">
                 <QRCodeSVG 
                   value="https://quick.mythoz.com/demo?table=toko" 
                   size={120}
                   level="H"
                   includeMargin={false}
                   imageSettings={{
                     src: "/favicon.ico",
                     x: undefined,
                     y: undefined,
                     height: 24,
                     width: 24,
                     excavate: true,
                   }}
                 />
               </div>
              <div className="absolute inset-0 flex items-center justify-center bg-white/0 group-hover:bg-white/5 transition-colors rounded-xl"></div>
           </div>
        </div>
        <div className="px-3 py-1.5 sm:px-4 sm:py-2 bg-white/80 backdrop-blur-md rounded-full shadow-lg border border-white flex items-center gap-2">
           <QrCode className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600" />
           <span className="text-[10px] sm:text-xs font-bold text-gray-800 tracking-tight">{t.scan_demo}</span>
        </div>
      </div>
    </div>
  );
}