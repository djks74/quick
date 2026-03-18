"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Sparkles, X, MessageCircle, MapPin, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: string;
  text: string;
  breakdown?: string;
  paymentUrl?: string;
}

export default function FloatingAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Halo! Saya Asisten AI Gercep. Mau cari makan atau pesan sesuatu hari ini?" }
  ]);
  const [history, setHistory] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const shareLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const locMsg = `📍 Shared Location: ${latitude}, ${longitude}`;
        
        setMessages(prev => [...prev, { role: "user", text: locMsg }]);
        setIsLoading(true);
        setIsLocating(false);

        try {
          const res = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              message: locMsg, 
              history,
              isPublic: true,
              context: {
                channel: "WEB",
                location: { latitude, longitude }
              }
            })
          });
          const data = await res.json();
          setMessages(prev => [...prev, { 
            role: "assistant", 
            text: data.text,
            breakdown: data.breakdown,
            paymentUrl: data.paymentUrl
          }]);
          if (data.history) setHistory(data.history);
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
        body: JSON.stringify({ 
          message: userMsg, 
          history,
          isPublic: true,
          context: { channel: "WEB" }
        })
      });
      const data = await res.json();
      if (data.error) {
        setMessages(prev => [...prev, { role: "assistant", text: `❌ Error: ${data.error}` }]);
      } else {
        setMessages(prev => [...prev, { 
          role: "assistant", 
          text: data.text,
          breakdown: data.breakdown,
          paymentUrl: data.paymentUrl
        }]);
        if (data.history) setHistory(data.history);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", text: "❌ Maaf, terjadi kesalahan koneksi." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-[380px] h-[550px] bg-white dark:bg-[#1A1D21] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="p-4 bg-primary text-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Sparkles size={18} />
              <span className="font-bold text-sm">Gercep AI Assistant</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`flex gap-2 max-w-[85%] ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    m.role === "user" ? "bg-primary text-white" : "bg-gray-100 dark:bg-gray-800 text-primary"
                  }`}>
                    {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  <div className={`p-3 rounded-xl text-[13px] leading-relaxed shadow-sm ${
                    m.role === "user" 
                      ? "bg-primary text-white rounded-tr-none" 
                      : "bg-gray-50 dark:bg-gray-800/50 dark:text-gray-200 rounded-tl-none border border-gray-100 dark:border-gray-700"
                  }`}>
                    {m.breakdown && (
                      <div className="mb-2 p-2 bg-white/50 dark:bg-black/20 rounded-lg font-mono text-[11px] border border-black/5 dark:border-white/5 whitespace-pre-wrap">
                        {m.breakdown}
                      </div>
                    )}
                    <div>{m.text}</div>
                    {m.paymentUrl && (
                      <a 
                        href={m.paymentUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="mt-3 flex items-center justify-center gap-2 w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-xs transition-colors shadow-md"
                      >
                        <ExternalLink size={14} />
                        Pay Now
                      </a>
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
                  placeholder="Tanya apa saja..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                />
                <button 
                  onClick={handleSend}
                  disabled={isLoading}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95",
          isOpen ? "bg-white dark:bg-gray-800 text-primary rotate-90" : "bg-primary text-white"
        )}
      >
        {isOpen ? <X size={28} /> : <MessageCircle size={28} />}
      </button>
    </div>
  );
}
