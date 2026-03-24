"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useAdmin, AdminLayoutStyle } from "@/lib/admin-context";
import { useShop } from "@/context/ShopContext";
import { getStoreSettings, updateStoreSettings, getStoreBySlug, getPosCashierUsername, generateApiKey } from "@/lib/api";
import { Building2, Check, Copy, Loader2, Lock, Plus, RefreshCcw, Sparkles, Trash2, ExternalLink, Globe, HelpCircle, Info } from "lucide-react";
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
  // For SUPER_ADMIN and MERCHANT owners, access is already validated by the server-side AdminLayout.
  // We only do a basic sanity check here to ensure the user is logged in.
  const canAccess = status === "authenticated";

  // Redirect users without session
  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push(`/login?callbackUrl=/${slugValue || ""}/admin/settings`);
      return;
    }
  }, [session, router, status, slugValue]);
  
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
  const isCorporate = subscriptionPlan === "CORPORATE";
  const isDemoStore = slugValue === "demo";
  const canOverridePlatformConfig = (isSovereign || isCorporate) && !isDemoStore;
  const canOverrideWaAndGemini = (isSovereign || isCorporate) && !isDemoStore;
  const [newPosMethodName, setNewPosMethodName] = useState("");
  const [newPosMethodMode, setNewPosMethodMode] = useState<PosPaymentMethod["mode"]>("card");
  
  const [settings, setSettings] = useState({
    storeName: "",
    slug: "",
    name: "",
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
    enableAiChatWidget: true,
    biteshipApiKey: "",
    biteshipOriginAreaId: "",
    biteshipOriginLat: "",
    biteshipOriginLng: "",
    shippingSenderName: "",
    shippingSenderPhone: "",
    shippingSenderAddress: "",
    shippingSenderPostalCode: "",
    customGeminiKey: "",
    webhookUrl: "",
    timezone: "Asia/Jakarta",
    operatingHours: {
      monday: { open: "09:00", close: "21:00", closed: false },
      tuesday: { open: "09:00", close: "21:00", closed: false },
      wednesday: { open: "09:00", close: "21:00", closed: false },
      thursday: { open: "09:00", close: "21:00", closed: false },
      friday: { open: "09:00", close: "21:00", closed: false },
      saturday: { open: "09:00", close: "21:00", closed: false },
      sunday: { open: "09:00", close: "21:00", closed: false },
    } as any
  });

  const [showIntegrationGuide, setShowIntegrationGuide] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);

  const [platformSettings, setPlatformSettings] = useState<any>(null);
  const [facebookAppIdError, setFacebookAppIdError] = useState<string | null>(null);

  // Meta SDK Initialization for Embedded Signup
  useEffect(() => {
    async function initFB() {
      const platRes = await fetch('/api/super-admin/settings').catch(() => null);
      let appIdCandidate = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || "";
      
      if (platRes?.ok) {
        const platData = await platRes.json();
        setPlatformSettings(platData.settings);
        if (platData.settings?.facebookAppId) {
          appIdCandidate = String(platData.settings.facebookAppId);
        }
      }

      const appId = appIdCandidate.trim();
      if (!/^\d{5,30}$/.test(appId)) {
        setFacebookAppIdError("Facebook App ID is missing or invalid. Please update it in Super Admin settings.");
        return;
      }

      setFacebookAppIdError(null);
      const initSdk = () => {
        (window as any).FB.init({
          appId,
          autoLogAppEvents: true,
          xfbml: true,
          version: 'v18.0'
        });
      };

      if (typeof window !== "undefined" && (window as any).FB) {
        initSdk();
        return;
      }

      if (typeof window !== "undefined") {
        (window as any).fbAsyncInit = initSdk;
        const existingScript = document.querySelector('script[src="https://connect.facebook.net/en_US/sdk.js"]');
        if (!existingScript) {
          const script = document.createElement("script");
          script.src = "https://connect.facebook.net/en_US/sdk.js";
          script.async = true;
          script.defer = true;
          script.crossOrigin = "anonymous";
          document.body.appendChild(script);
        }
      }
    }
    initFB();
  }, []);

  const launchWhatsAppSignup = () => {
    if (facebookAppIdError) {
      alert(facebookAppIdError);
      return;
    }
    if (!(window as any).FB) {
      alert("Facebook SDK not loaded. Please ensure a valid Facebook App ID is configured.");
      return;
    }
    
    (window as any).FB.login((response: any) => {
      if (response.authResponse) {
        const accessToken = response.authResponse.accessToken;
        // The access token can be used to fetch the WABA ID and Phone Number ID
        // In a real production app, you would send this to your backend
        alert("Success! Connected to Facebook. Please copy your Token from the Facebook Developer Portal or use the one we just received (logged to console).");
        console.log("Meta Access Token:", accessToken);
        setSettings(prev => ({ ...prev, whatsappToken: accessToken }));
      }
    }, {
      scope: 'whatsapp_business_management,whatsapp_business_messaging',
      extras: {
        feature: 'whatsapp_embedded_signup',
        setup: {
          // Additional setup params can go here
        }
      }
    });
  };

  const [bankAccount, setBankAccount] = useState({
    bankName: "BCA",
    accountNumber: "",
    accountName: ""
  });

  // Reset and Load Data when slug changes
  useEffect(() => {
    async function loadAll() {
      if (!slugValue) return;
      
      setIsDataLoading(true);
      setSaveMessage(null);
      setApiKey(null);
      setShowApiKey(false);

      const store = await getStoreBySlug(slugValue);
      if (!store) {
        setIsDataLoading(false);
        return;
      }

      setStoreId(store.id);
      setSubscriptionPlan(store.subscriptionPlan || "FREE");
      setApiKey(store.apiKey || null);
      if (store.name) setSiteName(store.name);

      const data = await getStoreSettings(store.id);
      if (data) {
        setSettings({
          storeName: data.name || "",
          slug: data.slug || "",
          name: data.name || "",
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
          enableAiChatWidget: (data as any).enableAiChatWidget ?? true,
          webhookUrl: (data as any).webhookUrl || "",
          timezone: (data as any).timezone || "Asia/Jakarta",
          operatingHours: (data as any).operatingHours || {
            monday: { open: "09:00", close: "21:00", closed: false },
            tuesday: { open: "09:00", close: "21:00", closed: false },
            wednesday: { open: "09:00", close: "21:00", closed: false },
            thursday: { open: "09:00", close: "21:00", closed: false },
            friday: { open: "09:00", close: "21:00", closed: false },
            saturday: { open: "09:00", close: "21:00", closed: false },
            sunday: { open: "09:00", close: "21:00", closed: false },
          }
        });
        
        if (data.bankAccount) {
            const bank = data.bankAccount as any;
            setBankAccount({
                bankName: bank.bankName || "BCA",
                accountNumber: bank.accountNumber || "",
                accountName: bank.accountName || ""
            });
        }
      }

      const posUsername = await getPosCashierUsername(store.id);
      setSettings(prev => ({ ...prev, posUsername: posUsername || "" }));
      
      setIsDataLoading(false);
    }
    loadAll();
  }, [slugValue, setSiteName]);

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
        enableAiChatWidget: settings.enableAiChatWidget,
        webhookUrl: settings.webhookUrl,
        operatingHours: settings.operatingHours,
        timezone: settings.timezone
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
                <h3 className="text-sm font-bold text-[#1d2327] dark:text-white">Operating Hours</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Set your weekly schedule and timezone.</p>
              </div>
              <div className="md:col-span-2 space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">Timezone</label>
                  <select 
                    className="w-full md:w-2/3 border border-[#ccd0d4] dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 focus:border-[#2271b1] outline-none dark:text-white"
                    value={settings.timezone}
                    onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                  >
                    <option value="Asia/Jakarta">WIB - Jakarta (UTC+7)</option>
                    <option value="Asia/Makassar">WITA - Makassar (UTC+8)</option>
                    <option value="Asia/Jayapura">WIT - Jayapura (UTC+9)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>

                <div className="space-y-3">
                  {Object.entries(settings.operatingHours).map(([day, schedule]: [string, any]) => (
                    <div key={day} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-800">
                      <div className="w-24 shrink-0">
                        <span className="text-sm font-bold capitalize text-gray-700 dark:text-gray-300">{day}</span>
                      </div>
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            checked={!schedule.closed}
                            onChange={(e) => {
                              const newHours = { ...settings.operatingHours };
                              newHours[day] = { ...newHours[day], closed: !e.target.checked };
                              setSettings({ ...settings, operatingHours: newHours });
                            }}
                            className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                          />
                          <span className="text-xs font-medium dark:text-gray-400">{schedule.closed ? "Closed" : "Open"}</span>
                        </div>
                        {!schedule.closed && (
                          <div className="flex items-center gap-2">
                            <input 
                              type="time" 
                              value={schedule.open}
                              onChange={(e) => {
                                const newHours = { ...settings.operatingHours };
                                newHours[day] = { ...newHours[day], open: e.target.value };
                                setSettings({ ...settings, operatingHours: newHours });
                              }}
                              className="border border-[#ccd0d4] dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs rounded outline-none dark:text-white"
                            />
                            <span className="text-xs text-gray-400">to</span>
                            <input 
                              type="time" 
                              value={schedule.close}
                              onChange={(e) => {
                                const newHours = { ...settings.operatingHours };
                                newHours[day] = { ...newHours[day], close: e.target.value };
                                setSettings({ ...settings, operatingHours: newHours });
                              }}
                              className="border border-[#ccd0d4] dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs rounded outline-none dark:text-white"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
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
                       {!canOverridePlatformConfig && (
                            <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 p-3 rounded-md text-xs mb-3 flex items-center border border-green-100 dark:border-green-800 transition-colors">
                                <Check className="w-4 h-4 mr-2" />
                                <span>Platform Midtrans Keys Active. Upgrade to Sovereign or Corporate to use your own keys.</span>
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
                <h3 className="text-sm font-bold text-[#1d2327] dark:text-white">Delivery</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Enable shipping and driver flows for your store.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.enableTakeawayDelivery}
                    onChange={(e) => setSettings({ ...settings, enableTakeawayDelivery: e.target.checked })}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label className="text-sm font-medium dark:text-gray-300">Enable delivery flow</label>
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
            <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b dark:border-gray-800 pb-8", !canOverridePlatformConfig && "opacity-50 pointer-events-none")}>
              <div>
                <h3 className="text-sm font-bold text-[#1d2327] dark:text-white">WhatsApp & AI Setup</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Configure your own Meta and Gemini credentials.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                {!canOverridePlatformConfig && (
                  <div className="p-6 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 rounded-[20px] space-y-3">
                    <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                      <Lock size={18} />
                      <h4 className="font-bold uppercase tracking-tight text-sm">Sovereign & Corporate Only</h4>
                    </div>
                    <p className="text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
                      Custom WhatsApp numbers and Gemini API Keys are exclusive to <strong>Sovereign</strong> and <strong>Corporate</strong> members. 
                    </p>
                  </div>
                )}

                {canOverridePlatformConfig && (
                  <div className="border border-[#ccd0d4] dark:border-gray-800 p-6 rounded-lg bg-white dark:bg-gray-800 space-y-6 transition-colors shadow-sm">
                    <div className="flex items-center gap-3 border-b dark:border-gray-700 pb-4">
                      <div className={cn(
                        "p-2 rounded-lg",
                        isCorporate ? "bg-purple-500/10 text-purple-500" : "bg-orange-500/10 text-orange-500"
                      )}>
                        {isCorporate ? <Building2 size={20} /> : <Sparkles size={20} />}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-[#1d2327] dark:text-white uppercase tracking-tight">
                          {isCorporate ? "Corporate Configurations" : "Sovereign Configurations"}
                        </h3>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Custom WhatsApp and Gemini API credentials.</p>
                      </div>
                      <button 
                        onClick={() => setShowIntegrationGuide(!showIntegrationGuide)}
                        className="text-gray-400 hover:text-primary transition-colors"
                        title="Help / Documentation"
                      >
                        <HelpCircle size={18} />
                      </button>
                    </div>

                    {showIntegrationGuide && (
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-xs uppercase tracking-widest">
                           <Info size={14} /> Onboarding Guide
                        </div>
                        <ul className="text-[11px] text-blue-600 dark:text-blue-500 space-y-2 leading-relaxed list-disc pl-4">
                           <li><strong>Meta App ID:</strong> Ensure you have a Meta App for your Business.</li>
                           <li><strong>WhatsApp Cloud API:</strong> Go to Meta Business Suite to get your <b>Phone Number ID</b> and <b>WABA ID</b>.</li>
                           <li><strong>Access Token:</strong> Use the <i>Embedded Signup</i> below or generate a permanent token in <b>App Settings &gt; WhatsApp &gt; Configuration</b>.</li>
                           <li><strong>Gemini Key:</strong> Get your free API Key from <a href="https://aistudio.google.com/" target="_blank" className="underline font-bold text-blue-700 hover:underline">Google AI Studio</a>.</li>
                        </ul>
                      </div>
                    )}

                    <div className="p-4 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-gray-800 rounded-xl space-y-4 transition-colors">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div>
                                <h4 className="text-xs font-bold dark:text-gray-200">WhatsApp Onboarding</h4>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400">Connect your business WhatsApp number automatically via Meta.</p>
                            </div>
                            <button 
                                onClick={launchWhatsAppSignup}
                                className="w-full sm:w-auto px-4 py-2 bg-[#1877F2] text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#166fe5] transition-colors shadow-sm"
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                Connect with Facebook
                            </button>
                        </div>
                        {facebookAppIdError && (
                          <p className="text-[11px] text-red-600 dark:text-red-400">{facebookAppIdError}</p>
                        )}
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

                      <div className="flex items-center space-x-2 pt-2">
                        <input 
                          type="checkbox" 
                          id="enableWhatsApp"
                          checked={settings.enableWhatsApp}
                          onChange={(e) => setSettings({ ...settings, enableWhatsApp: e.target.checked })}
                          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                        />
                        <label htmlFor="enableWhatsApp" className="text-sm font-medium dark:text-gray-300 cursor-pointer">
                          Enable Checkout via WhatsApp
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b dark:border-gray-800 pb-8", !canOverridePlatformConfig && "opacity-50 pointer-events-none")}>
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

            <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-6 items-start border-b dark:border-gray-800 pb-8", !canOverridePlatformConfig && "opacity-50 pointer-events-none")}>
              <div>
                <h3 className="text-sm font-bold text-[#1d2327] dark:text-white">AI Chat Widget</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Embed your AI assistant into your own website.</p>
              </div>
              <div className="md:col-span-2 space-y-4">
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
                  <p className="text-xs text-purple-700 dark:text-purple-400 leading-relaxed font-medium">
                    ✨ <strong>White-Label Ready:</strong> Your embedded chat uses your custom theme color and Gemini API Key (if configured).
                  </p>
                </div>

                <div className="flex items-center space-x-2 p-4 bg-white dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 rounded-xl">
                  <input 
                    type="checkbox" 
                    id="enableAiChatWidget"
                    checked={settings.enableAiChatWidget}
                    onChange={(e) => setSettings({ ...settings, enableAiChatWidget: e.target.checked })}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label htmlFor="enableAiChatWidget" className="text-sm font-bold dark:text-gray-300 cursor-pointer">
                    Enable AI Chat Widget
                  </label>
                </div>

                {settings.enableAiChatWidget && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-3">
                      <label className="block text-sm font-medium dark:text-gray-300 uppercase tracking-wider text-[10px] font-black text-gray-400">Embed Code (IFrame)</label>
                      <div className="relative group">
                        <textarea 
                          readOnly
                          className="w-full border border-[#ccd0d4] dark:border-gray-800 bg-gray-50 dark:bg-black/20 px-3 py-3 font-mono text-[10px] dark:text-white outline-none rounded shadow-inner min-h-[100px]" 
                          value={`<iframe src="${typeof window !== 'undefined' ? window.location.origin : 'https://gercep.click'}/embed/chat/${settings.slug}?title=${encodeURIComponent(settings.name)}&color=${(settings.themeColor || '#f97316').replace('#', '')}" width="400" height="600" style="border:none; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.1);"></iframe>`}
                        />
                        <button 
                          onClick={() => {
                            const code = `<iframe src="${window.location.origin}/embed/chat/${settings.slug}?title=${encodeURIComponent(settings.name)}&color=${(settings.themeColor || '#f97316').replace('#', '')}" width="400" height="600" style="border:none; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.1);"></iframe>`;
                            navigator.clipboard.writeText(code);
                            alert("Embed code copied!");
                          }}
                          className="absolute right-2 top-2 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-500 italic">Copy this code and paste it into your website's HTML to display the chat assistant.</p>
                    </div>

                    <div className="pt-4 border-t dark:border-gray-800">
                      <label className="block text-sm font-medium dark:text-gray-300 uppercase tracking-wider text-[10px] font-black text-gray-400 mb-2">Direct Link</label>
                      <div className="flex items-center gap-2">
                          <input 
                            type="text" 
                            readOnly 
                            className="flex-1 border border-[#ccd0d4] dark:border-gray-800 bg-gray-50 dark:bg-black/20 px-3 py-1.5 text-xs dark:text-white outline-none rounded"
                            value={`${typeof window !== 'undefined' ? window.location.origin : 'https://gercep.click'}/embed/chat/${settings.slug}`}
                          />
                          <a 
                            href={`/embed/chat/${settings.slug}`} 
                            target="_blank" 
                            className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            title="Preview"
                          >
                            <ExternalLink size={14} />
                          </a>
                      </div>
                    </div>
                  </div>
                )}
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
