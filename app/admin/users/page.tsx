"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { 
  Search, 
  User, 
  Trash2, 
  Edit2, 
  Shield, 
  Mail, 
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface AdminUser {
  id: string;
  username: string;
  name: string;
  email: string;
  role: 'Administrator' | 'Editor' | 'Author' | 'Contributor' | 'Subscriber';
  posts: number;
}

const sampleUsers: AdminUser[] = [
  { id: "1", username: "admin", name: "LCP Admin", email: "admin@lcp.com", role: "Administrator", posts: 42 },
  { id: "2", username: "editor1", name: "Jane Smith", email: "jane@lcp.com", role: "Editor", posts: 15 },
  { id: "3", username: "budi", name: "Budi Santoso", email: "budi@gmail.com", role: "Subscriber", posts: 0 },
];

export default function AdminUsers() {
  const searchParams = useSearchParams();
  const action = searchParams.get("action");
  const [users, setUsers] = useState<AdminUser[]>(sampleUsers);
  const [searchQuery, setSearchQuery] = useState("");

  if (action === "new") {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-medium border-b pb-4 mb-4">Add New User</h2>
        <div className="max-w-2xl space-y-4">
          <p className="text-sm text-gray-500 italic mb-6">Create a brand new user and add them to this site.</p>
          <div className="grid grid-cols-3 items-center">
            <label className="text-sm font-bold">Username (required)</label>
            <div className="col-span-2">
              <input type="text" className="w-full border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-3 items-center">
            <label className="text-sm font-bold">Email (required)</label>
            <div className="col-span-2">
              <input type="email" className="w-full border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-3 items-center">
            <label className="text-sm">First Name</label>
            <div className="col-span-2">
              <input type="text" className="w-full border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-3 items-center">
            <label className="text-sm">Last Name</label>
            <div className="col-span-2">
              <input type="text" className="w-full border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-3 items-center">
            <label className="text-sm">Role</label>
            <div className="col-span-2">
              <select className="w-full border border-[#ccd0d4] px-3 py-1.5 focus:border-[#2271b1] outline-none bg-white">
                <option value="Subscriber">Subscriber</option>
                <option value="Contributor">Contributor</option>
                <option value="Author">Author</option>
                <option value="Editor">Editor</option>
                <option value="Administrator">Administrator</option>
              </select>
            </div>
          </div>
          <div className="pt-6">
            <button className="px-6 py-2 bg-[#2271b1] text-white font-medium hover:bg-[#135e96] transition-colors rounded shadow-sm">
              Add New User
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50 p-3 border border-[#ccd0d4]">
        <div className="flex items-center space-x-2">
          <select className="border border-[#ccd0d4] bg-white px-2 py-1 text-sm focus:border-[#2271b1] outline-none">
            <option>Change role to...</option>
            <option>Administrator</option>
            <option>Editor</option>
            <option>Author</option>
            <option>Contributor</option>
            <option>Subscriber</option>
          </select>
          <button className="px-3 py-1 border border-[#ccd0d4] bg-white hover:bg-[#f6f7f7] text-sm font-medium">Change</button>
        </div>
        <div className="relative">
          <input 
            type="text" 
            placeholder="Search users..." 
            className="border border-[#ccd0d4] bg-white px-3 py-1 pl-8 text-sm focus:border-[#2271b1] outline-none w-full md:w-64"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1.5" />
        </div>
      </div>

      <div className="border border-[#ccd0d4] overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-white border-b border-[#ccd0d4]">
              <th className="px-4 py-3 font-semibold text-[#1d2327] w-10">
                <input type="checkbox" className="border-[#ccd0d4]" />
              </th>
              <th className="px-4 py-3 font-semibold text-[#1d2327]">Username</th>
              <th className="px-4 py-3 font-semibold text-[#1d2327]">Name</th>
              <th className="px-4 py-3 font-semibold text-[#1d2327]">Email</th>
              <th className="px-4 py-3 font-semibold text-[#1d2327]">Role</th>
              <th className="px-4 py-3 font-semibold text-[#1d2327]">Posts</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} className="border-b border-[#f0f0f1] hover:bg-[#f6f7f7] transition-colors group">
                <td className="px-4 py-4">
                  <input type="checkbox" className="border-[#ccd0d4]" />
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-gray-200 rounded mr-2 flex items-center justify-center text-gray-500 font-bold">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <Link href={`/admin/users/${user.id}`} className="text-[#2271b1] font-bold hover:text-[#135e96]">
                        {user.username}
                      </Link>
                    </div>
                    <div className="flex items-center space-x-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs ml-10">
                      <Link href={`/admin/users/${user.id}`} className="text-[#2271b1] hover:text-[#135e96]">Edit</Link>
                      <span className="text-gray-300">|</span>
                      <button className="text-red-600 hover:text-red-800">Delete</button>
                      <span className="text-gray-300">|</span>
                      <button className="text-[#2271b1] hover:text-[#135e96]">View</button>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-gray-600">{user.name}</td>
                <td className="px-4 py-4 text-[#2271b1] hover:underline cursor-pointer">{user.email}</td>
                <td className="px-4 py-4 text-gray-600">{user.role}</td>
                <td className="px-4 py-4 text-[#2271b1] font-medium">{user.posts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
