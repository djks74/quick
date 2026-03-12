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
  TrendingUp
} from "lucide-react";
import Link from "next/link";
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

export default function FlowShowcase() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="font-black text-xl tracking-tighter">QUICK</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-sm font-bold text-gray-500 hover:text-black transition-colors">Sign In</Link>
            <Link href="/register" className="px-6 py-2.5 bg-black text-white rounded-xl text-sm font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-black/10">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-full text-blue-600 text-xs font-black uppercase tracking-widest mb-8 animate-in fade-in slide-in-from-bottom duration-700">
            <Smartphone className="w-4 h-4" />
            Future of Retail & SME
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-gray-900 tracking-tight leading-[1.1] mb-8 animate-in fade-in slide-in-from-bottom duration-1000">
            Seamless flow from <br />
            <span className="text-blue-600">Scan to Payment.</span>
          </h1>
          <p className="text-xl text-gray-500 font-medium leading-relaxed max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom duration-1000 delay-200">
            A complete ecosystem designed to help local businesses grow without the complexity of traditional POS systems.
          </p>
        </div>
      </section>

      {/* Interactive Flow */}
      <section className="py-20 px-6 bg-gray-50/50">
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

      {/* Stats Section */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="p-8 rounded-3xl bg-white border border-gray-100 shadow-xl shadow-black/5 text-center space-y-4">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black">Multi-Store Support</h3>
              <p className="text-sm text-gray-500 font-medium">Manage multiple branches from a single unified super-admin dashboard.</p>
            </div>
            <div className="p-8 rounded-3xl bg-white border border-gray-100 shadow-xl shadow-black/5 text-center space-y-4">
              <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black">Bank-Grade Security</h3>
              <p className="text-sm text-gray-500 font-medium">Encrypted transactions and secure payment gateways for peace of mind.</p>
            </div>
            <div className="p-8 rounded-3xl bg-white border border-gray-100 shadow-xl shadow-black/5 text-center space-y-4">
              <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center mx-auto">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black">Scalable Architecture</h3>
              <p className="text-sm text-gray-500 font-medium">Built on Next.js 15 and Supabase to handle thousands of orders per second.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto bg-black rounded-[48px] p-12 md:p-24 text-center text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/20 blur-[120px] rounded-full" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-orange-600/20 blur-[120px] rounded-full" />
          
          <div className="relative z-10">
            <h2 className="text-4xl md:text-6xl font-black mb-8">Ready to transform <br /> your business?</h2>
            <p className="text-lg text-white/60 mb-12 max-w-xl mx-auto font-medium">Join hundreds of merchants already using our platform to simplify their operations and increase revenue.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register" className="w-full sm:w-auto px-12 py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl">Get Started Now</Link>
              <Link href="https://wa.me/yournumber" className="w-full sm:w-auto px-12 py-5 bg-white/10 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-white/20 transition-all flex items-center justify-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Contact Sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2 opacity-50">
            <Zap className="w-5 h-5" />
            <span className="font-black tracking-tighter">QUICK</span>
          </div>
          <p className="text-sm text-gray-400 font-medium">© 2024 Quick Ecosystem. All rights reserved.</p>
          <div className="flex gap-8">
            <Link href="#" className="text-sm text-gray-400 hover:text-black font-bold">Privacy</Link>
            <Link href="#" className="text-sm text-gray-400 hover:text-black font-bold">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
