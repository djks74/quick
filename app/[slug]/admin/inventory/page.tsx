"use client";

import { useState, useEffect, use } from "react";
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  AlertTriangle,
  Package,
  Layers,
  ChevronRight,
  ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InventoryItem {
  id: number;
  name: string;
  barcode: string;
  stock: number;
  unit: string;
  minStock: number;
  costPrice: number;
  updatedAt: string;
}

export default function InventoryListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  useEffect(() => {
    fetchItems();
  }, [slug]);

  const fetchItems = async () => {
    try {
      const res = await fetch(`/api/admin/inventory?slug=${slug}`);
      const data = await res.json();
      if (res.ok) setItems(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) || 
    (item.barcode && item.barcode.includes(search))
  );

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      const res = await fetch(`/api/admin/inventory?slug=${slug}&id=${id}`, { method: 'DELETE' });
      if (res.ok) fetchItems();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" />
            Ingredients & Raw Materials
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage your stock levels for kitchen and store operations.</p>
        </div>
        <button 
          onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-all font-bold text-sm shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add New Ingredient
        </button>
      </div>

      {/* Search & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2 relative">
          <input 
            type="text" 
            placeholder="Search by name or barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary/20 transition-all outline-none"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>
        <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center justify-between">
           <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Low Stock</span>
           <span className="text-lg font-black text-red-500">{items.filter(i => i.stock <= i.minStock).length}</span>
        </div>
        <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center justify-between">
           <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Items</span>
           <span className="text-lg font-black text-primary">{items.length}</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#1A1D21] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Item Name</th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Barcode</th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Stock Level</th>
              <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {filteredItems.map(item => (
              <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-bold text-gray-900 dark:text-white">{item.name}</div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Unit: {item.unit}</div>
                </td>
                <td className="px-6 py-4 text-xs font-bold text-gray-400 dark:text-gray-500 tracking-widest uppercase">
                  {item.barcode || "—"}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-sm font-black",
                      item.stock <= item.minStock ? "text-red-500" : "text-gray-900 dark:text-white"
                    )}>
                      {item.stock} {item.unit}
                    </span>
                    {item.stock <= item.minStock && (
                      <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Min: {item.minStock}</div>
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                  <button 
                    onClick={() => { setEditingItem(item); setIsModalOpen(true); }}
                    className="p-2 text-gray-400 hover:text-primary transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(item.id)}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {!loading && filteredItems.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-10" />
                  <p className="text-sm font-bold uppercase tracking-widest">No items found</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1A1D21] w-full max-w-md rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="p-6 border-b border-gray-100 dark:border-gray-800">
               <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                 {editingItem ? 'Edit Ingredient' : 'Add New Ingredient'}
               </h3>
             </div>
             <form onSubmit={async (e) => {
               e.preventDefault();
               const formData = new FormData(e.currentTarget);
               const data = {
                 slug: params.slug,
                 id: editingItem?.id,
                 name: formData.get('name'),
                 barcode: formData.get('barcode'),
                 stock: parseFloat(formData.get('stock') as string),
                 minStock: parseFloat(formData.get('minStock') as string),
                 unit: formData.get('unit'),
                 costPrice: parseFloat(formData.get('costPrice') as string),
               };

               const method = editingItem ? 'PUT' : 'POST';
               const res = await fetch('/api/admin/inventory', {
                 method,
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(data)
               });
               
               if (res.ok) {
                 setIsModalOpen(false);
                 fetchItems();
               }
             }} className="p-6 space-y-4">
               <div>
                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Item Name</label>
                 <input name="name" defaultValue={editingItem?.name} required className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border-none focus:ring-2 focus:ring-primary/20 outline-none" placeholder="e.g. Flour, Sugar, Milk" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Barcode / SKU</label>
                   <input name="barcode" defaultValue={editingItem?.barcode} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border-none focus:ring-2 focus:ring-primary/20 outline-none" placeholder="123456789" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Unit</label>
                   <input name="unit" defaultValue={editingItem?.unit || 'pcs'} required className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border-none focus:ring-2 focus:ring-primary/20 outline-none" placeholder="kg, gr, pcs" />
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Current Stock</label>
                   <input name="stock" type="number" step="0.01" defaultValue={editingItem?.stock || 0} required className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border-none focus:ring-2 focus:ring-primary/20 outline-none" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Min Stock Alert</label>
                   <input name="minStock" type="number" step="0.01" defaultValue={editingItem?.minStock || 5} required className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border-none focus:ring-2 focus:ring-primary/20 outline-none" />
                 </div>
               </div>
               <div className="flex gap-2 pt-4">
                 <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-xl font-bold text-sm">Cancel</button>
                 <button type="submit" className="flex-1 px-4 py-2 bg-primary text-white rounded-xl font-bold text-sm">Save Item</button>
               </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
