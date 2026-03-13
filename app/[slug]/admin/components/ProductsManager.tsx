"use client";

import { useState, useEffect } from "react";
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Copy,
  Image as ImageIcon
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import ProductForm from "@/app/[slug]/admin/products/ProductForm";
import CategoryForm from "@/app/[slug]/admin/products/CategoryForm";
import { getProducts, getCategories, createProduct, updateProduct, deleteProduct, createCategory, updateCategory, deleteCategory } from "@/lib/api";
import { cn } from "@/lib/utils";

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

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
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

  const handleAdd = () => {
    setEditingProduct(null);
    setIsFormOpen(true);
  };

  const handleAddCategory = () => {
    setEditingCategory(null);
    setIsCategoryFormOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
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

        <div className="flex gap-2 w-full sm:w-auto">
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
            <div className="relative w-full sm:w-96 mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
            <input 
                type="text"
                placeholder="Search products..."
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all dark:text-white dark:placeholder:text-gray-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
            />
            </div>

            {/* Products Table */}
            <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-xl">
                <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
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
                    {filteredProducts.map((product) => {
                        const productCost = product.ingredients?.reduce((total: number, ing: any) => {
                            const inventoryItem = inventoryItems.find(i => i.id === ing.inventoryItemId);
                            return total + (inventoryItem ? inventoryItem.costPrice * ing.quantity : 0);
                        }, 0) || 0;
                        const margin = product.price > 0 ? ((product.price - productCost) / product.price) * 100 : 0;

                        return (
                        <tr key={product.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                            <td className="px-6 py-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-200 dark:border-gray-700">
                                {product.image ? (
                                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
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
