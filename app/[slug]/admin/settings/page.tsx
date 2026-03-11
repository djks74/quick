"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useAdmin, AdminLayoutStyle } from "@/lib/admin-context";
import { useShop } from "@/context/ShopContext";
import { getStoreSettings, updateStoreSettings, getStoreBySlug } from "@/lib/api";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminSettings() {
  const { slug } = useParams();
  const router = useRouter();
  const { setSiteName } = useAdmin();
  const { data: session, status } = useSession();
  const isSuperAdmin = (session as any)?.user?.role === "SUPER_ADMIN";

  // Redirect non-super-admin users
  useEffect(() => {
    if (status !== "loading" && session && !isSuperAdmin) {
      router.push(`/${slug}/admin`);
    }
  }, [session, isSuperAdmin, slug, router, status]);
  
  // Hooks must be called unconditionally
  const { headerSettings, setHeaderSettings } = useShop();
  const [activeTab, setActiveTab] = useState("General");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState("FREE");
  
  const [settings, setSettings] = useState({
    storeName: "",
    whatsapp: "",
    themeColor: "",
    whatsappToken: "",
    whatsappPhoneId: "",
    enableWhatsApp: true,
    enableMidtrans: false,
    enableXendit: false,
    enableManualTransfer: false,
    enablePos: false,
    taxPercent: "0",
    serviceChargePercent: "0",
    qrisFeePercent: "0.7",
    manualTransferFee: "0",
    feePaidBy: "CUSTOMER",
    posGridColumns: 4,
    paymentGatewaySecret: "",
    paymentGatewayClientKey: ""
  });

  const [bankAccount, setBankAccount] = useState({
    bankName: "BCA",
    accountNumber: "",
    accountName: ""
  });

  // Fetch Store ID
  useEffect(() => {
    async function loadStore() {
      if (!slug) return;
      const store = await getStoreBySlug(slug as string);
      if (store) setStoreId(store.id);
    }
    loadStore();
  }, [slug]);

  // Load Settings
  useEffect(() => {
    async function loadSettings() {
      if (!storeId) return;
      const data = await getStoreSettings(storeId);
      if (data) {
        setSettings({
          storeName: data.name || "",
          whatsapp: data.whatsapp || "",
          themeColor: data.themeColor || "",
          whatsappToken: data.whatsappToken || "",
          whatsappPhoneId: data.whatsappPhoneId || "",
          enableWhatsApp: data.enableWhatsApp ?? true,
          enableMidtrans: data.enableMidtrans ?? false,
          enableXendit: data.enableXendit ?? false,
          enableManualTransfer: data.enableManualTransfer ?? false,
          enablePos: data.posEnabled ?? false,
          taxPercent: (data.taxPercent ?? 0).toString(),
          serviceChargePercent: (data.serviceChargePercent ?? 0).toString(),
          qrisFeePercent: (data.qrisFeePercent ?? 0.7).toString(),
          manualTransferFee: (data.manualTransferFee ?? 0).toString(),
          feePaidBy: data.feePaidBy || "CUSTOMER",
          posGridColumns: data.posGridColumns ?? 4,
          paymentGatewaySecret: data.paymentGatewaySecret || "",
          paymentGatewayClientKey: data.paymentGatewayClientKey || ""
        });
        
        if (data.bankAccount) {
            const bank = data.bankAccount as any;
            setBankAccount({
                bankName: bank.bankName || "BCA",
                accountNumber: bank.accountNumber || "",
                accountName: bank.accountName || ""
            });
        }

        if (data.name) setSiteName(data.name);
        setSubscriptionPlan(data.subscriptionPlan || "FREE");
      }
    }
    loadSettings();
  }, [storeId, setSiteName]);

  const handleSave = async () => {
    if (!storeId) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const result = await updateStoreSettings(storeId, {
        ...settings,
        taxPercent: parseFloat(settings.taxPercent.toString().replace(',', '.')) || 0,
        serviceChargePercent: parseFloat(settings.serviceChargePercent.toString().replace(',', '.')) || 0,
        qrisFeePercent: parseFloat(settings.qrisFeePercent.toString().replace(',', '.')) || 0,
        manualTransferFee: parseFloat(settings.manualTransferFee.toString().replace(',', '.')) || 0,
        bankAccount: bankAccount
      });

      if (result) {
        setSiteName(settings.storeName);
        setHeaderSettings(prev => ({ ...prev, siteName: settings.storeName }));
        setSaveMessage("Settings saved successfully.");
        // Update local state with returned data to ensure sync
        setSettings(prev => ({
            ...prev,
            taxPercent: (result.taxPercent ?? 0).toString(),
            serviceChargePercent: (result.serviceChargePercent ?? 0).toString(),
            qrisFeePercent: (result.qrisFeePercent ?? 0).toString(),
            manualTransferFee: (result.manualTransferFee ?? 0).toString(),
        }));
      } else {
        console.error("Failed to save settings: Server returned null");
        setSaveMessage("Failed to save settings. Please try again.");
      }
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSaveMessage("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const isEnterprise = subscriptionPlan === 'ENTERPRISE';
  const isDemoStore = slug === "demo";
  const canOverridePlatformConfig = isEnterprise && !isDemoStore;
  
  // Early return ONLY after hooks are defined
  if (status === "loading") return <div className="p-8">Loading...</div>;
  if (!isSuperAdmin) return null; // Or a restricted access message

  return (
    <div className="space-y-6">
      <div className="flex border-b border-[#ccd0d4] mb-6 overflow-x-auto">
        {["General", "Payments", "Tax & Fees", "Appearance"].map((tab) => (
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
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b pb-8">
              <div>
                <h3 className="text-sm font-bold text-[#1d2327]">Point of Sale</h3>
                <p className="text-xs text-gray-500 mt-1">Manage POS settings.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                 <div className="flex items-center space-x-2">
                    <input 
                      type="checkbox" 
                      checked={settings.enablePos}
                      onChange={(e) => setSettings({ ...settings, enablePos: e.target.checked })}
                      className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                    <label className="text-sm font-medium">Enable POS System</label>
                 </div>
                 {settings.enablePos && (
                    <div className="bg-blue-50 p-3 rounded text-sm text-blue-700">
                        POS is active at <a href={`/${slug}/pos`} target="_blank" className="font-bold hover:underline">/{slug}/pos</a>
                    </div>
                 )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              <div>
                <h3 className="text-sm font-bold text-[#1d2327]">Integrations</h3>
                <p className="text-xs text-gray-500 mt-1">Connect third-party services.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                {!isEnterprise && (
                    <div className="bg-blue-50 text-blue-700 p-3 rounded-md text-sm mb-4 flex items-center">
                        <Lock className="w-4 h-4 mr-2" />
                        Using Platform WhatsApp Config. Upgrade to Enterprise to use your own.
                    </div>
                )}
                {isDemoStore && (
                  <div className="bg-gray-100 text-gray-700 p-3 rounded-md text-sm mb-4">
                    Demo store always uses Platform WhatsApp config.
                  </div>
                )}
                <div className={cn(!canOverridePlatformConfig && "opacity-50 pointer-events-none")}>
                    <div>
                    <label className="block text-sm font-medium mb-1">WhatsApp Token (Meta)</label>
                    <input 
                        type="password" 
                        className="w-full md:w-2/3 border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                        value={settings.whatsappToken}
                        onChange={(e) => setSettings({ ...settings, whatsappToken: e.target.value })}
                    />
                    </div>
                    <div className="mt-4">
                    <label className="block text-sm font-medium mb-1">WhatsApp Phone Number ID</label>
                    <input 
                        type="text" 
                        className="w-full md:w-2/3 border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                        value={settings.whatsappPhoneId}
                        onChange={(e) => setSettings({ ...settings, whatsappPhoneId: e.target.value })}
                    />
                    </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Payments" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              <div>
                <h3 className="text-sm font-bold text-[#1d2327]">Payment Methods</h3>
                <p className="text-xs text-gray-500 mt-1">Enable multiple payment options.</p>
              </div>
              <div className="md:col-span-2 space-y-6">
                
                {/* Manual Transfer */}
                <div className="border p-4 rounded-lg bg-white space-y-4">
                    <div className="flex items-center justify-between">
                         <div className="flex items-center space-x-2">
                            <input 
                                type="checkbox" 
                                checked={settings.enableManualTransfer}
                                onChange={(e) => setSettings({ ...settings, enableManualTransfer: e.target.checked })}
                                className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                            />
                            <label className="text-sm font-medium">Enable Manual Transfer</label>
                        </div>
                    </div>
                    
                    {settings.enableManualTransfer && (
                        <div className="pl-6 pt-2 border-t mt-2">
                             {!isEnterprise && (
                                <div className="bg-gray-100 text-gray-600 p-2 text-xs mb-3 rounded">
                                    Funds will be transferred to Platform Account (BCA 888888888). Upgrade to Enterprise to use your own bank account.
                                </div>
                             )}
                             {isDemoStore && (
                                <div className="bg-gray-100 text-gray-600 p-2 text-xs mb-3 rounded">
                                    Demo store always uses Platform bank account.
                                </div>
                             )}
                             <div className={cn("space-y-3", !canOverridePlatformConfig && "opacity-50 pointer-events-none")}>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Bank Name</label>
                                    <input 
                                        type="text" 
                                        className="w-full border px-3 py-1.5 text-sm" 
                                        value={bankAccount.bankName}
                                        onChange={(e) => setBankAccount({ ...bankAccount, bankName: e.target.value })}
                                        placeholder="BCA"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Account Number</label>
                                    <input 
                                        type="text" 
                                        className="w-full border px-3 py-1.5 text-sm" 
                                        value={bankAccount.accountNumber}
                                        onChange={(e) => setBankAccount({ ...bankAccount, accountNumber: e.target.value })}
                                        placeholder="1234567890"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Account Name</label>
                                    <input 
                                        type="text" 
                                        className="w-full border px-3 py-1.5 text-sm" 
                                        value={bankAccount.accountName}
                                        onChange={(e) => setBankAccount({ ...bankAccount, accountName: e.target.value })}
                                        placeholder="Store Name"
                                    />
                                </div>
                             </div>
                        </div>
                    )}
                </div>

                {/* Midtrans */}
                <div className="border p-4 rounded-lg bg-white space-y-4">
                   <div className="flex items-center space-x-2">
                    <input 
                      type="checkbox" 
                      checked={settings.enableMidtrans}
                      onChange={(e) => setSettings({ ...settings, enableMidtrans: e.target.checked })}
                      className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                    <label className="text-sm font-medium">Enable Midtrans</label>
                   </div>
                   {settings.enableMidtrans && (
                     <div className="pl-6 space-y-3">
                       {!isEnterprise && (
                            <div className="bg-green-50 text-green-700 p-3 rounded-md text-xs mb-3 flex items-center">
                                <Check className="w-4 h-4 mr-2" />
                                <span>Platform Midtrans Keys Active. Upgrade to Enterprise to use your own keys.</span>
                            </div>
                       )}
                       {isDemoStore && (
                          <div className="bg-gray-100 text-gray-600 p-2 text-xs mb-3 rounded">
                              Demo store always uses Platform Midtrans keys.
                          </div>
                       )}
                       <div className={cn("space-y-3", !canOverridePlatformConfig && "opacity-75 pointer-events-none")}>
                            <input 
                                type="password" 
                                className="w-full border px-3 py-1.5 text-sm bg-gray-50" 
                                placeholder={!isEnterprise ? "•••••••••••••••• (Platform Key)" : "Server Key"}
                                value={!isEnterprise ? "••••••••••••••••" : settings.paymentGatewaySecret}
                                onChange={(e) => setSettings({ ...settings, paymentGatewaySecret: e.target.value })}
                                readOnly={!isEnterprise}
                            />
                            <input 
                                type="text" 
                                className="w-full border px-3 py-1.5 text-sm bg-gray-50" 
                                placeholder={!isEnterprise ? "•••••••••••••••• (Platform Key)" : "Client Key"}
                                value={!isEnterprise ? "••••••••••••••••" : settings.paymentGatewayClientKey}
                                onChange={(e) => setSettings({ ...settings, paymentGatewayClientKey: e.target.value })}
                                readOnly={!isEnterprise}
                            />
                       </div>
                     </div>
                   )}
                </div>

                {/* WhatsApp Checkout */}
                <div className="flex items-center space-x-2 border p-4 rounded-lg bg-white">
                  <input 
                    type="checkbox" 
                    checked={settings.enableWhatsApp}
                    onChange={(e) => setSettings({ ...settings, enableWhatsApp: e.target.checked })}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label className="text-sm font-medium">Enable Checkout via WhatsApp</label>
                </div>

              </div>
            </div>
          </div>
        )}

        {activeTab === "Tax & Fees" && (
           <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b pb-8">
                 <div>
                   <h3 className="text-sm font-bold text-[#1d2327]">Additional Charges</h3>
                   <p className="text-xs text-gray-500 mt-1">Configure taxes and service charges.</p>
                 </div>
                 <div className="md:col-span-2 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Tax (%)</label>
                            <input 
                                type="text"
                                inputMode="decimal"
                                className="w-full border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                                value={settings.taxPercent}
                                onChange={(e) => setSettings({ ...settings, taxPercent: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Service Charge (%)</label>
                            <input 
                                type="text"
                                inputMode="decimal"
                                className="w-full border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                                value={settings.serviceChargePercent}
                                onChange={(e) => setSettings({ ...settings, serviceChargePercent: e.target.value })}
                            />
                        </div>
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b pb-8">
                 <div>
                   <h3 className="text-sm font-bold text-[#1d2327]">Payment Fees</h3>
                   <p className="text-xs text-gray-500 mt-1">Configure transaction fees.</p>
                 </div>
                 <div className="md:col-span-2 space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Who pays the fees?</label>
                        <select 
                            className="w-full border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none bg-white"
                            value={settings.feePaidBy}
                            onChange={(e) => setSettings({ ...settings, feePaidBy: e.target.value })}
                        >
                            <option value="CUSTOMER">Customer (Added to Total)</option>
                            <option value="MERCHANT">Merchant (Deducted from Settlement)</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">QRIS Fee (%)</label>
                            <input 
                                type="text"
                                inputMode="decimal"
                                className="w-full border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" 
                                value={settings.qrisFeePercent}
                                onChange={(e) => setSettings({ ...settings, qrisFeePercent: e.target.value })}
                            />
                            <p className="text-xs text-gray-500 mt-1">Default is 0.7%</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Bank Transfer Fee (Flat)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1.5 text-gray-500 text-sm">Rp</span>
                                <input 
                                    type="text"
                                    inputMode="decimal"
                                    className="w-full border border-[#ccd0d4] pl-8 pr-3 py-1.5 focus:border-[#2271b1] outline-none" 
                                    value={settings.manualTransferFee}
                                    onChange={(e) => setSettings({ ...settings, manualTransferFee: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                 </div>
              </div>
           </div>
        )}

        {activeTab === "Appearance" && (
           <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                 <div>
                   <h3 className="text-sm font-bold text-[#1d2327]">Theme</h3>
                 </div>
                 <div className="md:col-span-2 space-y-4">
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
                          className="w-full md:w-1/3 border border-[#ccd0d4] px-3 py-1.5 uppercase" 
                          value={settings.themeColor}
                          onChange={(e) => setSettings({ ...settings, themeColor: e.target.value })}
                        />
                      </div>
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                 <div>
                   <h3 className="text-sm font-bold text-[#1d2327]">Layout</h3>
                 </div>
                 <div className="md:col-span-2 space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">POS Grid Columns</label>
                        <select 
                            className="w-full border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none bg-white"
                            value={settings.posGridColumns}
                            onChange={(e) => setSettings({ ...settings, posGridColumns: parseInt(e.target.value) })}
                        >
                            <option value={3}>3 Columns</option>
                            <option value={4}>4 Columns</option>
                            <option value={5}>5 Columns</option>
                            <option value={6}>6 Columns</option>
                        </select>
                    </div>
                 </div>
              </div>
           </div>
        )}

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
              <Check className="w-4 h-4 mr-1" />
              {saveMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
