import { getOrders, getStoreBySlug } from "@/lib/api";
import OrdersTable from "../components/OrdersTable";

export default async function AdminOrders({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  
  const store = await getStoreBySlug(slug);
  if (!store) return null;
  
  const orders = await getOrders(store.id);

  return (
    <div className="space-y-4">
      <OrdersTable initialOrders={orders} slug={slug} />
    </div>
  );
}
