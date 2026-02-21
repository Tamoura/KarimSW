"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, getAccessToken } from "@/lib/api-client";

type UserStatus = "active" | "suspended";
type FilterTab = "all" | UserStatus;

interface AdminUser {
  id: string;
  email: string;
  didCount: number;
  joined: string;
  lastActive: string;
  status: UserStatus;
}

const mockUsers: AdminUser[] = [
  { id: "u1", email: "alice@example.com", didCount: 2, joined: "2024-08-15", lastActive: "2026-01-20", status: "active" },
  { id: "u2", email: "bob@company.de", didCount: 1, joined: "2024-10-22", lastActive: "2025-11-05", status: "active" },
  { id: "u3", email: "charlie@test.com", didCount: 3, joined: "2024-04-10", lastActive: "2025-09-01", status: "suspended" },
  { id: "u4", email: "diana@startup.io", didCount: 1, joined: "2025-01-01", lastActive: "2026-01-19", status: "active" },
  { id: "u5", email: "eve@globalfinance.com", didCount: 4, joined: "2024-07-05", lastActive: "2025-12-30", status: "active" },
  { id: "u6", email: "frank@utoronto.ca", didCount: 2, joined: "2024-09-14", lastActive: "2025-08-22", status: "suspended" },
  { id: "u7", email: "grace@nhs.uk", didCount: 1, joined: "2025-02-19", lastActive: "2026-02-18", status: "active" },
];

const PAGE_SIZE = 5;

interface DeleteModalProps {
  user: AdminUser;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function DeleteModal({ user, onConfirm, onCancel, loading }: DeleteModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      aria-describedby="delete-modal-desc"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h2 id="delete-modal-title" className="text-base font-semibold text-gray-900">
              Delete User Account
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{user.email}</p>
          </div>
        </div>

        <p id="delete-modal-desc" className="text-sm text-gray-700 mb-6 leading-relaxed">
          This will permanently delete all user data including credentials and DIDs.
          This action cannot be undone.
        </p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="btn-secondary px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={`Confirm deletion of ${user.email}`}
          >
            {loading ? "Deleting..." : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>(mockUsers);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }

    async function fetchUsers() {
      try {
        const res = await apiFetch("/admin/users?page=1&limit=20");
        if (res.ok) {
          const data = await res.json();
          setUsers(Array.isArray(data) ? data : data.users ?? mockUsers);
        }
      } catch {
        // API unavailable — mock data already set
      } finally {
        setLoading(false);
      }
    }

    fetchUsers();
  }, [router]);

  // Reset page when search or tab changes
  useEffect(() => {
    setPage(1);
  }, [search, activeTab]);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchesTab = activeTab === "all" || u.status === activeTab;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        u.email.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    });
  }, [users, activeTab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleSuspend(id: string) {
    setActionLoading(id + "-suspend");
    try {
      const res = await apiFetch(`/admin/users/${id}/suspend`, { method: "POST" });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === id ? { ...u, status: "suspended" } : u))
        );
      }
    } catch {
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, status: "suspended" } : u))
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(user: AdminUser) {
    setDeleteLoading(true);
    try {
      await apiFetch(`/admin/users/${user.id}`, { method: "DELETE" });
    } catch {
      // API unavailable — proceed with local removal
    } finally {
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setDeleteTarget(null);
      setDeleteLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "suspended", label: "Suspended" },
  ];

  return (
    <>
      {deleteTarget && (
        <DeleteModal
          user={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteLoading}
        />
      )}

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
                <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">Exit Admin</Link>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Manage Users</h1>
              <p className="text-sm text-gray-500 mt-1">
                Search users, view account status, and handle moderation actions
              </p>
            </div>
            <Link href="/admin" className="btn-secondary text-sm px-4 py-2">
              Back to Dashboard
            </Link>
          </div>

          {/* Search & Filters */}
          <div className="card space-y-4">
            {/* Search */}
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
                placeholder="Search by email or DID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Tab Filters */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit" role="tablist" aria-label="Filter users by status">
              {tabs.map((tab) => {
                const count =
                  tab.key === "all"
                    ? users.length
                    : users.filter((u) => u.status === tab.key).length;
                return (
                  <button
                    key={tab.key}
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      activeTab === tab.key
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab.label}
                    <span className={`ml-1.5 text-xs ${activeTab === tab.key ? "text-gray-500" : "text-gray-400"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Users Table */}
          <div className="card p-0 overflow-hidden">
            {paginated.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <span className="text-gray-400 text-xl">U</span>
                </div>
                <p className="text-gray-700 font-medium">No users found</p>
                <p className="text-gray-400 text-sm mt-1">
                  {search ? "Try a different search term or clear the filter." : "No users match the selected status."}
                </p>
                {(search || activeTab !== "all") && (
                  <button
                    onClick={() => { setSearch(""); setActiveTab("all"); }}
                    className="mt-3 text-sm text-primary-500 hover:text-primary-600"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Users table">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">DIDs</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Active</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginated.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-gray-900">{user.email}</span>
                        </td>
                        <td className="py-3.5 px-4 text-gray-600 tabular-nums">{user.didCount}</td>
                        <td className="py-3.5 px-4 text-gray-500 whitespace-nowrap">{formatDate(user.joined)}</td>
                        <td className="py-3.5 px-4 text-gray-500 whitespace-nowrap">{formatDate(user.lastActive)}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              user.status === "active"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {user.status === "active" ? "Active" : "Suspended"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/admin/users/${user.id}`}
                              className="text-xs text-primary-500 hover:text-primary-600 font-medium"
                            >
                              View
                            </Link>
                            {user.status === "active" && (
                              <button
                                onClick={() => handleSuspend(user.id)}
                                disabled={actionLoading === user.id + "-suspend"}
                                className="text-xs px-2.5 py-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium transition-colors disabled:opacity-50"
                                aria-label={`Suspend ${user.email}`}
                              >
                                {actionLoading === user.id + "-suspend" ? "Suspending..." : "Suspend"}
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteTarget(user)}
                              className="text-xs px-2.5 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 font-medium transition-colors"
                              aria-label={`Delete account for ${user.email}`}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-sm text-gray-500">
                Showing{" "}
                <span className="font-medium text-gray-700">
                  {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}
                </span>{" "}
                to{" "}
                <span className="font-medium text-gray-700">
                  {Math.min(page * PAGE_SIZE, filtered.length)}
                </span>{" "}
                of <span className="font-medium text-gray-700">{filtered.length}</span> users
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
    </>
  );
}
