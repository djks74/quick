"use client";

import { 
  Store, 
  QrCode, 
  Smartphone, 
  CreditCard, 
  LayoutDashboard, 
  ArrowRight, 
  CheckCircle2, 
  Zap, 
  Users, 
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  Globe
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

const translations = {
  en: {
    signIn: "Sign In",
    getStarted: "Get Started",
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
    phase4_f1: "Integrated POS for cashier operations",
    phase4_f2: "Inventory and stock management",
    phase4_f3: "Barcode scan for stock in/out updates",
    phase4_f4: "Real-time sales and stock insights",
    multiStore: "Multi-Store Support",
    multiStoreDesc: "Manage multiple branches from a single unified super-admin dashboard.",
    security: "Bank-Grade Security",
    securityDesc: "Encrypted transactions and secure payment gateways for peace of mind.",
    scalable: "Scalable Architecture",
    scalableDesc: "Built on Next.js 15 and Supabase to handle thousands of orders per second.",
    ready: "Ready to transform your business?",
    readyDesc: "Join hundreds of merchants already using our platform to simplify their operations and increase revenue.",
    contactSales: "Contact Sales"
  },
  id: {
    signIn: "Masuk",
    getStarted: "Mulai Sekarang",
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
    phase4_f1: "POS terintegrasi untuk operasional kasir",
    phase4_f2: "Manajemen inventori dan stok",
    phase4_f3: "Scan barcode untuk update stok masuk/keluar",
    phase4_f4: "Insight penjualan dan stok secara real-time",
    multiStore: "Dukungan Multi-Toko",
    multiStoreDesc: "Kelola banyak cabang dari satu dasbor super-admin yang terpadu.",
    security: "Keamanan Standar Bank",
    securityDesc: "Transaksi terenkripsi dan gateway pembayaran aman untuk ketenangan pikiran Anda.",
    scalable: "Arsitektur Terukur",
    scalableDesc: "Dibangun dengan Next.js 15 dan Supabase untuk menangani ribuan pesanan per detik.",
    ready: "Siap mengubah bisnis Anda?",
    readyDesc: "Bergabunglah dengan ratusan merchant yang telah menggunakan platform kami untuk menyederhanakan operasional dan meningkatkan pendapatan.",
    contactSales: "Hubungi Penjualan"
  }
};

export default function FlowShowcase() {
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

  return (
    <div className="min-h-screen bg-white dark:bg-[#0F1113] transition-colors duration-300">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 dark:bg-[#0F1113]/80 backdrop-blur-md border-b border-gray-100 dark:border-white/10 transition-colors">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-black dark:bg-white rounded-xl flex items-center justify-center transition-colors">
              <Zap className="w-6 h-6 text-white dark:text-black" />
            </div>
            <span className="font-black text-xl tracking-tighter dark:text-white">GERCEP</span>
          </Link>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setLang(lang === 'en' ? 'id' : 'en')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 transition-colors border border-gray-100 dark:border-white/10"
            >
              <Globe className="w-4 h-4" />
              {lang === 'en' ? 'ID' : 'EN'}
            </button>
            <Link href="/login" className="text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">{t.signIn}</Link>
            <Link href="/register" className="px-6 py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-black/10">{t.getStarted}</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-full text-blue-600 dark:text-blue-400 text-xs font-black uppercase tracking-widest mb-8 animate-in fade-in slide-in-from-bottom duration-700">
            <Smartphone className="w-4 h-4" />
            {t.flow_subtitle}
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-gray-900 dark:text-white tracking-tight leading-[1.1] mb-8 animate-in fade-in slide-in-from-bottom duration-1000">
            {t.flow_title_start} <br />
            <span className="text-blue-600 dark:text-blue-400">{t.flow_title_highlight}</span>
          </h1>
          <p className="text-xl text-gray-500 dark:text-gray-400 font-medium leading-relaxed max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom duration-1000 delay-200">
            {t.flow_description}
          </p>
        </div>
      </section>

      {/* Interactive Flow */}
      <section className="py-20 px-6 bg-gray-50/50 dark:bg-white/5 transition-colors">
        <div className="max-w-6xl mx-auto space-y-32">
          {steps.map((step, idx) => (
            <div key={idx} className={cn(
              "flex flex-col md:flex-row items-center gap-12 md:gap-20",
              idx % 2 !== 0 && "md:flex-row-reverse"
            )}>
              {/* Visual Side */}
              <div className="flex-1 w-full relative">
                <div className={cn(
                  "absolute -inset-4 rounded-[40px] blur-2xl opacity-20 dark:opacity-10",
                  `bg-${step.color}-500`
                )} />
                <div className="relative aspect-[4/3] rounded-[32px] overflow-hidden border-8 border-white dark:border-gray-800 shadow-2xl shadow-black/10">
                  <Image 
                    src={step.image} 
                    alt={step.title} 
                    fill
                    unoptimized
                    className="object-cover" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-8 left-8 text-white">
                    <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">{step.phase}</p>
                    <h4 className="text-2xl font-black">{step.title}</h4>
                  </div>
                </div>
              </div>

              {/* Text Side */}
              <div className="flex-1 space-y-8">
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center text-white transition-colors",
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
                        "w-6 h-6 rounded-full flex items-center justify-center transition-colors",
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

      {/* Stats Section */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="p-8 rounded-3xl bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 shadow-xl shadow-black/5 text-center space-y-4 transition-colors">
              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black dark:text-white">{t.multiStore}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{t.multiStoreDesc}</p>
            </div>
            <div className="p-8 rounded-3xl bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 shadow-xl shadow-black/5 text-center space-y-4 transition-colors">
              <div className="w-12 h-12 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-2xl flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black dark:text-white">{t.security}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{t.securityDesc}</p>
            </div>
            <div className="p-8 rounded-3xl bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 shadow-xl shadow-black/5 text-center space-y-4 transition-colors">
              <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-2xl flex items-center justify-center mx-auto">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black dark:text-white">{t.scalable}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{t.scalableDesc}</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto bg-black dark:bg-white rounded-[48px] p-12 md:p-24 text-center text-white dark:text-black relative overflow-hidden transition-colors">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/20 blur-[120px] rounded-full" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-orange-600/20 blur-[120px] rounded-full" />
          
          <div className="relative z-10">
            <h2 className="text-4xl md:text-6xl font-black mb-8">{t.ready}</h2>
            <p className="text-lg text-white/60 dark:text-black/60 mb-12 max-w-xl mx-auto font-medium">{t.readyDesc}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register" className="w-full sm:w-auto px-12 py-5 bg-white dark:bg-black text-black dark:text-white rounded-2xl font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl">{t.getStarted}</Link>
              <Link href="https://wa.me/6287768201551" className="w-full sm:w-auto px-12 py-5 bg-white/10 dark:bg-black/10 text-white dark:text-black rounded-2xl font-black uppercase tracking-widest hover:bg-white/20 dark:hover:bg-black/20 transition-all flex items-center justify-center gap-2">
                <MessageSquare className="w-5 h-5" />
                {t.contactSales}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-gray-100 dark:border-white/10 transition-colors">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2 opacity-50 dark:opacity-80 dark:text-white">
            <Zap className="w-5 h-5" />
            <span className="font-black tracking-tighter">GERCEP</span>
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">© 2026 Gercep Ecosystem. All rights reserved.</p>
          <div className="flex gap-8">
            <Link href="/privacy" className="text-sm text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white font-bold transition-colors">Privacy</Link>
            <Link href="/terms" className="text-sm text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white font-bold transition-colors">Terms</Link>
            <Link href="/faq" className="text-sm text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white font-bold transition-colors">FAQ</Link>
            <Link href="/documentation" className="text-sm text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white font-bold transition-colors">Documentation</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
