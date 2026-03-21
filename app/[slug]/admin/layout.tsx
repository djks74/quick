import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { getStoreBySlug } from "@/lib/api";
import AdminShell from "./AdminShell";
import { Suspense } from "react";
import AdminSpinner from "./components/AdminSpinner";

export default async function AdminLayout({ children, params }: { children: React.ReactNode, params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [session, store] = await Promise.all([
    getServerSession(authOptions),
    getStoreBySlug(slug)
  ]);

  if (!session) {
    redirect('/login');
  }

  if (!store) notFound();

  // Access Control
  const user = (session as any).user;
  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  
  // Corporate Check: If owner, allow access to any store they own
  const isOwner = store.ownerId === parseInt(user.id);
  
  // Manager Check: If manager, allow access to assigned store
  const isManager = user.role === 'MANAGER' && user.storeId === store.id;

  if (!isSuperAdmin && !isOwner && !isManager) {
    // If user is a cashier for THIS store, redirect to POS
    if (user.role === 'CASHIER' && user.storeId === store.id) {
        redirect(`/${slug}/pos`);
    }
    
    // Default fallback
    redirect('/'); 
  }

  // If store is disabled, only super admin can enter. Merchants see notice.
  if (!store.isActive && !isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0F1113] p-6">
        <div className="max-w-md w-full bg-white dark:bg-[#1A1D21] p-12 rounded-[2.5rem] shadow-xl border border-red-100 dark:border-red-900/20 text-center space-y-6">
          <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-3xl flex items-center justify-center mx-auto">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Store Disabled</h1>
          <p className="text-gray-500 dark:text-gray-400 font-medium">This outlet has been administratively disabled. Please contact your Corporate Admin or Platform Support for more information.</p>
          <a href="/dashboard" className="inline-block px-8 py-4 bg-gray-900 dark:bg-white text-white dark:text-black rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 transition-all shadow-xl">Back to Dashboard</a>
        </div>
      </div>
    );
  }

  return (
    <AdminShell store={store} isSuperAdmin={isSuperAdmin} userRole={user.role}>
      <Suspense fallback={<AdminSpinner label="Loading..." />}>{children}</Suspense>
    </AdminShell>
  );
}
