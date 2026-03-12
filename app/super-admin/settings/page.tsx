import { getAllStores, getPlatformSettings } from "@/lib/super-admin";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import SuperAdminNav from "../SuperAdminNav";
import SettingsForm from "./SettingsForm";

export default async function SuperAdminSettingsPage() {
  const session = await getServerSession(authOptions);
  const user = (session as any)?.user;
  if (!session || user?.role !== "SUPER_ADMIN") {
    redirect("/login");
  }

  const [stores, settings] = await Promise.all([getAllStores(), getPlatformSettings()]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0F1113] p-8 transition-colors duration-300">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Platform Settings</h1>
            <p className="text-gray-500 dark:text-gray-400">Master configuration used by Pro and default Enterprise.</p>
          </div>
          <SuperAdminNav totalStores={stores.length} />
        </header>

        <div className="bg-white dark:bg-[#1A1D21] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 transition-colors">
          <SettingsForm initialSettings={settings} />
        </div>
      </div>
    </div>
  );
}

