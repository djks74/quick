"use client";

import { useCurrency } from "@/context/CurrencyContext";
import { useState } from "react";
import { Product } from "@/lib/types";

interface ProductGridProps {
  products: Product[];
  title?: string;
}

export default function ProductGrid({ products, title = "Latest Products" }: ProductGridProps) {
  const { formatPrice, loading } = useCurrency();
  const [processingId, setProcessingId] = useState<number | null>(null);

  const getPriceDisplay = (product: Product) => {
    if (product.type === "variable" && product.variations && product.variations.length > 0) {
      const prices = product.variations.map(v => v.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      
      if (minPrice === maxPrice) {
        return formatPrice(minPrice);
      }
      return `${formatPrice(minPrice)} – ${formatPrice(maxPrice)}`;
    }
    return formatPrice(product.price);
  };

  const handleBuyNow = (product: Product) => {
    setProcessingId(product.id);
    // Redirect to cart immediately as requested by user
    window.location.href = "/cart";
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <section className="py-16 bg-background-shade">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold mb-8 text-center text-text">{title}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.map((product) => (
            <div key={product.id} className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col group border border-gray-100">
              <div className="h-64 bg-gray-100 flex items-center justify-center relative overflow-hidden">
                 <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors duration-300"></div>
                 {product.image ? (
                   /* eslint-disable-next-line @next/next/no-img-element */
                   <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                 ) : (
                   <span className="text-gray-400 font-medium">No Image</span>
                 )}
                 {product.type === "variable" && (
                   <div className="absolute top-4 right-4 bg-primary/90 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest">
                     Variable
                   </div>
                 )}
              </div>
              <div className="p-6 flex-grow flex flex-col">
                <div className="text-[10px] text-primary font-bold uppercase tracking-widest mb-1">
                  {product.category.replace("-", " ")}
                </div>
                <h3 className="text-lg font-bold mb-2 text-gray-900 line-clamp-2 group-hover:text-primary transition-colors">
                  {product.name}
                </h3>
                <div className="flex items-center mb-4">
                    <div className="flex text-yellow-400 text-sm">
                        {[...Array(5)].map((_, i) => (
                            <span key={i} className="mr-0.5">{i < product.rating ? "★" : "☆"}</span>
                        ))}
                    </div>
                </div>
                <p className="text-primary font-black mb-6 text-xl">
                  {getPriceDisplay(product)}
                </p>
                <div className="mt-auto grid grid-cols-2 gap-3">
                    <button className="bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold py-3 px-4 rounded-lg transition-all uppercase text-[10px] tracking-widest border border-gray-200">
                      Options
                    </button>
                    <button 
                      onClick={() => handleBuyNow(product)}
                      disabled={processingId === product.id}
                      className="bg-primary hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-lg transition-all uppercase text-[10px] tracking-widest disabled:opacity-50 shadow-lg shadow-primary/20"
                    >
                      {processingId === product.id ? "..." : "Buy Now"}
                    </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
