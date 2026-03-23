import { getAllStores, getPlatformSettings } from "@/lib/super-admin";
import { getGlobalWaUsage } from "@/lib/wa-credit";
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

  const [stores, settings, globalWaUsage] = await Promise.all([
    getAllStores(200), 
    getPlatformSettings(),
    getGlobalWaUsage()
  ]);

  return (
    <div className="bg-white dark:bg-[#1A1D21] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 transition-colors">
      <SettingsForm initialSettings={settings} waUsage={globalWaUsage} />
    </div>
  );
}

