"use client";

import { useState, useEffect } from "react";
import { useAdmin, AdminLayoutStyle } from "@/lib/admin-context";
import { useShop, HeaderSettings, PaymentSettings } from "@/context/ShopContext";
import { getStoreSettings, updateStoreSettings } from "@/lib/api";
import { 
  Settings, 
  Globe, 
  Mail, 
  Lock, 
  Eye, 
  Layout, 
  Smartphone, 
  Palette,
  Check,
  CreditCard
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminSettings() {
  const { layoutStyle, setLayoutStyle, siteName, setSiteName } = useAdmin();
  const { headerSettings, setHeaderSettings, paymentSettings, setPaymentSettings } = useShop();
  const [activeTab, setActiveTab] = useState("General");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    storeName: "",
    whatsapp: "",
    themeColor: "",
    whatsappToken: "",
    whatsappPhoneId: "",
    paymentGatewaySecret: ""
  });

  useEffect(() => {
    async function loadSettings() {
      const data = await getStoreSettings();
      if (data) {
        setSettings({
          storeName: data.storeName || "",
          whatsapp: data.whatsapp || "",
          themeColor: data.themeColor || "",
          whatsappToken: data.whatsappToken || "",
          whatsappPhoneId: data.whatsappPhoneId || "",
          paymentGatewaySecret: data.paymentGatewaySecret || ""
        });
        if (data.storeName) setSiteName(data.storeName);
      }
    }
    loadSettings();
  }, [setSiteName]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await updateStoreSettings(settings);
      setSiteName(settings.storeName);
      setSaveMessage("Settings saved successfully.");
      
      // Clear message after 3 seconds
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSaveMessage("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const layoutOptions: { id: AdminLayoutStyle; name: string; desc: string; preview: string }[] = [
    { 
      id: "wordpress", 
      name: "WordPress Style", 
      desc: "Classic WP dashboard with dark sidebar and top bar.",
      preview: "bg-[#1d2327]" 
    },
    { 
      id: "modern", 
      name: "Modern Dashboard", 
      desc: "Clean, spacious layout with white sidebar and rounded cards.",
      preview: "bg-white border-r border-gray-200" 
    },
    { 
      id: "minimal", 
      name: "Minimalist", 
      desc: "Ultra-clean layout focusing on content with floating elements.",
      preview: "bg-gray-50" 
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex border-b border-[#ccd0d4] mb-6 overflow-x-auto">
        {["General", "Header & Footer", "Payments", "Writing", "Reading"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[2px] whitespace-nowrap",
              activeTab === tab 
                ? "border-[#2271b1] text-[#2271b1] bg-white" 
                : "border-transparent text-gray-500 hover:text-[#2271b1]"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="max-w-4xl space-y-8">
        {activeTab === "General" && (
          <div className="space-y-6">
            {/* Site Identity */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b pb-8">
              <div>
                <h3 className="text-sm font-bold text-[#1d2327]">Store Identity</h3>
                <p className="text-xs text-gray-500 mt-1">Global settings for your store.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Store Name</label>
                  <input 
                    type="text" 
                    className="w-full md:w-2/3 border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                    value={settings.storeName}
                    onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">WhatsApp Number</label>
                  <input 
                    type="text" 
                    className="w-full md:w-2/3 border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                    value={settings.whatsapp}
                    onChange={(e) => setSettings({ ...settings, whatsapp: e.target.value })}
                    placeholder="628..."
                  />
                  <p className="text-xs text-gray-500 mt-1">Format: Country code without + (e.g., 628123456789)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Theme Color</label>
                  <div className="flex items-center space-x-2">
                    <input 
                      type="color" 
                      className="w-8 h-8 p-0 border-0 rounded cursor-pointer"
                      value={settings.themeColor}
                      onChange={(e) => setSettings({ ...settings, themeColor: e.target.value })}
                    />
                    <input 
                      type="text" 
                      className="w-full md:w-1/3 border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none uppercase" 
                      value={settings.themeColor}
                      onChange={(e) => setSettings({ ...settings, themeColor: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Integrations */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              <div>
                <h3 className="text-sm font-bold text-[#1d2327]">Integrations</h3>
                <p className="text-xs text-gray-500 mt-1">Connect third-party services.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">WhatsApp Token (Meta)</label>
                  <input 
                    type="password" 
                    className="w-full md:w-2/3 border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                    value={settings.whatsappToken}
                    onChange={(e) => setSettings({ ...settings, whatsappToken: e.target.value })}
                    placeholder="Meta API Token"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">WhatsApp Phone Number ID</label>
                  <input 
                    type="text" 
                    className="w-full md:w-2/3 border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                    value={settings.whatsappPhoneId}
                    onChange={(e) => setSettings({ ...settings, whatsappPhoneId: e.target.value })}
                    placeholder="e.g. 10456..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Payment Gateway Secret</label>
                  <input 
                    type="password" 
                    className="w-full md:w-2/3 border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                    value={settings.paymentGatewaySecret}
                    onChange={(e) => setSettings({ ...settings, paymentGatewaySecret: e.target.value })}
                    placeholder="Xendit/Midtrans Secret Key"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Header & Footer" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              <div>
                <h3 className="text-sm font-bold text-[#1d2327]">Header Styling</h3>
                <p className="text-xs text-gray-500 mt-1">Customize the look and feel of your site header.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Header Height</label>
                  <input 
                    type="text" 
                    className="w-full md:w-1/3 border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                    value={headerSettings.height}
                    onChange={(e) => setHeaderSettings({ ...headerSettings, height: e.target.value })}
                  />
                  <p className="text-xs text-gray-500 mt-1">e.g. 80px, 5rem</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Background Color</label>
                  <div className="flex items-center space-x-2">
                    <input 
                      type="color" 
                      className="w-8 h-8 p-0 border-0 rounded cursor-pointer"
                      value={headerSettings.backgroundColor}
                      onChange={(e) => setHeaderSettings({ ...headerSettings, backgroundColor: e.target.value })}
                    />
                    <input 
                      type="text" 
                      className="w-full md:w-1/3 border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none uppercase" 
                      value={headerSettings.backgroundColor}
                      onChange={(e) => setHeaderSettings({ ...headerSettings, backgroundColor: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Text Color</label>
                  <div className="flex items-center space-x-2">
                    <input 
                      type="color" 
                      className="w-8 h-8 p-0 border-0 rounded cursor-pointer"
                      value={headerSettings.textColor}
                      onChange={(e) => setHeaderSettings({ ...headerSettings, textColor: e.target.value })}
                    />
                    <input 
                      type="text" 
                      className="w-full md:w-1/3 border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none uppercase" 
                      value={headerSettings.textColor}
                      onChange={(e) => setHeaderSettings({ ...headerSettings, textColor: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Font Size</label>
                  <input 
                    type="text" 
                    className="w-full md:w-1/3 border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                    value={headerSettings.fontSize}
                    onChange={(e) => setHeaderSettings({ ...headerSettings, fontSize: e.target.value })}
                  />
                  <p className="text-xs text-gray-500 mt-1">e.g. 14px, 1rem</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Payments" && (
          <div className="space-y-6">
            {/* Xendit */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b pb-8">
              <div>
                <h3 className="text-sm font-bold text-[#1d2327]">Xendit Payment Gateway</h3>
                <p className="text-xs text-gray-500 mt-1">Accept payments via Xendit API.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                <div className="flex items-center space-x-2">
                  <input 
                    type="checkbox" 
                    id="xendit-enable"
                    checked={paymentSettings.xenditEnabled}
                    onChange={(e) => setPaymentSettings({ ...paymentSettings, xenditEnabled: e.target.checked })}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label htmlFor="xendit-enable" className="text-sm font-medium">Enable Xendit</label>
                </div>
                {paymentSettings.xenditEnabled && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                    <label className="block text-sm font-medium mb-1">Secret API Key</label>
                    <input 
                      type="password" 
                      className="w-full border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                      value={paymentSettings.xenditApiKey}
                      onChange={(e) => setPaymentSettings({ ...paymentSettings, xenditApiKey: e.target.value })}
                      placeholder="xnd_..."
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Midtrans */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              <div>
                <h3 className="text-sm font-bold text-[#1d2327]">Midtrans Payment Gateway</h3>
                <p className="text-xs text-gray-500 mt-1">Accept payments via Midtrans Snap API.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                <div className="flex items-center space-x-2">
                  <input 
                    type="checkbox" 
                    id="midtrans-enable"
                    checked={paymentSettings.midtransEnabled}
                    onChange={(e) => setPaymentSettings({ ...paymentSettings, midtransEnabled: e.target.checked })}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label htmlFor="midtrans-enable" className="text-sm font-medium">Enable Midtrans</label>
                </div>
                {paymentSettings.midtransEnabled && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div>
                      <label className="block text-sm font-medium mb-1">Server Key</label>
                      <input 
                        type="password" 
                        className="w-full border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                        value={paymentSettings.midtransServerKey}
                        onChange={(e) => setPaymentSettings({ ...paymentSettings, midtransServerKey: e.target.value })}
                        placeholder="SB-Mid-server-..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Client Key</label>
                      <input 
                        type="text" 
                        className="w-full border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                        value={paymentSettings.midtransClientKey}
                        onChange={(e) => setPaymentSettings({ ...paymentSettings, midtransClientKey: e.target.value })}
                        placeholder="SB-Mid-client-..."
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-6 border-t flex items-center space-x-4">
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 bg-[#2271b1] text-white font-medium hover:bg-[#135e96] transition-colors rounded shadow-sm flex items-center"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
          {saveMessage && (
            <span className={cn("text-sm flex items-center", saveMessage.includes("Failed") ? "text-red-600" : "text-green-600")}>
              {saveMessage.includes("Failed") ? null : <Check className="w-4 h-4 mr-1" />} 
              {saveMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
