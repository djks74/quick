"use client";

import { useState, useRef, useEffect, use } from "react";
import { 
  Search, 
  Scan, 
  RefreshCw, 
  AlertCircle,
  CheckCircle2,
  Package,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  CameraOff
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function IngredientStockManager({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [barcode, setBarcode] = useState("");
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cameraSupported, setCameraSupported] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
    setCameraSupported(typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!isCameraOpen || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    const attach = async () => {
      try {
        await video.play();
        runDetectLoop();
      } catch {
        setCameraError("Unable to start camera preview on this browser.");
      }
    };
    attach();
  }, [isCameraOpen]);

  const lookupIngredient = async (value: string) => {
    if (!value) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    setItem(null);

    try {
      const res = await fetch(`/api/admin/inventory?barcode=${encodeURIComponent(value)}&slug=${slug}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Ingredient not found");

      setItem(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setBarcode("");
      if (inputRef.current) inputRef.current.focus();
    }
  };

  const stopCamera = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    await lookupIngredient(barcode);
  };

  const runDetectLoop = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const loop = async () => {
      if (!videoRef.current || !detectorRef.current || !isCameraOpen) return;
      try {
        const barcodes = await detectorRef.current.detect(videoRef.current);
        if (barcodes?.length) {
          const rawValue = barcodes[0]?.rawValue;
          if (rawValue) {
            stopCamera();
            setBarcode(rawValue);
            await lookupIngredient(rawValue);
            return;
          }
        }
      } catch {
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  const startCamera = async () => {
    try {
      setCameraError(null);
      setError(null);
      if (!cameraSupported) {
        setCameraError("Camera scan is not supported on this browser.");
        return;
      }
      const BarcodeDetectorCtor = (window as any).BarcodeDetector;
      detectorRef.current = new BarcodeDetectorCtor({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"]
      });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }
      });
      streamRef.current = stream;
      setIsCameraOpen(true);
    } catch {
      setCameraError("Unable to access camera. Please allow camera permission.");
      stopCamera();
    }
  };

  const updateStock = async (amount: number) => {
    if (!item) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          amount,
          slug: slug,
          action: "update_stock"
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update stock");

      setItem(data);
      setSuccess(`${amount > 0 ? 'Added' : 'Reduced'} ${Math.abs(amount)} ${data.unit} successfully!`);
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 md:space-y-8 py-4 md:py-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white flex items-center justify-center gap-3">
          <Scan className="w-8 h-8 text-primary" />
          Stock Scanner
        </h2>
        <p className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Scan ingredients to manage raw material stock</p>
      </div>

      <div className="bg-white dark:bg-[#1A1D21] rounded-2xl border border-gray-100 dark:border-gray-800 p-4 md:p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="text-xs font-bold text-gray-600 dark:text-gray-300">
          1. Scan ingredient barcode or type SKU, then press Enter.
        </div>
        <div className="text-xs font-bold text-gray-600 dark:text-gray-300">
          2. Tap Reduce 1 to deduct stock for used ingredient.
        </div>
        <div className="text-xs font-bold text-gray-600 dark:text-gray-300">
          3. Tap Add 1 for restock corrections.
        </div>
      </div>

      <div className="bg-white dark:bg-[#1A1D21] rounded-2xl border border-gray-100 dark:border-gray-800 p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
        <div className="text-xs font-bold text-gray-600 dark:text-gray-300">
          Use physical scanner or phone camera to scan barcode directly.
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={startCamera}
            disabled={!cameraSupported || isCameraOpen || loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 text-primary dark:text-blue-400 font-black text-xs uppercase tracking-widest disabled:opacity-50"
          >
            <Camera className="w-4 h-4" />
            Start Camera
          </button>
          <button
            type="button"
            onClick={stopCamera}
            disabled={!isCameraOpen}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-black text-xs uppercase tracking-widest disabled:opacity-50"
          >
            <CameraOff className="w-4 h-4" />
            Stop
          </button>
        </div>
      </div>

      {isCameraOpen && (
        <div className="bg-black rounded-2xl border border-gray-800 overflow-hidden">
          <video ref={videoRef} className="w-full max-h-[320px] object-cover" muted playsInline autoPlay />
        </div>
      )}

      {cameraError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl border border-red-100 dark:border-red-900/30">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-bold">{cameraError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Scanner Section */}
        <div className="bg-white dark:bg-[#1A1D21] p-8 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl space-y-8">
          <form onSubmit={handleScan} className="space-y-6 text-center">
            <div className="inline-flex items-center justify-center p-4 bg-primary/5 dark:bg-primary/10 rounded-2xl mb-2">
               <Layers className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                Ready to Scan
              </label>
              <div className="relative group">
                <input
                  ref={inputRef}
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/20 rounded-2xl px-12 py-5 text-lg md:text-2xl font-black focus:ring-4 focus:ring-primary/5 transition-all placeholder:text-gray-300 dark:placeholder:text-gray-600 dark:text-white text-center"
                  placeholder="000000000"
                  autoFocus
                />
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-300 group-focus-within:text-primary transition-colors" />
                {loading && (
                  <RefreshCw className="absolute right-5 top-1/2 -translate-y-1/2 w-6 h-6 text-primary animate-spin" />
                )}
              </div>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest px-8">
              Tip: Keep this window focused and use your physical scanner to automatically pull up ingredients.
            </p>
          </form>

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl border border-red-100 dark:border-red-900/30 animate-in fade-in slide-in-from-top-2 duration-200">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-bold">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-2xl border border-green-100 dark:border-green-900/30 animate-in fade-in slide-in-from-top-2 duration-200">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-bold">{success}</p>
            </div>
          )}
        </div>

        {/* Display Section */}
        <div className="min-h-[400px]">
          {item ? (
            <div className="bg-white dark:bg-[#1A1D21] rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl overflow-hidden animate-in fade-in zoom-in duration-300 h-full flex flex-col">
              <div className="p-8 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{item.name}</h3>
                  <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-1">
                    SKU: {item.barcode || "N/A"} • UNIT: {item.unit}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                   <Package className="w-6 h-6 text-primary" />
                </div>
              </div>

              <div className="p-8 flex-1 flex flex-col justify-center space-y-12">
                <div className="text-center space-y-2">
                  <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Current Inventory</p>
                  <div className="flex items-center justify-center gap-3">
                    <p className={cn(
                      "text-7xl font-black",
                      item.stock > item.minStock ? "text-gray-900 dark:text-white" : "text-red-500 animate-pulse"
                    )}>
                      {item.stock}
                    </p>
                    <span className="text-xl font-black text-gray-400 dark:text-gray-500 mt-6">{item.unit}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <button
                    onClick={() => updateStock(-1)}
                    disabled={loading || item.stock <= 0}
                    className="flex flex-col items-center justify-center p-8 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-3xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-all group disabled:opacity-50 border-2 border-transparent active:border-red-200"
                  >
                    <ArrowDownLeft className="w-10 h-10 mb-2 group-active:scale-90 transition-transform" />
                    <span className="text-xs font-black uppercase tracking-widest">Reduce 1</span>
                  </button>
                  <button
                    onClick={() => updateStock(1)}
                    disabled={loading}
                    className="flex flex-col items-center justify-center p-8 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-3xl hover:bg-green-100 dark:hover:bg-green-900/30 transition-all group disabled:opacity-50 border-2 border-transparent active:border-green-200"
                  >
                    <ArrowUpRight className="w-10 h-10 mb-2 group-active:scale-90 transition-transform" />
                    <span className="text-xs font-black uppercase tracking-widest">Add 1</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full bg-gray-50/30 dark:bg-gray-800/20 rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-800 flex flex-col items-center justify-center p-12 text-center text-gray-400 dark:text-gray-600">
              <div className="w-24 h-24 bg-gray-100/50 dark:bg-gray-800/50 rounded-full flex items-center justify-center mb-6">
                 <Package className="w-12 h-12 opacity-10" />
              </div>
              <p className="text-sm font-black uppercase tracking-widest mb-2">No Item Selected</p>
              <p className="text-xs max-w-[250px] font-bold leading-relaxed opacity-60">
                Scan an ingredient's barcode or enter a SKU to view current stock and make adjustments.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
