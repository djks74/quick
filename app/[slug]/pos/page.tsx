import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";
import PosClient from "./PosClient";

export const metadata = {
  title: "POS System | Quick",
  description: "Point of Sale System",
};

export default async function PosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect(`/login?callbackUrl=/${slug}/pos`);
  }

  await ensureStoreSettingsSchema();

  // Fetch Store
  const store = await prisma.store.findUnique({
    where: { slug },
    include: { 
        categories: true,
        owner: true 
    }
  });

  if (!store) {
    notFound();
  }

  // Check Permissions
  const user = (session as any).user;
  const isOwner = store.ownerId === parseInt(user.id);
  const isSuperAdmin = user.role === "SUPER_ADMIN";
  
  // Check if user is a cashier for this store
  // We need to fetch the user again to be sure about the workedAtId relationship if not in session
  const dbUser = await prisma.user.findUnique({
    where: { id: parseInt(user.id) },
    select: { workedAtId: true, role: true }
  });

  const isCashier = dbUser?.role === "CASHIER" && dbUser?.workedAtId === store.id;

  // Check Subscription - PRO, ENTERPRISE, and SOVEREIGN can access POS. FREE cannot.
  if (store.subscriptionPlan === 'FREE' && !isSuperAdmin) {
    redirect(`/${slug}/admin`);
  }

  if (!isOwner && !isSuperAdmin && !isCashier) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-6">You do not have permission to access the POS for this store.</p>
          <a href={`/${slug}`} className="text-blue-600 hover:underline">Return to Store</a>
        </div>
      </div>
    );
  }

  // Check if POS is enabled
  if (!store.posEnabled && !isSuperAdmin) { // Super Admin can always access for debugging
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md text-center">
          <h1 className="text-2xl font-bold text-yellow-600 mb-4">POS Disabled</h1>
          <p className="text-gray-600 mb-6">The Point of Sale system is currently disabled for this store.</p>
          {isOwner && (
            <a href={`/${slug}/admin/settings`} className="block w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
              Enable in Settings
            </a>
          )}
          <a href={`/${slug}`} className="block mt-4 text-blue-600 hover:underline">Return to Store</a>
        </div>
      </div>
    );
  }

  // Fetch Products
  const products = await prisma.product.findMany({
    where: { storeId: store.id },
    orderBy: { name: 'asc' }
  });

  // Serialize data for client component
  const serializedProducts = products.map(p => ({
    id: p.id,
    name: p.name,
    price: p.price,
    image: p.image,
    category: p.category || 'uncategorized',
    stock: p.stock
  }));

  const serializedCategories = (store.categories || []).map(c => ({
    id: c.id.toString(),
    name: c.name,
    slug: c.slug
  }));

  return (
    <PosClient 
      store={{
        id: store.id,
        name: store.name,
        slug: store.slug,
        enableManualTransfer: store.enableManualTransfer,
        enableMidtrans: store.enableMidtrans,
        bankAccount: store.bankAccount,
        taxPercent: store.taxPercent,
        serviceChargePercent: store.serviceChargePercent,
        qrisFeePercent: store.qrisFeePercent,
        manualTransferFee: store.manualTransferFee,
        feePaidBy: store.feePaidBy,
        posGridColumns: store.posGridColumns,
        posPaymentMethods: store.posPaymentMethods
      }}
      products={serializedProducts}
      categories={serializedCategories}
      user={{
        name: user.name,
        email: user.email,
        role: dbUser?.role || user.role
      }}
    />
  );
}
