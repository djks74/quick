"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { samplePages, Page } from "@/data/pages";
import { 
  Search, 
  MoreVertical, 
  Eye, 
  Trash2, 
  ChevronLeft, 
  ChevronRight,
  Plus,
  Edit2,
  FileText,
  Calendar,
  User,
  Globe
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function AdminPages() {
  const searchParams = useSearchParams();
  const action = searchParams.get("action");
  const editId = searchParams.get("edit");
  const [pages, setPages] = useState<Page[]>(samplePages);
  const [searchQuery, setSearchQuery] = useState("");

  const editingPage = editId ? pages.find(p => p.id === editId) : null;

  if (action === "new" || (action === "edit" && editingPage)) {
    const pageToEdit = editingPage || { title: "", content: "", status: "draft" as const };
    
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b pb-4 mb-4">
          <h2 className="text-xl font-medium">{action === "edit" ? "Edit Page" : "Add New Page"}</h2>
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <div>
              <input 
                type="text" 
                className="w-full border border-[#ccd0d4] px-4 py-3 text-xl font-medium focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1] outline-none" 
                placeholder="Add title" 
                defaultValue={pageToEdit.title}
              />
            </div>
            <div>
              <div className="border border-[#ccd0d4] bg-white">
                <div className="flex items-center border-b border-[#ccd0d4] bg-gray-50 px-3 py-2 space-x-2">
                  <button className="px-2 py-1 text-xs font-bold border rounded hover:bg-gray-100">B</button>
                  <button className="px-2 py-1 text-xs italic border rounded hover:bg-gray-100">I</button>
                  <button className="px-2 py-1 text-xs underline border rounded hover:bg-gray-100">U</button>
                  <div className="w-px h-4 bg-gray-300 mx-1"></div>
                  <button className="px-2 py-1 text-xs border rounded hover:bg-gray-100 flex items-center">
                    <Plus className="w-3 h-3 mr-1" /> Add Media
                  </button>
                </div>
                <textarea 
                  className="w-full p-4 h-96 focus:outline-none resize-none" 
                  placeholder="Start writing or type / to choose a block"
                  defaultValue={pageToEdit.content}
                ></textarea>
              </div>
            </div>
          </div>
          
          <div className="w-full lg:w-72 space-y-4">
            <div className="bg-white border border-[#ccd0d4] shadow-sm">
              <div className="px-4 py-2 font-bold text-sm border-b border-[#ccd0d4] bg-gray-50">Publish</div>
              <div className="p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between text-gray-600">
                  <span className="flex items-center"><Globe className="w-3 h-3 mr-1.5" /> Visibility:</span>
                  <span className="font-bold text-[#2271b1]">Public</span>
                </div>
                <div className="flex items-center justify-between text-gray-600">
                  <span className="flex items-center"><Calendar className="w-3 h-3 mr-1.5" /> Publish:</span>
                  <span className="font-bold text-[#2271b1]">Immediately</span>
                </div>
                <div className="pt-3 flex items-center justify-between">
                  <button className="text-red-600 hover:underline">Move to Trash</button>
                  <button 
                    onClick={() => window.location.href = "/admin/pages"}
                    className="px-4 py-1.5 bg-[#2271b1] text-white font-medium hover:bg-[#135e96] transition-colors rounded"
                  >
                    {action === "edit" ? "Update" : "Publish"}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="bg-white border border-[#ccd0d4] shadow-sm">
              <div className="px-4 py-2 font-bold text-sm border-b border-[#ccd0d4] bg-gray-50">Page Attributes</div>
              <div className="p-4 space-y-3 text-xs">
                <div>
                  <label className="block mb-1 text-gray-600">Parent Page</label>
                  <select className="w-full border border-[#ccd0d4] px-2 py-1 outline-none focus:border-[#2271b1]">
                    <option>(no parent)</option>
                    {pages.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-gray-600">Order</label>
                  <input type="number" className="w-full border border-[#ccd0d4] px-2 py-1 outline-none focus:border-[#2271b1]" defaultValue="0" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const filteredPages = pages.filter(page => 
    page.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50 p-3 border border-[#ccd0d4]">
        <div className="flex items-center space-x-2">
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
            placeholder="Search pages..." 
            className="border border-[#ccd0d4] bg-white px-3 py-1 pl-8 text-sm focus:border-[#2271b1] outline-none w-full md:w-64"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1.5" />
        </div>
      </div>

      {/* Pages Table */}
      <div className="border border-[#ccd0d4] overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-white border-b border-[#ccd0d4]">
              <th className="px-4 py-3 font-semibold text-[#1d2327] w-10">
                <input type="checkbox" className="border-[#ccd0d4]" />
              </th>
              <th className="px-4 py-3 font-semibold text-[#1d2327]">Title</th>
              <th className="px-4 py-3 font-semibold text-[#1d2327]">Author</th>
              <th className="px-4 py-3 font-semibold text-[#1d2327]">Date</th>
              <th className="px-4 py-3 font-semibold text-[#1d2327] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPages.length > 0 ? (
              filteredPages.map((page) => (
                <tr key={page.id} className="border-b border-[#f0f0f1] hover:bg-[#f6f7f7] transition-colors group">
                  <td className="px-4 py-4">
                    <input type="checkbox" className="border-[#ccd0d4]" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <Link href={`/admin/pages?action=edit&edit=${page.id}`} className="text-[#2271b1] font-bold hover:text-[#135e96]">
                        {page.title} {page.status === 'draft' && <span className="text-gray-400 font-normal">— Draft</span>}
                      </Link>
                      <div className="flex items-center space-x-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                        <Link href={`/admin/pages?action=edit&edit=${page.id}`} className="text-[#2271b1] hover:text-[#135e96]">Edit</Link>
                        <span className="text-gray-300">|</span>
                        <button className="text-[#2271b1] hover:text-[#135e96]">Quick Edit</button>
                        <span className="text-gray-300">|</span>
                        <button className="text-red-600 hover:text-red-800">Trash</button>
                        <span className="text-gray-300">|</span>
                        <button className="text-[#2271b1] hover:text-[#135e96]">View</button>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-[#2271b1] font-medium">
                    {page.author}
                  </td>
                  <td className="px-4 py-4 text-gray-600">
                    <div className="flex flex-col">
                      <span>{page.status === 'publish' ? 'Published' : 'Last Modified'}</span>
                      <span className="text-xs mt-1">{new Date(page.date).toLocaleDateString()}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link href={`/admin/pages?action=edit&edit=${page.id}`} className="p-1 hover:bg-gray-200 rounded text-gray-600" title="Edit Page">
                        <Edit2 className="w-4 h-4" />
                      </Link>
                      <button className="p-1 hover:bg-gray-200 rounded text-red-600" title="Delete Page">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 italic">
                  No pages found matching your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Simulation */}
      <div className="flex items-center justify-between text-sm text-gray-600 py-2">
        <div>{filteredPages.length} items</div>
        <div className="flex items-center space-x-1">
          <button className="p-1 border border-[#ccd0d4] bg-white text-gray-400 cursor-not-allowed">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-3 py-1 border border-[#ccd0d4] bg-[#f0f0f1] font-medium">1</div>
          <button className="p-1 border border-[#ccd0d4] bg-white hover:bg-[#f6f7f7]">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
