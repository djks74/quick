"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useAdmin, AdminLayoutStyle } from "@/lib/admin-context";
import { useShop } from "@/context/ShopContext";
import { getStoreSettings, updateStoreSettings, getStoreBySlug, getPosCashierUsername, generateApiKey } from "@/lib/api";
import { Check, Copy, Loader2, Lock, Plus, RefreshCcw, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import AdminSpinner from "../components/AdminSpinner";

type PosPaymentMethod = {
  id: string;
  name: string;
  mode: "cash" | "card" | "qris" | "transfer" | "other";
};

export default function AdminSettings() {
  const { slug } = useParams();
  const router = useRouter();
  const { setSiteName } = useAdmin();
  const { data: session, status } = useSession();
  const isSuperAdmin = (session as any)?.user?.role === "SUPER_ADMIN";
  const slugValue = (Array.isArray(slug) ? slug[0] : slug) as string | undefined;
  const sessionStoreSlug = (session as any)?.user?.storeSlug as string | null | undefined;
  const canAccess = Boolean(isSuperAdmin || (sessionStoreSlug && slugValue && sessionStoreSlug === slugValue));

  // Redirect users without access
  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push(`/login?callbackUrl=/${slugValue || ""}/admin/settings`);
      return;
    }
    if (!canAccess) {
      if (sessionStoreSlug) router.push(`/${sessionStoreSlug}/admin`);
      else router.push(`/`);
    }
  }, [session, canAccess, slug, router, status, sessionStoreSlug, slugValue]);
  
  // Hooks must be called unconditionally
  const { headerSettings, setHeaderSettings } = useShop();
  const [activeTab, setActiveTab] = useState("General");

  // Handle tab from URL
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const tab = searchParams.get("tab");
    if (tab && ["General", "Payments", "Shipping", "Tax & Fees", "Appearance", "Integrations"].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  const [isSaving, setIsSaving] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState("FREE");
  const isSovereign = subscriptionPlan === "SOVEREIGN";
  const isEnterprise = subscriptionPlan === "ENTERPRISE";
  const isDemoStore = slugValue === "demo";
  const canOverridePlatformConfig = (isEnterprise || isSovereign) && !isDemoStore;
  const canOverrideWaAndGemini = isSovereign && !isDemoStore;
  const [newPosMethodName, setNewPosMethodName] = useState("");
  const [newPosMethodMode, setNewPosMethodMode] = useState<PosPaymentMethod["mode"]>("card");
  
  const [settings, setSettings] = useState({
    storeName: "",
    whatsapp: "",
    themeColor: "",
    whatsappToken: "",
    whatsappPhoneId: "",
    enableWhatsApp: true,
    enableMidtrans: false,
    enableManualTransfer: false,
    enablePos: false,
    posUsername: "",
    posPassword: "",
    taxPercent: "0",
    serviceChargePercent: "0",
    qrisFeePercent: "0.7",
    manualTransferFee: "0",
    feePaidBy: "CUSTOMER",
    posGridColumns: 4,
    posPaymentMethods: [] as PosPaymentMethod[],
    paymentGatewaySecret: "",
    paymentGatewayClientKey: "",
    shippingEnableJne: false,
    shippingEnableGosend: false,
    shippingJneOnly: false,
    shippingEnableStoreCourier: false,
    shippingStoreCourierFee: "0",
    enableTakeawayDelivery: true,
    biteshipApiKey: "",
    biteshipOriginAreaId: "",
    biteshipOriginLat: "",
    biteshipOriginLng: "",
    shippingSenderName: "",
    shippingSenderPhone: "",
    shippingSenderAddress: "",
    shippingSenderPostalCode: "",
    customGeminiKey: "",
    webhookUrl: ""
  });

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);

  const [bankAccount, setBankAccount] = useState({
    bankName: "BCA",
    accountNumber: "",
    accountName: ""
  });

  // Fetch Store ID
  useEffect(() => {
    async function loadStore() {
      if (!slugValue) return;
      const store = await getStoreBySlug(slugValue);
      if (store) {
        setStoreId(store.id);
      } else {
        setIsDataLoading(false);
      }
    }
    loadStore();
  }, [slugValue]);

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
          enableManualTransfer: data.enableManualTransfer ?? false,
          enablePos: data.posEnabled ?? false,
          posUsername: "",
          posPassword: "",
          taxPercent: (data.taxPercent ?? 0).toString(),
          serviceChargePercent: (data.serviceChargePercent ?? 0).toString(),
          qrisFeePercent: (data.qrisFeePercent ?? 0.7).toString(),
          manualTransferFee: (data.manualTransferFee ?? 0).toString(),
          feePaidBy: data.feePaidBy || "CUSTOMER",
          posGridColumns: data.posGridColumns ?? 4,
          posPaymentMethods: Array.isArray(data.posPaymentMethods)
            ? data.posPaymentMethods
                .map((item: any) => ({
                  id: String(item?.id || `pm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
                  name: String(item?.name || "").trim(),
                  mode: (["cash", "card", "qris", "transfer", "other"].includes(String(item?.mode)) ? item.mode : "other") as PosPaymentMethod["mode"]
                }))
                .filter((item: PosPaymentMethod) => item.name.length > 0)
            : [],
          paymentGatewaySecret: data.paymentGatewaySecret || "",
          paymentGatewayClientKey: data.paymentGatewayClientKey || "",
          shippingEnableJne: data.shippingEnableJne ?? false,
          shippingEnableGosend: data.shippingEnableGosend ?? false,
          shippingJneOnly: data.shippingJneOnly ?? false,
          shippingEnableStoreCourier: (data as any).shippingEnableStoreCourier ?? false,
          shippingStoreCourierFee: ((data as any).shippingStoreCourierFee ?? 0).toString(),
          enableTakeawayDelivery: data.enableTakeawayDelivery ?? true,
          biteshipApiKey: data.biteshipApiKey || "",
          biteshipOriginAreaId: data.biteshipOriginAreaId || "",
          biteshipOriginLat: data.biteshipOriginLat !== null && data.biteshipOriginLat !== undefined ? String(data.biteshipOriginLat) : "",
          biteshipOriginLng: data.biteshipOriginLng !== null && data.biteshipOriginLng !== undefined ? String(data.biteshipOriginLng) : "",
          shippingSenderName: data.shippingSenderName || "",
          shippingSenderPhone: data.shippingSenderPhone || "",
          shippingSenderAddress: data.shippingSenderAddress || "",
          shippingSenderPostalCode: data.shippingSenderPostalCode || "",
          customGeminiKey: (data as any).customGeminiKey || "",
          webhookUrl: (data as any).webhookUrl || ""
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
        setApiKey(data.apiKey || null);
      }

      const posUsername = await getPosCashierUsername(storeId);
      setSettings(prev => ({ ...prev, posUsername: posUsername || "" }));
      setIsDataLoading(false);
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
        posPaymentMethods: settings.posPaymentMethods,
        biteshipOriginLat: settings.biteshipOriginLat ? parseFloat(settings.biteshipOriginLat.toString().replace(',', '.')) : null,
        biteshipOriginLng: settings.biteshipOriginLng ? parseFloat(settings.biteshipOriginLng.toString().replace(',', '.')) : null,
        shippingStoreCourierFee: parseFloat(settings.shippingStoreCourierFee.toString().replace(',', '.')) || 0,
        bankAccount: bankAccount,
        customGeminiKey: settings.customGeminiKey,
        webhookUrl: settings.webhookUrl
      });

      if (result) {
        setSiteName(settings.storeName);
        setSaveMessage("Settings saved successfully.");
        // Update local state with returned data to ensure sync
        setSettings(prev => ({
            ...prev,
            taxPercent: (result.taxPercent ?? 0).toString(),
            serviceChargePercent: (result.serviceChargePercent ?? 0).toString(),
            qrisFeePercent: (result.qrisFeePercent ?? 0).toString(),
            manualTransferFee: (result.manualTransferFee ?? 0).toString(),
            posPassword: "",
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

  const addPosPaymentMethod = () => {
    const name = newPosMethodName.trim();
    if (!name) return;
    const method: PosPaymentMethod = {
      id: `pm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      mode: newPosMethodMode
    };
    setSettings((prev) => ({
      ...prev,
      posPaymentMethods: [...prev.posPaymentMethods, method]
    }));
    setNewPosMethodName("");
    setNewPosMethodMode("card");
  };

  const removePosPaymentMethod = (id: string) => {
    setSettings((prev) => ({
      ...prev,
      posPaymentMethods: prev.posPaymentMethods.filter((method) => method.id !== id)
    }));
  };

  const handleGenerateApiKey = async () => {
    if (!storeId) return;
    if (!confirm("Are you sure? Any existing integration using the old key will stop working.")) return;
    
    setIsGeneratingKey(true);
    try {
      const newKey = await generateApiKey(storeId);
      if (newKey) {
        setApiKey(newKey);
        setShowApiKey(true);
      }
    } catch (error) {
      console.error("Failed to generate API Key:", error);
    } finally {
      setIsGeneratingKey(false);
    }
  };
  
  // Early return ONLY after hooks are defined
  if (status === "loading" || isDataLoading) {
    return <AdminSpinner label="Loading settings..." />;
  }
  if (!session || !canAccess) return null;

  return (
    <div className="space-y-6">
      <div className="flex border-b border-[#ccd0d4] mb-6 overflow-x-auto">
        {["General", "Payments", "Shipping", "Tax & Fees", "Appearance", "Integrations"].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              // Update URL without reload
              const url = new URL(window.location.href);
              url.searchParams.set('tab', tab);
              window.history.pushState({}, '', url);
            }}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[2px] whitespace-nowrap",
              activeTab === tab 
                ? "border-[#2271b1] text-[#2271b1] bg-white dark:bg-gray-800" 
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b dark:border-gray-800 pb-8">
              <div>
                <h3 className="text-sm font-bold text-[#1d2327] dark:text-white">Store Identity</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Global settings for your store.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">Store Name</label>
                  <input 
                    type="text" 
                    className="w-full md:w-2/3 border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white" 
                    value={settings.storeName}
                    onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">WhatsApp Number</label>
                  <input 
                    type="text" 
                    className="w-full md:w-2/3 border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white" 
                    value={settings.whatsapp}
                    onChange={(e) => setSettings({ ...settings, whatsapp: e.target.value })}
                    placeholder="628..."
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b dark:border-gray-800 pb-8">
              <div>
                <h3 className="text-sm font-bold text-[#1d2327] dark:text-white">Point of Sale</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Manage POS settings.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                 <div className="flex items-center space-x-2">
                    <input 
                      type="checkbox" 
                      checked={settings.enablePos}
                      onChange={(e) => setSettings({ ...settings, enablePos: e.target.checked })}
                      className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                    <label className="text-sm font-medium dark:text-gray-300">Enable POS System</label>
                 </div>
                 {settings.enablePos && (
                    <>
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-800 transition-colors">
                        POS is active at <a href={`/${slug}/pos`} target="_blank" className="font-bold hover:underline">/{slug}/pos</a>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1 dark:text-gray-300">POS Username</label>
                          <input
                            type="text"
                            className="w-full border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white"
                            value={settings.posUsername}
                            onChange={(e) => setSettings({ ...settings, posUsername: e.target.value })}
                            placeholder="e.g. kasir1"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1 dark:text-gray-300">POS Password</label>
                          <input
                            type="password"
                            className="w-full border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white"
                            value={settings.posPassword}
                            onChange={(e) => setSettings({ ...settings, posPassword: e.target.value })}
                            placeholder="Set new password"
                          />
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Cashier login link: <span className="font-bold">{`/login?callbackUrl=/${slug}/pos`}</span>
                      </div>
                      <div className="space-y-3 pt-2">
                        <div>
                          <label className="block text-sm font-medium mb-1 dark:text-gray-300">POS Payment Methods</label>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Add methods like Credit Card, Debit Card, EDC, or custom business methods.</p>
                          <div className="space-y-2">
                            {settings.posPaymentMethods.length === 0 && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-md px-3 py-2">
                                No custom methods yet. POS will fallback to Cash and enabled gateway methods.
                              </div>
                            )}
                            {settings.posPaymentMethods.map((method) => (
                              <div key={method.id} className="flex items-center justify-between gap-2 border border-[#ccd0d4] dark:border-gray-700 rounded-md px-3 py-2 bg-white dark:bg-gray-800">
                                <div>
                                  <p className="text-sm font-bold text-gray-900 dark:text-white">{method.name}</p>
                                  <p className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">{method.mode}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removePosPaymentMethod(method.id)}
                                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <input
                            type="text"
                            className="md:col-span-2 border border-[#ccd0d4] dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm dark:text-white outline-none focus:border-[#2271b1]"
                            placeholder="e.g. Credit Card"
                            value={newPosMethodName}
                            onChange={(e) => setNewPosMethodName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addPosPaymentMethod()}
                          />
                          <select
                            className="border border-[#ccd0d4] dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm dark:text-white outline-none focus:border-[#2271b1]"
                            value={newPosMethodMode}
                            onChange={(e) => setNewPosMethodMode(e.target.value as PosPaymentMethod["mode"])}
                          >
                            <option value="card">Card</option>
                            <option value="cash">Cash</option>
                            <option value="qris">QRIS</option>
                            <option value="transfer">Transfer</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={addPosPaymentMethod}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#2271b1] text-white text-xs font-bold uppercase tracking-widest hover:bg-[#135e96]"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add POS Method
                        </button>
                      </div>
                    </>
                 )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              <div>
                <h3 className="text-sm font-bold text-[#1d2327] dark:text-white">Integrations</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Connect third-party services.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                {!isEnterprise && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 p-3 rounded-md text-sm mb-4 flex items-center border border-blue-100 dark:border-blue-800 transition-colors">
                        <Lock className="w-4 h-4 mr-2" />
                        Using Platform WhatsApp Config. Upgrade to Enterprise to use your own.
                    </div>
                )}
                {isDemoStore && (
                  <div className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 p-3 rounded-md text-sm mb-4 border dark:border-gray-700 transition-colors">
                    Demo store always uses Platform WhatsApp config.
                  </div>
                )}
                <div className={cn(!canOverridePlatformConfig && "opacity-50 pointer-events-none")}>
                    <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">WhatsApp Token (Meta)</label>
                    <input 
                        type="password" 
                        className="w-full md:w-2/3 border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white" 
                        value={settings.whatsappToken}
                        onChange={(e) => setSettings({ ...settings, whatsappToken: e.target.value })}
                    />
                    </div>
                    <div className="mt-4">
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">WhatsApp Phone Number ID</label>
                    <input 
                        type="text" 
                        className="w-full md:w-2/3 border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white" 
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
                {/* Payments Tab Title Section */}
                <div>
                  <h3 className="text-sm font-bold text-[#1d2327] dark:text-white">Payment Gateways</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Configure automated payment processing.</p>
                </div>
                <div className="md:col-span-2 space-y-6">
                  
                  {/* Manual Transfer - REMOVED */}

                  {/* Midtrans */}
                <div className="border border-[#ccd0d4] dark:border-gray-800 p-4 rounded-lg bg-white dark:bg-gray-800 space-y-4 transition-colors">
                   <div className="flex items-center space-x-2">
                    <input 
                      type="checkbox" 
                      checked={settings.enableMidtrans}
                      onChange={(e) => setSettings({ ...settings, enableMidtrans: e.target.checked })}
                      className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                    <label className="text-sm font-medium dark:text-gray-300">Enable Midtrans</label>
                   </div>
                   {settings.enableMidtrans && (
                     <div className="pl-6 space-y-3">
                       {!isEnterprise && (
                            <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 p-3 rounded-md text-xs mb-3 flex items-center border border-green-100 dark:border-green-800 transition-colors">
                                <Check className="w-4 h-4 mr-2" />
                                <span>Platform Midtrans Keys Active. Upgrade to Enterprise to use your own keys.</span>
                            </div>
                       )}
                       {isDemoStore && (
                          <div className="bg-gray-100 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 p-2 text-xs mb-3 rounded border dark:border-gray-800">
                              Demo store always uses Platform Midtrans keys.
                          </div>
                       )}
                      <div className={cn("space-y-3", !canOverridePlatformConfig && "opacity-75 pointer-events-none")}>
                           <input 
                               type="password" 
                               className="w-full border border-[#ccd0d4] dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-1.5 text-sm dark:text-white outline-none" 
                               placeholder={!canOverridePlatformConfig ? "•••••••••••••••• (Platform Key)" : "Server Key"}
                               value={!canOverridePlatformConfig ? "••••••••••••••••" : settings.paymentGatewaySecret}
                               onChange={(e) => setSettings({ ...settings, paymentGatewaySecret: e.target.value })}
                               readOnly={!canOverridePlatformConfig}
                           />
                           <input 
                               type="text" 
                               className="w-full border border-[#ccd0d4] dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-1.5 text-sm dark:text-white outline-none" 
                               placeholder={!canOverridePlatformConfig ? "•••••••••••••••• (Platform Key)" : "Client Key"}
                               value={!canOverridePlatformConfig ? "••••••••••••••••" : settings.paymentGatewayClientKey}
                               onChange={(e) => setSettings({ ...settings, paymentGatewayClientKey: e.target.value })}
                               readOnly={!canOverridePlatformConfig}
                           />
                      </div>
                     </div>
                   )}
                </div>

                {/* WhatsApp Checkout */}
                <div className="flex items-center space-x-2 border border-[#ccd0d4] dark:border-gray-800 p-4 rounded-lg bg-white dark:bg-gray-800 transition-colors">
                  <input 
                    type="checkbox" 
                    checked={settings.enableWhatsApp}
                    onChange={(e) => setSettings({ ...settings, enableWhatsApp: e.target.checked })}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label className="text-sm font-medium dark:text-gray-300">Enable Checkout via WhatsApp</label>
                </div>

                {isSovereign && (
                  <div className="border border-[#ccd0d4] dark:border-gray-800 p-6 rounded-lg bg-white dark:bg-gray-800 space-y-6 transition-colors shadow-sm">
                    <div className="flex items-center gap-3 border-b dark:border-gray-700 pb-4">
                      <div className="p-2 bg-orange-500/10 rounded-lg text-orange-500">
                        <Sparkles size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#1d2327] dark:text-white uppercase tracking-tight">Sovereign Configurations</h3>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Custom WhatsApp and Gemini API credentials.</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">WhatsApp Token</label>
                          <input 
                            type="password" 
                            className="w-full border border-[#ccd0d4] dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm dark:text-white outline-none focus:border-orange-500 transition-colors rounded" 
                            placeholder="EAAG..."
                            value={settings.whatsappToken}
                            onChange={(e) => setSettings({ ...settings, whatsappToken: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">WhatsApp Phone ID</label>
                          <input 
                            type="text" 
                            className="w-full border border-[#ccd0d4] dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm dark:text-white outline-none focus:border-orange-500 transition-colors rounded" 
                            placeholder="123456789..."
                            value={settings.whatsappPhoneId}
                            onChange={(e) => setSettings({ ...settings, whatsappPhoneId: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Custom Gemini API Key</label>
                        <input 
                          type="password" 
                          className="w-full border border-[#ccd0d4] dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm dark:text-white outline-none focus:border-orange-500 transition-colors rounded" 
                          placeholder="AIzaSy..."
                          value={settings.customGeminiKey}
                          onChange={(e) => setSettings({ ...settings, customGeminiKey: e.target.value })}
                        />
                        <p className="text-[10px] text-gray-500 italic">Your own Google Gemini Pro key for AI chat.</p>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        )}

        {activeTab === "Tax & Fees" && (
           <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b dark:border-gray-800 pb-8">
                 <div>
                   <h3 className="text-sm font-bold text-[#1d2327] dark:text-white">Additional Charges</h3>
                   <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Configure taxes and service charges.</p>
                 </div>
                 <div className="md:col-span-2 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Tax (%)</label>
                            <input 
                                type="text"
                                inputMode="decimal"
                                className="w-full border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white" 
                                value={settings.taxPercent}
                                onChange={(e) => setSettings({ ...settings, taxPercent: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Service Charge (%)</label>
                            <input 
                                type="text"
                                inputMode="decimal"
                                className="w-full border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white" 
                                value={settings.serviceChargePercent}
                                onChange={(e) => setSettings({ ...settings, serviceChargePercent: e.target.value })}
                            />
                        </div>
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b dark:border-gray-800 pb-8">
                 <div>
                   <h3 className="text-sm font-bold text-[#1d2327] dark:text-white">Payment Fees</h3>
                   <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Configure transaction fees.</p>
                 </div>
                 <div className="md:col-span-2 space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1 dark:text-gray-300">Who pays the fees?</label>
                        <select 
                            className="w-full border border-[#ccd0d4] dark:border-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none bg-white dark:bg-gray-800 dark:text-white transition-colors"
                            value={settings.feePaidBy}
                            onChange={(e) => setSettings({ ...settings, feePaidBy: e.target.value })}
                        >
                            <option value="CUSTOMER">Customer (Added to Total)</option>
                            <option value="MERCHANT">Merchant (Deducted from Settlement)</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Payment Fees - Merchant cannot change, only super admin can see/edit */}
                        {isSuperAdmin ? (
                          <>
                            <div>
                                <label className="block text-sm font-medium mb-1 dark:text-gray-300">QRIS Fee (%) - Admin Only</label>
                                <div className="relative">
                                    <input 
                                        type="text"
                                        inputMode="decimal"
                                        className="w-full border border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-900/10 px-3 py-1.5 outline-none dark:text-white rounded" 
                                        value={settings.qrisFeePercent}
                                        onChange={(e) => setSettings({ ...settings, qrisFeePercent: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 dark:text-gray-300">Other Payment Fee (Flat) - Admin Only</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1.5 text-gray-500 dark:text-gray-400 text-sm">Rp</span>
                                    <input 
                                        type="text"
                                        inputMode="decimal"
                                        className="w-full border border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-900/10 pl-8 pr-3 py-1.5 outline-none dark:text-white rounded" 
                                        value={settings.manualTransferFee}
                                        onChange={(e) => setSettings({ ...settings, manualTransferFee: e.target.value })}
                                    />
                                </div>
                            </div>
                          </>
                        ) : (
                          <div className="col-span-2 p-4 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-gray-800">
                             <p className="text-xs text-gray-500 italic">Platform fees are managed by Gercep Administration. If you need a fee adjustment, please contact support.</p>
                          </div>
                        )}
                    </div>
                 </div>
              </div>
           </div>
        )}

        {activeTab === "Shipping" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b dark:border-gray-800 pb-8">
              <div>
                <h3 className="text-sm font-bold text-[#1d2327] dark:text-white">Takeaway and Delivery</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Enable shipping flows after WhatsApp checkout.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.enableTakeawayDelivery}
                    onChange={(e) => setSettings({ ...settings, enableTakeawayDelivery: e.target.checked })}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label className="text-sm font-medium dark:text-gray-300">Enable takeaway delivery flow</label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.shippingEnableJne}
                    onChange={(e) => setSettings({ ...settings, shippingEnableJne: e.target.checked })}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label className="text-sm font-medium dark:text-gray-300">Enable JNE</label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.shippingEnableGosend}
                    onChange={(e) => setSettings({ ...settings, shippingEnableGosend: e.target.checked })}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label className="text-sm font-medium dark:text-gray-300">Enable GoSend</label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.shippingEnableStoreCourier}
                    onChange={(e) => setSettings({ ...settings, shippingEnableStoreCourier: e.target.checked })}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label className="text-sm font-medium dark:text-gray-300">Enable Store Courier (≤100m)</label>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">Store Courier Fee (Flat)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1.5 text-gray-500 dark:text-gray-400 text-sm">Rp</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 pl-8 pr-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white"
                      value={settings.shippingStoreCourierFee}
                      onChange={(e) => setSettings({ ...settings, shippingStoreCourierFee: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              <div>
                <h3 className="text-sm font-bold text-[#1d2327] dark:text-white">Shipping Configuration</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Configure shipping origin for GoSend and JNE.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">Origin Area ID (Optional)</label>
                  <input
                    type="text"
                    className="w-full border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white"
                    value={settings.biteshipOriginAreaId}
                    onChange={(e) => setSettings({ ...settings, biteshipOriginAreaId: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Origin Latitude (Optional)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white"
                      value={settings.biteshipOriginLat}
                      onChange={(e) => setSettings({ ...settings, biteshipOriginLat: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Origin Longitude (Optional)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white"
                      value={settings.biteshipOriginLng}
                      onChange={(e) => setSettings({ ...settings, biteshipOriginLng: e.target.value })}
                    />
                  </div>
                </div>
                <div className="border border-[#ccd0d4] dark:border-gray-800 rounded-md p-3 space-y-3">
                  <h4 className="text-sm font-semibold dark:text-gray-300">Merchant Sender Address</h4>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Sender Name</label>
                    <input
                      type="text"
                      className="w-full border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white"
                      value={settings.shippingSenderName}
                      onChange={(e) => setSettings({ ...settings, shippingSenderName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Sender Phone</label>
                    <input
                      type="text"
                      className="w-full border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white"
                      value={settings.shippingSenderPhone}
                      onChange={(e) => setSettings({ ...settings, shippingSenderPhone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Sender Full Address</label>
                    <textarea
                      className="w-full border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white min-h-20"
                      value={settings.shippingSenderAddress}
                      onChange={(e) => setSettings({ ...settings, shippingSenderAddress: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Sender Postal Code</label>
                    <input
                      type="text"
                      className="w-full border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white"
                      value={settings.shippingSenderPostalCode}
                      onChange={(e) => setSettings({ ...settings, shippingSenderPostalCode: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Integrations" && (
          <div className="space-y-6">
            {!isSovereign && (
              <div className="p-6 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 rounded-[20px] space-y-3">
                <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                  <Lock size={18} />
                  <h4 className="font-bold uppercase tracking-tight text-sm">Sovereign Feature Only</h4>
                </div>
                <p className="text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
                  Integration tools and Product Sync API are exclusive to <strong>Sovereign</strong> members. 
                  Upgrade your plan to start syncing with WooCommerce, Shopify, or internal systems.
                </p>
              </div>
            )}
            <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b dark:border-gray-800 pb-8", !isSovereign && "opacity-50 pointer-events-none")}>
              <div>
                <h3 className="text-sm font-bold text-[#1d2327] dark:text-white">API Access</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Use this key to sync products from your internal systems.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                  <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed font-medium">
                    ⚠️ <strong>Security Notice:</strong> Keep your API Key secret. Do not share it or commit it to public repositories. 
                    This key allows full management of your store products via the API.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium dark:text-gray-300 uppercase tracking-wider text-[10px] font-black text-gray-400">Secret API Key</label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input 
                        type={showApiKey ? "text" : "password"} 
                        readOnly
                        className="w-full border border-[#ccd0d4] dark:border-gray-800 bg-gray-50 dark:bg-black/20 px-3 py-2 font-mono text-sm dark:text-white outline-none rounded shadow-inner" 
                        value={apiKey || "Click generate to create your first key"}
                      />
                      {apiKey && (
                        <button 
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-blue-600 hover:text-blue-700 uppercase"
                        >
                          {showApiKey ? "Hide" : "Show"}
                        </button>
                      )}
                    </div>
                    {apiKey && (
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(apiKey);
                          alert("API Key copied to clipboard");
                        }}
                        className="p-2 border border-[#ccd0d4] dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                        title="Copy to clipboard"
                      >
                        <Copy size={18} className="text-gray-600 dark:text-gray-400" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleGenerateApiKey}
                    disabled={isGeneratingKey}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-[#ccd0d4] dark:border-gray-700 rounded text-xs font-bold uppercase tracking-widest text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm"
                  >
                    {isGeneratingKey ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                    {apiKey ? "Regenerate API Key" : "Generate API Key"}
                  </button>
                </div>

                <div className="pt-6 space-y-2 border-t dark:border-gray-800">
                  <label className="block text-sm font-medium dark:text-gray-300 uppercase tracking-wider text-[10px] font-black text-gray-400">Order Webhook URL</label>
                  <input 
                    type="url" 
                    className="w-full border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm dark:text-white outline-none focus:border-blue-500 transition-colors rounded" 
                    placeholder="https://your-pos-system.com/webhook/orders"
                    value={settings.webhookUrl}
                    onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value })}
                  />
                  <p className="text-[10px] text-gray-500 italic">We will send order data to this URL whenever an order is marked as PAID.</p>
                </div>

                <div className="pt-4 mt-4 border-t dark:border-gray-800">
                  <Link 
                    href="/documentation/api" 
                    target="_blank"
                    className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:underline"
                  >
                    Read API Documentation
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Appearance" && (
           <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                 <div>
                   <h3 className="text-sm font-bold text-[#1d2327] dark:text-white">Theme</h3>
                 </div>
                 <div className="md:col-span-2 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1 dark:text-gray-300">Theme Color</label>
                      <div className="flex items-center space-x-2">
                        <input 
                          type="color" 
                          className="w-8 h-8 p-0 border-0 rounded cursor-pointer"
                          value={settings.themeColor}
                          onChange={(e) => setSettings({ ...settings, themeColor: e.target.value })}
                        />
                        <input 
                          type="text" 
                          className="w-full md:w-1/3 border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 uppercase dark:text-white outline-none focus:border-[#2271b1]" 
                          value={settings.themeColor}
                          onChange={(e) => setSettings({ ...settings, themeColor: e.target.value })}
                        />
                      </div>
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                 <div>
                   <h3 className="text-sm font-bold text-[#1d2327] dark:text-white">Layout</h3>
                 </div>
                 <div className="md:col-span-2 space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1 dark:text-gray-300">POS Grid Columns</label>
                        <select 
                            className="w-full border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white transition-colors"
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

        <div className="pt-6 border-t dark:border-gray-800 flex items-center space-x-4 transition-colors">
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 bg-[#2271b1] text-white font-medium hover:bg-[#135e96] transition-colors rounded shadow-sm flex items-center"
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
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
