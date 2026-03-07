"use client";

import { useState } from "react";
import { useAdmin, AdminLayoutStyle } from "@/lib/admin-context";
import { useShop, HeaderSettings, PaymentSettings } from "@/context/ShopContext";
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

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => setIsSaving(false), 800);
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
                <h3 className="text-sm font-bold text-[#1d2327]">Site Identity</h3>
                <p className="text-xs text-gray-500 mt-1">Global settings for your website branding.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Site Title</label>
                  <input 
                    type="text" 
                    className="w-full md:w-2/3 border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Tagline</label>
                  <input 
                    type="text" 
                    className="w-full md:w-2/3 border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                    placeholder="Just another Next.js site"
                  />
                  <p className="text-xs text-gray-500 mt-1">In a few words, explain what this site is about.</p>
                </div>
              </div>
            </div>

            {/* Admin Layout Selection */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b pb-8">
              <div>
                <h3 className="text-sm font-bold text-[#1d2327]">Admin Layout Style</h3>
                <p className="text-xs text-gray-500 mt-1">Choose the interface style for your administration area.</p>
              </div>
              <div className="md:col-span-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {layoutOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setLayoutStyle(option.id)}
                      className={cn(
                        "p-4 border text-left transition-all group relative",
                        layoutStyle === option.id 
                          ? "border-[#2271b1] bg-[#f0f6fa] ring-1 ring-[#2271b1]" 
                          : "border-[#ccd0d4] hover:border-[#b1b4b6] bg-white"
                      )}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className={cn("w-12 h-8 rounded border border-[#ccd0d4] shadow-sm", option.preview)} />
                        {layoutStyle === option.id && <div className="bg-[#2271b1] text-white p-0.5 rounded-full"><Check className="w-3 h-3" /></div>}
                      </div>
                      <h4 className="text-sm font-bold text-[#1d2327]">{option.name}</h4>
                      <p className="text-xs text-gray-500 mt-1">{option.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Email Settings */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              <div>
                <h3 className="text-sm font-bold text-[#1d2327]">Administration Email</h3>
                <p className="text-xs text-gray-500 mt-1">The address used for admin purposes.</p>
              </div>
              <div className="md:col-span-2">
                <input 
                  type="email" 
                  className="w-full md:w-2/3 border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                  defaultValue="admin@lcpautocars.com"
                />
                <p className="text-xs text-gray-500 mt-1 italic">This address is used for admin purposes. If you change this, we will send you an email at your new address to confirm it.</p>
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
          {isSaving && <span className="text-sm text-green-600 flex items-center"><Check className="w-4 h-4 mr-1" /> Settings saved.</span>}
        </div>
      </div>
    </div>
  );
}
