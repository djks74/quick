import { getAllUsers, getAllStores } from "@/lib/super-admin";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import SuperAdminNav from "../SuperAdminNav";
import UserTable from "./UserTable";

export default async function SuperAdminUsersPage() {
  const session = await getServerSession(authOptions);
  
  const user = (session as any)?.user;
  if (!session || user?.role !== 'SUPER_ADMIN') {
    redirect('/login');
  }

  const users = await getAllUsers(200);
  const stores = await getAllStores(200);

  return (
    <div className="bg-white dark:bg-[#1A1D21] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden transition-colors">
      <UserTable users={users} allStores={stores} />
    </div>
  );
}
