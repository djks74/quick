"use client";

import { useState, useRef, useEffect } from "react";
import { 
  Search, 
  Scan, 
  Plus, 
  Minus, 
  RefreshCw, 
  AlertCircle,
  CheckCircle2,
  Package
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

export default function InventoryPage({ params }: { params: { slug: string } }) {
  const [barcode, setBarcode] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on load and when scanning starts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode) return;

    setLoading(true);
    setError(null);
    setSuccess(null);
    setProduct(null);

    try {
      const res = await fetch(`/api/products/inventory?barcode=${barcode}&slug=${params.slug}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Product not found");

      setProduct(data);
      // Auto-reduce stock if found? Maybe not, let user confirm
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setBarcode("");
      if (inputRef.current) inputRef.current.focus();
    }
  };

  const updateStock = async (amount: number) => {
    if (!product) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/products/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          amount,
          slug: params.slug
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update stock");

      setProduct(data.product);
      setSuccess(`Stock updated successfully! New stock: ${data.product.stock}`);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Scan className="w-6 h-6 text-primary" />
            Inventory Manager
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Scan barcodes to quickly manage your stock levels.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Scanner Input */}
        <div className="bg-white dark:bg-[#1A1D21] p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-6">
          <form onSubmit={handleScan} className="space-y-4">
            <label className="block text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
              Scan Barcode / Enter SKU
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl px-12 py-4 text-xl font-black focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-gray-300 dark:placeholder:text-gray-600 dark:text-white"
                placeholder="Scan now..."
                autoFocus
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-300 dark:text-gray-600" />
              {loading && (
                <RefreshCw className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 text-primary animate-spin" />
              )}
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest text-center">
              Tip: Keep your cursor in the box to use a physical barcode scanner
            </p>
          </form>

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-bold">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-bold">{success}</p>
            </div>
          )}
        </div>

        {/* Product Display & Controls */}
        <div className="min-h-[300px]">
          {product ? (
            <div className="bg-white dark:bg-[#1A1D21] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden animate-in fade-in zoom-in duration-300">
              <div className="p-6 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 overflow-hidden flex-shrink-0">
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">{product.name}</h3>
                  <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                    {product.barcode || "No Barcode"} • {product.category}
                  </p>
                </div>
              </div>

              <div className="p-8 space-y-8">
                <div className="text-center space-y-2">
                  <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Current Stock</p>
                  <p className={cn(
                    "text-6xl font-black",
                    product.stock > 10 ? "text-gray-900 dark:text-white" : "text-red-500 animate-pulse"
                  )}>
                    {product.stock}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => updateStock(-1)}
                    disabled={loading || product.stock <= 0}
                    className="flex flex-col items-center justify-center p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-all group disabled:opacity-50"
                  >
                    <Minus className="w-8 h-8 mb-2 group-active:scale-90 transition-transform" />
                    <span className="text-xs font-black uppercase tracking-widest">Reduce 1</span>
                  </button>
                  <button
                    onClick={() => updateStock(1)}
                    disabled={loading}
                    className="flex flex-col items-center justify-center p-6 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-2xl hover:bg-green-100 dark:hover:bg-green-900/30 transition-all group disabled:opacity-50"
                  >
                    <Plus className="w-8 h-8 mb-2 group-active:scale-90 transition-transform" />
                    <span className="text-xs font-black uppercase tracking-widest">Add 1</span>
                  </button>
                </div>

                <div className="pt-4 flex items-center justify-between text-xs font-bold text-gray-400 dark:text-gray-500 border-t border-gray-50 dark:border-gray-800">
                  <span>Price: {formatCurrency(product.price)}</span>
                  <span>Unit: {product.unit || "pcs"}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full bg-gray-50/50 dark:bg-gray-800/20 rounded-2xl border-2 border-dashed border-gray-100 dark:border-gray-800 flex flex-col items-center justify-center p-8 text-center text-gray-400 dark:text-gray-600">
              <Package className="w-16 h-16 mb-4 opacity-10" />
              <p className="text-sm font-bold uppercase tracking-widest">No product selected</p>
              <p className="text-xs mt-2 max-w-[200px]">Scan a barcode or enter a SKU to view and manage inventory.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
