import { getStoreBySlug } from "@/lib/api";
import { getStoreProfitAnalytics } from "@/lib/finance";
import ProfitAnalytics from "../../components/ProfitAnalytics";

export default async function MerchantProfitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return null;

  const analytics = await getStoreProfitAnalytics(store.id);

  return (
    <div className="space-y-8">
      <ProfitAnalytics analytics={analytics} />
    </div>
  );
}
