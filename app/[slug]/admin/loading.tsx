"use client";

import { Loader2 } from "lucide-react";

export default function AdminLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-xs font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">
          Loading admin...
        </p>
      </div>
    </div>
  );
}
