"use client";

import { useState, useRef, useEffect } from "react";
import SuperAdminNav from "../SuperAdminNav";
import { Send, Bot, User, Loader2, Sparkles } from "lucide-react";

export default function AssistantPage() {
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([
    { role: "assistant", text: "Halo! Saya Asisten AI Gercep. Ada yang bisa saya bantu hari ini? Anda bisa tanya stok, penjualan, atau cari toko." }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg })
      });
      const data = await res.json();
      if (data.error) {
        setMessages(prev => [...prev, { role: "assistant", text: `❌ Error: ${data.error}` }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", text: data.text }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", text: "❌ Maaf, terjadi kesalahan koneksi." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0F1113] flex flex-col">
      <div className="max-w-5xl mx-auto w-full p-8 flex-1 flex flex-col">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Sparkles className="text-primary" />
              AI Assistant
            </h1>
            <p className="text-gray-500 dark:text-gray-400">Manage your platform using natural language.</p>
          </div>
          <SuperAdminNav />
        </header>

        <div className="flex-1 bg-white dark:bg-[#1A1D21] rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden mb-4 min-h-[600px]">
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`flex gap-3 max-w-[80%] ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    m.role === "user" ? "bg-primary text-white" : "bg-gray-100 dark:bg-gray-800 text-primary"
                  }`}>
                    {m.role === "user" ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div className={`p-4 rounded-2xl text-sm ${
                    m.role === "user" 
                      ? "bg-primary text-white rounded-tr-none" 
                      : "bg-gray-50 dark:bg-gray-800/50 dark:text-gray-200 rounded-tl-none border border-gray-100 dark:border-gray-700"
                  }`}>
                    {m.text}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex gap-3 items-center text-gray-400 text-sm">
                  <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <Loader2 size={16} className="animate-spin text-primary" />
                  </div>
                  Thinking...
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800/20 border-t dark:border-gray-800">
            <div className="relative">
              <input
                type="text"
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 pr-12 text-sm focus:ring-2 focus:ring-primary outline-none dark:text-white transition-all shadow-sm"
                placeholder="Type your command (e.g., 'Cari toko pasar segar')..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
              />
              <button 
                onClick={handleSend}
                disabled={isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50"
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
