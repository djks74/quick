"use client";

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer, Plus, Trash2, ExternalLink, Globe, Save, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getTables, createTable, deleteTable, getStoreBySlug, updateStoreDomain } from "@/lib/api";

export default function AdminTables() {
  const { slug } = useParams();
  const [storeId, setStoreId] = useState<number | null>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [customDomain, setCustomDomain] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  
  // Add Table State
  const [isAdding, setIsAdding] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newTableIdentifier, setNewTableIdentifier] = useState("");

  // Domain State
  const [isSavingDomain, setIsSavingDomain] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!slug) return;
      const store = await getStoreBySlug(slug as string);
      if (store) {
        setStoreId(store.id);
        setCustomDomain(store.customDomain || "");
        const fetchedTables = await getTables(store.id);
        setTables(fetchedTables);
      }
      setIsLoading(false);
    }
    loadData();
  }, [slug]);

  const handleAddTable = async () => {
    if (!storeId) {
      alert("Store ID not found. Please reload.");
      return;
    }
    if (!newTableName || !newTableIdentifier) {
      alert("Please fill in all fields.");
      return;
    }

    setIsAdding(true);
    try {
      console.log("Creating table...", { storeId, newTableName, newTableIdentifier });
      const table = await createTable(storeId, newTableName, newTableIdentifier);
      console.log("Create result:", table);
      
      if (table) {
        setTables([...tables, table]);
        setNewTableName("");
        setNewTableIdentifier("");
        alert("Table added successfully!");
      } else {
        alert("Failed to create table. Please check if identifier already exists or try again.");
      }
    } catch (err) {
      console.error("Error in handleAddTable:", err);
      alert("An error occurred.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveTable = async (id: number) => {
    if (confirm("Delete this table?")) {
      const success = await deleteTable(id);
      if (success) {
        setTables(tables.filter(t => t.id !== id));
      }
    }
  };

  const handleSaveDomain = async () => {
    if (!storeId) return;
    setIsSavingDomain(true);
    await updateStoreDomain(storeId, customDomain);
    setIsSavingDomain(false);
    alert("Domain updated!");
  };

  // Compute Base URL
  const getQrUrl = (identifier: string) => {
    let origin = (customDomain || (typeof window !== 'undefined' ? window.location.origin : '')).trim();
    
    // Ensure protocol exists
    if (origin && !origin.startsWith("http://") && !origin.startsWith("https://")) {
      origin = "https://" + origin;
    }
    
    const cleanOrigin = origin.replace(/\/$/, "");
    return `${cleanOrigin}/${slug}?table=${encodeURIComponent(identifier)}`;
  };

  if (isLoading) return <div className="p-8 text-center">Loading tables...</div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Table Management</h2>
          <p className="text-sm text-gray-500">Manage tables and QR codes.</p>
        </div>
      </div>

      {/* Domain Configuration */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center">
          <Globe className="w-4 h-4 mr-2" />
          QR Code Base URL
        </h3>
        <div className="flex gap-4">
          <input 
            type="text" 
            placeholder="https://your-app.ngrok-free.app" 
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary"
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
          />
          <button 
            onClick={handleSaveDomain}
            disabled={isSavingDomain}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-black transition-colors disabled:opacity-50 flex items-center"
          >
            {isSavingDomain ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Set a custom domain (e.g., ngrok URL) to make QR codes scannable from other devices. 
          Leave empty to use current browser origin.
        </p>
      </div>

      {/* Add Table Form */}
      <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Add New Table</h3>
        <div className="flex flex-col md:flex-row gap-4">
          <input 
            type="text" 
            placeholder="Table Name (e.g. VIP 1)" 
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm"
            value={newTableName}
            onChange={(e) => setNewTableName(e.target.value)}
          />
          <input 
            type="text" 
            placeholder="Identifier (e.g. 1, vip-1)" 
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm"
            value={newTableIdentifier}
            onChange={(e) => setNewTableIdentifier(e.target.value)}
          />
          <button 
            onClick={handleAddTable}
            disabled={isAdding || !newTableName || !newTableIdentifier}
            className="bg-primary text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center whitespace-nowrap"
          >
            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Add Table
          </button>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {tables.map((table) => {
          const qrUrl = getQrUrl(table.identifier);
          return (
            <div key={table.id} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center text-center group hover:border-primary/30 transition-all">
              <div className="mb-4 bg-white p-2 rounded-lg shadow-sm border border-gray-100">
                <QRCodeSVG 
                  value={qrUrl} 
                  size={150}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">{table.name}</h3>
              <p className="text-xs text-gray-400 mb-4 break-all px-2">{qrUrl}</p>
              
              <div className="flex space-x-2 w-full">
                <Link 
                  href={qrUrl}
                  target="_blank"
                  className="flex-1 py-2 text-xs font-bold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center"
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Test
                </Link>
                <button 
                  onClick={() => window.print()} 
                  className="flex-1 py-2 text-xs font-bold text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center"
                >
                  <Printer className="w-3 h-3 mr-1" />
                  Print
                </button>
                <button 
                  onClick={() => handleRemoveTable(table.id)}
                  className="p-2 text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      
      {tables.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-500">No tables found. Add a table to generate QR codes.</p>
        </div>
      )}
    </div>
  );
}
