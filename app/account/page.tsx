"use client";

import { useState } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { User, Lock, Mail, ArrowRight, Package, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AccountPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoginView, setIsLoginView] = useState(true);

  return (
    <main className="min-h-screen flex flex-col bg-[#F0F3F7]">
      <Header />
      
      <div className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        {!isLoggedIn ? (
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-[#1d2327] p-6 text-center">
              <h1 className="text-2xl font-black italic text-white uppercase tracking-wider">
                {isLoginView ? "Login to Account" : "Create Account"}
              </h1>
              <p className="text-gray-400 text-sm mt-2">
                {isLoginView ? "Welcome back to LCP Auto Cars" : "Join the premium tuning community"}
              </p>
            </div>
            
            <div className="p-8 space-y-6">
              {!isLoginView && (
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      type="text" 
                      className="w-full bg-gray-50 border border-gray-100 rounded-lg px-10 py-3 text-sm focus:ring-1 focus:ring-primary outline-none transition-all" 
                      placeholder="John Doe"
                    />
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    type="email" 
                    className="w-full bg-gray-50 border border-gray-100 rounded-lg px-10 py-3 text-sm focus:ring-1 focus:ring-primary outline-none transition-all" 
                    placeholder="john@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    type="password" 
                    className="w-full bg-gray-50 border border-gray-100 rounded-lg px-10 py-3 text-sm focus:ring-1 focus:ring-primary outline-none transition-all" 
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button 
                onClick={() => setIsLoggedIn(true)}
                className="w-full bg-primary text-white py-4 rounded-xl font-black uppercase tracking-widest text-sm shadow-lg shadow-primary/20 hover:bg-orange-600 transition-all flex items-center justify-center group"
              >
                {isLoginView ? "Sign In" : "Register Now"}
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </button>

              <div className="text-center">
                <button 
                  onClick={() => setIsLoginView(!isLoginView)}
                  className="text-sm text-gray-500 hover:text-primary transition-colors font-medium"
                >
                  {isLoginView ? "Don't have an account? Register" : "Already have an account? Login"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Account Sidebar */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center space-x-4 mb-8">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900">Admin User</h2>
                    <p className="text-xs text-gray-500">admin@lcp.com</p>
                  </div>
                </div>
                
                <nav className="space-y-1">
                  {[
                    { name: "Dashboard", icon: User, active: true },
                    { name: "My Orders", icon: Package },
                    { name: "Settings", icon: Settings },
                  ].map((item) => (
                    <button 
                      key={item.name}
                      className={cn(
                        "w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                        item.active ? "bg-primary text-white" : "text-gray-500 hover:bg-gray-50"
                      )}
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.name}</span>
                    </button>
                  ))}
                  <button 
                    onClick={() => setIsLoggedIn(false)}
                    className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 transition-all"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </nav>
              </div>
            </div>

            {/* Account Content */}
            <div className="lg:col-span-3 space-y-8">
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                <h2 className="text-xl font-black italic uppercase tracking-wider mb-6">Account Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Total Orders</p>
                    <p className="text-2xl font-black italic">12</p>
                  </div>
                  <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Reward Points</p>
                    <p className="text-2xl font-black italic">850</p>
                  </div>
                  <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Membership</p>
                    <p className="text-2xl font-black italic text-primary">GOLD</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                <h2 className="text-xl font-black italic uppercase tracking-wider mb-6 text-gray-900">Recent Orders</h2>
                <div className="text-center py-12 text-gray-400 italic">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No recent orders found.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
