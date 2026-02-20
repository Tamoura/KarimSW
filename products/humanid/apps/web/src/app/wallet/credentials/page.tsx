"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE = "http://localhost:5013/api/v1";

type CredentialStatus = "OFFERED" | "ACTIVE" | "REVOKED" | "EXPIRED" | "SUSPENDED";

interface Credential {
  id: string;
  credentialType: string;
  status: CredentialStatus;
  issuerDid: string;
  issuedAt: string;
  expiresAt: string | null;
  acceptedAt: string | null;
}

function StatusBadge({ status }: { status: CredentialStatus }) {
  const styles: Record<CredentialStatus, string> = {
    OFFERED: "bg-amber-100 text-amber-800",
    ACTIVE: "bg-green-100 text-green-800",
    REVOKED: "bg-red-100 text-red-800",
    EXPIRED: "bg-gray-100 text-gray-600",
    SUSPENDED: "bg-orange-100 text-orange-700",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-4 py-2 border-b border-gray-100 last:border-0">
      <dt className="text-xs font-medium text-gray-500 sm:w-32 shrink-0">{label}</dt>
      <dd className="text-xs text-gray-900 font-mono break-all">{value}</dd>
    </div>
  );
}

function CredentialCard({ credential }: { credential: Credential }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="card hover:shadow-md transition-shadow">
      <button
        type="button"
        className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={`credential-details-${credential.id}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-sm font-semibold text-gray-900">{credential.credentialType}</p>
              <StatusBadge status={credential.status} />
            </div>
            <p className="text-xs text-gray-400 font-mono truncate" title={credential.issuerDid}>
              Issuer: {credential.issuerDid.length > 40 ? `${credential.issuerDid.slice(0, 40)}…` : credential.issuerDid}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Issued {formatDate(credential.issuedAt)}
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded detail panel */}
      {expanded && (
        <div
          id={`credential-details-${credential.id}`}
          className="mt-4 pt-4 border-t border-gray-100"
        >
          <dl>
            <DetailRow label="ID" value={credential.id} />
            <DetailRow label="Type" value={credential.credentialType} />
            <DetailRow label="Status" value={credential.status} />
            <DetailRow label="Issuer DID" value={credential.issuerDid} />
            <DetailRow label="Issued At" value={formatDate(credential.issuedAt)} />
            <DetailRow label="Expires At" value={formatDate(credential.expiresAt)} />
            <DetailRow label="Accepted At" value={formatDate(credential.acceptedAt)} />
          </dl>
        </div>
      )}
    </li>
  );
}

export default function WalletCredentialsPage() {
  const router = useRouter();

  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | CredentialStatus>("ALL");

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    router.push("/login");
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");

    if (!token) {
      router.push("/login");
      return;
    }

    fetch(`${API_BASE}/wallet/credentials`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.status === 401) { handleUnauthorized(); return; }
        if (!res.ok) throw new Error("Failed to load credentials.");
        const data = await res.json();
        setCredentials(data.credentials ?? []);
      })
      .catch(() => setError("Could not load your credentials. Please try again."))
      .finally(() => setLoading(false));
  }, [router, handleUnauthorized]);

  const statusFilters: Array<"ALL" | CredentialStatus> = [
    "ALL", "ACTIVE", "OFFERED", "REVOKED", "EXPIRED", "SUSPENDED",
  ];

  const displayed = filter === "ALL"
    ? credentials
    : credentials.filter((c) => c.status === filter);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link
              href="/wallet"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors no-underline"
              aria-label="Back to wallet"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Wallet
            </Link>
            <span className="text-gray-300" aria-hidden="true">/</span>
            <span className="text-sm font-medium text-gray-900">My Credentials</span>

            <div className="ml-auto flex items-center gap-2">
              <Link href="/" className="flex items-center gap-2 no-underline hover:no-underline">
                <div className="w-7 h-7 rounded-lg bg-primary-500 flex items-center justify-center">
                  <span className="text-white font-bold text-xs" aria-hidden="true">H</span>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Credentials</h1>
          <p className="mt-1 text-sm text-gray-500">
            All verifiable credentials in your wallet. Click a credential to expand details.
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading credentials">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading credentials…</p>
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3">
            <svg className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-sm text-danger-700">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Filter tabs */}
            <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Filter credentials by status">
              {statusFilters.map((s) => {
                const count = s === "ALL" ? credentials.length : credentials.filter((c) => c.status === s).length;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFilter(s)}
                    aria-pressed={filter === s}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                      filter === s
                        ? "bg-primary-500 text-white"
                        : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900"
                    }`}
                  >
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                    <span
                      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-xs ${
                        filter === s ? "bg-primary-400 text-white" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Credential list */}
            {displayed.length === 0 ? (
              <div className="card text-center py-16">
                <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                </svg>
                <p className="text-sm text-gray-500">
                  {filter === "ALL"
                    ? "No credentials in your wallet yet."
                    : `No ${filter.toLowerCase()} credentials.`}
                </p>
              </div>
            ) : (
              <ul className="space-y-3" role="list" aria-label="Credentials">
                {displayed.map((cred) => (
                  <CredentialCard key={cred.id} credential={cred} />
                ))}
              </ul>
            )}

            <p className="mt-4 text-xs text-gray-400 text-right">
              Showing {displayed.length} of {credentials.length} credential{credentials.length !== 1 ? "s" : ""}
            </p>
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
