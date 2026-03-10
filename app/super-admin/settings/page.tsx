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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Platform Settings</h1>
            <p className="text-gray-500">Master configuration used by Pro and default Enterprise.</p>
          </div>
          <SuperAdminNav totalStores={stores.length} />
        </header>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <SettingsForm initialSettings={settings} />
        </div>
      </div>
    </div>
  );
}

