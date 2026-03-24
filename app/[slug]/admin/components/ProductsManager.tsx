"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Copy,
  Image as ImageIcon,
  RefreshCcw
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import ProductForm from "@/app/[slug]/admin/products/ProductForm";
import CategoryForm from "@/app/[slug]/admin/products/CategoryForm";
import { getProducts, getCategories, createProduct, updateProduct, deleteProduct, resetAllProductsForStore, createCategory, updateCategory, deleteCategory } from "@/lib/api";
import { cn } from "@/lib/utils";

type IngredientUOM = "gram" | "kg" | "pcs";

const normalizeUOM = (value?: string): IngredientUOM => {
  const v = (value || "").toLowerCase();
  if (v === "gram" || v === "gr" || v === "g") return "gram";
  if (v === "kg" || v === "kilogram") return "kg";
  return "pcs";
};

const toBaseQuantity = (quantity: number, quantityUnit: IngredientUOM, baseUnit: IngredientUOM, conversionFactor: number) => {
  const gramsPerPcs = Math.max(0.000001, Number.isFinite(conversionFactor) ? conversionFactor : 1);
  const qty = Number.isFinite(quantity) ? quantity : 0;
  const grams = quantityUnit === "gram" ? qty : quantityUnit === "kg" ? qty * 1000 : qty * gramsPerPcs;
  const baseQty = baseUnit === "gram" ? grams : baseUnit === "kg" ? grams / 1000 : grams / gramsPerPcs;
  return Number(baseQty.toFixed(6));
};

export default function ProductsManager({ 
  initialProducts, 
  initialCategories, 
  inventoryItems = [],
  storeId, 
  isSuperAdmin 
}: { 
  initialProducts: any[], 
  initialCategories: any[], 
  inventoryItems?: any[],
  storeId: number,
  isSuperAdmin: boolean
}) {
  const [activeTab, setActiveTab] = useState("products");
  const [products, setProducts] = useState(initialProducts);
  const [categories, setCategories] = useState(initialCategories);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const totalProductsCount = products.length;
  const activeProductsCount = products.filter(p => p.category !== "_ARCHIVED_").length;
  const categoriesCount = categories.length;

  const lastSync = products.reduce((latest, p) => {
    const date = new Date(p.updatedAt).getTime();
    return date > latest ? date : latest;
  }, 0);

  const filteredProducts = useMemo(
    () =>
      products.filter((p) => {
        // Hide System products (like Tagihan Manual)
        if (p.category === "System") return false;

        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.category || "").toLowerCase().includes(q)
        );
      }),
    [products, searchQuery]
  );

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedProducts = useMemo(
    () => filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredProducts, currentPage, pageSize]
  );

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this product?")) {
      const success = await deleteProduct(id);
      if (success) {
        setProducts(products.filter(p => p.id !== id));
      }
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (confirm("Are you sure you want to delete this category? All products in this category will be uncategorized.")) {
      const success = await deleteCategory(id);
      if (success) {
        setCategories(categories.filter(c => c.id !== id.toString()));
      }
    }
  };

  const handleDuplicate = async (product: any) => {
    if (!confirm(`Duplicate "${product.name}"?`)) return;
    
    const { id, createdAt, updatedAt, ...productData } = product;
    const newProduct = {
        ...productData,
        name: `${product.name} (Copy)`,
    };
    
    if (newProduct.variations && Array.isArray(newProduct.variations)) {
        newProduct.variations = newProduct.variations.map((v: any) => {
            const { id, ...vData } = v;
            return vData;
        });
    }

    const created = await createProduct(storeId, newProduct);
    if (created) {
        const freshProducts = await getProducts(storeId);
        setProducts(freshProducts);
    }
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setIsFormOpen(true);
  };

  const handleEditCategory = (category: any) => {
    setEditingCategory(category);
    setIsCategoryFormOpen(true);
  };

  const toggleSelectAll = () => {
    if (selectedProductIds.length === paginatedProducts.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(paginatedProducts.map(p => p.id));
    }
  };

  const toggleSelectProduct = (id: number) => {
    setSelectedProductIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedProductIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedProductIds.length} selected products?`)) return;

    setIsDeletingBulk(true);
    try {
      const results = await Promise.all(selectedProductIds.map(id => deleteProduct(id)));
      const successCount = results.filter(ok => ok).length;
      
      if (successCount > 0) {
        const processedIds = selectedProductIds.filter((_, index) => results[index]);
        
        setProducts(prev => prev.filter(p => !processedIds.includes(p.id)));
        setSelectedProductIds(prev => prev.filter(id => !processedIds.includes(id)));
      }
      
      if (successCount < selectedProductIds.length) {
        alert(`Successfully processed ${successCount} products. ${selectedProductIds.length - successCount} products could not be deleted.`);
      }
    } catch (err) {
      console.error("[BULK_DELETE_ERROR]", err);
      alert("An error occurred during bulk deletion. Please refresh and try again.");
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const handleAdd = () => {
    setEditingProduct(null);
    setIsFormOpen(true);
  };

  const handleAddCategory = () => {
    setEditingCategory(null);
    setIsCategoryFormOpen(true);
  };

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      const [freshProducts, freshCategories] = await Promise.all([
        getProducts(storeId, undefined, 5000, 0),
        getCategories(storeId)
      ]);
      setProducts(freshProducts);
      setCategories(freshCategories);
      setSelectedProductIds([]);
      setPage(1);
    } catch (err) {
      console.error("[REFRESH_ERROR]", err);
      alert("Failed to refresh data. Please reload the page.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const resetAllProducts = async () => {
    if (!confirm("Reset all products for this store? This will archive all current products so you can re-sync from WCFM.")) return;
    const res = await resetAllProductsForStore(storeId);
    if (!res?.success) {
      alert("Failed to reset products. Please try again.");
      return;
    }
    await refreshData();
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#1A1D21] p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Total Products</p>
          <h3 className="text-xl font-black text-gray-900 dark:text-white">{totalProductsCount}</h3>
        </div>
        <div className="bg-white dark:bg-[#1A1D21] p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Active Menu</p>
          <h3 className="text-xl font-black text-green-600 dark:text-green-400">{activeProductsCount}</h3>
        </div>
        <div className="bg-white dark:bg-[#1A1D21] p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Categories</p>
          <h3 className="text-xl font-black text-blue-600 dark:text-blue-400">{categoriesCount}</h3>
        </div>
        <div className="bg-white dark:bg-[#1A1D21] p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Out of Stock</p>
          <h3 className="text-xl font-black text-red-600 dark:text-red-400">{products.filter(p => p.stock <= 0).length}</h3>
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-4">
             {/* Tabs */}
             <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                <button 
                  onClick={() => setActiveTab('products')} 
                  className={cn(
                    "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                    activeTab === 'products' 
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                  )}
                >
                  Products
                </button>
                <button 
                  onClick={() => setActiveTab('categories')} 
                  className={cn(
                    "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                    activeTab === 'categories' 
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                  )}
                >
                  Categories
                </button>
             </div>
           </div>
           {lastSync > 0 && (
             <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-tight bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-800">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Last Sync: {new Date(lastSync).toLocaleString('id-ID', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
             </div>
           )}
         </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={refreshData}
            disabled={isRefreshing}
            className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200 font-bold text-sm uppercase tracking-wider border border-gray-200 dark:border-gray-700 disabled:opacity-50"
          >
            <RefreshCcw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={resetAllProducts}
            className="bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200 font-bold text-sm uppercase tracking-wider border border-red-100 dark:border-red-900/20"
          >
            <Trash2 className="w-4 h-4" />
            <span>Reset Products</span>
          </button>
          {isSuperAdmin && (
            <button 
                onClick={handleAddCategory}
                className="bg-secondary/10 dark:bg-secondary/20 hover:bg-secondary/20 dark:hover:bg-secondary/30 text-secondary px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200 font-bold text-sm uppercase tracking-wider border border-secondary/20 dark:border-secondary/30"
            >
                <Plus className="w-4 h-4" />
                <span>Add Category</span>
            </button>
          )}
          {activeTab === 'products' && (
            <button 
                onClick={handleAdd}
                className="bg-primary hover:bg-orange-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200 font-bold text-sm uppercase tracking-wider shadow-lg shadow-primary/20"
            >
                <Plus className="w-4 h-4" />
                <span>Add Product</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'products' && (
        <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div className="relative w-full sm:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input 
                    type="text"
                    placeholder="Search products..."
                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all dark:text-white dark:placeholder:text-gray-500"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {selectedProductIds.length > 0 && (
                <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/10 px-4 py-2 rounded-lg border border-red-100 dark:border-red-900/20 animate-in fade-in slide-in-from-top-2">
                  <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-widest">
                    {selectedProductIds.length} Selected
                  </span>
                  <button
                    onClick={handleBulkDelete}
                    disabled={isDeletingBulk}
                    className="flex items-center gap-1.5 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                  >
                    {isDeletingBulk ? <div className="w-3 h-3 border-2 border-white/30 border-t-white animate-spin rounded-full" /> : <Trash2 size={12} />}
                    Delete All
                  </button>
                  <button
                    onClick={() => setSelectedProductIds([])}
                    className="text-[10px] font-black text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Products Table */}
            <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-xl">
                <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                    <th className="px-6 py-4 w-10">
                      <input 
                        type="checkbox"
                        className="rounded border-gray-300 dark:border-gray-700 text-primary focus:ring-primary cursor-pointer"
                        checked={paginatedProducts.length > 0 && selectedProductIds.length === paginatedProducts.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Product</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Barcode</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Category</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center">Cost</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center">Margin</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right">Price</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {paginatedProducts.map((product) => {
                        const productCost = product.ingredients?.reduce((total: number, ing: any) => {
                            const inventoryItem = inventoryItems.find(i => i.id === ing.inventoryItemId);
                            if (!inventoryItem) return total;
                            const baseUnit = normalizeUOM(ing.baseUnit || inventoryItem.unit);
                            const quantityUnit = normalizeUOM(ing.quantityUnit || baseUnit);
                            const conversionFactor = Math.max(0.000001, Number(ing.conversionFactor) || 1);
                            const baseQuantity = toBaseQuantity(Number(ing.quantity) || 0, quantityUnit, baseUnit, conversionFactor);
                            return total + (inventoryItem.costPrice * baseQuantity);
                        }, 0) || 0;
                        const margin = product.price > 0 ? ((product.price - productCost) / product.price) * 100 : 0;

                        return (
                        <tr key={product.id} className={cn(
                          "hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors",
                          selectedProductIds.includes(product.id) && "bg-blue-50/50 dark:bg-blue-900/10"
                        )}>
                            <td className="px-6 py-4">
                              <input 
                                type="checkbox"
                                className="rounded border-gray-300 dark:border-gray-700 text-primary focus:ring-primary cursor-pointer"
                                checked={selectedProductIds.includes(product.id)}
                                onChange={() => toggleSelectProduct(product.id)}
                              />
                            </td>
                            <td className="px-6 py-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-200 dark:border-gray-700 relative">
                                {product.image ? (
                                    <Image 
                                      src={product.image} 
                                      alt={product.name} 
                                      fill
                                      className="object-cover"
                                      unoptimized
                                    />
                                ) : (
                                    <ImageIcon className="w-5 h-5 text-gray-300 dark:text-gray-600" />
                                )}
                                </div>
                                <div>
                                <div className="font-bold text-gray-900 dark:text-white text-sm">{product.name}</div>
                                <div className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">ID: #{product.id}</div>
                                </div>
                            </div>
                            </td>
                            <td className="px-6 py-4 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                                {product.barcode || "-"}
                            </td>
                            <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400">
                                {product.category?.replace("-", " ") || "Uncategorized"}
                            </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                            <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-0.5">Total Cost</span>
                            <span className="text-xs font-bold text-primary">{formatCurrency(productCost, "IDR")}</span>
                            </td>
                            <td className="px-6 py-4 text-center">
                            <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest",
                                margin > 30 ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                                margin > 10 ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400" :
                                "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                            )}>
                                {margin.toFixed(0)}% Margin
                            </span>
                            </td>
                            <td className="px-6 py-4 text-right font-black text-gray-900 dark:text-white text-sm">
                            {formatCurrency(product.price, "IDR")}
                            </td>
                            <td className="px-6 py-4 text-right">
                        <div className="flex justify-end space-x-2">
                            <button 
                            onClick={() => handleDuplicate(product)}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                            title="Duplicate"
                            >
                            <Copy className="w-4 h-4" />
                            </button>
                            <button 
                            onClick={() => handleEdit(product)}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-orange-400 hover:bg-primary/10 dark:hover:bg-orange-400/10 rounded-lg transition-all"
                            >
                            <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                            onClick={() => handleDelete(product.id)}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                            >
                            <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                        </td>
                    </tr>
                    );
                    })}
                </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-4 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-4">
                <span>
                  Showing{" "}
                  <span className="font-bold">
                    {filteredProducts.length === 0
                      ? 0
                      : (currentPage - 1) * pageSize + 1}
                    {"–"}
                    {Math.min(currentPage * pageSize, filteredProducts.length)}
                  </span>{" "}
                  of <span className="font-bold">{filteredProducts.length}</span>{" "}
                  products
                </span>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Show:</span>
                  <select 
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-[11px] font-bold outline-none focus:border-primary transition-colors"
                  >
                    {[10, 20, 50, 100].map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed bg-white dark:bg-gray-900 text-[11px] font-bold uppercase tracking-widest"
                >
                  Prev
                </button>
                <span className="text-[11px] font-bold uppercase tracking-widest">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed bg-white dark:bg-gray-900 text-[11px] font-bold uppercase tracking-widest"
                >
                  Next
                </button>
              </div>
            </div>
        </>
      )}

      {activeTab === 'categories' && (
        <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-xl">
            <table className="w-full text-left border-collapse">
            <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Name</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Slug</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Products</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900 dark:text-white text-sm">
                        {cat.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {cat.slug}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-200 font-bold">
                        {cat.count || 0}
                    </td>
                    <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-2">
                        <button 
                        onClick={() => handleEditCategory(cat)}
                        className="p-2 text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-orange-400 hover:bg-primary/10 dark:hover:bg-orange-400/10 rounded-lg transition-all"
                        >
                        <Edit2 className="w-4 h-4" />
                        </button>
                        {isSuperAdmin && (
                            <button 
                            onClick={() => handleDeleteCategory(parseInt(cat.id))}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                            >
                            <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
      )}

      {isFormOpen && (
        <ProductForm 
          product={editingProduct} 
          categories={categories}
          inventoryItems={inventoryItems}
          onClose={() => setIsFormOpen(false)}
          onSave={async (updatedProduct: any) => {
            let savedProduct;
            try {
                if (editingProduct) {
                    savedProduct = await updateProduct(editingProduct.id, updatedProduct);
                } else {
                    savedProduct = await createProduct(storeId, updatedProduct);
                }
                const freshProducts = await getProducts(storeId);
                setProducts(freshProducts);
                setIsFormOpen(false);
            } catch (err) {
                console.error(err);
                alert("Failed to save product.");
            }
          }}
        />
      )}

      {isCategoryFormOpen && (
        <CategoryForm 
          category={editingCategory}
          onClose={() => setIsCategoryFormOpen(false)}
          onSave={async (newCategory: any) => {
            let saved;
            if (editingCategory) {
                saved = await updateCategory(parseInt(editingCategory.id), newCategory);
            } else {
                saved = await createCategory(storeId, newCategory);
            }
            if (saved) {
              const freshCategories = await getCategories(storeId);
              setCategories(freshCategories);
            }
            setIsCategoryFormOpen(false);
          }}
        />
      )}
    </div>
  );
}
