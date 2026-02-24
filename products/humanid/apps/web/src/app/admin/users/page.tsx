"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, getAccessToken, setAccessToken } from "@/lib/api-client";

type FilterTab = "all" | "ACTIVE" | "SUSPENDED";

interface AdminUser {
  id: string;
  email: string;
  role: string;
  status: string;
  didCount: number;
  createdAt: string;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    SUSPENDED: "bg-red-100 text-red-700",
    DEACTIVATED: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    ADMIN: "bg-red-100 text-red-700",
    ISSUER: "bg-blue-100 text-blue-700",
    DEVELOPER: "bg-purple-100 text-purple-700",
    HOLDER: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[role] ?? "bg-gray-100 text-gray-600"}`}>
      {role.charAt(0) + role.slice(1).toLowerCase()}
    </span>
  );
}

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchUsers = useCallback(async (pageNum: number, searchQ: string, status: FilterTab) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: String(PAGE_SIZE) });
      if (searchQ.trim()) params.set("search", searchQ.trim());
      if (status !== "all") params.set("status", status);

      const res = await apiFetch(`/admin/users?${params.toString()}`);
      if (res.status === 401) { handleUnauthorized(); return; }
      if (!res.ok) throw new Error("Failed to load users.");

      const data = await res.json();
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError("Could not load users. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) { router.push("/login"); return; }
    fetchUsers(1, "", "all");
  }, [router, fetchUsers]);

  function handleSearch() {
    setPage(1);
    fetchUsers(1, search, activeTab);
  }

  function handleTabChange(tab: FilterTab) {
    setActiveTab(tab);
    setPage(1);
    fetchUsers(1, search, tab);
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    fetchUsers(newPage, search, activeTab);
  }

  async function handleSuspend(id: string, email: string) {
    if (!window.confirm(`Suspend user ${email}?`)) return;
    setActionLoading(id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch(`/admin/users/${id}/suspend`, { method: "PATCH" });
      if (res.status === 401) { handleUnauthorized(); return; }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError((data as { detail?: string }).detail ?? "Failed to suspend user.");
        return;
      }
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, status: "SUSPENDED" } : u));
      setActionSuccess(`User ${email} has been suspended.`);
    } catch {
      setActionError("Could not connect to the server.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReactivate(id: string, email: string) {
    if (!window.confirm(`Reactivate user ${email}?`)) return;
    setActionLoading(id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch(`/admin/users/${id}/reactivate`, { method: "PATCH" });
      if (res.status === 401) { handleUnauthorized(); return; }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError((data as { detail?: string }).detail ?? "Failed to reactivate user.");
        return;
      }
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, status: "ACTIVE" } : u));
      setActionSuccess(`User ${email} has been reactivated.`);
    } catch {
      setActionError("Could not connect to the server.");
    } finally {
      setActionLoading(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "ACTIVE", label: "Active" },
    { key: "SUSPENDED", label: "Suspended" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="border-b border-gray-100 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">H</span>
              </div>
              <span className="font-semibold text-gray-900">HumanID</span>
              <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Admin</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900">Dashboard</Link>
              <Link href="/admin/users" className="text-sm font-medium text-primary-500">Users</Link>
              <Link href="/admin/issuers" className="text-sm text-gray-600 hover:text-gray-900">Issuers</Link>
              <Link href="/admin/audit" className="text-sm text-gray-600 hover:text-gray-900">Audit Log</Link>
              <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">Exit Admin</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Manage Users</h1>
            <p className="text-sm text-gray-500 mt-1">Search users, view account status, and handle moderation actions</p>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="card space-y-4">
          <div className="relative">
            <label htmlFor="user-search" className="sr-only">Search users</label>
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            </div>
            <input
              id="user-search"
              type="search"
              placeholder="Search by email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit" role="tablist" aria-label="Filter users by status">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Feedback */}
        {actionSuccess && (
          <div role="status" className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
            <p className="text-sm text-green-700">{actionSuccess}</p>
          </div>
        )}
        {(actionError || error) && (
          <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{actionError || error}</p>
          </div>
        )}

        {/* Users Table */}
        {loading ? (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading users">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading users&hellip;</p>
            </div>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            {users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <span className="text-gray-400 text-xl">U</span>
                </div>
                <p className="text-gray-700 font-medium">No users found</p>
                <p className="text-gray-400 text-sm mt-1">
                  {search ? "Try a different search term or clear the filter." : "No users match the selected status."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Users table">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">DIDs</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-gray-900">{user.email}</span>
                        </td>
                        <td className="py-3.5 px-4"><RoleBadge role={user.role} /></td>
                        <td className="py-3.5 px-4"><StatusBadge status={user.status} /></td>
                        <td className="py-3.5 px-4 text-gray-600 tabular-nums">{user.didCount}</td>
                        <td className="py-3.5 px-4 text-gray-500 whitespace-nowrap">{formatDate(user.createdAt)}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-end gap-2">
                            {user.status === "ACTIVE" ? (
                              <button
                                onClick={() => handleSuspend(user.id, user.email)}
                                disabled={actionLoading === user.id}
                                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 font-medium transition-colors disabled:opacity-50"
                                aria-label={`Suspend ${user.email}`}
                              >
                                {actionLoading === user.id ? <Spinner /> : null}
                                Suspend
                              </button>
                            ) : user.status === "SUSPENDED" ? (
                              <button
                                onClick={() => handleReactivate(user.id, user.email)}
                                disabled={actionLoading === user.id}
                                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 font-medium transition-colors disabled:opacity-50"
                                aria-label={`Reactivate ${user.email}`}
                              >
                                {actionLoading === user.id ? <Spinner /> : null}
                                Reactivate
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400 italic">Deactivated</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {!loading && total > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between px-1">
            <p className="text-sm text-gray-500">
              Showing{" "}
              <span className="font-medium text-gray-700">{Math.min((page - 1) * PAGE_SIZE + 1, total)}</span>{" "}
              to{" "}
              <span className="font-medium text-gray-700">{Math.min(page * PAGE_SIZE, total)}</span>{" "}
              of <span className="font-medium text-gray-700">{total}</span> users
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                Prev
              </button>
              <span className="text-sm text-gray-600 px-2">
                Page <span className="font-medium">{page}</span> of <span className="font-medium">{totalPages}</span>
              </span>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
