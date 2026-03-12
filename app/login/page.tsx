"use client";

import { Suspense, useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: formData.email,
        password: formData.password
      });

      if (result?.error) {
        setError("Invalid email or password");
      } else {
        // Fetch session using getSession (more reliable client-side)
        const session = await getSession();
        const callbackUrl = searchParams.get("callbackUrl");
        
        if (session?.user) {
           if (callbackUrl && callbackUrl.startsWith('/')) {
             router.push(callbackUrl);
           } else if (session.user.role === 'SUPER_ADMIN') {
             router.push('/super-admin');
           } else if (session.user.storeSlug) {
             router.push(`/${session.user.storeSlug}/admin`);
           } else {
             // Fallback if no store
             router.push('/');
           }
           router.refresh(); // Ensure server components update
        } else {
           // Retry or reload
           window.location.href = "/";
        }
      }
    } catch (err) {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white dark:bg-[#1A1D21] rounded-2xl shadow-xl p-10 border dark:border-white/10 transition-colors duration-300">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Welcome Back</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium">Log in to manage your store.</p>
      </div>

      {registered && (
        <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 p-4 rounded-xl mb-6 text-sm text-center font-bold border border-green-100 dark:border-green-800 transition-colors">
          Account created! Please log in.
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl mb-6 text-sm text-center font-bold border border-red-100 dark:border-red-800 transition-colors">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
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
          <div className="flex justify-between items-center mb-1.5">
            <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Password</label>
            <a href="#" className="text-[10px] font-black text-blue-600 dark:text-blue-400 hover:underline uppercase tracking-widest">Forgot?</a>
          </div>
          <input
            type="password"
            required
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:border-blue-500 transition-all font-bold text-gray-900 dark:text-white"
            placeholder="••••••••"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 mt-4"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Log In"}
        </button>
      </form>

      <div className="mt-8 text-center text-xs font-bold text-gray-500 dark:text-gray-400">
        Don't have a store yet?{" "}
        <Link href="/register" className="text-blue-600 dark:text-blue-400 font-black uppercase tracking-widest hover:underline">
          Create one
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0F1113] flex items-center justify-center p-4 transition-colors duration-300">
      <Suspense fallback={<Loader2 className="w-10 h-10 animate-spin text-blue-600" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
