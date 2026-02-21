"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getAccessToken, setAccessToken } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionStatus = "active" | "expired" | "revoked";
type DateRange = "7d" | "30d" | "all";
type StatusFilter = "all" | SessionStatus;

interface SharingSession {
  id: string;
  verifierName: string;
  verifierDomain: string;
  credentialTypes: string[];
  claimsDisclosed: string[];
  sharedAt: string;
  expiresAt: string | null;
  status: SessionStatus;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Mock data (used when API returns 404 or network error)
// ---------------------------------------------------------------------------

const MOCK_SESSIONS: SharingSession[] = [
  {
    id: "s1",
    verifierName: "Lund University",
    verifierDomain: "lu.se",
    credentialTypes: ["University Degree"],
    claimsDisclosed: ["Full Name", "Degree Title", "Graduation Year"],
    sharedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
    status: "active",
  },
  {
    id: "s2",
    verifierName: "NHS England",
    verifierDomain: "nhs.uk",
    credentialTypes: ["Health Certificate"],
    claimsDisclosed: ["Full Name", "Certificate Number", "Expiry Date"],
    sharedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    status: "expired",
  },
  {
    id: "s3",
    verifierName: "Acme Financial Services",
    verifierDomain: "acme.com",
    credentialTypes: ["Age Proof"],
    claimsDisclosed: ["Age \u2265 18 (zero-knowledge proof)"],
    sharedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: null,
    status: "revoked",
  },
  {
    id: "s4",
    verifierName: "Singapore ICA",
    verifierDomain: "ica.gov.sg",
    credentialTypes: ["National ID", "Age Proof"],
    claimsDisclosed: ["Full Name", "ID Number", "Age \u2265 21 (zero-knowledge proof)"],
    sharedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    status: "active",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months !== 1 ? "s" : ""} ago`;
}

function formatExpiry(
  expiresAt: string | null,
  status: SessionStatus,
): { label: string; past: boolean } {
  if (status === "revoked") return { label: "Revoked", past: false };
  if (!expiresAt) return { label: "Never expires", past: false };

  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  const diff = exp - now;
  const days = Math.floor(Math.abs(diff) / (24 * 60 * 60 * 1000));

  if (diff < 0) {
    if (days === 0) return { label: "Expired today", past: true };
    if (days === 1) return { label: "Expired yesterday", past: true };
    return { label: `Expired ${days} days ago`, past: true };
  }

  if (days === 0) return { label: "Expires today", past: false };
  if (days === 1) return { label: "Expires tomorrow", past: false };
  return {
    label: `Expires ${new Date(expiresAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
    past: false,
  };
}

function isWithinDays(iso: string, days: number): boolean {
  return Date.now() - new Date(iso).getTime() < days * 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner({ size = 4 }: { size?: number }) {
  return (
    <svg
      className={`w-${size} h-${size} animate-spin`}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
      />
    </svg>
  );
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const styles: Record<SessionStatus, string> = {
    active: "bg-green-100 text-green-800",
    expired: "bg-gray-100 text-gray-600",
    revoked: "bg-red-100 text-red-800",
  };
  const labels: Record<SessionStatus, string> = {
    active: "Active",
    expired: "Expired",
    revoked: "Revoked",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="card text-center py-16">
      {/* Simple SVG illustration */}
      <svg
        className="w-14 h-14 text-gray-200 mx-auto mb-4"
        fill="none"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        <rect x="8" y="16" width="48" height="36" rx="4" stroke="currentColor" strokeWidth="2.5" />
        <path d="M8 26h48" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="32" cy="38" r="6" stroke="currentColor" strokeWidth="2.5" />
        <path d="M32 35v3l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="52" cy="12" r="6" fill="#e5e7eb" stroke="currentColor" strokeWidth="2" />
        <path d="M52 9v4M50 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      {filtered ? (
        <>
          <p className="text-sm font-medium text-gray-700 mb-1">No sessions match your filters</p>
          <p className="text-xs text-gray-400">Try adjusting the status filter or date range.</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-700 mb-1">
            You haven&apos;t shared any credentials yet
          </p>
          <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
            When you present credentials to verifiers, each sharing session will appear here so you
            can track and revoke access.
          </p>
        </>
      )}
    </div>
  );
}

interface SessionCardProps {
  session: SharingSession;
  onRevoke: (id: string) => void;
  revokingId: string | null;
}

function SessionCard({ session, onRevoke, revokingId }: SessionCardProps) {
  const expiry = formatExpiry(session.expiresAt, session.status);
  const isRevoking = revokingId === session.id;

  return (
    <li className="card hover:shadow-md transition-shadow">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        {/* Left: verifier info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-gray-900">{session.verifierName}</p>
            <StatusBadge status={session.status} />
          </div>
          <p className="text-xs text-gray-400 mb-2">{session.verifierDomain}</p>

          {/* Credential types */}
          <div className="flex flex-wrap gap-1 mb-2">
            {session.credentialTypes.map((type) => (
              <span
                key={type}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-50 text-primary-700 border border-primary-100"
              >
                {type}
              </span>
            ))}
          </div>

          {/* Claims disclosed */}
          <div className="mb-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Claims disclosed:</p>
            <div className="flex flex-wrap gap-1">
              {session.claimsDisclosed.map((claim) => (
                <span
                  key={claim}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs text-gray-600 bg-gray-50 border border-gray-200"
                >
                  {claim}
                </span>
              ))}
            </div>
          </div>

          {/* Timestamps */}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400">
            <span>
              Shared{" "}
              <span className="text-gray-600" title={formatDate(session.sharedAt)}>
                {formatRelative(session.sharedAt)}
              </span>
            </span>
            <span
              className={expiry.past ? "text-danger-600" : "text-gray-400"}
            >
              {expiry.label}
            </span>
          </div>
        </div>

        {/* Right: revoke button (active sessions only) */}
        {session.status === "active" && (
          <div className="shrink-0 sm:ml-4">
            <button
              type="button"
              onClick={() => onRevoke(session.id)}
              disabled={isRevoking}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-danger-600 bg-danger-50 border border-danger-200 rounded-lg hover:bg-danger-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-500 focus-visible:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={`Revoke access for ${session.verifierName}`}
            >
              {isRevoking ? (
                <>
                  <Spinner size={3} />
                  Revoking&hellip;
                </>
              ) : (
                "Revoke Access"
              )}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog (simple native confirm — avoids modal complexity)
// ---------------------------------------------------------------------------

function useRevoke(
  sessions: SharingSession[],
  setSessions: React.Dispatch<React.SetStateAction<SharingSession[]>>,
  setActionError: React.Dispatch<React.SetStateAction<string | null>>,
  setActionSuccess: React.Dispatch<React.SetStateAction<string | null>>,
  handleUnauthorized: () => void,
) {
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleRevoke = useCallback(
    async (id: string) => {
      const session = sessions.find((s) => s.id === id);
      const verifierName = session?.verifierName ?? "this verifier";

      const confirmed = window.confirm(
        `Revoke access for ${verifierName}? They will no longer be able to verify your credentials from this session.`,
      );
      if (!confirmed) return;

      setRevokingId(id);
      setActionError(null);
      setActionSuccess(null);

      try {
        const res = await apiFetch(`/wallet/sharing/${id}`, { method: "DELETE" });

        if (res.status === 401) {
          handleUnauthorized();
          return;
        }

        if (!res.ok && res.status !== 404) {
          const data = await res.json().catch(() => ({}));
          setActionError(
            (data as { detail?: string }).detail ??
              (data as { message?: string }).message ??
              "Failed to revoke session.",
          );
          return;
        }

        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: "revoked" as const } : s)),
        );
        setActionSuccess(`Access revoked for ${verifierName}.`);
      } catch {
        setActionError("Could not connect to the server.");
      } finally {
        setRevokingId(null);
      }
    },
    [sessions, handleUnauthorized, setActionError, setActionSuccess, setSessions],
  );

  return { revokingId, handleRevoke };
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;

export default function WalletSharingPage() {
  const router = useRouter();

  const [sessions, setSessions] = useState<SharingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");

  // Pagination
  const [page, setPage] = useState(1);
  const [_pagination, _setPagination] = useState<PaginationMeta | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch("/wallet/sharing?page=1&limit=100&status=all");

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      // Fall back to mock data if API endpoint not yet implemented
      if (res.status === 404 || res.status === 501) {
        setSessions(MOCK_SESSIONS);
        setUsingMock(true);
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to load sharing history.");
      }

      const data = await res.json();
      setSessions(data.sessions ?? data.data ?? []);
      if (data.pagination) {
        _setPagination(data.pagination);
      }
    } catch {
      // Network error — use mock data gracefully
      setSessions(MOCK_SESSIONS);
      setUsingMock(true);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }

    fetchSessions()
      .catch(() => setError("Could not load sharing history. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchSessions]);

  const { revokingId, handleRevoke } = useRevoke(
    sessions,
    setSessions,
    setActionError,
    setActionSuccess,
    handleUnauthorized,
  );

  // ---------------------------------------------------------------------------
  // Derived stats
  // ---------------------------------------------------------------------------

  const totalShares = sessions.length;
  const activeSessions = sessions.filter((s) => s.status === "active").length;
  const last30Days = sessions.filter((s) => isWithinDays(s.sharedAt, 30)).length;

  // ---------------------------------------------------------------------------
  // Client-side filtering and pagination
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    let result = sessions;

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((s) => s.status === statusFilter);
    }

    // Date range filter
    if (dateRange === "7d") {
      result = result.filter((s) => isWithinDays(s.sharedAt, 7));
    } else if (dateRange === "30d") {
      result = result.filter((s) => isWithinDays(s.sharedAt, 30));
    }

    // Search filter (verifier name)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (s) =>
          s.verifierName.toLowerCase().includes(q) ||
          s.verifierDomain.toLowerCase().includes(q),
      );
    }

    return result;
  }, [sessions, statusFilter, dateRange, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset page when filters change
  const handleFilterChange = useCallback(
    <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
      setter(value);
      setPage(1);
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const statusOptions: Array<{ value: StatusFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "expired", label: "Expired" },
    { value: "revoked", label: "Revoked" },
  ];

  const dateOptions: Array<{ value: DateRange; label: string }> = [
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "all", label: "All time" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navigation */}
      <nav className="border-b border-gray-100 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/"
              className="flex items-center gap-2 no-underline hover:no-underline"
              aria-label="HumanID Wallet home"
            >
              <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm" aria-hidden="true">
                  H
                </span>
              </div>
              <span className="font-semibold text-gray-900">HumanID Wallet</span>
            </Link>

            <div
              className="hidden sm:flex items-center gap-4"
              role="navigation"
              aria-label="Wallet navigation"
            >
              <Link
                href="/wallet"
                className="text-sm text-gray-600 hover:text-gray-900 no-underline transition-colors"
              >
                Wallet
              </Link>
              <Link
                href="/wallet/credentials"
                className="text-sm text-gray-600 hover:text-gray-900 no-underline transition-colors"
              >
                Credentials
              </Link>
              <Link
                href="/wallet/dids"
                className="text-sm text-gray-600 hover:text-gray-900 no-underline transition-colors"
              >
                DIDs
              </Link>
              <Link
                href="/wallet/sharing"
                className="text-sm font-medium text-primary-500 no-underline"
                aria-current="page"
              >
                Sharing
              </Link>
              <Link
                href="/wallet/security"
                className="text-sm text-gray-600 hover:text-gray-900 no-underline transition-colors"
              >
                Security
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Sharing History</h1>
          <p className="mt-1 text-sm text-gray-500">
            Every time you&apos;ve shared a credential with a verifier
          </p>
        </div>

        {/* Mock data notice */}
        {usingMock && !loading && (
          <div
            role="status"
            className="mb-6 flex items-start gap-3 rounded-lg bg-warning-50 border border-warning-200 px-4 py-3"
          >
            <svg
              className="w-4 h-4 text-warning-600 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            <p className="text-xs text-warning-700">
              Showing sample data &mdash; sharing history API is not yet available. Real sessions
              will appear here once the endpoint is live.
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div
            className="flex items-center justify-center py-24"
            role="status"
            aria-label="Loading sharing history"
          >
            <div className="flex flex-col items-center gap-3">
              <svg
                className="w-8 h-8 animate-spin text-primary-500"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
                />
              </svg>
              <p className="text-sm text-gray-500">Loading sharing history&hellip;</p>
            </div>
          </div>
        )}

        {/* Hard error (API unreachable and mock also failed) */}
        {!loading && error && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3"
          >
            <svg
              className="w-5 h-5 text-danger-500 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            <p className="text-sm text-danger-700">{error}</p>
          </div>
        )}

        {/* Action feedback */}
        {actionSuccess && (
          <div
            role="status"
            className="mb-6 flex items-start gap-3 rounded-lg bg-success-50 border border-success-200 px-4 py-3"
          >
            <svg
              className="w-5 h-5 text-success-600 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <p className="text-sm text-success-700">{actionSuccess}</p>
          </div>
        )}
        {actionError && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3"
          >
            <svg
              className="w-5 h-5 text-danger-500 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            <p className="text-sm text-danger-700">{actionError}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="card">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Total Shares
                </p>
                <p className="text-3xl font-bold text-gray-900">{totalShares}</p>
                <p className="text-xs text-gray-400 mt-1">all time</p>
              </div>
              <div className="card">
                <p className="text-xs font-medium text-success-600 uppercase tracking-wide mb-1">
                  Active Sessions
                </p>
                <p className="text-3xl font-bold text-gray-900">{activeSessions}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {activeSessions === 1 ? "verifier has access" : "verifiers have access"}
                </p>
              </div>
              <div className="card">
                <p className="text-xs font-medium text-primary-500 uppercase tracking-wide mb-1">
                  Last 30 Days
                </p>
                <p className="text-3xl font-bold text-gray-900">{last30Days}</p>
                <p className="text-xs text-gray-400 mt-1">recent shares</p>
              </div>
            </div>

            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              {/* Search */}
              <div className="relative flex-1 min-w-0">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <svg
                    className="w-4 h-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                    />
                  </svg>
                </div>
                <input
                  type="search"
                  placeholder="Search verifier name or domain..."
                  value={search}
                  onChange={(e) => handleFilterChange(setSearch, e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:border-primary-500 transition-colors"
                  aria-label="Search by verifier name or domain"
                />
              </div>

              {/* Status filter */}
              <div
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1"
                role="group"
                aria-label="Filter by status"
              >
                {statusOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleFilterChange(setStatusFilter, opt.value)}
                    aria-pressed={statusFilter === opt.value}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                      statusFilter === opt.value
                        ? "bg-primary-500 text-white"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Date range filter */}
              <div
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1"
                role="group"
                aria-label="Filter by date range"
              >
                {dateOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleFilterChange(setDateRange, opt.value)}
                    aria-pressed={dateRange === opt.value}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 whitespace-nowrap ${
                      dateRange === opt.value
                        ? "bg-primary-500 text-white"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Session list */}
            {paginated.length === 0 ? (
              <EmptyState filtered={filtered.length === 0 && sessions.length > 0} />
            ) : (
              <ul className="space-y-3" role="list" aria-label="Sharing sessions">
                {paginated.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onRevoke={handleRevoke}
                    revokingId={revokingId}
                  />
                ))}
              </ul>
            )}

            {/* Count and pagination */}
            {filtered.length > 0 && (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-xs text-gray-400">
                  Showing{" "}
                  {Math.min((currentPage - 1) * PAGE_SIZE + 1, filtered.length)}&ndash;
                  {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}{" "}
                  session{filtered.length !== 1 ? "s" : ""}
                </p>

                {totalPages > 1 && (
                  <nav
                    className="flex items-center gap-2"
                    aria-label="Sharing history pagination"
                  >
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Previous page"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 19.5 8.25 12l7.5-7.5"
                        />
                      </svg>
                      Previous
                    </button>

                    <div className="flex items-center gap-1" aria-label="Page numbers">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPage(p)}
                          aria-label={`Page ${p}`}
                          aria-current={p === currentPage ? "page" : undefined}
                          className={`w-8 h-8 text-xs font-medium rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors ${
                            p === currentPage
                              ? "bg-primary-500 text-white"
                              : "text-gray-600 bg-white border border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Next page"
                    >
                      Next
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m8.25 4.5 7.5 7.5-7.5 7.5"
                        />
                      </svg>
                    </button>
                  </nav>
                )}
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
