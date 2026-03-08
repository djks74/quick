import { getAllUsers, getAllStores } from "@/lib/super-admin";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import SuperAdminNav from "../SuperAdminNav";
import UserTable from "./UserTable";

export default async function SuperAdminUsersPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user.role !== 'SUPER_ADMIN') {
    redirect('/login');
  }

  const users = await getAllUsers();
  const stores = await getAllStores(); // Just for the counter in Nav

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-500">Manage all registered users and their roles.</p>
          </div>
          <SuperAdminNav totalStores={stores.length} />
        </header>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <UserTable users={users} />
        </div>
      </div>
    </div>
  );
}
