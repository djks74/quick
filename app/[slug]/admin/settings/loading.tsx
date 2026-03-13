"use client";

import { Loader2 } from "lucide-react";

export default function AdminSettingsLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm font-bold uppercase tracking-widest">Loading settings...</span>
      </div>
    </div>
  );
}
