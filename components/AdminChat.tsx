"use client";

import { useState, useRef, useEffect } from "react";
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
}

interface AdminChatProps {
  user: any;
  context?: any;
}

export default function AdminChat({ user, context }: AdminChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  if (!user) return null;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", parts: [{ text: input }] };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          history: messages,
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

      const botMessage: Message = { role: "model", parts: [{ text: data.text }] };
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
        <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white dark:border-gray-900">
          AI
        </div>
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
      <div className="p-4 bg-blue-600 dark:bg-blue-700 flex items-center justify-between text-white">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider">Gercep AI Assistant</h3>
            <p className="text-[10px] opacity-80 font-medium">Store & Corporate Help</p>
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
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Quick Tools */}
          <div className="p-2 border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-gray-800/50 flex gap-2 overflow-x-auto no-scrollbar">
            {[
              { icon: BarChart3, label: "Stats", text: "Tampilkan performa toko saya hari ini" },
              { icon: Package, label: "Produk", text: "Daftar produk saya" },
              { icon: Settings, label: "Status", text: "Buka/Tutup toko" },
              { icon: Building2, label: "Corporate", text: "Ringkasan seluruh outlet" },
            ].map((tool, idx) => (
              <button
                key={idx}
                onClick={() => setInput(tool.text)}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-white/10 text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-800 transition-all"
              >
                <tool.icon className="w-3 h-3" />
                {tool.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
            {messages.length === 0 && (
              <div className="text-center py-8 space-y-4">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto">
                  <Bot className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Halo {user.name}!</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[200px] mx-auto mt-1">
                    Saya asisten AI Gercep. Saya bisa membantu melihat statistik, mengubah harga, atau mengelola outlet Anda.
                  </p>
                </div>
              </div>
            )}
            
            {messages.map((m, i) => (
              <div 
                key={i} 
                className={cn(
                  "flex gap-3",
                  m.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                  m.role === "user" ? "bg-gray-100 dark:bg-gray-800" : "bg-blue-100 dark:bg-blue-900/40"
                )}>
                  {m.role === "user" ? <User size={16} /> : <Bot size={16} className="text-blue-600 dark:text-blue-400" />}
                </div>
                <div className={cn(
                  "max-w-[75%] p-3 rounded-2xl text-xs leading-relaxed",
                  m.role === "user" 
                    ? "bg-blue-600 text-white rounded-tr-none" 
                    : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-none"
                )}>
                  {m.parts[0].text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-2xl rounded-tl-none">
                  <div className="flex gap-1">
                    <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-100 dark:border-white/5">
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="relative"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Tanya AI assistant..."
                className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-xl py-3 pl-4 pr-12 text-xs font-medium focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
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
