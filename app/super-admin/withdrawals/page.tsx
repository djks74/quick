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
    getAllWithdrawals(200),
    getAllStores(200)
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
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white dark:bg-[#1A1D21] p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 transition-colors">
            <div className="flex items-center gap-3 mb-2">
               <Clock className="w-5 h-5 text-orange-500" />
               <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Pending Payouts</span>
            </div>
            <p className="text-2xl font-bold dark:text-white">
               {formatCurrency(pendingAmount, "IDR")}
            </p>
         </div>
         <div className="bg-white dark:bg-[#1A1D21] p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 transition-colors">
            <div className="flex items-center gap-3 mb-2">
               <CheckCircle2 className="w-5 h-5 text-green-500" />
               <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Completed Today</span>
            </div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
               {formatCurrency(completedTodayAmount, "IDR")}
            </p>
         </div>
         <div className="bg-white dark:bg-[#1A1D21] p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 transition-colors">
            <div className="flex items-center gap-3 mb-2">
               <AlertCircle className="w-5 h-5 text-blue-500" />
               <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Queue Size</span>
            </div>
            <p className="text-2xl font-bold dark:text-white">{pendingCount} Requests</p>
         </div>
      </div>

      <div className="bg-white dark:bg-[#1A1D21] rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800">
           <h2 className="text-lg font-bold dark:text-white">Recent Payout Requests</h2>
        </div>
        <WithdrawalTable initialWithdrawals={withdrawals} />
      </div>
    </div>
  );
}
