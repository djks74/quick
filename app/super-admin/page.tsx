import { getAllStores } from "@/lib/super-admin";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import StoreTable from "./StoreTable";
import { authOptions } from "@/lib/auth";
import SuperAdminNav from "./SuperAdminNav";

export default async function SuperAdminPage() {
  const session = await getServerSession(authOptions);
  
  // Protect route
  const user = (session as any)?.user;
  if (!session || user?.role !== 'SUPER_ADMIN') {
    redirect('/login');
  }

  const stores = await getAllStores();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0F1113] p-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Platform Administration</h1>
            <p className="text-gray-500 dark:text-gray-400">Manage all merchants and subscriptions.</p>
          </div>
          <SuperAdminNav totalStores={stores.length} />
        </header>

        <div className="bg-white dark:bg-[#1A1D21] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <StoreTable stores={stores} />
        </div>
      </div>
    </div>
  );
}
