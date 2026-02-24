"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAccessToken, setAccessToken, apiFetch } from "@/lib/api-client";

interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  actorId?: string;
  actorEmail?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface VerifyResult {
  valid: boolean;
  checkedCount?: number;
  message?: string;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AuditPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterAction, setFilterAction] = useState("");
  const [filterEntityType, setFilterEntityType] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [page, setPage] = useState(1);
  const limit = 50;

  // Verify chain integrity
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  // Export
  const [exporting, setExporting] = useState(false);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchEvents = useCallback(async (
    currentPage: number,
    action: string,
    entityType: string,
    from: string,
    to: string
  ) => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      page: String(currentPage),
      limit: String(limit),
    });
    if (action) params.set("action", action);
    if (entityType) params.set("entityType", entityType);
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());

    try {
      const res = await apiFetch(`/audit/events?${params.toString()}`);

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) throw new Error("Failed to load audit events.");

      const data = await res.json();
      setEvents(data.events ?? []);
      setMeta(data.meta ?? data.pagination ?? null);
    } catch {
      setError("Could not load audit events. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    setEmail("");
    fetchEvents(page, filterAction, filterEntityType, filterFrom, filterTo);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function handleApplyFilters() {
    setPage(1);
    fetchEvents(1, filterAction, filterEntityType, filterFrom, filterTo);
  }

  function handleClearFilters() {
    setFilterAction("");
    setFilterEntityType("");
    setFilterFrom("");
    setFilterTo("");
    setPage(1);
    fetchEvents(1, "", "", "", "");
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    fetchEvents(newPage, filterAction, filterEntityType, filterFrom, filterTo);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleVerifyChain() {
    setVerifying(true);
    setVerifyResult(null);

    try {
      const res = await apiFetch(`/audit/events/verify`);

      if (res.status === 401) { handleUnauthorized(); return; }

      const data = await res.json();
      setVerifyResult(data);
    } catch {
      setVerifyResult({ valid: false, message: "Could not verify chain integrity." });
    } finally {
      setVerifying(false);
    }
  }

  async function handleExport(format: "json" | "csv") {
    setExporting(true);

    try {
      const res = await apiFetch(`/audit/events/export?format=${format}`);

      if (res.status === 401) { handleUnauthorized(); return; }
      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-events.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — export errors are not critical
    } finally {
      setExporting(false);
    }
  }

  function handleLogout() {
    setAccessToken(null);
    router.push("/login");
  }

  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link
              href="/org"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors no-underline"
              aria-label="Back to Organisation"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Organisation
            </Link>
            <span className="text-gray-300" aria-hidden="true">/</span>
            <span className="text-sm font-medium text-gray-900">Audit Trail</span>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden sm:block text-sm text-gray-500 truncate max-w-xs" title={email}>
                {email}
              </span>
              <button onClick={handleLogout} className="btn-secondary px-3 py-1.5 text-sm" type="button">
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
            <p className="mt-1 text-sm text-gray-500">
              Immutable log of all actions taken within your organisation.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleVerifyChain}
              disabled={verifying}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifying ? <Spinner /> : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
              )}
              Verify Chain Integrity
            </button>
            <button
              type="button"
              onClick={() => handleExport("json")}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors disabled:opacity-50"
            >
              {exporting ? <Spinner /> : null}
              Export JSON
            </button>
            <button
              type="button"
              onClick={() => handleExport("csv")}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors disabled:opacity-50"
            >
              {exporting ? <Spinner /> : null}
              Export CSV
            </button>
          </div>
        </div>

        {/* Verify result banner */}
        {verifyResult && (
          <div
            role="status"
            className={`mb-6 flex items-start gap-3 rounded-lg border px-4 py-3 ${
              verifyResult.valid
                ? "bg-green-50 border-green-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <svg
              className={`w-5 h-5 shrink-0 mt-0.5 ${verifyResult.valid ? "text-green-600" : "text-red-500"}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              {verifyResult.valid ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              )}
            </svg>
            <div>
              <p className={`text-sm font-medium ${verifyResult.valid ? "text-green-800" : "text-red-800"}`}>
                {verifyResult.valid ? "Chain integrity verified" : "Chain integrity check failed"}
              </p>
              {verifyResult.message && (
                <p className={`text-xs mt-0.5 ${verifyResult.valid ? "text-green-700" : "text-red-700"}`}>
                  {verifyResult.message}
                </p>
              )}
              {verifyResult.checkedCount !== undefined && (
                <p className="text-xs text-gray-500 mt-0.5">{verifyResult.checkedCount} events checked.</p>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="card mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Filters</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="filter-action" className="block text-xs font-medium text-gray-600 mb-1">
                Action
              </label>
              <input
                id="filter-action"
                type="text"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                placeholder="e.g. credential.issued"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label htmlFor="filter-entity" className="block text-xs font-medium text-gray-600 mb-1">
                Entity Type
              </label>
              <input
                id="filter-entity"
                type="text"
                value={filterEntityType}
                onChange={(e) => setFilterEntityType(e.target.value)}
                placeholder="e.g. Credential"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label htmlFor="filter-from" className="block text-xs font-medium text-gray-600 mb-1">
                From Date
              </label>
              <input
                id="filter-from"
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label htmlFor="filter-to" className="block text-xs font-medium text-gray-600 mb-1">
                To Date
              </label>
              <input
                id="filter-to"
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button
              type="button"
              onClick={handleApplyFilters}
              className="btn-primary text-sm px-4 py-2"
            >
              Apply Filters
            </button>
            <button
              type="button"
              onClick={handleClearFilters}
              className="btn-secondary text-sm px-4 py-2"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading audit events">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading audit events&hellip;</p>
            </div>
          </div>
        )}

        {!loading && error && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            {events.length === 0 ? (
              <div className="card text-center py-16">
                <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
                <p className="text-sm text-gray-500">No audit events found.</p>
                {(filterAction || filterEntityType || filterFrom || filterTo) && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="mt-4 text-sm text-primary-500 hover:text-primary-600"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="card overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200" role="table" aria-label="Audit events">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Action</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Entity Type</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Entity</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Actor</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">IP</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {events.map((ev) => (
                        <tr key={ev.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 font-mono">
                              {ev.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                            {ev.entityType}
                          </td>
                          <td className="px-4 py-3">
                            {ev.entityId ? (
                              <span className="text-xs font-mono text-gray-500" title={ev.entityId}>
                                {ev.entityId.length > 12 ? `${ev.entityId.slice(0, 12)}\u2026` : ev.entityId}
                              </span>
                            ) : (
                              <span className="text-gray-300">&mdash;</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {ev.actorEmail ?? ev.actorId ?? "\u2014"}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-400 whitespace-nowrap">
                            {ev.ipAddress ?? "\u2014"}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {formatDate(ev.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-4">
                  <p className="text-xs text-gray-400">
                    {meta ? (
                      <>
                        Page {meta.page} of {meta.totalPages} &mdash; {meta.total} event{meta.total !== 1 ? "s" : ""} total
                      </>
                    ) : (
                      <>{events.length} event{events.length !== 1 ? "s" : ""}</>
                    )}
                  </p>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePageChange(page - 1)}
                        disabled={page <= 1}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Previous page"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                        Prev
                      </button>
                      <span className="text-xs text-gray-500 px-2">{page} / {totalPages}</span>
                      <button
                        type="button"
                        onClick={() => handlePageChange(page + 1)}
                        disabled={page >= totalPages}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Next page"
                      >
                        Next
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-gray-200 mt-auto py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs text-center text-gray-400">
            HumanID &mdash; Your identity, your control.
          </p>
        </div>
      </footer>
    </div>
  );
}
