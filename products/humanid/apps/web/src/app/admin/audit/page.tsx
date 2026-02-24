"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getAccessToken, setAccessToken } from "@/lib/api-client";

interface AuditEvent {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface VerifyResult {
  intact: boolean;
  entriesChecked: number;
  totalEntries: number;
  brokenAt: string | null;
  verifiedAt: string;
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

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

export default function AdminAuditPage() {
  const router = useRouter();

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Export / Verify state
  const [exporting, setExporting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchEvents = useCallback(async (pageNum: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: String(pageSize) });
      if (actionFilter) params.set("action", actionFilter);
      if (entityFilter) params.set("entityType", entityFilter);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);

      const res = await apiFetch(`/audit/events?${params.toString()}`);
      if (res.status === 401) { handleUnauthorized(); return; }
      if (!res.ok) throw new Error("Failed to load audit events.");

      const data = await res.json();
      setEvents(data.events ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError("Could not load audit events.");
    } finally {
      setLoading(false);
    }
  }, [actionFilter, entityFilter, fromDate, toDate, handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) { router.push("/login"); return; }
    fetchEvents(1);
  }, [router, fetchEvents]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    fetchEvents(newPage);
  }

  function handleApplyFilters() {
    setPage(1);
    fetchEvents(1);
  }

  async function handleExport(format: "json" | "csv") {
    setExporting(true);
    try {
      const params = new URLSearchParams({ format });
      if (actionFilter) params.set("action", actionFilter);
      if (entityFilter) params.set("entityType", entityFilter);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);

      const res = await apiFetch(`/audit/events/export?${params.toString()}`);
      if (res.status === 401) { handleUnauthorized(); return; }
      if (!res.ok) { setError("Export failed."); return; }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "csv" ? "audit-events.csv" : "audit-events.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not export audit events.");
    } finally {
      setExporting(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await apiFetch("/audit/events/verify");
      if (res.status === 401) { handleUnauthorized(); return; }
      if (!res.ok) { setError("Verification failed."); return; }
      const data = await res.json();
      setVerifyResult(data);
    } catch {
      setError("Could not verify audit chain.");
    } finally {
      setVerifying(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
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
              <Link href="/admin/issuers" className="text-sm text-gray-600 hover:text-gray-900">Issuers</Link>
              <Link href="/admin/audit" className="text-sm font-medium text-primary-500">Audit Log</Link>
              <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">Exit Admin</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
            <p className="mt-1 text-sm text-gray-500">
              Compliance-grade tamper-evident audit trail of all platform events
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
            >
              {verifying ? <Spinner /> : null}
              Verify Chain
            </button>
            <button
              type="button"
              onClick={() => handleExport("csv")}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {exporting ? <Spinner /> : null}
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => handleExport("json")}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Export JSON
            </button>
          </div>
        </div>

        {/* Verify result */}
        {verifyResult && (
          <div
            role="status"
            className={`mb-6 rounded-lg border px-4 py-3 flex items-start gap-3 ${
              verifyResult.intact
                ? "bg-green-50 border-green-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <svg className={`w-5 h-5 shrink-0 mt-0.5 ${verifyResult.intact ? "text-green-600" : "text-red-600"}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              {verifyResult.intact ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              )}
            </svg>
            <div>
              <p className={`text-sm font-semibold ${verifyResult.intact ? "text-green-900" : "text-red-900"}`}>
                {verifyResult.intact ? "Audit chain integrity verified" : "Audit chain integrity BROKEN"}
              </p>
              <p className={`text-xs mt-0.5 ${verifyResult.intact ? "text-green-700" : "text-red-700"}`}>
                {verifyResult.entriesChecked} of {verifyResult.totalEntries} entries checked
                {verifyResult.brokenAt && ` — break at entry ${verifyResult.brokenAt}`}
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="card mb-6">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1">
              <label htmlFor="action-filter" className="block text-xs font-medium text-gray-700 mb-1">Action</label>
              <input
                id="action-filter"
                type="text"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                placeholder="e.g. did.created"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="entity-filter" className="block text-xs font-medium text-gray-700 mb-1">Entity Type</label>
              <input
                id="entity-filter"
                type="text"
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                placeholder="e.g. credential"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label htmlFor="from-date" className="block text-xs font-medium text-gray-700 mb-1">From</label>
              <input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label htmlFor="to-date" className="block text-xs font-medium text-gray-700 mb-1">To</label>
              <input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <button
              type="button"
              onClick={handleApplyFilters}
              className="btn-primary text-sm shrink-0"
            >
              Apply
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading audit events">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading audit events&hellip;</p>
            </div>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200" role="table" aria-label="Audit events">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Timestamp</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Actor</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Action</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Entity Type</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Entity ID</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">IP</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                        No audit events found.
                      </td>
                    </tr>
                  ) : (
                    events.map((event) => (
                      <tr key={event.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap font-mono">
                          {formatDate(event.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-[140px] truncate" title={event.userId}>
                          {event.userId}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 font-mono">
                            {event.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{event.entityType}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-mono max-w-[140px] truncate" title={event.entityId}>
                          {event.entityId}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-mono whitespace-nowrap">
                          {event.ipAddress ?? "\u2014"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                <p className="text-xs text-gray-400">
                  Showing {(page - 1) * pageSize + 1}&ndash;{Math.min(page * pageSize, total)} of {total}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                    className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Previous page"
                  >
                    Prev
                  </button>
                  <span className="text-xs text-gray-500 px-2">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page === totalPages}
                    className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Next page"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
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
