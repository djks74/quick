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
  xenditSecretKey?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
};

export default function SettingsForm({ initialSettings }: { initialSettings: PlatformSettings | null }) {
  const router = useRouter();
  const defaults = useMemo(
    () => ({
      whatsappToken: initialSettings?.whatsappToken || "",
      whatsappPhoneId: initialSettings?.whatsappPhoneId || "",
      midtransServerKey: initialSettings?.midtransServerKey || "",
      midtransClientKey: initialSettings?.midtransClientKey || "",
      xenditSecretKey: initialSettings?.xenditSecretKey || "",
      bankName: initialSettings?.bankName || "",
      bankAccountNumber: initialSettings?.bankAccountNumber || "",
      bankAccountName: initialSettings?.bankAccountName || ""
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
      await updatePlatformSettings(form);
      setSaveMessage("Settings saved successfully.");
      router.refresh();
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (e) {
      setSaveMessage("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b pb-8">
        <div>
          <h3 className="text-sm font-bold text-gray-900">WhatsApp Cloud API</h3>
          <p className="text-xs text-gray-500 mt-1">Used by Pro and default Enterprise.</p>
        </div>
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">WhatsApp Token (Meta)</label>
            <input
              type="password"
              className="w-full border border-gray-300 px-3 py-2 rounded-lg"
              value={form.whatsappToken}
              onChange={(e) => setForm({ ...form, whatsappToken: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">WhatsApp Phone Number ID</label>
            <input
              type="text"
              className="w-full border border-gray-300 px-3 py-2 rounded-lg"
              value={form.whatsappPhoneId}
              onChange={(e) => setForm({ ...form, whatsappPhoneId: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b pb-8">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Midtrans</h3>
          <p className="text-xs text-gray-500 mt-1">Used when a store enables Midtrans.</p>
        </div>
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Server Key</label>
            <input
              type="password"
              className="w-full border border-gray-300 px-3 py-2 rounded-lg"
              value={form.midtransServerKey}
              onChange={(e) => setForm({ ...form, midtransServerKey: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Client Key</label>
            <input
              type="text"
              className="w-full border border-gray-300 px-3 py-2 rounded-lg"
              value={form.midtransClientKey}
              onChange={(e) => setForm({ ...form, midtransClientKey: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b pb-8">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Xendit</h3>
          <p className="text-xs text-gray-500 mt-1">Used when a store enables Xendit.</p>
        </div>
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Secret Key</label>
            <input
              type="password"
              className="w-full border border-gray-300 px-3 py-2 rounded-lg"
              value={form.xenditSecretKey}
              onChange={(e) => setForm({ ...form, xenditSecretKey: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Manual Transfer</h3>
          <p className="text-xs text-gray-500 mt-1">Default bank account for non-Enterprise.</p>
        </div>
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Bank Name</label>
            <input
              type="text"
              className="w-full border border-gray-300 px-3 py-2 rounded-lg"
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Account Number</label>
            <input
              type="text"
              className="w-full border border-gray-300 px-3 py-2 rounded-lg"
              value={form.bankAccountNumber}
              onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Account Name</label>
            <input
              type="text"
              className="w-full border border-gray-300 px-3 py-2 rounded-lg"
              value={form.bankAccountName}
              onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="pt-6 border-t flex items-center space-x-4">
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

