import { getAllStores } from "@/lib/super-admin";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import StoreTable from "./StoreTable";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import SuperAdminNav from "./SuperAdminNav";

export default async function SuperAdminPage() {
  const session = await getServerSession(authOptions);
  
  // Protect route
  if (!session || session.user.role !== 'SUPER_ADMIN') {
    redirect('/login');
  }

  const stores = await getAllStores();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Platform Administration</h1>
            <p className="text-gray-500">Manage all merchants and subscriptions.</p>
          </div>
          <SuperAdminNav totalStores={stores.length} />
        </header>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <StoreTable stores={stores} />
        </div>
      </div>
    </div>
  );
}
