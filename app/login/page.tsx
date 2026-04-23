"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn, getSession, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Eye, EyeOff } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const registered = searchParams.get("registered");
  const callbackUrl = searchParams.get("callbackUrl");
  const inferredPosSlug = (() => {
    if (!callbackUrl || !callbackUrl.startsWith("/")) return "";
    const match = callbackUrl.match(/^\/([^/]+)\/pos(\/|$)/);
    return match?.[1] || "";
  })();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [posMode, setPosMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    storeSlug: ""
  });

  useEffect(() => {
    const redirectAuthenticatedUser = async () => {
      if (status !== "authenticated") return;
      const user = session?.user as any;
      if (callbackUrl && callbackUrl.startsWith("/") && callbackUrl !== "/login") {
        router.replace(callbackUrl);
        router.refresh();
        return;
      }
      if (user?.role === "SUPER_ADMIN") {
        router.replace("/super-admin");
      } else if (user?.hasMultipleStores) {
        router.replace("/dashboard");
      } else if (user?.storeSlug) {
        router.replace(`/${user.storeSlug}/admin`);
      } else if (user?.role === "MANAGER" && user?.storeId) {
        const res = await fetch(`/api/stores/${user.storeId}`);
        const data = await res.json();
        if (data.slug) router.replace(`/${data.slug}/admin`);
        else router.replace("/");
      } else if (user?.role === "CASHIER" && (user?.storeSlug || inferredPosSlug)) {
        router.replace(`/${user.storeSlug || inferredPosSlug}/pos`);
      } else {
        router.replace("/");
      }
      router.refresh();
    };
    redirectAuthenticatedUser();
  }, [status, session, callbackUrl, router, inferredPosSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const storeSlug = posMode ? (formData.storeSlug || inferredPosSlug) : "";
      const result = await signIn("credentials", {
        redirect: false,
        email: formData.email,
        password: formData.password,
        storeSlug
      });

      if (result?.error) {
        setError("Invalid email or password");
      } else {
        if (posMode) {
          const target = (callbackUrl && callbackUrl.startsWith("/"))
            ? callbackUrl
            : `/${storeSlug}/pos`;
          router.push(target);
          router.refresh();
        } else {
          if (callbackUrl && callbackUrl.startsWith('/')) {
            router.push(callbackUrl);
            router.refresh();
          } else {
            const session = await getSession();
            const user = session?.user as any;
            if (user?.role === 'SUPER_ADMIN') {
              router.push('/super-admin');
            } else if (user?.hasMultipleStores) {
              router.push('/dashboard');
            } else if (user?.storeSlug) {
              router.push(`/${user.storeSlug}/admin`);
            } else if (user?.role === 'MANAGER' && user?.storeId) {
              // Fetch store slug for manager
              const res = await fetch(`/api/stores/${user.storeId}`);
              const data = await res.json();
              if (data.slug) {
                router.push(`/${data.slug}/admin`);
              } else {
                router.push('/');
              }
            } else {
              router.push('/');
            }
            router.refresh();
          }
        }
      }
    } catch (err) {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="w-full max-w-md bg-white dark:bg-[#1A1D21] rounded-2xl shadow-xl p-10 border dark:border-white/10 transition-colors duration-300 flex items-center justify-center min-h-[260px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

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
        {posMode && !inferredPosSlug && (
          <div>
            <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">Store Slug</label>
            <input
              type="text"
              required
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:border-blue-500 transition-all font-bold text-gray-900 dark:text-white"
              placeholder="e.g. demo"
              value={formData.storeSlug}
              onChange={(e) => setFormData({ ...formData, storeSlug: e.target.value })}
            />
          </div>
        )}
        <div>
          <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">
            {posMode ? "POS Username" : "Email Address"}
          </label>
          <input
            type={posMode ? "text" : "email"}
            required
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:border-blue-500 transition-all font-bold text-gray-900 dark:text-white"
            placeholder={posMode ? "e.g. kasir1" : "john@example.com"}
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Password</label>
            <Link href="/forgot-password" className="text-[10px] font-black text-blue-600 dark:text-blue-400 hover:underline uppercase tracking-widest">Forgot?</Link>
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:border-blue-500 transition-all font-bold text-gray-900 dark:text-white pr-12"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 mt-4"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Log In"}
        </button>
      </form>
      {loading && (
        <div className="mt-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-4 py-3 text-xs font-black uppercase tracking-widest text-blue-700 dark:text-blue-300 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Signing in...
        </div>
      )}

      <div className="mt-8 text-center text-xs font-bold text-gray-500 dark:text-gray-400">
        Don't have a store yet?{" "}
        <Link href="/register" className="text-blue-600 dark:text-blue-400 font-black uppercase tracking-widest hover:underline">
          Create one
        </Link>
        <span className="mx-2">•</span>
        <button
          type="button"
          onClick={() => {
            if (posMode) {
              setPosMode(false);
              setFormData((prev) => ({ ...prev, storeSlug: "" }));
            } else {
              setPosMode(true);
              setFormData((prev) => ({ ...prev, storeSlug: prev.storeSlug || inferredPosSlug }));
            }
          }}
          className="text-blue-600 dark:text-blue-400 font-black uppercase tracking-widest hover:underline"
        >
          {posMode ? "Admin Login" : "POS Login"}
        </button>
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
