"use client";

import { useSearchParams, useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { 
  Search, 
  User, 
  Trash2, 
  Edit2, 
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle,
  ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { getStoreBySlug, getStoreCashiers, createStoreCashier, deleteStoreCashier } from "@/lib/api";
import AdminSpinner from "../components/AdminSpinner";

interface StoreUser {
  id: number;
  name: string | null;
  email: string;
  role: string;
  createdAt: Date;
}

export default function AdminUsers() {
  const searchParams = useSearchParams();
  const { slug } = useParams();
  const router = useRouter();
  const action = searchParams.get("action");
  
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [storeId, setStoreId] = useState<number | null>(null);
  
  // Form State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "CASHIER"
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!slug) return;
      try {
        const store = await getStoreBySlug(slug as string);
        if (store) {
          setStoreId(store.id);
          const cashiers = await getStoreCashiers(store.id);
          setUsers(cashiers as any); // Cast for now
        }
      } catch (error) {
        console.error("Failed to load users", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [slug]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    
    setFormError(null);
    setFormSuccess(null);

    if (formData.password !== formData.confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }

    if (formData.password.length < 6) {
      setFormError("Password must be at least 6 characters");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createStoreCashier(storeId, {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role
      });

      if (result.error) {
        setFormError(result.error);
      } else {
        setFormSuccess(`${formData.role} created successfully!`);
        setFormData({ name: "", email: "", password: "", confirmPassword: "", role: "CASHIER" });
        // Refresh list
        const cashiers = await getStoreCashiers(storeId);
        setUsers(cashiers as any);
        // Optional: Redirect back to list after delay
        setTimeout(() => router.push(`/${slug}/admin/users`), 1500);
      }
    } catch (error) {
      setFormError("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!storeId || !confirm("Are you sure you want to delete this user?")) return;

    try {
      const result = await deleteStoreCashier(storeId, userId);
      if (result.success) {
        setUsers(users.filter(u => u.id !== userId));
      } else {
        alert(result.error || "Failed to delete user");
      }
    } catch (error) {
      console.error("Failed to delete user", error);
      alert("An error occurred");
    }
  };

  if (isLoading) {
    return <AdminSpinner label="Loading users..." />;
  }

  if (action === "new") {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4 border-b pb-4 mb-4">
          <Link href={`/${slug}/admin/users`} className="p-2 hover:bg-gray-100 rounded-full">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <h2 className="text-xl font-medium">Add New {formData.role === 'CASHIER' ? 'Cashier' : 'Manager'}</h2>
        </div>
        
        <div className="max-w-2xl">
          {formError && (
            <div className="mb-6 bg-red-50 text-red-600 p-3 rounded-md flex items-center text-sm">
              <AlertCircle className="w-4 h-4 mr-2" />
              {formError}
            </div>
          )}
          
          {formSuccess && (
            <div className="mb-6 bg-green-50 text-green-600 p-3 rounded-md flex items-center text-sm">
              <CheckCircle className="w-4 h-4 mr-2" />
              {formSuccess}
            </div>
          )}

          <form onSubmit={handleCreateUser} className="space-y-6 bg-white p-6 border rounded-lg shadow-sm">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input 
                  type="text" 
                  required
                  className="w-full border border-[#ccd0d4] px-3 py-2 rounded focus:border-[#2271b1] outline-none" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input 
                  type="email" 
                  required
                  className="w-full border border-[#ccd0d4] px-3 py-2 rounded focus:border-[#2271b1] outline-none" 
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <select 
                  className="w-full border border-[#ccd0d4] px-3 py-2 rounded focus:border-[#2271b1] outline-none bg-white"
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value})}
                >
                  <option value="CASHIER">Cashier (POS Only)</option>
                  <option value="MANAGER">Manager (Dashboard + POS)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Password</label>
                  <input 
                    type="password" 
                    required
                    className="w-full border border-[#ccd0d4] px-3 py-2 rounded focus:border-[#2271b1] outline-none" 
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Confirm Password</label>
                  <input 
                    type="password" 
                    required
                    className="w-full border border-[#ccd0d4] px-3 py-2 rounded focus:border-[#2271b1] outline-none" 
                    value={formData.confirmPassword}
                    onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end space-x-3">
               <Link href={`/${slug}/admin/users`} className="px-4 py-2 text-gray-600 hover:text-gray-800">
                 Cancel
               </Link>
               <button 
                type="submit" 
                disabled={isSubmitting}
                className="px-6 py-2 bg-[#2271b1] text-white font-medium hover:bg-[#135e96] transition-colors rounded shadow-sm disabled:opacity-50 flex items-center"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {formData.role === 'CASHIER' ? 'Create Cashier' : 'Create Manager'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(user => 
    (user.name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
           <h1 className="text-2xl font-bold text-[#1d2327]">Users</h1>
           <p className="text-sm text-gray-500">Manage cashiers and staff for your store.</p>
        </div>
        <Link 
          href={`/${slug}/admin/users?action=new`}
          className="px-4 py-2 bg-[#2271b1] text-white font-medium hover:bg-[#135e96] transition-colors rounded shadow-sm flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add New
        </Link>
      </div>

      <div className="bg-white border border-[#ccd0d4] rounded-lg overflow-hidden shadow-sm">
        <div className="p-4 border-b border-[#ccd0d4] bg-gray-50 flex flex-col md:flex-row justify-between gap-4">
          <div className="relative w-full md:w-64">
            <input 
              type="text" 
              placeholder="Search users..." 
              className="w-full border border-[#ccd0d4] bg-white px-3 py-1.5 pl-9 text-sm focus:border-[#2271b1] outline-none rounded"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-[#ccd0d4]">
              <tr>
                <th className="px-6 py-3 font-semibold text-[#1d2327]">Name</th>
                <th className="px-6 py-3 font-semibold text-[#1d2327]">Email</th>
                <th className="px-6 py-3 font-semibold text-[#1d2327]">Role</th>
                <th className="px-6 py-3 font-semibold text-[#1d2327]">Created At</th>
                <th className="px-6 py-3 font-semibold text-[#1d2327] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No users found. Create a cashier to get started.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold mr-3">
                          {(user.name || user.email).charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-[#1d2327]">{user.name || "Unknown"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                        user.role === 'MANAGER' ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"
                      )}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDeleteUser(user.id)}
                        className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
