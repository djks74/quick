"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit, Trash2, Key } from "lucide-react";

export default function UserTable({ users }: { users: any[] }) {
  const [editingUser, setEditingUser] = useState<any>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
          <tr>
            <th className="px-6 py-3">Name</th>
            <th className="px-6 py-3">Email</th>
            <th className="px-6 py-3">Role</th>
            <th className="px-6 py-3">Stores</th>
            <th className="px-6 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="bg-white border-b hover:bg-gray-50">
              <td className="px-6 py-4 font-medium text-gray-900">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-600 font-bold">
                    {user.name.charAt(0)}
                  </div>
                  {user.name}
                </div>
              </td>
              <td className="px-6 py-4 text-gray-600">
                {user.email}
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                  user.role === 'SUPER_ADMIN' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {user.role}
                </span>
              </td>
              <td className="px-6 py-4">
                {user.stores.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {user.stores.map((store: any) => (
                      <Link 
                        key={store.id} 
                        href={`/${store.slug}/admin`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {store.name}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400 text-xs italic">No stores</span>
                )}
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button 
                    onClick={() => alert("Reset password feature coming soon")}
                    className="text-gray-400 hover:text-yellow-600 p-1"
                    title="Reset Password"
                  >
                    <Key className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setEditingUser(user)}
                    className="text-gray-400 hover:text-blue-600 p-1"
                    title="Edit User"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
