import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="relative">
        <Loader2 className="w-12 h-12 text-primary animate-spin opacity-20" />
        <Loader2 className="w-12 h-12 text-primary animate-spin absolute inset-0 [animation-duration:1.5s]" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <h2 className="text-sm font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 animate-pulse">
          Loading Dashboard
        </h2>
        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-tight">
          Please wait a moment...
        </p>
      </div>
    </div>
  );
}

