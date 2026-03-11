import { getStoreBySlug } from "@/lib/api";
import { getStoreLedger } from "@/lib/finance";
import LedgerTable from "../../components/LedgerTable";

export default async function MerchantLedger({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  
  const store = await getStoreBySlug(slug);
  if (!store) return null;
  
  const ledger = await getStoreLedger(store.id);

  return (
    <div className="space-y-8">
      <LedgerTable initialLedger={ledger} />
    </div>
  );
}
