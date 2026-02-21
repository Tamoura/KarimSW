"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAccessToken, setAccessToken } from "@/lib/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5013/api/v1";

type DelegationStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

interface Delegation {
  id: string;
  delegateId: string;
  credentialTypes: string[];
  constraints?: Record<string, unknown>;
  status: DelegationStatus;
  expiresAt?: string;
  createdAt: string;
}

interface ChainResult {
  delegateId: string;
  chain?: unknown[];
  valid?: boolean;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
      <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-8.25a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      <p className="text-xs text-red-700">{message}</p>
    </div>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div role="status" className="mb-4 flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2.5">
      <svg className="w-4 h-4 text-green-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
      <p className="text-xs text-green-700">{message}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: DelegationStatus }) {
  const styles: Record<DelegationStatus, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    REVOKED: "bg-red-100 text-red-800",
    EXPIRED: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DelegatedIssuancePage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Grant form
  const [grantDelegateId, setGrantDelegateId] = useState("");
  const [grantCredentialTypes, setGrantCredentialTypes] = useState("");
  const [grantConstraints, setGrantConstraints] = useState("");
  const [grantExpiresAt, setGrantExpiresAt] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantSuccess, setGrantSuccess] = useState<string | null>(null);

  // Verify chain panel
  const [verifyDelegateId, setVerifyDelegateId] = useState("");
  const [verifyingChain, setVerifyingChain] = useState(false);
  const [chainResult, setChainResult] = useState<ChainResult | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);

  // Revoke
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeSuccess, setRevokeSuccess] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchDelegations = useCallback(async (token: string) => {
    const res = await fetch(`${API_BASE}/issuance-delegation`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error("Failed to load delegations.");
    const data = await res.json();
    setDelegations(data.delegations ?? data ?? []);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) { router.push("/login"); return; }
    setEmail("");
    fetchDelegations(token)
      .catch(() => setError("Could not load delegations. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchDelegations]);

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }
    if (!grantDelegateId.trim()) { setGrantError("Delegate ID is required."); return; }
    if (!grantCredentialTypes.trim()) { setGrantError("At least one credential type is required."); return; }

    let constraints: Record<string, unknown> | undefined;
    if (grantConstraints.trim()) {
      try {
        constraints = JSON.parse(grantConstraints);
      } catch {
        setGrantError("Constraints must be valid JSON.");
        return;
      }
    }

    const credentialTypes = grantCredentialTypes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setGranting(true);
    setGrantError(null);
    setGrantSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/issuance-delegation/grant`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          delegateId: grantDelegateId.trim(),
          credentialTypes,
          constraints,
          expiresAt: grantExpiresAt || undefined,
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGrantError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to grant delegation."
        );
        return;
      }

      const data = await res.json();
      const newDelegation: Delegation = data.delegation ?? data;
      setDelegations((prev) => [newDelegation, ...prev]);
      setGrantSuccess(`Delegation granted to "${grantDelegateId.trim()}".`);
      setGrantDelegateId("");
      setGrantCredentialTypes("");
      setGrantConstraints("");
      setGrantExpiresAt("");
    } catch {
      setGrantError("Could not connect to the server.");
    } finally {
      setGranting(false);
    }
  }

  async function handleVerifyChain(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }
    if (!verifyDelegateId.trim()) { setChainError("Delegate ID is required."); return; }

    setVerifyingChain(true);
    setChainError(null);
    setChainResult(null);

    try {
      const res = await fetch(`${API_BASE}/issuance-delegation/verify-chain/${encodeURIComponent(verifyDelegateId.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setChainError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Chain verification failed."
        );
        return;
      }

      const data = await res.json();
      setChainResult(data);
    } catch {
      setChainError("Could not connect to the server.");
    } finally {
      setVerifyingChain(false);
    }
  }

  async function handleRevoke(id: string) {
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    setRevokingId(id);
    setRevokeError(null);
    setRevokeSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/issuance-delegation/${id}/revoke`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRevokeError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to revoke delegation."
        );
        return;
      }

      setDelegations((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: "REVOKED" as DelegationStatus } : d))
      );
      setRevokeSuccess("Delegation revoked successfully.");
    } catch {
      setRevokeError("Could not connect to the server.");
    } finally {
      setRevokingId(null);
    }
  }

  function handleLogout() {
    setAccessToken(null);
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 no-underline hover:no-underline">
                <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
                  <span className="text-white font-bold text-sm" aria-hidden="true">H</span>
                </div>
                <span className="font-bold text-gray-900 text-lg">HumanID</span>
              </Link>
              <span className="text-gray-300" aria-hidden="true">/</span>
              <span className="text-sm font-medium text-primary-600">Delegated Issuance</span>
            </div>
            <div className="flex items-center gap-3">
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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Delegated Issuance</h1>
          <p className="mt-1 text-sm text-gray-500">
            Grant and manage credential issuance authority to delegate issuers.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading delegations">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading delegations&hellip;</p>
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
          <div className="space-y-6">
            {/* Grant delegation form */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Grant Delegation</h2>
              {grantSuccess && <SuccessBanner message={grantSuccess} />}
              <form onSubmit={handleGrant} noValidate>
                {grantError && <ErrorBanner message={grantError} />}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label htmlFor="grant-delegate-id" className="block text-xs font-medium text-gray-700 mb-1">
                      Delegate ID <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="grant-delegate-id"
                      type="text"
                      value={grantDelegateId}
                      onChange={(e) => setGrantDelegateId(e.target.value)}
                      placeholder="did:key:... or user ID"
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="grant-expires-at" className="block text-xs font-medium text-gray-700 mb-1">
                      Expires At (optional)
                    </label>
                    <input
                      id="grant-expires-at"
                      type="datetime-local"
                      value={grantExpiresAt}
                      onChange={(e) => setGrantExpiresAt(e.target.value)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="grant-credential-types" className="block text-xs font-medium text-gray-700 mb-1">
                      Credential Types (comma-separated) <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="grant-credential-types"
                      type="text"
                      value={grantCredentialTypes}
                      onChange={(e) => setGrantCredentialTypes(e.target.value)}
                      placeholder="VerifiableCredential, EmploymentCredential"
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="grant-constraints" className="block text-xs font-medium text-gray-700 mb-1">
                      Constraints (JSON, optional)
                    </label>
                    <textarea
                      id="grant-constraints"
                      value={grantConstraints}
                      onChange={(e) => setGrantConstraints(e.target.value)}
                      placeholder='{"maxIssuances": 100}'
                      rows={3}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                    />
                  </div>
                </div>
                <button type="submit" disabled={granting} className="btn-primary text-sm">
                  {granting ? (
                    <span className="flex items-center gap-2"><Spinner />Granting&hellip;</span>
                  ) : (
                    "Grant Delegation"
                  )}
                </button>
              </form>
            </div>

            {/* Verify chain panel */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Verify Delegation Chain</h2>
              <form onSubmit={handleVerifyChain} noValidate className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label htmlFor="verify-delegate-id" className="block text-xs font-medium text-gray-700 mb-1">
                    Delegate ID
                  </label>
                  <input
                    id="verify-delegate-id"
                    type="text"
                    value={verifyDelegateId}
                    onChange={(e) => setVerifyDelegateId(e.target.value)}
                    placeholder="Enter delegate ID to verify chain"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div className="flex items-end">
                  <button type="submit" disabled={verifyingChain} className="btn-primary text-sm whitespace-nowrap">
                    {verifyingChain ? (
                      <span className="flex items-center gap-2"><Spinner />Verifying&hellip;</span>
                    ) : (
                      "Verify Chain"
                    )}
                  </button>
                </div>
              </form>
              {chainError && <div className="mt-3"><ErrorBanner message={chainError} /></div>}
              {chainResult && (
                <div className="mt-4">
                  <div className={`rounded-lg px-3 py-2 mb-3 ${chainResult.valid ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
                    <p className={`text-sm font-semibold ${chainResult.valid ? "text-green-700" : "text-amber-700"}`}>
                      {chainResult.valid ? "Chain is valid" : "Chain validity unknown"}
                    </p>
                  </div>
                  <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(chainResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Delegations table */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Delegations</h2>
              {revokeSuccess && <SuccessBanner message={revokeSuccess} />}
              {revokeError && <ErrorBanner message={revokeError} />}
              {delegations.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
                  </svg>
                  <p className="text-sm text-gray-500">No delegations granted yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200" role="table" aria-label="Delegations">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Delegate ID</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Credential Types</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Expires</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {delegations.map((d) => (
                        <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-xs font-mono text-gray-700 max-w-[140px] truncate" title={d.delegateId}>
                            {d.delegateId}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {d.credentialTypes.map((ct) => (
                                <span key={ct} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                                  {ct}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={d.status} />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(d.expiresAt)}</td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(d.createdAt)}</td>
                          <td className="px-4 py-3 text-right">
                            {d.status === "ACTIVE" && (
                              <button
                                type="button"
                                onClick={() => handleRevoke(d.id)}
                                disabled={revokingId === d.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors disabled:opacity-50"
                                aria-label={`Revoke delegation for ${d.delegateId}`}
                              >
                                {revokingId === d.id ? <><Spinner />Revoking&hellip;</> : "Revoke"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
