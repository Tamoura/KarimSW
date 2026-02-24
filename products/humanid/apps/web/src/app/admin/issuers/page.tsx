"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, getAccessToken } from "@/lib/api-client";

type TrustStatus = "PENDING" | "TRUSTED" | "REVOKED";

interface Issuer {
  id: string;
  organizationName: string;
  did: string;
  trustStatus: TrustStatus;
  tier: string;
  credentialCount: number;
  createdAt: string;
}

const trustStatusConfig: Record<TrustStatus, { label: string; classes: string }> = {
  PENDING: { label: "Pending", classes: "bg-amber-100 text-amber-700" },
  TRUSTED: { label: "Trusted", classes: "bg-green-100 text-green-700" },
  REVOKED: { label: "Revoked", classes: "bg-red-100 text-red-700" },
};

function truncateDid(did: string, maxLen = 32): string {
  if (did.length <= maxLen) return did;
  return did.slice(0, 18) + "..." + did.slice(-10);
}

export default function AdminIssuersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TrustStatus>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchIssuers = useCallback(async (p: number, q: string, status: string) => {
    try {
      setError(null);
      const params = new URLSearchParams({ page: String(p), limit: "20" });
      if (q) params.set("search", q);
      if (status !== "all") params.set("status", status);

      const res = await apiFetch(`/admin/issuers?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Error ${res.status}`);
      }
      const data = await res.json();
      setIssuers(data.issuers ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? 1);
      setTotalPages(data.totalPages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load issuers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    fetchIssuers(page, search, statusFilter);
  }, [router, page, search, statusFilter, fetchIssuers]);

  async function handleApprove(id: string) {
    setActionLoading(id + "-approve");
    try {
      const res = await apiFetch(`/admin/issuers/${id}/approve`, { method: "PATCH" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Approve failed");
      }
      await fetchIssuers(page, search, statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve issuer");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSuspend(id: string) {
    setActionLoading(id + "-suspend");
    try {
      const res = await apiFetch(`/admin/issuers/${id}/suspend`, { method: "PATCH" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Suspend failed");
      }
      await fetchIssuers(page, search, statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to suspend issuer");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const tabs: { key: "all" | TrustStatus; label: string }[] = [
    { key: "all", label: "All" },
    { key: "PENDING", label: "Pending" },
    { key: "TRUSTED", label: "Trusted" },
    { key: "REVOKED", label: "Revoked" },
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
              <Link href="/admin/users" className="text-sm text-gray-600 hover:text-gray-900">Users</Link>
              <Link href="/admin/issuers" className="text-sm font-medium text-primary-500">Issuers</Link>
              <Link href="/admin/audit" className="text-sm text-gray-600 hover:text-gray-900">Audit Log</Link>
              <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">Exit Admin</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Manage Issuers</h1>
            <p className="text-sm text-gray-500 mt-1">
              Review applications, assign trust levels, and moderate issuer activity ({total} total)
            </p>
          </div>
          <Link href="/admin" className="btn-secondary text-sm px-4 py-2">
            Back to Dashboard
          </Link>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={() => setError(null)} className="text-xs text-red-500 underline mt-1">Dismiss</button>
          </div>
        )}

        {/* Search & Filters */}
        <div className="card space-y-4">
          <div className="relative">
            <label htmlFor="issuer-search" className="sr-only">Search issuers</label>
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            </div>
            <input
              id="issuer-search"
              type="search"
              placeholder="Search by organization name..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit" role="tablist" aria-label="Filter issuers by status">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={statusFilter === tab.key}
                onClick={() => { setStatusFilter(tab.key); setPage(1); }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  statusFilter === tab.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Issuers Table */}
        <div className="card p-0 overflow-hidden">
          {issuers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <span className="text-gray-400 text-xl">I</span>
              </div>
              <p className="text-gray-700 font-medium">No issuers found</p>
              <p className="text-gray-400 text-sm mt-1">
                {search ? "Try a different search term or clear the filter." : "No issuers match the selected status."}
              </p>
              {(search || statusFilter !== "all") && (
                <button
                  onClick={() => { setSearch(""); setStatusFilter("all"); setPage(1); }}
                  className="mt-3 text-sm text-primary-500 hover:text-primary-600"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Issuers table">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Organization</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">DID</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Trust Status</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Credentials</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {issuers.map((issuer) => {
                    const status = trustStatusConfig[issuer.trustStatus] ?? trustStatusConfig.PENDING;
                    return (
                      <tr key={issuer.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-gray-900">{issuer.organizationName}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-mono text-xs text-gray-500" title={issuer.did}>
                            {truncateDid(issuer.did)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status.classes}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right text-gray-600 tabular-nums">
                          {issuer.credentialCount.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-gray-500 text-xs">
                          {new Date(issuer.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-end gap-2">
                            {issuer.trustStatus === "PENDING" && (
                              <button
                                onClick={() => handleApprove(issuer.id)}
                                disabled={actionLoading === issuer.id + "-approve"}
                                className="text-xs px-2.5 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 font-medium transition-colors disabled:opacity-50"
                                aria-label={`Approve ${issuer.organizationName}`}
                              >
                                {actionLoading === issuer.id + "-approve" ? "Approving..." : "Approve"}
                              </button>
                            )}
                            {issuer.trustStatus === "TRUSTED" && (
                              <button
                                onClick={() => handleSuspend(issuer.id)}
                                disabled={actionLoading === issuer.id + "-suspend"}
                                className="text-xs px-2.5 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 font-medium transition-colors disabled:opacity-50"
                                aria-label={`Suspend ${issuer.organizationName}`}
                              >
                                {actionLoading === issuer.id + "-suspend" ? "Suspending..." : "Suspend"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages} ({total} issuers)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
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
