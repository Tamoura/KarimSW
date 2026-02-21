"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, getAccessToken } from "@/lib/api-client";

type TrustLevel = "self-asserted" | "verified" | "government-backed";
type IssuerStatus = "pending" | "active" | "suspended";
type FilterTab = "all" | IssuerStatus;

interface Issuer {
  id: string;
  name: string;
  did: string;
  trustLevel: TrustLevel;
  status: IssuerStatus;
  credentialCount: number;
}

const mockIssuers: Issuer[] = [
  { id: "1", name: "National University of Dubai", did: "did:web:nud.ac.ae", trustLevel: "government-backed", status: "active", credentialCount: 4521 },
  { id: "2", name: "Dubai Health Authority", did: "did:web:dha.gov.ae", trustLevel: "verified", status: "active", credentialCount: 892 },
  { id: "3", name: "TechCorp LLC", did: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK", trustLevel: "self-asserted", status: "pending", credentialCount: 0 },
  { id: "4", name: "Global Finance Inc", did: "did:web:globalfinance.com", trustLevel: "verified", status: "suspended", credentialCount: 120 },
  { id: "5", name: "Abu Dhabi Police", did: "did:web:adp.gov.ae", trustLevel: "government-backed", status: "active", credentialCount: 12087 },
  { id: "6", name: "StartupXYZ", did: "did:key:z6MkrJVnaZkeFzdQyMZu1cgjg7k1pZZ6x65JVpM", trustLevel: "self-asserted", status: "pending", credentialCount: 0 },
];

const trustLevelConfig: Record<TrustLevel, { label: string; classes: string }> = {
  "self-asserted": { label: "Self-Asserted", classes: "bg-gray-100 text-gray-700" },
  "verified": { label: "Verified", classes: "bg-blue-100 text-blue-700" },
  "government-backed": { label: "Government-Backed", classes: "bg-green-100 text-green-700" },
};

const statusConfig: Record<IssuerStatus, { label: string; classes: string }> = {
  pending: { label: "Pending", classes: "bg-amber-100 text-amber-700" },
  active: { label: "Active", classes: "bg-green-100 text-green-700" },
  suspended: { label: "Suspended", classes: "bg-red-100 text-red-700" },
};

function truncateDid(did: string, maxLen = 32): string {
  if (did.length <= maxLen) return did;
  return did.slice(0, 18) + "..." + did.slice(-10);
}

export default function AdminIssuersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [issuers, setIssuers] = useState<Issuer[]>(mockIssuers);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }

    async function fetchIssuers() {
      try {
        const res = await apiFetch("/admin/issuers");
        if (res.ok) {
          const data = await res.json();
          setIssuers(Array.isArray(data) ? data : data.issuers ?? mockIssuers);
        }
      } catch {
        // API unavailable — mock data already set
      } finally {
        setLoading(false);
      }
    }

    fetchIssuers();
  }, [router]);

  const filtered = useMemo(() => {
    return issuers.filter((issuer) => {
      const matchesTab = activeTab === "all" || issuer.status === activeTab;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        issuer.name.toLowerCase().includes(q) ||
        issuer.did.toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    });
  }, [issuers, activeTab, search]);

  async function handleApprove(id: string) {
    setActionLoading(id + "-approve");
    try {
      const res = await apiFetch(`/admin/issuers/${id}/approve`, { method: "POST" });
      if (res.ok) {
        setIssuers((prev) =>
          prev.map((i) => (i.id === id ? { ...i, status: "active" } : i))
        );
      }
    } catch {
      // Optimistic fallback for demo
      setIssuers((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: "active" } : i))
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSuspend(id: string) {
    setActionLoading(id + "-suspend");
    try {
      const res = await apiFetch(`/admin/issuers/${id}/suspend`, { method: "POST" });
      if (res.ok) {
        setIssuers((prev) =>
          prev.map((i) => (i.id === id ? { ...i, status: "suspended" } : i))
        );
      }
    } catch {
      setIssuers((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: "suspended" } : i))
      );
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

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "active", label: "Approved" },
    { key: "suspended", label: "Suspended" },
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
              Review applications, assign trust levels, and moderate issuer activity
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
            <label htmlFor="issuer-search" className="sr-only">Search issuers</label>
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            </div>
            <input
              id="issuer-search"
              type="search"
              placeholder="Search by name or DID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Tab Filters */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit" role="tablist" aria-label="Filter issuers by status">
            {tabs.map((tab) => {
              const count = tab.key === "all"
                ? issuers.length
                : issuers.filter((i) => i.status === tab.key).length;
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

        {/* Issuers Table */}
        <div className="card p-0 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <span className="text-gray-400 text-xl">I</span>
              </div>
              <p className="text-gray-700 font-medium">No issuers found</p>
              <p className="text-gray-400 text-sm mt-1">
                {search ? "Try a different search term or clear the filter." : "No issuers match the selected status."}
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
              <table className="w-full text-sm" aria-label="Issuers table">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Organization</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">DID</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Trust Level</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Credentials</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((issuer) => {
                    const trust = trustLevelConfig[issuer.trustLevel];
                    const status = statusConfig[issuer.status];
                    return (
                      <tr key={issuer.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-gray-900">{issuer.name}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className="font-mono text-xs text-gray-500"
                            title={issuer.did}
                          >
                            {truncateDid(issuer.did)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${trust.classes}`}>
                            {trust.label}
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
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/admin/issuers/${issuer.id}`}
                              className="text-xs text-primary-500 hover:text-primary-600 font-medium"
                            >
                              View
                            </Link>
                            {issuer.status === "pending" && (
                              <button
                                onClick={() => handleApprove(issuer.id)}
                                disabled={actionLoading === issuer.id + "-approve"}
                                className="text-xs px-2.5 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 font-medium transition-colors disabled:opacity-50"
                                aria-label={`Approve ${issuer.name}`}
                              >
                                {actionLoading === issuer.id + "-approve" ? "Approving..." : "Approve"}
                              </button>
                            )}
                            {issuer.status === "active" && (
                              <button
                                onClick={() => handleSuspend(issuer.id)}
                                disabled={actionLoading === issuer.id + "-suspend"}
                                className="text-xs px-2.5 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 font-medium transition-colors disabled:opacity-50"
                                aria-label={`Suspend ${issuer.name}`}
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
      </main>
    </div>
  );
}
