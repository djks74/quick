import { getStoreBySlug } from "@/lib/api";
import { getStoreProfitAnalytics } from "@/lib/finance";
import ProfitAnalytics from "../../components/ProfitAnalytics";
import { Suspense } from "react";
import AdminSpinner from "../../components/AdminSpinner";

export default async function MerchantProfitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <AdminSpinner label="Loading analytics..." />
        }
      >
        <ProfitAnalyticsContent slug={slug} />
      </Suspense>
    </div>
  );
}

async function ProfitAnalyticsContent({ slug }: { slug: string }) {
  const store = await getStoreBySlug(slug);
  if (!store) return null;

  const analytics = await getStoreProfitAnalytics(store.id);

  return <ProfitAnalytics analytics={analytics} />;
}
