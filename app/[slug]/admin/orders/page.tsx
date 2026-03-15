import { getOrders, getStoreBySlug } from "@/lib/api";
import OrdersTable from "../components/OrdersTable";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function AdminOrders({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = (await getServerSession(authOptions)) as any;
  const canForcePaid = session?.user?.role === "SUPER_ADMIN";
  
  const store = await getStoreBySlug(slug);
  if (!store) return null;
  
  const orders = await getOrders(store.id);

  return (
    <div className="space-y-4">
      <OrdersTable initialOrders={orders} slug={slug} canForcePaid={canForcePaid} />
    </div>
  );
}
