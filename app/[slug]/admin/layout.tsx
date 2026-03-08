import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { notFound, redirect } from "next/navigation";
import { getStoreBySlug } from "@/lib/api";
import AdminShell from "./AdminShell";

export default async function AdminLayout({ children, params }: { children: React.ReactNode, params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // Fetch store
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  // Access Control
  const isSuperAdmin = session.user.role === 'SUPER_ADMIN';
  const isOwner = session.user.storeSlug === slug;

  if (!isSuperAdmin && !isOwner) {
    // If user has another store, redirect there. Else 403.
    if (session.user.storeSlug) {
        redirect(`/${session.user.storeSlug}/admin`);
    } else {
        redirect('/'); // Or 403 page
    }
  }

  return <AdminShell store={store} isSuperAdmin={isSuperAdmin}>{children}</AdminShell>;
}
