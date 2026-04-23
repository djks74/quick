"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { 
  MessageSquare, 
  X, 
  Send, 
  Loader2, 
  Bot, 
  User,
  Maximize2,
  Minimize2,
  Building2,
  BarChart3,
  Package,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "model";
  parts: { text: string }[];
  image?: string;
}

interface AdminChatProps {
  user: any;
  context?: any;
  defaultOpen?: boolean;
  onRequestClose?: () => void;
}

export default function AdminChat({ user, context, defaultOpen = false, onRequestClose }: AdminChatProps) {
  const [isOpen, setIsOpen] = useState(Boolean(defaultOpen));
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "model", parts: [{ text: "Halo Admin! Saya Gercep Admin Assistant untuk manajemen. Ada yang bisa saya bantu terkait outlet atau laporan hari ini?" }] }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (user) {
      scrollToBottom();
    }
  }, [messages, user]);

  if (!user) return null;

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", parts: [{ text: input }] };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const trimmedHistory = Array.isArray(messages) ? messages.slice(-12) : [];
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          history: trimmedHistory,
          isPublic: false,
          context: {
            ...context,
            userId: user.id,
            role: user.role
          }
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const botMessage: Message = { 
        role: "model", 
        parts: [{ text: data.text }],
        image: data.productImage 
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { 
        role: "model", 
        parts: [{ text: "Maaf, terjadi kesalahan teknis. Silakan coba lagi." }] 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 z-50 group"
      >
        <MessageSquare className="w-6 h-6 group-hover:animate-pulse" />
      </button>
    );
  }

  return (
    <div 
      className={cn(
        "fixed bottom-6 right-6 w-96 bg-white dark:bg-[#1A1D21] rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 z-50 flex flex-col transition-all duration-300 overflow-hidden",
        isMinimized ? "h-14" : "h-[600px] max-h-[80vh]"
      )}
    >
      {/* Header */}
      <div className="p-4 bg-slate-900 dark:bg-black flex items-center justify-between text-white border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/30">
            <Bot className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-[11px] font-black uppercase tracking-[0.1em]">Gercep Admin Assistant</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
              <p className="text-[9px] opacity-60 font-black uppercase tracking-widest">Management Mode</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>
          <button 
            onClick={() => {
              setIsOpen(false);
              onRequestClose?.();
            }}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Quick Tools */}
          <div className="p-2 border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-slate-900/50 flex gap-2 overflow-x-auto no-scrollbar">
            {[
              { icon: BarChart3, label: "Daily Stats", text: "Tampilkan laporan penjualan hari ini" },
              { icon: Package, label: "Price Update", text: "Bagaimana cara update harga produk?" },
              { icon: Settings, label: "Store Status", text: "Cek status operasional toko" },
              { icon: Building2, label: "All Outlets", text: "Ringkasan performa seluruh outlet" },
            ].map((tool, idx) => (
              <button
                key={idx}
                onClick={() => setInput(tool.text)}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/10 text-[10px] font-black uppercase tracking-wider text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-800 transition-all shadow-sm"
              >
                <tool.icon className="w-3 h-3 text-blue-500" />
                {tool.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-white dark:bg-[#0F1115]">
            {messages.map((m, i) => (
              <div 
                key={i} 
                className={cn(
                  "flex gap-3",
                  m.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border",
                  m.role === "user" 
                    ? "bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-white/5" 
                    : "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/50"
                )}>
                  {m.role === "user" ? <User size={16} className="text-gray-400" /> : <Bot size={16} className="text-blue-500" />}
                </div>
                <div className={cn(
                  "max-w-[80%] p-3.5 rounded-2xl text-[12px] leading-relaxed shadow-sm",
                  m.role === "user" 
                    ? "bg-slate-900 text-white rounded-tr-none font-medium" 
                    : "bg-gray-50 dark:bg-slate-800/50 text-gray-900 dark:text-gray-100 rounded-tl-none border border-gray-100 dark:border-white/5"
                )}>
                  {m.image && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 relative h-48 w-full">
                      <Image 
                        src={m.image} 
                        alt="Product" 
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  )}
                  {m.parts[0].text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                </div>
                <div className="bg-gray-50 dark:bg-slate-800/50 p-3.5 rounded-2xl rounded-tl-none border border-gray-100 dark:border-white/5">
                  <div className="flex gap-1.5">
                    <div className="w-1.5 h-1.5 bg-blue-500/40 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-blue-500/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-blue-500/40 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-100 dark:border-white/5 bg-white dark:bg-[#0F1115]">
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="relative"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Tulis instruksi manajemen..."
                className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-white/10 rounded-2xl py-3.5 pl-5 pr-12 text-[12px] font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none shadow-inner"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-slate-900 text-white rounded-xl hover:bg-black disabled:opacity-50 disabled:hover:bg-slate-900 transition-all active:scale-95 shadow-lg"
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
