"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSent(false);
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(data?.error || "Unable to send reset email. Please try again later."));
        return;
      }
      setSent(true);
    } catch (err) {
      setError("Unable to send reset email. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0F1113] flex items-center justify-center p-4 transition-colors duration-300">
      <div className="w-full max-w-md bg-white dark:bg-[#1A1D21] rounded-2xl shadow-xl p-10 border dark:border-white/10 transition-colors duration-300">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Reset Password</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium">
            Enter your email and we’ll send you a reset link.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl mb-6 text-sm text-center font-bold border border-red-100 dark:border-red-800 transition-colors">
            {error}
          </div>
        )}

        {sent && (
          <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 p-4 rounded-xl mb-6 text-sm text-center font-bold border border-green-100 dark:border-green-800 transition-colors">
            If the account exists, you will receive a reset link shortly.
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              required
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:border-blue-500 transition-all font-bold text-gray-900 dark:text-white"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 mt-4"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Send Reset Link"}
          </button>
        </form>

        <div className="mt-8 text-center text-xs font-bold text-gray-500 dark:text-gray-400">
          <Link href="/login" className="text-blue-600 dark:text-blue-400 font-black uppercase tracking-widest hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}

