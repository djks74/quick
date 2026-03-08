"use client";

import { useState } from "react";
import { 
  Search, 
  Grid, 
  List, 
  Plus, 
  Trash2, 
  Filter,
  Image as ImageIcon,
  File,
  Video,
  Music,
  MoreVertical,
  ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaItem {
  id: string;
  url: string;
  name: string;
  type: 'image' | 'video' | 'pdf';
  size: string;
  date: string;
}

const sampleMedia: MediaItem[] = [
  { id: "1", url: "https://images.unsplash.com/photo-1555215695-3004980ad54e?q=80&w=2070&auto=format&fit=crop", name: "bmw-b58-engine.jpg", type: "image", size: "1.2 MB", date: "2024-03-01" },
  { id: "2", url: "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?q=80&w=2070&auto=format&fit=crop", name: "m4-competition.jpg", type: "image", size: "2.4 MB", date: "2024-03-02" },
  { id: "3", url: "https://images.unsplash.com/photo-1603386329225-868f9b1ee6c9?q=80&w=2069&auto=format&fit=crop", name: "exhaust-system.jpg", type: "image", size: "850 KB", date: "2024-03-03" },
  { id: "4", url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?q=80&w=1974&auto=format&fit=crop", name: "turbo-charger.jpg", type: "image", size: "1.5 MB", date: "2024-03-04" },
];

export default function AdminMedia() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(sampleMedia);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredMedia = mediaItems.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50 p-3 border border-[#ccd0d4]">
        <div className="flex items-center space-x-2">
          <div className="flex border border-[#ccd0d4] rounded bg-white">
            <button 
              onClick={() => setViewMode('grid')}
              className={cn("p-1.5", viewMode === 'grid' ? "bg-gray-100" : "hover:bg-gray-50")}
            >
              <Grid className="w-4 h-4 text-gray-600" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn("p-1.5 border-l border-[#ccd0d4]", viewMode === 'list' ? "bg-gray-100" : "hover:bg-gray-50")}
            >
              <List className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          <select className="border border-[#ccd0d4] bg-white px-2 py-1 text-sm focus:border-[#2271b1] outline-none">
            <option>All media items</option>
            <option>Images</option>
            <option>Videos</option>
            <option>Documents</option>
          </select>
          <select className="border border-[#ccd0d4] bg-white px-2 py-1 text-sm focus:border-[#2271b1] outline-none">
            <option>All dates</option>
            <option>March 2024</option>
            <option>February 2024</option>
          </select>
          <button className="px-3 py-1 border border-[#ccd0d4] bg-white hover:bg-[#f6f7f7] text-sm font-medium">Filter</button>
        </div>
        <div className="relative">
          <input 
            type="text" 
            placeholder="Search media..." 
            className="border border-[#ccd0d4] bg-white px-3 py-1 pl-8 text-sm focus:border-[#2271b1] outline-none w-full md:w-64"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1.5" />
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="aspect-square border-2 border-dashed border-[#ccd0d4] flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors group">
            <Plus className="w-8 h-8 text-gray-400 group-hover:text-[#2271b1]" />
            <span className="text-xs text-gray-500 mt-2">Add New</span>
          </div>
          {filteredMedia.map((item) => (
            <div key={item.id} className="aspect-square bg-gray-100 border border-[#ccd0d4] relative group overflow-hidden cursor-pointer">
              {item.type === 'image' ? (
                <img src={item.url} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <File className="w-12 h-12" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                <button className="p-2 bg-white rounded-full hover:bg-gray-100 text-[#2271b1]"><ImageIcon className="w-4 h-4" /></button>
                <button className="p-2 bg-white rounded-full hover:bg-gray-100 text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-[#ccd0d4] overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-white border-b border-[#ccd0d4]">
                <th className="px-4 py-3 font-semibold text-[#1d2327] w-10">
                  <input type="checkbox" className="border-[#ccd0d4]" />
                </th>
                <th className="px-4 py-3 font-semibold text-[#1d2327]">File</th>
                <th className="px-4 py-3 font-semibold text-[#1d2327]">Author</th>
                <th className="px-4 py-3 font-semibold text-[#1d2327]">Uploaded to</th>
                <th className="px-4 py-3 font-semibold text-[#1d2327]">Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredMedia.map((item) => (
                <tr key={item.id} className="border-b border-[#f0f0f1] hover:bg-[#f6f7f7] transition-colors group">
                  <td className="px-4 py-4">
                    <input type="checkbox" className="border-[#ccd0d4]" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-gray-100 border border-[#ccd0d4] mr-3 overflow-hidden">
                        {item.type === 'image' && <img src={item.url} className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-[#2271b1] hover:text-[#135e96] cursor-pointer">{item.name}</span>
                        <div className="flex items-center space-x-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                          <button className="text-[#2271b1] hover:text-[#135e96]">Edit</button>
                          <span className="text-gray-300">|</span>
                          <button className="text-red-600 hover:text-red-800">Delete Permanently</button>
                          <span className="text-gray-300">|</span>
                          <button className="text-[#2271b1] hover:text-[#135e96]">View</button>
                          <span className="text-gray-300">|</span>
                          <button className="text-[#2271b1] hover:text-[#135e96]">Copy URL</button>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-[#2271b1] font-medium">admin</td>
                  <td className="px-4 py-4 text-[#2271b1] hover:underline cursor-pointer italic text-xs">(Unattached)</td>
                  <td className="px-4 py-4 text-gray-600">{item.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
