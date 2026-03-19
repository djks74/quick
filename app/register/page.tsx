"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    storeName: "",
    plan: "FREE"
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Registration failed");
      }

      // Success -> Redirect to login
      router.push("/login?registered=true");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0F1113] flex items-center justify-center p-4 transition-colors duration-300">
      <div className="w-full max-w-md bg-white dark:bg-[#1A1D21] rounded-2xl shadow-xl p-10 border dark:border-white/10 transition-colors duration-300">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Create Your Store</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium">Start selling online in seconds.</p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl mb-6 text-sm text-center font-bold border border-red-100 dark:border-red-800 transition-colors">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Your Name</label>
            <input
              type="text"
              required
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:border-blue-500 transition-all font-bold text-gray-900 dark:text-white"
              placeholder="John Doe"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Email Address</label>
            <input
              type="email"
              required
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:border-blue-500 transition-all font-bold text-gray-900 dark:text-white"
              placeholder="john@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Password</label>
            <input
              type="password"
              required
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:border-blue-500 transition-all font-bold text-gray-900 dark:text-white"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Store Name</label>
            <input
              type="text"
              required
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:border-blue-500 transition-all font-bold text-gray-900 dark:text-white"
              placeholder="My Awesome Shop"
              value={formData.storeName}
              onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
            />
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 font-bold uppercase tracking-tight">
              Your store URL will be: gercep.click/{formData.storeName.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'your-store'}
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Choose Plan</label>
            <div className="grid grid-cols-1 gap-3">
              {[
                { id: "FREE", name: "Free", desc: "Basic features" },
                { id: "ENTERPRISE", name: "Enterprise", desc: "Priority support & features" },
                { id: "SOVEREIGN", name: "Sovereign", desc: "Full whitelabel & AI control" }
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, plan: p.id })}
                  className={cn(
                    "flex flex-col p-4 rounded-xl border-2 transition-all text-left",
                    formData.plan === p.id 
                      ? "border-blue-600 bg-blue-50/50 dark:bg-blue-900/20" 
                      : "border-gray-100 dark:border-gray-800 bg-transparent hover:border-blue-200 dark:hover:border-blue-900/40"
                  )}
                >
                  <span className="font-black text-sm uppercase tracking-tight dark:text-white">{p.name}</span>
                  <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 mt-4"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Create Account"}
          </button>
        </form>

        <div className="mt-8 text-center text-xs font-bold text-gray-500 dark:text-gray-400">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 dark:text-blue-400 font-black uppercase tracking-widest hover:underline">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
