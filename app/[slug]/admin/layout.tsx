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

  return (
    <AdminShell store={store} isSuperAdmin={isSuperAdmin} userRole={user.role}>
      <Suspense fallback={<AdminSpinner label="Loading..." />}>{children}</Suspense>
    </AdminShell>
  );
}
