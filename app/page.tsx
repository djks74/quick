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

import ThemeToggle from "@/components/ThemeToggle";

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
    scan_demo: "Scan to try Demo",
    contact_demo: "Contact us for demo activation",
    flow_subtitle: "Future of Retail & SME",
    flow_title_start: "Seamless flow from",
    flow_title_highlight: "Scan to Payment.",
    flow_description: "A complete ecosystem designed to help local businesses grow without the complexity of traditional POS systems.",
    phase1_title: "Merchant Setup",
    phase1_subtitle: "Launch your digital presence in minutes.",
    phase1_f1: "No-code store creation",
    phase1_f2: "Custom brand colors & logo",
    phase1_f3: "Instant menu/product upload",
    phase1_f4: "Table-specific QR generation",
    phase2_title: "The Scan Experience",
    phase2_subtitle: "Zero friction for your customers.",
    phase2_f1: "No app download required",
    phase2_f2: "Instant access via QR scan",
    phase2_f3: "Interactive digital menu",
    phase2_f4: "Direct WhatsApp ordering",
    phase3_title: "Automated Payments",
    phase3_subtitle: "Secure and real-time verification.",
    phase3_f1: "Dynamic QRIS generation",
    phase3_f2: "Instant payment callbacks",
    phase3_f3: "Zero manual verification",
    phase3_f4: "Auto-update order status",
    phase4_title: "Admin Mastery",
    phase4_subtitle: "Control everything from one place.",
    phase4_f1: "Real-time order tracking",
    phase4_f2: "Sales & revenue analytics",
    phase4_f3: "Customer behavior insights",
    phase4_f4: "Withdrawal management"
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
    scan_demo: "Scan untuk coba Demo",
    contact_demo: "Hubungi kami untuk aktivasi demo",
    flow_subtitle: "Masa Depan Ritel & UMKM",
    flow_title_start: "Alur transaksi mulus dari",
    flow_title_highlight: "Scan hingga Bayar.",
    flow_description: "Ekosistem lengkap yang dirancang untuk membantu bisnis lokal tumbuh tanpa kerumitan sistem POS tradisional.",
    phase1_title: "Setup Merchant",
    phase1_subtitle: "Luncurkan kehadiran digital Anda dalam hitungan menit.",
    phase1_f1: "Pembuatan toko tanpa coding",
    phase1_f2: "Warna brand & logo kustom",
    phase1_f3: "Upload menu/produk instan",
    phase1_f4: "Generasi QR per meja",
    phase2_title: "Pengalaman Scan",
    phase2_subtitle: "Tanpa hambatan bagi pelanggan Anda.",
    phase2_f1: "Tidak perlu download aplikasi",
    phase2_f2: "Akses instan via scan QR",
    phase2_f3: "Menu digital interaktif",
    phase2_f4: "Pemesanan langsung via WhatsApp",
    phase3_title: "Pembayaran Otomatis",
    phase3_subtitle: "Verifikasi aman dan real-time.",
    phase3_f1: "Generasi QRIS dinamis",
    phase3_f2: "Callback pembayaran instan",
    phase3_f3: "Tanpa verifikasi manual",
    phase3_f4: "Update status pesanan otomatis",
    phase4_title: "Kendali Admin",
    phase4_subtitle: "Kontrol semuanya dari satu tempat.",
    phase4_f1: "Pelacakan pesanan real-time",
    phase4_f2: "Analitik penjualan & pendapatan",
    phase4_f3: "Wawasan perilaku pelanggan",
    phase4_f4: "Manajemen penarikan dana"
  }
};

export default function Home() {
  const [lang, setLang] = useState<'en' | 'id'>('en');
  const t = translations[lang];

  const steps = [
    {
      phase: "Phase 1",
      title: t.phase1_title,
      subtitle: t.phase1_subtitle,
      icon: Store,
      color: "blue",
      features: [t.phase1_f1, t.phase1_f2, t.phase1_f3, t.phase1_f4],
      image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=800"
    },
    {
      phase: "Phase 2",
      title: t.phase2_title,
      subtitle: t.phase2_subtitle,
      icon: QrCode,
      color: "orange",
      features: [t.phase2_f1, t.phase2_f2, t.phase2_f3, t.phase2_f4],
      image: "https://images.unsplash.com/photo-1595079676339-1534801ad6cf?auto=format&fit=crop&q=80&w=800"
    },
    {
      phase: "Phase 3",
      title: t.phase3_title,
      subtitle: t.phase3_subtitle,
      icon: CreditCard,
      color: "green",
      features: [t.phase3_f1, t.phase3_f2, t.phase3_f3, t.phase3_f4],
      image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&q=80&w=800"
    },
    {
      phase: "Phase 4",
      title: t.phase4_title,
      subtitle: t.phase4_subtitle,
      icon: LayoutDashboard,
      color: "purple",
      features: [t.phase4_f1, t.phase4_f2, t.phase4_f3, t.phase4_f4],
      image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800"
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-950 transition-colors duration-300">
      {/* Navbar */}
      <nav className="w-full px-6 py-4 flex justify-between items-center backdrop-blur-sm bg-white/30 dark:bg-black/30 sticky top-0 z-50 border-b border-white/20 dark:border-white/10">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-10 h-10 bg-black dark:bg-white rounded-xl flex items-center justify-center">
            <Zap className="w-6 h-6 text-white dark:text-black" />
          </div>
          <span className="font-black text-xl tracking-tighter text-black dark:text-white">GERCEP</span>
        </Link>
        
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <button 
            onClick={() => setLang(lang === 'en' ? 'id' : 'en')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 text-sm font-medium text-gray-600 dark:text-gray-300 transition-colors"
          >
            <Globe className="w-4 h-4" />
            {lang === 'en' ? 'ID' : 'EN'}
          </button>
          
          <Link 
            href="/login" 
            className="px-6 py-2 bg-white dark:bg-white/10 text-gray-700 dark:text-white font-medium rounded-full shadow-sm hover:shadow-md transition-all hover:text-blue-600 dark:hover:text-blue-400"
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
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-sm font-medium animate-pulse">
              <MessageCircle className="w-4 h-4" />
              <span>{t.badge}</span>
            </div>
            
            <h1 className="text-5xl lg:text-7xl font-extrabold text-gray-900 dark:text-white tracking-tight leading-tight">
              {t.title_start} <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">{t.title_highlight}</span> {t.title_end}
            </h1>
            
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
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
              className="px-8 py-4 bg-white dark:bg-white/10 text-gray-800 dark:text-white border-2 border-gray-100 dark:border-white/10 rounded-2xl font-bold hover:bg-gray-50 dark:hover:bg-white/20 hover:border-gray-200 dark:hover:border-white/20 transition-all shadow-sm hover:shadow-md flex items-center justify-center"
            >
              {t.create_store}
            </Link>
          </div>

          <div className="flex justify-center lg:justify-start">
            <Link 
              href="https://wa.me/6287768201551?text=Halo%20Gercep,%20saya%20tertarik%20untuk%20aktivasi%20demo."
              target="_blank"
              className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline underline-offset-4 flex items-center gap-2 transition-all"
            >
              <MessageSquare className="w-4 h-4" />
              {t.contact_demo}
            </Link>
          </div>
          
          <div className="pt-8 flex items-center justify-center lg:justify-start gap-8 text-gray-400 dark:text-gray-500 text-sm font-medium">
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
             <div className="flex items-center justify-center lg:justify-start gap-3 p-4 bg-white/50 dark:bg-white/5 backdrop-blur-sm rounded-2xl border border-white dark:border-white/10 shadow-sm hover:shadow-md transition-all group max-w-xl mx-auto lg:mx-0">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform">
                   <MessageCircle className="w-6 h-6" />
                </div>
                <div className="flex-1 text-left">
                   <p className="text-gray-800 dark:text-gray-200 font-bold text-lg leading-snug">
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
            <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl border-8 border-gray-900 dark:border-gray-800 overflow-hidden aspect-[9/19] max-h-[600px] mx-auto relative bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950">
              
              {/* Phone Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-gray-900 rounded-b-2xl z-20"></div>
              
              {/* Screen Content */}
              <div className="p-6 space-y-6 pt-12">
                {/* Header */}
                <div className="flex justify-between items-center">
                  <div className="w-8 h-8 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse"></div>
                  <div className="w-24 h-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                  <ShoppingBag className="w-6 h-6 text-gray-400 dark:text-gray-600" />
                </div>
                
                {/* Hero Image Placeholder */}
                <div className="w-full aspect-video bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                  <Store className="w-12 h-12 text-blue-300 dark:text-blue-700" />
                </div>
                
                {/* Product List */}
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-4 p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-lg flex-shrink-0"></div>
                      <div className="flex-1 space-y-2">
                        <div className="w-3/4 h-4 bg-gray-100 dark:bg-gray-700 rounded"></div>
                        <div className="w-1/2 h-4 bg-gray-100 dark:bg-gray-700 rounded"></div>
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
          <div className="absolute top-1/3 -right-4 lg:-right-12 bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xl animate-float delay-1000 hidden sm:block border dark:border-white/10">
             <div className="flex items-center gap-3">
               <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full text-green-600 dark:text-green-400">
                 <MessageCircle className="w-6 h-6" />
               </div>
               <div>
                 <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t.new_order}</p>
                 <p className="text-sm font-bold text-gray-900 dark:text-white">+ Rp 240.000</p>
               </div>
             </div>
          </div>
        </div>
      </main>

      {/* Interactive Flow */}
      <section className="py-20 px-6 bg-white dark:bg-[#0F1113] transition-colors duration-300">
        <div className="max-w-4xl mx-auto text-center mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-full text-blue-600 dark:text-blue-400 text-xs font-black uppercase tracking-widest mb-6">
            <Smartphone className="w-4 h-4" />
            {t.flow_subtitle}
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-tight mb-6">
            {t.flow_title_start} <br />
            <span className="text-blue-600 dark:text-blue-400">{t.flow_title_highlight}</span>
          </h2>
          <p className="text-lg text-gray-500 dark:text-gray-400 font-medium leading-relaxed max-w-2xl mx-auto">
            {t.flow_description}
          </p>
        </div>

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
                <div className="relative rounded-[32px] overflow-hidden border-8 border-white dark:border-gray-800 shadow-2xl shadow-black/10">
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
                  <h2 className="text-4xl font-black text-gray-900 dark:text-white mb-4">{step.title}</h2>
                  <p className="text-lg text-gray-500 dark:text-gray-400 font-medium">{step.subtitle}</p>
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
                      <span className="font-bold text-gray-700 dark:text-gray-300">{feature}</span>
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
        <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-[1.5rem] sm:rounded-[2rem] shadow-2xl border border-gray-100 dark:border-white/10 group hover:scale-105 transition-transform duration-300">
           <div className="relative">
              <div className="block sm:hidden">
                 <QRCodeSVG 
                   value="https://gercep.click/demo?table=toko" 
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
                   value="https://gercep.click/demo?table=toko" 
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
        <div className="px-3 py-1.5 sm:px-4 sm:py-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md rounded-full shadow-lg border border-white dark:border-white/10 flex items-center gap-2">
           <QrCode className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 dark:text-blue-400" />
           <span className="text-[10px] sm:text-xs font-bold text-gray-800 dark:text-white tracking-tight">{t.scan_demo}</span>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-12 border-t border-gray-100 dark:border-white/10 bg-white dark:bg-[#0F1113] transition-colors">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2 opacity-50 dark:opacity-80 dark:text-white">
            <Zap className="w-5 h-5" />
            <span className="font-black tracking-tighter uppercase">Gercep</span>
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">© 2024 Gercep Ecosystem. All rights reserved.</p>
          <div className="flex gap-8">
            <Link href="#" className="text-sm text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white font-bold transition-colors">Privacy</Link>
            <Link href="#" className="text-sm text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white font-bold transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}