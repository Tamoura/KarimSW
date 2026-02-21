"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAccessToken, setAccessToken } from "@/lib/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5013/api/v1";

type DidStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

interface Did {
  id: string;
  did: string;
  method: string;
  status: DidStatus;
  publicKey?: string;
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

function StatusBadge({ status }: { status: DidStatus }) {
  const styles: Record<DidStatus, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    SUSPENDED: "bg-orange-100 text-orange-700",
    DEACTIVATED: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function truncate(s: string, len = 20): string {
  if (s.length <= len + 6) return s;
  return `${s.slice(0, len)}\u2026`;
}

export default function WalletDidsPage() {
  const router = useRouter();

  const [dids, setDids] = useState<Did[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [creatingDid, setCreatingDid] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ id: string; type: "suspend" | "reactivate" | "deactivate" } | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newMethod, setNewMethod] = useState("key");

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchDids = useCallback(async (token: string) => {
    const res = await fetch(`${API_BASE}/dids`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error("Failed to load DIDs.");
    const data = await res.json();
    setDids(data.dids ?? []);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) { router.push("/login"); return; }

    fetchDids(token)
      .catch(() => setError("Could not load DIDs. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchDids]);

  async function handleCreate() {
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    setCreatingDid(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/dids`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ method: newMethod }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to create DID."
        );
        return;
      }

      const created: Did = await res.json();
      setDids((prev) => [created, ...prev]);
      setActionSuccess("DID created successfully.");
      setShowCreateForm(false);
    } catch {
      setActionError("Could not connect to the server.");
    } finally {
      setCreatingDid(false);
    }
  }

  async function handleStatusChange(
    id: string,
    newStatus: "SUSPENDED" | "ACTIVE" | "DEACTIVATED"
  ) {
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    setPendingAction({ id, type: newStatus === "SUSPENDED" ? "suspend" : newStatus === "ACTIVE" ? "reactivate" : "deactivate" });
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/dids/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to update DID status."
        );
        return;
      }

      setDids((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: newStatus } : d))
      );
      setActionSuccess(`DID ${newStatus.toLowerCase()} successfully.`);
    } catch {
      setActionError("Could not connect to the server.");
    } finally {
      setPendingAction(null);
    }
  }

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
            <span className="text-sm font-medium text-gray-900">DIDs</span>
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
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Decentralised Identifiers</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your DIDs. Each DID has an Ed25519 key pair for signing and verifying credentials.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setShowCreateForm((v) => !v); setActionError(null); }}
            className="btn-primary text-sm shrink-0"
          >
            {showCreateForm ? "Cancel" : "+ New DID"}
          </button>
        </div>

        {/* Create DID form */}
        {showCreateForm && (
          <div className="card mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Create New DID</h2>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
              <div>
                <label htmlFor="did-method" className="block text-xs font-medium text-gray-700 mb-1">
                  DID Method
                </label>
                <select
                  id="did-method"
                  value={newMethod}
                  onChange={(e) => setNewMethod(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="key">did:key</option>
                  <option value="web">did:web</option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creatingDid}
                className="btn-primary text-sm"
              >
                {creatingDid ? (
                  <span className="flex items-center gap-2">
                    <Spinner />
                    Creating&hellip;
                  </span>
                ) : (
                  "Create DID"
                )}
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              A new Ed25519 key pair will be generated. The public key is embedded in the DID document.
            </p>
          </div>
        )}

        {/* Feedback banners */}
        {actionSuccess && (
          <div role="status" className="mb-6 flex items-start gap-3 rounded-lg bg-success-50 border border-success-200 px-4 py-3">
            <svg className="w-5 h-5 text-success-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <p className="text-sm text-success-700">{actionSuccess}</p>
          </div>
        )}
        {actionError && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3">
            <svg className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-sm text-danger-700">{actionError}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading DIDs">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading DIDs&hellip;</p>
            </div>
          </div>
        )}

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
            {dids.length === 0 ? (
              <div className="card text-center py-16">
                <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z" />
                </svg>
                <p className="text-sm text-gray-500 mb-4">No DIDs registered yet.</p>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(true)}
                  className="btn-primary text-sm"
                >
                  Create Your First DID
                </button>
              </div>
            ) : (
              <ul className="space-y-4" role="list" aria-label="DID list">
                {dids.map((did) => {
                  const isLoading = pendingAction?.id === did.id;
                  return (
                    <li key={did.id} className="card">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <StatusBadge status={did.status} />
                            <span className="text-xs text-gray-400 font-medium uppercase">
                              {did.method}
                            </span>
                          </div>
                          <p
                            className="text-sm font-mono text-gray-900 break-all"
                            title={did.did}
                          >
                            {did.did}
                          </p>
                          {did.publicKey && (
                            <p className="mt-2 text-xs text-gray-400">
                              <span className="font-medium text-gray-500">Public key:</span>{" "}
                              <span className="font-mono">{truncate(did.publicKey, 32)}</span>
                            </p>
                          )}
                          <p className="mt-1 text-xs text-gray-400">
                            Created {formatDate(did.createdAt)}
                          </p>
                        </div>

                        {did.status !== "DEACTIVATED" && (
                          <div className="flex items-center gap-2 shrink-0">
                            {did.status === "ACTIVE" && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(did.id, "SUSPENDED")}
                                disabled={isLoading}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-warning-700 bg-warning-50 border border-warning-200 rounded-lg hover:bg-warning-100 focus:outline-none focus:ring-2 focus:ring-warning-500 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label={`Suspend DID ${truncate(did.did, 16)}`}
                              >
                                {isLoading && pendingAction?.type === "suspend" ? <Spinner /> : null}
                                Suspend
                              </button>
                            )}
                            {did.status === "SUSPENDED" && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(did.id, "ACTIVE")}
                                disabled={isLoading}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-success-700 bg-success-50 border border-success-200 rounded-lg hover:bg-success-100 focus:outline-none focus:ring-2 focus:ring-success-500 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label={`Reactivate DID ${truncate(did.did, 16)}`}
                              >
                                {isLoading && pendingAction?.type === "reactivate" ? <Spinner /> : null}
                                Reactivate
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleStatusChange(did.id, "DEACTIVATED")}
                              disabled={isLoading}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-danger-600 bg-danger-50 border border-danger-200 rounded-lg hover:bg-danger-100 focus:outline-none focus:ring-2 focus:ring-danger-500 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              aria-label={`Deactivate DID ${truncate(did.did, 16)}`}
                            >
                              {isLoading && pendingAction?.type === "deactivate" ? <Spinner /> : null}
                              Deactivate
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="mt-4 text-xs text-gray-400 text-right">
              {dids.length} DID{dids.length !== 1 ? "s" : ""} total
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
