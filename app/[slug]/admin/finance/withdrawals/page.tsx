import { getStoreBySlug } from "@/lib/api";
import { getStoreAvailableBalance, getStoreWithdrawals } from "@/lib/finance";
import WithdrawalRequestForm from "../../components/WithdrawalRequestForm";

export default async function MerchantWithdrawals({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  
  const store = await getStoreBySlug(slug);
  if (!store) return null;
  
  const [availableBalance, withdrawals] = await Promise.all([
    getStoreAvailableBalance(store.id),
    getStoreWithdrawals(store.id)
  ]);

  return (
    <div className="space-y-8">
      <WithdrawalRequestForm 
        initialStore={{ ...store, balance: availableBalance }} 
        initialWithdrawals={withdrawals} 
        slug={slug} 
      />
    </div>
  );
}
