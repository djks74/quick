import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import SuperAdminNav from "./SuperAdminNav";
import { getStoreCount } from "@/lib/super-admin";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const user = (session as any)?.user;

  if (!session || user?.role !== "SUPER_ADMIN") {
    redirect("/login");
  }

  // Efficiently get total stores for the nav
  const totalStores = await getStoreCount();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0F1113] p-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Platform Administration</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Manage all merchants and subscriptions.</p>
          </div>
          <div className="flex items-center gap-4">
             <SuperAdminNav totalStores={totalStores} />
          </div>
        </header>
        
        {/* Page Content */}
        {children}
      </div>
    </div>
  );
}
