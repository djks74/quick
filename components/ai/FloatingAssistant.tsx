"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Send, Bot, User, Loader2, Sparkles, X, MessageCircle, MapPin, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: string;
  text: string;
  breakdown?: string;
  paymentUrl?: string;
  productImage?: string;
  quickReplies?: Array<{ id: string; title: string; value?: string }>;
  shippingOptions?: Array<{ id: string; title: string; provider?: string; service?: string; fee?: number; eta?: string | null }>;
  categories?: Array<{ name: string; slug: string; image?: string | null }>;
  products?: Array<{ id: number; name: string; price: number; category?: string | null; categoryName?: string | null; image?: string | null }>;
  activeStoreId?: number;
  activeStoreSlug?: string;
  uiAction?: { type: string; label?: string; storeSlug?: string; storeId?: number; options?: Array<{ slug: string; name: string }> };
}

interface FloatingAssistantProps {
  forceOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  greeting?: string;
  storeSlug?: string;
  themeColor?: string;
  isEmbed?: boolean;
}

export default function FloatingAssistant({ 
  forceOpen, 
  onOpenChange,
  title = "Gercep Assistant",
  greeting = "Halo! Saya Asisten AI Gercep. Mau cari makan atau pesan sesuatu hari ini?",
  storeSlug,
  themeColor,
  isEmbed = false
}: FloatingAssistantProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(isEmbed);
  
  // Hide on Admin, Dashboard, and POS pages (only if not embedded)
  const isAdminPage = !isEmbed && (pathname?.includes("/admin") || pathname?.includes("/dashboard") || pathname?.includes("/super-admin"));
  const isPosPage = !isEmbed && pathname?.includes("/pos");

  useEffect(() => {
    if (forceOpen) {
      setIsOpen(true);
    }
  }, [forceOpen]);

  const toggleOpen = (val: boolean) => {
    if (isEmbed) return; // Cannot close in embed mode
    setIsOpen(val);
    if (onOpenChange) onOpenChange(val);
  };
  
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: greeting }
  ]);
  const [history, setHistory] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [sharedLocation, setSharedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [activeProductListIdx, setActiveProductListIdx] = useState<number | null>(null);
  const [productQtyById, setProductQtyById] = useState<Record<number, number>>({});
  const [lastActiveStore, setLastActiveStore] = useState<{ id: number; slug?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.role === "assistant" && Array.isArray((m as any).products) && (m as any).products.length > 0) {
        if (activeProductListIdx !== i) {
          setActiveProductListIdx(i);
          setProductQtyById({});
        }
        break;
      }
    }
  }, [messages, activeProductListIdx]);

  const formatMessage = (text: string) => {
    // 1. Handle Bold (**text**)
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // 2. Handle Markdown Links ([text](url))
    formatted = formatted.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:opacity-80 transition-opacity font-medium">$1</a>');
    // 3. Handle line breaks
    return formatted.split('\n').map((line, i) => (
      <span key={i} dangerouslySetInnerHTML={{ __html: line + '<br/>' }} />
    ));
  };

  const shareLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setSharedLocation({ latitude, longitude });
        const locMsg = `📍 Shared Location: ${latitude}, ${longitude}`;
        
        setMessages(prev => [...prev, { role: "user", text: locMsg }]);
        setIsLoading(true);
        setIsLocating(false);

        try {
          const trimmedHistory = Array.isArray(history) ? history.slice(-12) : [];
          const res = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              message: locMsg, 
              history: trimmedHistory,
              isPublic: true,
              context: {
                channel: "WEB",
                location: { latitude, longitude },
                slug: lastActiveStore?.slug || storeSlug
              }
            })
          });
          const data = await res.json();
          if (data.error) {
            setMessages(prev => [...prev, { role: "assistant", text: "❌ Maaf, ada kendala teknis. Coba kirim pesan lagi ya." }]);
            if (data.resetHistory) setHistory([]);
            return;
          }
          setMessages(prev => [...prev, { 
            role: "assistant", 
            text: data.text,
            breakdown: data.breakdown,
            paymentUrl: data.paymentUrl,
            productImage: data.productImage,
            quickReplies: Array.isArray(data.quickReplies) ? data.quickReplies.slice(0, 3) : undefined,
            shippingOptions: Array.isArray(data.shippingOptions) ? data.shippingOptions : undefined,
            categories: Array.isArray(data.categories) ? data.categories : undefined,
            products: Array.isArray(data.products) ? data.products : undefined,
            activeStoreId: typeof data.activeStoreId === "number" ? data.activeStoreId : undefined,
            activeStoreSlug: typeof data.activeStoreSlug === "string" ? data.activeStoreSlug : undefined,
            uiAction: data.uiAction && typeof data.uiAction === "object" ? data.uiAction : undefined
          }]);
          if (typeof data.activeStoreId === "number" && data.activeStoreId > 0) {
            setLastActiveStore({ id: data.activeStoreId, slug: typeof data.activeStoreSlug === "string" ? data.activeStoreSlug : undefined });
          }
          if (data.history) setHistory(Array.isArray(data.history) ? data.history.slice(-12) : data.history);
        } catch (e) {
          setMessages(prev => [...prev, { role: "assistant", text: "❌ Maaf, terjadi kesalahan koneksi." }]);
        } finally {
          setIsLoading(false);
        }
      },
      (error) => {
        setIsLocating(false);
        alert("Unable to retrieve your location");
      }
    );
  };

  const getWhatsAppUrl = (storeId?: number, storeSlugOverride?: string) => {
    const platformNumber = "62882003961609";
    const normalizeSlug = (s: string) =>
      String(s || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_ ]+/g, "")
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
    const resolvedSlug = normalizeSlug(String(storeSlugOverride || lastActiveStore?.slug || storeSlug || ""));
    const sid = Number(storeId || lastActiveStore?.id || 0);
    const msg =
      resolvedSlug
        ? `MULAI_BELANJA_SLUG:${resolvedSlug}`
        : sid > 0
          ? `MULAI_BELANJA:${sid}`
          : (storeSlug ? `Menu\nToko: ${storeSlug}` : "Menu");
    return `https://wa.me/${platformNumber}?text=${encodeURIComponent(msg)}`;
  };

  const handleSend = async (forcedMessage?: string) => {
    const source = String(forcedMessage ?? input).trim();
    if (!source || isLoading) return;

    const userMsg = source;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setIsLoading(true);

    try {
      const trimmedHistory = Array.isArray(history) ? history.slice(-12) : [];
      const context: any = { channel: "WEB", slug: lastActiveStore?.slug || storeSlug };
      if (sharedLocation) context.location = sharedLocation;
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: userMsg, 
          history: trimmedHistory,
          isPublic: true,
          context
        })
      });
      const data = await res.json();
      if (data.error) {
        setMessages(prev => [...prev, { role: "assistant", text: "❌ Maaf, ada kendala teknis. Coba kirim pesan lagi ya." }]);
        if (data.resetHistory) setHistory([]);
      } else {
        setMessages(prev => [...prev, { 
          role: "assistant", 
          text: data.text,
          breakdown: data.breakdown,
          paymentUrl: data.paymentUrl,
          productImage: data.productImage,
          quickReplies: Array.isArray(data.quickReplies) ? data.quickReplies.slice(0, 3) : undefined,
          shippingOptions: Array.isArray(data.shippingOptions) ? data.shippingOptions : undefined,
          categories: Array.isArray(data.categories) ? data.categories : undefined,
          products: Array.isArray(data.products) ? data.products : undefined,
          activeStoreId: typeof data.activeStoreId === "number" ? data.activeStoreId : undefined,
          activeStoreSlug: typeof data.activeStoreSlug === "string" ? data.activeStoreSlug : undefined,
          uiAction: data.uiAction && typeof data.uiAction === "object" ? data.uiAction : undefined
        }]);
        if (typeof data.activeStoreId === "number" && data.activeStoreId > 0) {
          setLastActiveStore({ id: data.activeStoreId, slug: typeof data.activeStoreSlug === "string" ? data.activeStoreSlug : undefined });
        } else if (typeof data.activeStoreSlug === "string" && data.activeStoreSlug.trim()) {
          setLastActiveStore({ id: 0, slug: data.activeStoreSlug.trim() });
        }
        if (data.history) setHistory(Array.isArray(data.history) ? data.history.slice(-12) : data.history);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", text: "❌ Maaf, terjadi kesalahan koneksi." }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isAdminPage || isPosPage) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-4">
      {/* Chat Window */}
      {isOpen && (
        <div className={cn(
          "bg-white dark:bg-gray-900 shadow-2xl border border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300",
          isEmbed 
            ? "relative w-full h-full rounded-none sm:rounded-none" 
            : "fixed inset-0 sm:inset-auto sm:bottom-24 sm:right-0 w-full sm:w-[400px] h-full sm:h-[550px] sm:rounded-3xl"
        )}>
          {/* Header */}
          <div className="p-4 flex items-center justify-between shadow-lg" style={{ backgroundColor: themeColor || '#f97316' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md">
                <Sparkles size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-sm font-black tracking-tight text-white">{title}</h2>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-[10px] font-bold text-white/80 uppercase tracking-widest">Online</span>
                </div>
              </div>
            </div>
            {!isEmbed && (
              <button onClick={() => toggleOpen(false)} className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white">
                <X size={20} />
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide bg-gray-50/50 dark:bg-gray-900/50">
            {messages.map((m, idx) => (
              <div key={idx} className={cn("flex gap-3", m.role === "user" ? "flex-row-reverse" : "flex-start")}>
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm", m.role === "user" ? "text-white" : "bg-white dark:bg-gray-800 text-primary border dark:border-gray-700")} style={m.role === 'user' ? { backgroundColor: themeColor || '#f97316' } : {}}>
                  {m.role === "user" ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className={cn("max-w-[80%] flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}>
                  <div className={`p-3 rounded-2xl text-[13px] leading-relaxed shadow-sm ${
                    m.role === "user" 
                      ? "text-white rounded-tr-none" 
                      : "bg-white dark:bg-gray-800 dark:text-gray-200 rounded-tl-none border border-gray-100 dark:border-gray-700"
                  }`} style={m.role === 'user' ? { backgroundColor: themeColor || '#f97316' } : {}}>
                    {m.breakdown && (
                      <div className="mb-3 p-3 bg-gray-50 dark:bg-black/40 rounded-xl font-mono text-[11px] border border-black/5 dark:border-white/5 whitespace-pre-wrap leading-tight text-gray-600 dark:text-gray-400">
                        {m.breakdown}
                      </div>
                    )}
                    {m.productImage && (
                      <div className="mb-3 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 shadow-sm relative h-48 w-full">
                        <Image 
                          src={m.productImage} 
                          alt="Product" 
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    )}
                    <div className="break-words">
                      {formatMessage(m.text)}
                    </div>
                    {!m.paymentUrl && m.role !== "user" && !sharedLocation && /bagikan lokasi|share location|kirim lokasi|📍/i.test(String(m.text || "")) && (
                      <button
                        onClick={shareLocation}
                        disabled={isLoading}
                        className="mt-3 px-3 py-2 rounded-xl text-[11px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        Share Location
                      </button>
                    )}
                    {m.paymentUrl && (
                      <a 
                        href={m.paymentUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="mt-4 flex items-center justify-center gap-2 w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black text-xs transition-all shadow-lg hover:shadow-green-500/20 active:scale-95 uppercase tracking-wider"
                      >
                        <ExternalLink size={14} />
                        Pay Now (Bayar Sekarang)
                      </a>
                    )}
                    {Array.isArray(m.shippingOptions) && m.shippingOptions.length > 0 && !m.paymentUrl && (
                      <div className="mt-3 flex flex-col gap-2">
                        {m.shippingOptions.slice(0, 3).map((opt) => (
                          <button
                            key={String(opt.id)}
                            onClick={() =>
                              handleSend(
                                `Saya pilih pengiriman: ${String(opt.title)} (provider=${String(opt.provider || "")}, service=${String(opt.service || "")}, ongkir=Rp ${new Intl.NumberFormat("id-ID").format(Number(opt.fee || 0))}${opt.eta ? `, ETA ${String(opt.eta)}` : ""})`
                              )
                            }
                            className="px-3 py-2 rounded-xl text-left text-[11px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                          >
                            <div className="font-semibold">{opt.title}</div>
                            <div className="text-[10px] text-gray-500 dark:text-gray-400">
                              Rp {new Intl.NumberFormat("id-ID").format(Number(opt.fee || 0))}
                              {opt.eta ? ` • ${String(opt.eta)}` : ""}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {m.role !== "user" &&
                      m.uiAction?.type === "CHOOSE_STORE" &&
                      Array.isArray(m.uiAction.options) &&
                      m.uiAction.options.length > 0 && (
                        <div className="mt-3 flex flex-col gap-2">
                          <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                            Pilih toko:
                          </div>
                          <div className="flex flex-col gap-2">
                            {m.uiAction.options.slice(0, 6).map((opt) => (
                              <button
                                key={String(opt.slug)}
                                onClick={() => handleSend(`PILIH_TOKO_SLUG:${String(opt.slug)}`)}
                                disabled={isLoading}
                                className="px-3 py-2 rounded-xl text-left text-[11px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                              >
                                <div className="font-semibold">{opt.name}</div>
                                <div className="text-[10px] text-gray-500 dark:text-gray-400">{opt.slug}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    {m.role !== "user" &&
                      m.uiAction?.type === "START_SHOPPING" &&
                      String(m.uiAction?.storeSlug || "").trim().length > 0 &&
                      !m.paymentUrl &&
                      !(Array.isArray(m.shippingOptions) && m.shippingOptions.length > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          const slug = String(m.uiAction?.storeSlug || "").trim();
                          window.open(getWhatsAppUrl(m.uiAction?.storeId, slug), "_blank");
                        }}
                        disabled={isLoading}
                        className="mt-3 w-full px-3 py-2.5 rounded-xl bg-[#25D366] text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-[#25D366]/20 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <MessageCircle className="w-4 h-4" /> Mulai Belanja
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex gap-2 items-center text-gray-400 text-xs">
                  <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <Loader2 size={14} className="animate-spin text-primary" />
                  </div>
                  {isLocating ? "Getting location..." : "Thinking..."}
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          {/* Input */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800/20 border-t dark:border-gray-800">
            <div className="flex gap-2">
              <button
                onClick={shareLocation}
                disabled={isLoading}
                className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-xl transition-all disabled:opacity-50"
                title="Share Location"
              >
                <MapPin size={18} />
              </button>
              <div className="relative flex-1">
                <input
                  type="text"
                  className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 pr-10 text-xs focus:ring-2 focus:ring-primary outline-none dark:text-white transition-all shadow-sm"
                  style={{ '--tw-ring-color': themeColor || '#f97316' } as any}
                  placeholder="Tanya apa saja..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                />
                <button 
                  onClick={() => handleSend()}
                  disabled={isLoading}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50"
                  style={{ color: themeColor || '#f97316' }}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Button */}
      {!isEmbed && (
        <button
          onClick={() => toggleOpen(!isOpen)}
          className={cn(
            "w-14 h-14 rounded-full items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95",
            isOpen ? "hidden sm:flex bg-white dark:bg-gray-800 text-primary rotate-90" : "flex text-white"
          )}
          style={!isOpen ? { backgroundColor: themeColor || '#f97316' } : { color: themeColor || '#f97316' }}
        >
          {isOpen ? <X size={28} /> : <MessageCircle size={28} />}
        </button>
      )}
    </div>
  );
}
