import { 
  getAllWithdrawals, 
  getAllStores 
} from "@/lib/super-admin";
import SuperAdminNav from "../SuperAdminNav";
import { formatCurrency } from "@/lib/utils";
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle
} from "lucide-react";
import WithdrawalTable from "../components/WithdrawalTable";

export default async function SuperAdminWithdrawals() {
  const [withdrawals, stores] = await Promise.all([
    getAllWithdrawals(),
    getAllStores()
  ]);
  
  const totalStores = stores.length;
  const pendingAmount = withdrawals
    .filter(w => w.status === 'PENDING')
    .reduce((acc, curr) => acc + curr.amount, 0);
  
  const completedTodayAmount = withdrawals
    .filter(w => w.status === 'COMPLETED' && new Date(w.updatedAt).toDateString() === new Date().toDateString())
    .reduce((acc, curr) => acc + curr.amount, 0);
  
  const pendingCount = withdrawals.filter(w => w.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Withdrawal Requests</h1>
            <p className="text-gray-500">Manage merchant payouts and bank transfers.</p>
          </div>
          <SuperAdminNav totalStores={totalStores} />
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
           <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                 <Clock className="w-5 h-5 text-orange-500" />
                 <span className="text-sm text-gray-500 font-medium">Pending Payouts</span>
              </div>
              <p className="text-2xl font-bold">
                 {formatCurrency(pendingAmount, "IDR")}
              </p>
           </div>
           <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                 <CheckCircle2 className="w-5 h-5 text-green-500" />
                 <span className="text-sm text-gray-500 font-medium">Completed Today</span>
              </div>
              <p className="text-2xl font-bold text-green-600">
                 {formatCurrency(completedTodayAmount, "IDR")}
              </p>
           </div>
           <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                 <AlertCircle className="w-5 h-5 text-blue-500" />
                 <span className="text-sm text-gray-500 font-medium">Queue Size</span>
              </div>
              <p className="text-2xl font-bold">{pendingCount} Requests</p>
           </div>
        </div>

        <WithdrawalTable initialWithdrawals={withdrawals} />
      </div>
    </div>
  );
}
