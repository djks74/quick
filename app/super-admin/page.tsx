import { getAllStores, getAllUsers, getPlatformSettings } from "@/lib/super-admin";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import StoreTable from "./StoreTable";
import { authOptions } from "@/lib/auth";
import SuperAdminNav from "./SuperAdminNav";
import CreateMerchantButton from "./CreateMerchantButton";

export default async function SuperAdminPage() {
  const session = await getServerSession(authOptions);
  
  // Protect route
  const user = (session as any)?.user;
  if (!session || user?.role !== 'SUPER_ADMIN') {
    redirect('/login');
  }

  const [stores, users, platformSettings] = await Promise.all([
    getAllStores(200),
    getAllUsers(500),
    getPlatformSettings()
  ]);

  return (
    <div className="bg-white dark:bg-[#1A1D21] rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
        <h2 className="text-lg font-bold dark:text-white">Active Stores</h2>
        <CreateMerchantButton users={users} />
      </div>
      <StoreTable stores={stores} users={users} storeTypes={(platformSettings as any)?.storeTypes || []} />
    </div>
  );
}
