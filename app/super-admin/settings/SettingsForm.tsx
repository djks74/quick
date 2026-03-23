"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Send, Activity, Wallet, MessageSquare } from "lucide-react";
import { updatePlatformSettings, testWhatsAppConnection } from "@/lib/super-admin";
import { cn } from "@/lib/utils";

type PlatformSettings = {
  whatsappToken?: string | null;
  whatsappPhoneId?: string | null;
  midtransServerKey?: string | null;
  midtransClientKey?: string | null;
  biteshipApiKey?: string | null;
  subscriptionServerKey?: string | null;
  subscriptionClientKey?: string | null;
  geminiApiKey?: string | null;
  facebookAppId?: string | null;
  waRateMarketing?: number;
  waRateUtility?: number;
  waRateAuthentication?: number;
  waRateService?: number;
};

export default function SettingsForm({ 
  initialSettings, 
  waUsage 
}: { 
  initialSettings: PlatformSettings | null;
  waUsage: {
    totalBalance: number;
    totalUsageCount: number;
    totalTopup: number;
    estimatedCost: number;
    recentLogs: any[];
  };
}) {
  const router = useRouter();
  const defaults = useMemo(
    () => ({
      whatsappToken: initialSettings?.whatsappToken || "",
      whatsappPhoneId: initialSettings?.whatsappPhoneId || "",
      midtransServerKey: initialSettings?.midtransServerKey || "",
      midtransClientKey: initialSettings?.midtransClientKey || "",
      biteshipApiKey: initialSettings?.biteshipApiKey || "",
      subscriptionServerKey: initialSettings?.subscriptionServerKey || "",
      subscriptionClientKey: initialSettings?.subscriptionClientKey || "",
      geminiApiKey: initialSettings?.geminiApiKey || "",
      facebookAppId: initialSettings?.facebookAppId || "",
      waRateMarketing: initialSettings?.waRateMarketing ?? 2000,
      waRateUtility: initialSettings?.waRateUtility ?? 350,
      waRateAuthentication: initialSettings?.waRateAuthentication ?? 300,
      waRateService: initialSettings?.waRateService ?? 0
    }),
    [initialSettings]
  );

  const [form, setForm] = useState(defaults);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");

  const handleTestWhatsApp = async () => {
    if (!form.whatsappToken || !form.whatsappPhoneId || !testPhone) {
      setTestMessage("Token, Phone ID, and Test Phone Number are required.");
      return;
    }

    setIsTesting(true);
    setTestMessage(null);
    try {
      const res = await testWhatsAppConnection({
        token: form.whatsappToken,
        phoneNumberId: form.whatsappPhoneId,
        testPhone: testPhone
      });

      if (res.success) {
        setTestMessage("Test message sent successfully! Check your WhatsApp.");
      } else {
        setTestMessage(`Failed: ${res.error}`);
      }
    } catch (e) {
      setTestMessage("An error occurred during testing.");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const res = await updatePlatformSettings(form);
      if (res.success) {
        setSaveMessage("Settings saved successfully.");
        router.refresh();
      } else {
        setSaveMessage(res.error || "Failed to save settings.");
      }
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (e) {
      console.error("Save catch error:", e);
      setSaveMessage("An error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Platform Usage Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pb-8 border-b dark:border-gray-800 transition-colors">
          <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                  <MessageSquare size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Total Messages</span>
              </div>
              <div className="text-2xl font-bold dark:text-white">
                  {waUsage.totalUsageCount.toLocaleString()}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Global conversation count</p>
          </div>

          <div className="p-4 bg-orange-50/50 dark:bg-orange-900/10 rounded-xl border border-orange-100 dark:border-orange-900/30">
              <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-2">
                  <Wallet size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Global Balance</span>
              </div>
              <div className="text-2xl font-bold dark:text-white">
                  Rp {waUsage.totalBalance.toLocaleString()}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Total credit across all stores</p>
          </div>

          <div className="p-4 bg-green-50/50 dark:bg-green-900/10 rounded-xl border border-green-100 dark:border-green-900/30">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-2">
                  <Activity size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Total Revenue</span>
              </div>
              <div className="text-2xl font-bold dark:text-white">
                  Rp {waUsage.totalTopup.toLocaleString()}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Lifetime WhatsApp top-ups</p>
          </div>

          <div className="p-4 bg-purple-50/50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-900/30">
              <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-2">
                  <Activity size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Est. Meta Cost</span>
              </div>
              <div className="text-2xl font-bold dark:text-white text-purple-600">
                  Rp {waUsage.estimatedCost.toLocaleString()}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Approximate platform expense</p>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b dark:border-gray-800 pb-8 transition-colors">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Meta / WhatsApp Rates</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Cost per message charged by Meta (in IDR). Used for profit calculations.</p>
        </div>
        <div className="md:col-span-2 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1 dark:text-gray-400 uppercase tracking-widest">Marketing</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-400 text-sm">Rp</span>
              <input
                type="number"
                className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-800 pl-10 pr-3 py-2 rounded-lg dark:text-white transition-colors"
                value={form.waRateMarketing}
                onChange={(e) => setForm({ ...form, waRateMarketing: Number(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 dark:text-gray-400 uppercase tracking-widest">Utility</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-400 text-sm">Rp</span>
              <input
                type="number"
                className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-800 pl-10 pr-3 py-2 rounded-lg dark:text-white transition-colors"
                value={form.waRateUtility}
                onChange={(e) => setForm({ ...form, waRateUtility: Number(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 dark:text-gray-400 uppercase tracking-widest">Authentication</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-400 text-sm">Rp</span>
              <input
                type="number"
                className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-800 pl-10 pr-3 py-2 rounded-lg dark:text-white transition-colors"
                value={form.waRateAuthentication}
                onChange={(e) => setForm({ ...form, waRateAuthentication: Number(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 dark:text-gray-400 uppercase tracking-widest">Service (24h Window)</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-400 text-sm">Rp</span>
              <input
                type="number"
                className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-800 pl-10 pr-3 py-2 rounded-lg dark:text-white transition-colors"
                value={form.waRateService}
                onChange={(e) => setForm({ ...form, waRateService: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b dark:border-gray-800 pb-8 transition-colors">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">WhatsApp Cloud API</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Used by Pro and default Enterprise.</p>
        </div>
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">WhatsApp Token (Meta)</label>
            <input
              type="password"
              className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg dark:text-white transition-colors"
              value={form.whatsappToken}
              onChange={(e) => setForm({ ...form, whatsappToken: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">WhatsApp Phone Number ID</label>
            <input
              type="text"
              className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg dark:text-white transition-colors"
              value={form.whatsappPhoneId}
              onChange={(e) => setForm({ ...form, whatsappPhoneId: e.target.value })}
            />
          </div>
          
          <div className="pt-2 border-t dark:border-gray-800 space-y-3">
            <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">Connection Test</h4>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Test Phone (e.g. 628...)"
                className="flex-1 border border-gray-300 dark:border-gray-800 bg-gray-50 dark:bg-black/20 px-3 py-1.5 rounded-lg text-sm dark:text-white outline-none focus:border-blue-500"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
              />
              <button
                onClick={handleTestWhatsApp}
                disabled={isTesting}
                className="inline-flex items-center gap-2 px-4 py-1.5 bg-green-600 text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {isTesting ? "Sending..." : "Test Now"}
              </button>
            </div>
            {testMessage && (
              <p className={cn("text-[10px] font-bold uppercase tracking-tight", testMessage.includes("success") ? "text-green-600" : "text-red-500")}>
                {testMessage}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b dark:border-gray-800 pb-8 transition-colors">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Midtrans</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Used when a store enables Midtrans.</p>
        </div>
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Server Key</label>
            <input
              type="password"
              className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg dark:text-white transition-colors"
              value={form.midtransServerKey}
              onChange={(e) => setForm({ ...form, midtransServerKey: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Client Key</label>
            <input
              type="text"
              className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg dark:text-white transition-colors"
              value={form.midtransClientKey}
              onChange={(e) => setForm({ ...form, midtransClientKey: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b dark:border-gray-800 pb-8 transition-colors">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Google Gemini AI</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">API Key for AI-powered assistant and customer ordering.</p>
        </div>
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Gemini API Key</label>
            <input
              type="password"
              className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg dark:text-white transition-colors"
              value={form.geminiApiKey}
              onChange={(e) => setForm({ ...form, geminiApiKey: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b dark:border-gray-800 pb-8 transition-colors">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Biteship</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Default shipping API key for stores without own key.</p>
        </div>
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Biteship API Key</label>
            <input
              type="password"
              className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg dark:text-white transition-colors"
              value={form.biteshipApiKey}
              onChange={(e) => setForm({ ...form, biteshipApiKey: e.target.value })}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              If empty, system falls back to BITESHIP_API_KEY from environment variables.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b dark:border-gray-800 pb-8 transition-colors">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Subscription (Midtrans)</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Keys used for Monthly Subscription (Rp 299.000).</p>
        </div>
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Subscription Server Key</label>
            <input
              type="password"
              className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg dark:text-white transition-colors"
              value={form.subscriptionServerKey}
              onChange={(e) => setForm({ ...form, subscriptionServerKey: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Subscription Client Key</label>
            <input
              type="text"
              className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg dark:text-white transition-colors"
              value={form.subscriptionClientKey}
              onChange={(e) => setForm({ ...form, subscriptionClientKey: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b dark:border-gray-800 pb-8 transition-colors">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Meta / Facebook</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Required for Embedded Signup flow.</p>
        </div>
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Facebook App ID</label>
            <input
              type="text"
              className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg dark:text-white transition-colors"
              value={form.facebookAppId}
              onChange={(e) => setForm({ ...form, facebookAppId: e.target.value })}
              placeholder="e.g. 752112443422115"
            />
          </div>
        </div>
      </div>

      <div className="pt-6 border-t dark:border-gray-800 flex items-center space-x-4 transition-colors">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors rounded-lg shadow-sm"
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
        {saveMessage && (
          <span className={cn("text-sm flex items-center", saveMessage.includes("Failed") ? "text-red-600" : "text-green-600")}>
            <Check className="w-4 h-4 mr-1" />
            {saveMessage}
          </span>
        )}
      </div>
    </div>
  );
}
