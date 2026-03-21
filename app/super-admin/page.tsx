import { getAllStores, getAllUsers } from "@/lib/super-admin";
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

  const [stores, users] = await Promise.all([
    getAllStores(200),
    getAllUsers(500)
  ]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0F1113] p-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Platform Administration</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Manage all merchants and subscriptions.</p>
          </div>
          <div className="flex items-center gap-4">
            <CreateMerchantButton users={users} />
            <SuperAdminNav totalStores={stores.length} />
          </div>
        </header>

        <div className="bg-white dark:bg-[#1A1D21] rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <StoreTable stores={stores} />
        </div>
      </div>
    </div>
  );
}
