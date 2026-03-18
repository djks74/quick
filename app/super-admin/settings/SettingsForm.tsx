"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { updatePlatformSettings } from "@/lib/super-admin";
import { cn } from "@/lib/utils";

type PlatformSettings = {
  whatsappToken?: string | null;
  whatsappPhoneId?: string | null;
  midtransServerKey?: string | null;
  midtransClientKey?: string | null;
  biteshipApiKey?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  subscriptionServerKey?: string | null;
  subscriptionClientKey?: string | null;
  geminiApiKey?: string | null;
};

export default function SettingsForm({ initialSettings }: { initialSettings: PlatformSettings | null }) {
  const router = useRouter();
  const defaults = useMemo(
    () => ({
      whatsappToken: initialSettings?.whatsappToken || "",
      whatsappPhoneId: initialSettings?.whatsappPhoneId || "",
      midtransServerKey: initialSettings?.midtransServerKey || "",
      midtransClientKey: initialSettings?.midtransClientKey || "",
      biteshipApiKey: initialSettings?.biteshipApiKey || "",
      bankName: initialSettings?.bankName || "",
      bankAccountNumber: initialSettings?.bankAccountNumber || "",
      bankAccountName: initialSettings?.bankAccountName || "",
      subscriptionServerKey: initialSettings?.subscriptionServerKey || "",
      subscriptionClientKey: initialSettings?.subscriptionClientKey || "",
      geminiApiKey: initialSettings?.geminiApiKey || ""
    }),
    [initialSettings]
  );

  const [form, setForm] = useState(defaults);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Manual Transfer</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Default bank account for non-Enterprise.</p>
        </div>
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Bank Name</label>
            <input
              type="text"
              className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg dark:text-white transition-colors"
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Account Number</label>
            <input
              type="text"
              className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg dark:text-white transition-colors"
              value={form.bankAccountNumber}
              onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Account Name</label>
            <input
              type="text"
              className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg dark:text-white transition-colors"
              value={form.bankAccountName}
              onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })}
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
