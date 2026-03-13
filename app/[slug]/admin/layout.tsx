import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { getStoreBySlug } from "@/lib/api";
import AdminShell from "./AdminShell";

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
  const isOwner = user.storeSlug === slug;

  if (!isSuperAdmin && !isOwner) {
    // If user has another store, redirect there. Else 403.
    if (user.storeSlug) {
        redirect(`/${user.storeSlug}/admin`);
    } else {
        redirect('/'); // Or 403 page
    }
  }

  return <AdminShell store={store} isSuperAdmin={isSuperAdmin}>{children}</AdminShell>;
}
