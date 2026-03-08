"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Image as ImageIcon
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import ProductForm from "./ProductForm";
import CategoryForm from "./CategoryForm";
import { getProducts, getCategories, createProduct, updateProduct, deleteProduct, createCategory, updateCategory, deleteCategory, getStoreBySlug } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function AdminProducts() {
  const { slug } = useParams();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState("products");
  const [storeId, setStoreId] = useState<number | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (searchParams.get('view') === 'categories') {
      setActiveTab('categories');
    }
  }, [searchParams]);

  useEffect(() => {
    async function loadData() {
      if (!slug) return;
      
      // Get store first if we don't have ID yet
      let currentStoreId = storeId;
      if (!currentStoreId) {
        const store = await getStoreBySlug(slug as string);
        if (store) {
          setStoreId(store.id);
          currentStoreId = store.id;
        }
      }

      if (currentStoreId) {
        const [p, c] = await Promise.all([getProducts(currentStoreId), getCategories(currentStoreId)]);
        setProducts(p);
        setCategories(c);
      }
    }
    loadData();
  }, [slug, storeId]);

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
           <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
              <button 
                onClick={() => setActiveTab('products')} 
                className={cn(
                  "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                  activeTab === 'products' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                )}
              >
                Products
              </button>
              <button 
                onClick={() => setActiveTab('categories')} 
                className={cn(
                  "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                  activeTab === 'categories' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                )}
              >
                Categories
              </button>
           </div>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button 
            onClick={handleAddCategory}
            className="bg-secondary/10 hover:bg-secondary/20 text-secondary px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200 font-bold text-sm uppercase tracking-wider border border-secondary/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Category</span>
          </button>
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
                type="text"
                placeholder="Search products..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
            />
            </div>

            {/* Products Table */}
            <div className="overflow-x-auto border border-gray-100 rounded-xl">
                <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Product</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Category</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Price</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-200">
                            {product.image ? (
                                <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                            ) : (
                                <ImageIcon className="w-5 h-5 text-gray-300" />
                            )}
                            </div>
                            <div>
                            <div className="font-bold text-gray-900 text-sm">{product.name}</div>
                            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">ID: #{product.id}</div>
                            </div>
                        </div>
                        </td>
                        <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-100 text-blue-800">
                            {product.category.replace("-", " ")}
                        </span>
                        </td>
                        <td className="px-6 py-4 font-black text-gray-900 text-sm">
                        {formatCurrency(product.price, "IDR")}
                        </td>
                        <td className="px-6 py-4 text-right">
                        <div className="flex justify-end space-x-2">
                            <button 
                            onClick={() => handleEdit(product)}
                            className="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                            >
                            <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                            onClick={() => handleDelete(product.id)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            >
                            <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
        </>
      )}

      {activeTab === 'categories' && (
        <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full text-left border-collapse">
            <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Name</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Slug</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Products</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Subcategories</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
                {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900 text-sm">
                        {cat.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                        {cat.slug}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 font-bold">
                        {cat.count}
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                            {cat.subCategories && cat.subCategories.length > 0 ? (
                                cat.subCategories.map((sub: any, idx: number) => (
                                    <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 border border-gray-200">
                                        {sub.name}
                                    </span>
                                ))
                            ) : (
                                <span className="text-gray-400 text-xs italic">None</span>
                            )}
                        </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-2">
                        <button 
                        onClick={() => handleEditCategory(cat)}
                        className="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                        >
                        <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                        onClick={() => handleDeleteCategory(parseInt(cat.id))}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                        <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
      )}

      {/* Product Form Modal */}
      {isFormOpen && (
        <ProductForm 
          product={editingProduct} 
          categories={categories}
          onClose={() => setIsFormOpen(false)}
          onSave={async (updatedProduct: any) => {
            if (!storeId) return;
            let savedProduct;
            if (editingProduct) {
              savedProduct = await updateProduct(editingProduct.id, updatedProduct);
              if (savedProduct) {
                setProducts(products.map(p => p.id === savedProduct.id ? savedProduct : p));
              }
            } else {
              savedProduct = await createProduct(storeId, updatedProduct);
              if (savedProduct) {
                setProducts([...products, savedProduct]);
              }
            }
            // Reload to ensure we have the latest data
            const freshProducts = await getProducts(storeId);
            setProducts(freshProducts);
            setIsFormOpen(false);
          }}
        />
      )}

      {/* Category Form Modal */}
      {isCategoryFormOpen && (
        <CategoryForm 
          category={editingCategory}
          onClose={() => setIsCategoryFormOpen(false)}
          onSave={async (newCategory: any) => {
            if (!storeId) return;
            let saved;
            if (editingCategory) {
                saved = await updateCategory(parseInt(editingCategory.id), newCategory);
            } else {
                saved = await createCategory(storeId, newCategory);
            }
            
            if (saved) {
              // Reload categories
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
