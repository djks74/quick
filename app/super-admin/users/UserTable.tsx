"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit, Trash2, Key, X, Save, Shield, Store, User as UserIcon } from "lucide-react";
import { updateUser, resetUserPassword } from "@/lib/super-admin";

export default function UserTable({ users, allStores }: { users: any[], allStores: any[] }) {
  const [editingUser, setEditingUser] = useState<any>(null);
  const [resettingUser, setResettingUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setLoading(true);
    try {
      const res = await updateUser(editingUser.id, {
        name: editingUser.name,
        email: editingUser.email,
        role: editingUser.role,
        workedAtId: editingUser.role === 'CASHIER' ? (editingUser.workedAtId ? parseInt(editingUser.workedAtId) : null) : null
      });
      if (res.success) {
        setEditingUser(null);
        alert("User updated successfully");
      } else {
        alert(res.error || "Failed to update user");
      }
    } catch (e) {
      alert("Error updating user");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resettingUser || !newPassword) return;
    setLoading(true);
    try {
      const res = await resetUserPassword(resettingUser.id, newPassword);
      if (res.success) {
        setResettingUser(null);
        setNewPassword("");
        alert("Password reset successfully");
      } else {
        alert(res.error || "Failed to reset password");
      }
    } catch (e) {
      alert("Error resetting password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-800/50 border-b dark:border-gray-800 transition-colors">
            <tr>
              <th className="px-6 py-3">User</th>
              <th className="px-6 py-3">Role</th>
              <th className="px-6 py-3">Owned Stores</th>
              <th className="px-6 py-3">Work Assignment</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="bg-white dark:bg-[#1A1D21] border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold transition-colors">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 dark:text-white">{user.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    user.role === 'SUPER_ADMIN' 
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' 
                      : user.role === 'MERCHANT'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  }`}>
                    {user.role === 'SUPER_ADMIN' && <Shield size={10} />}
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {user.stores.length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {user.stores.map((store: any) => (
                        <Link 
                          key={store.id} 
                          href={`/${store.slug}/admin`}
                          className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-bold text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          {store.name}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500 text-xs italic">No stores</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {user.role === 'CASHIER' ? (
                    user.workedAt ? (
                      <div className="flex items-center gap-1 text-xs font-bold text-green-600 dark:text-green-400">
                        <Store size={12} />
                        {user.workedAt.name}
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 text-xs italic">Unassigned</span>
                    )
                  ) : (
                    <span className="text-gray-300 dark:text-gray-700 text-xs">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={() => setResettingUser(user)}
                      className="text-gray-400 dark:text-gray-500 hover:text-yellow-600 dark:hover:text-yellow-400 p-2 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-lg transition-colors"
                      title="Reset Password"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setEditingUser(user)}
                      className="text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
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

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1A1D21] rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Edit className="w-5 h-5 text-blue-600" />
                Edit User
              </h3>
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-1">Full Name</label>
                <input 
                  type="text"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-1">Email Address</label>
                <input 
                  type="email"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-1">Role</label>
                <select 
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                >
                  <option value="MERCHANT">MERCHANT</option>
                  <option value="CASHIER">CASHIER</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                </select>
              </div>

              {editingUser.role === 'CASHIER' && (
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-1">Assign to Store</label>
                  <select 
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                    value={editingUser.workedAtId || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, workedAtId: e.target.value || null })}
                  >
                    <option value="">Unassigned</option>
                    {allStores.map(store => (
                      <option key={store.id} value={store.id}>{store.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="p-6 bg-gray-50 dark:bg-gray-800/50 flex gap-3">
              <button 
                onClick={() => setEditingUser(null)}
                className="flex-1 px-4 py-2 rounded-xl font-bold text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button 
                disabled={loading}
                onClick={handleUpdateUser}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-500/30 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resettingUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1A1D21] rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-yellow-600" />
                Reset Password
              </h3>
              <button onClick={() => setResettingUser(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800 rounded-xl text-xs text-yellow-800 dark:text-yellow-400 leading-relaxed">
                Resetting password for <strong>{resettingUser.name}</strong>. This action will take effect immediately.
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-1">New Password</label>
                <input 
                  type="password"
                  autoFocus
                  placeholder="Enter new password..."
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-yellow-500 outline-none transition-all dark:text-white"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-gray-800/50 flex gap-3">
              <button 
                onClick={() => setResettingUser(null)}
                className="flex-1 px-4 py-2 rounded-xl font-bold text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button 
                disabled={loading || !newPassword}
                onClick={handleResetPassword}
                className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-xl font-bold text-sm hover:bg-yellow-700 shadow-lg shadow-yellow-500/30 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                Reset Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
