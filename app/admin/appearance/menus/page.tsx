"use client";

import { useState } from "react";
import { 
  Plus, 
  ChevronDown, 
  ChevronRight, 
  GripVertical, 
  Trash2, 
  Search,
  Check,
  Settings,
  MousePointer2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { samplePages } from "@/data/pages";

interface MenuItem {
  id: string;
  label: string;
  type: 'page' | 'custom' | 'category';
  url?: string;
  children?: MenuItem[];
  isOpen?: boolean;
}

export default function AdminMenus() {
  const [activeMenu, setActiveMenu] = useState("Primary Menu");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([
    { id: "1", label: "Home", type: "page", url: "/" },
    { id: "2", label: "Shop", type: "custom", url: "/shop" },
    { 
      id: "3", 
      label: "Products", 
      type: "category", 
      isOpen: true,
      children: [
        { id: "3-1", label: "Tuning Parts", type: "category" },
        { id: "3-2", label: "Custom Tunes", type: "category" },
      ] 
    },
    { id: "4", label: "About Us", type: "page", url: "/about" },
    { id: "5", label: "Contact", type: "page", url: "/contact" },
  ]);

  const toggleItem = (id: string) => {
    setMenuItems(items => items.map(item => {
      if (item.id === id) return { ...item, isOpen: !item.isOpen };
      if (item.children) {
        return {
          ...item,
          children: item.children.map(child => 
            child.id === id ? { ...child, isOpen: !child.isOpen } : child
          )
        };
      }
      return item;
    }));
  };

  const removeItem = (id: string) => {
    setMenuItems(items => items.filter(item => {
      if (item.id === id) return false;
      if (item.children) {
        item.children = item.children.filter(child => child.id !== id);
      }
      return true;
    }));
  };

  return (
    <div className="space-y-6">
      {/* Menu Selector */}
      <div className="flex flex-col md:flex-row md:items-center gap-4 bg-[#f6f7f7] p-4 border border-[#ccd0d4]">
        <label className="text-sm font-medium">Select a menu to edit:</label>
        <div className="flex items-center space-x-2">
          <select 
            className="border border-[#ccd0d4] bg-white px-2 py-1 text-sm focus:border-[#2271b1] outline-none min-w-[200px]"
            value={activeMenu}
            onChange={(e) => setActiveMenu(e.target.value)}
          >
            <option>Primary Menu</option>
            <option>Footer Menu</option>
            <option>Top Bar Menu</option>
          </select>
          <button className="px-3 py-1 border border-[#ccd0d4] bg-white hover:bg-[#f6f7f7] text-sm font-medium">Select</button>
        </div>
        <span className="text-sm text-gray-500">or <button className="text-[#2271b1] hover:underline">create a new menu</button>. Don't forget to save your changes!</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar: Add menu items */}
        <div className="lg:col-span-4 space-y-4">
          <h3 className="font-bold text-sm text-[#1d2327]">Add menu items</h3>
          
          {/* Pages Accordion */}
          <div className="bg-white border border-[#ccd0d4]">
            <button className="w-full flex items-center justify-between px-3 py-2 bg-[#f6f7f7] border-b border-[#ccd0d4] font-bold text-xs">
              Pages <ChevronDown className="w-3 h-3" />
            </button>
            <div className="p-3 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
              {samplePages.map(page => (
                <label key={page.id} className="flex items-center space-x-2 text-sm cursor-pointer hover:text-[#2271b1]">
                  <input type="checkbox" className="border-[#ccd0d4]" />
                  <span>{page.title}</span>
                </label>
              ))}
            </div>
            <div className="p-2 border-t border-[#ccd0d4] bg-[#f6f7f7] flex justify-between">
              <button className="text-[11px] text-[#2271b1] hover:underline">Select All</button>
              <button className="px-3 py-1 border border-[#ccd0d4] bg-white hover:bg-[#f6f7f7] text-xs font-medium rounded shadow-sm">Add to Menu</button>
            </div>
          </div>

          {/* Custom Links Accordion */}
          <div className="bg-white border border-[#ccd0d4]">
            <button className="w-full flex items-center justify-between px-3 py-2 bg-[#f6f7f7] border-b border-[#ccd0d4] font-bold text-xs">
              Custom Links <ChevronDown className="w-3 h-3" />
            </button>
            <div className="p-3 space-y-3">
              <div>
                <label className="block text-xs mb-1 text-gray-600">URL</label>
                <input type="text" className="w-full border border-[#ccd0d4] px-2 py-1 text-sm outline-none focus:border-[#2271b1]" defaultValue="http://" />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">Link Text</label>
                <input type="text" className="w-full border border-[#ccd0d4] px-2 py-1 text-sm outline-none focus:border-[#2271b1]" />
              </div>
              <div className="flex justify-end pt-2 border-t border-[#f0f0f1]">
                <button className="px-3 py-1 border border-[#ccd0d4] bg-white hover:bg-[#f6f7f7] text-xs font-medium rounded shadow-sm">Add to Menu</button>
              </div>
            </div>
          </div>

          {/* Categories Accordion */}
          <div className="bg-white border border-[#ccd0d4]">
            <button className="w-full flex items-center justify-between px-3 py-2 bg-[#f6f7f7] border-b border-[#ccd0d4] font-bold text-xs">
              Categories <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Main: Menu Structure */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-[#ccd0d4] shadow-sm">
            <div className="px-4 py-2 border-b border-[#ccd0d4] bg-[#f6f7f7] flex items-center justify-between">
              <h3 className="font-bold text-sm">Menu structure</h3>
              <button className="px-4 py-1.5 bg-[#2271b1] text-white text-xs font-bold rounded shadow-sm hover:bg-[#135e96] transition-colors">Save Menu</button>
            </div>
            
            <div className="p-6">
              <div className="mb-6">
                <h4 className="font-bold text-sm mb-1">Menu Name</h4>
                <input 
                  type="text" 
                  className="w-full md:w-1/2 border border-[#ccd0d4] px-3 py-1.5 text-sm focus:border-[#2271b1] outline-none" 
                  value={activeMenu}
                  onChange={(e) => setActiveMenu(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-4 italic">Drag each item into the order you prefer. Click the arrow on the right of the item to reveal additional configuration options.</p>
              </div>

              {/* Menu Items List */}
              <div className="space-y-2">
                {menuItems.map((item) => (
                  <div key={item.id} className="space-y-1">
                    <div className="flex items-center group">
                      <div className="flex-1 flex items-center bg-[#f6f7f7] border border-[#ccd0d4] hover:border-[#b1b4b6] cursor-move transition-colors">
                        <div className="p-2 border-r border-[#ccd0d4] text-gray-400 group-hover:text-gray-600">
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <div className="flex-1 px-3 py-2 flex items-center justify-between text-sm">
                          <span className="font-medium">{item.label}</span>
                          <span className="text-xs text-gray-400 italic capitalize">{item.type}</span>
                        </div>
                        <button 
                          onClick={() => toggleItem(item.id)}
                          className="p-2 border-l border-[#ccd0d4] text-gray-400 hover:text-[#2271b1] transition-colors"
                        >
                          {item.isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {item.isOpen && (
                      <div className="ml-[34px] p-4 bg-white border border-[#ccd0d4] border-t-0 space-y-4 shadow-inner text-xs">
                        <div>
                          <label className="block mb-1 text-gray-600">Navigation Label</label>
                          <input type="text" className="w-full border border-[#ccd0d4] px-2 py-1 outline-none focus:border-[#2271b1]" defaultValue={item.label} />
                        </div>
                        {item.url && (
                          <div>
                            <label className="block mb-1 text-gray-600">URL</label>
                            <input type="text" className="w-full border border-[#ccd0d4] px-2 py-1 outline-none focus:border-[#2271b1]" defaultValue={item.url} />
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-2 border-t border-[#f0f0f1]">
                          <button 
                            onClick={() => removeItem(item.id)}
                            className="text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                          <button className="text-[#2271b1] hover:underline">Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* Sub-items simulation */}
                    {item.children?.map(child => (
                      <div key={child.id} className="ml-8 space-y-1">
                        <div className="flex items-center group">
                          <div className="flex-1 flex items-center bg-[#f6f7f7] border border-[#ccd0d4] hover:border-[#b1b4b6] cursor-move transition-colors">
                            <div className="p-2 border-r border-[#ccd0d4] text-gray-400 group-hover:text-gray-600">
                              <GripVertical className="w-4 h-4" />
                            </div>
                            <div className="flex-1 px-3 py-2 flex items-center justify-between text-sm">
                              <span className="font-medium">{child.label}</span>
                              <span className="text-xs text-gray-400 italic">sub item</span>
                            </div>
                            <button className="p-2 border-l border-[#ccd0d4] text-gray-400">
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="px-4 py-3 border-t border-[#ccd0d4] bg-[#f6f7f7] flex items-center justify-between mt-6">
              <button className="text-red-600 hover:underline text-xs">Delete Menu</button>
              <button className="px-4 py-1.5 bg-[#2271b1] text-white text-xs font-bold rounded shadow-sm hover:bg-[#135e96] transition-colors">Save Menu</button>
            </div>
          </div>

          <div className="bg-white border border-[#ccd0d4] shadow-sm p-6">
            <h3 className="font-bold text-sm mb-4">Menu Settings</h3>
            <div className="space-y-4">
              <div className="flex items-start space-x-4 text-xs">
                <span className="w-32 font-medium text-gray-600">Auto add pages</span>
                <label className="flex items-center space-x-2">
                  <input type="checkbox" className="border-[#ccd0d4]" />
                  <span>Automatically add new top-level pages to this menu</span>
                </label>
              </div>
              <div className="flex items-start space-x-4 text-xs">
                <span className="w-32 font-medium text-gray-600">Display location</span>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" className="border-[#ccd0d4]" defaultChecked />
                    <span>Primary Menu</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" className="border-[#ccd0d4]" />
                    <span>Footer Menu</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" className="border-[#ccd0d4]" />
                    <span>Top Bar Menu</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
