import { getProducts, getCategories, getStoreBySlug, getInventoryItems } from "@/lib/api";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ProductsManager from "@/app/[slug]/admin/components/ProductsManager";
import { redirect } from "next/navigation";

export default async function AdminProducts({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = (await getServerSession(authOptions)) as any;
  const isSuperAdmin = session?.user?.role === 'SUPER_ADMIN';
  
  const store = await getStoreBySlug(slug);
  if (!store) return null;

  if (store.subscriptionPlan === 'FREE' && !isSuperAdmin) {
    redirect(`/${slug}/admin`);
  }
  
  const [products, categories, inventoryItems] = await Promise.all([
    getProducts(store.id),
    getCategories(store.id),
    getInventoryItems(store.id)
  ]);

  return (
    <div className="space-y-6">
      <ProductsManager 
        initialProducts={products} 
        initialCategories={categories} 
        inventoryItems={inventoryItems}
        storeId={store.id} 
        isSuperAdmin={isSuperAdmin} 
      />
    </div>
  );
}
