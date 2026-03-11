import { getStoreBySlug } from "@/lib/api";
import { getStoreWithdrawals } from "@/lib/finance";
import WithdrawalRequestForm from "../../components/WithdrawalRequestForm";

export default async function MerchantWithdrawals({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  
  const store = await getStoreBySlug(slug);
  if (!store) return null;
  
  const withdrawals = await getStoreWithdrawals(store.id);

  return (
    <div className="space-y-8">
      <WithdrawalRequestForm 
        initialStore={store} 
        initialWithdrawals={withdrawals} 
        slug={slug} 
      />
    </div>
  );
}
