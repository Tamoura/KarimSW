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

interface Did {
  id: string;
  did: string;
  method: string;
  status: string;
  createdAt: string;
}

interface WalletData {
  credentials: Credential[];
  total: number;
}

interface DidsData {
  dids: Did[];
  total: number;
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

function Spinner() {
  return (
    <svg
      className="w-4 h-4 animate-spin"
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

function truncateDid(did: string, chars = 20): string {
  if (did.length <= chars + 6) return did;
  return `${did.slice(0, chars)}…`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function WalletPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string>("");
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [dids, setDids] = useState<Did[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [acceptSuccess, setAcceptSuccess] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    router.push("/login");
  }, [router]);

  const fetchData = useCallback(async (token: string) => {
    const headers = { Authorization: `Bearer ${token}` };

    const [credRes, didRes] = await Promise.all([
      fetch(`${API_BASE}/wallet/credentials`, { headers }),
      fetch(`${API_BASE}/dids`, { headers }),
    ]);

    if (credRes.status === 401 || didRes.status === 401) {
      handleUnauthorized();
      return;
    }

    if (!credRes.ok) {
      throw new Error("Failed to load credentials.");
    }
    if (!didRes.ok) {
      throw new Error("Failed to load DIDs.");
    }

    const credData: WalletData = await credRes.json();
    const didData: DidsData = await didRes.json();

    setCredentials(credData.credentials ?? []);
    setDids(didData.dids ?? []);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const storedEmail = localStorage.getItem("user_email");

    if (!token) {
      router.push("/login");
      return;
    }

    setEmail(storedEmail ?? "");

    fetchData(token)
      .catch(() => setError("Could not load your wallet. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchData]);

  async function handleAccept(id: string) {
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    setAcceptingId(id);
    setAcceptError(null);
    setAcceptSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/wallet/credentials/${id}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAcceptError((data as { detail?: string; message?: string }).detail ?? (data as { message?: string }).message ?? "Failed to accept credential.");
        return;
      }

      setCredentials((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "ACTIVE", acceptedAt: new Date().toISOString() } : c))
      );
      setAcceptSuccess("Credential accepted successfully.");
    } catch {
      setAcceptError("Could not connect to the server.");
    } finally {
      setAcceptingId(null);
    }
  }

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    router.push("/login");
  }

  const total = credentials.length;
  const active = credentials.filter((c) => c.status === "ACTIVE").length;
  const offered = credentials.filter((c) => c.status === "OFFERED").length;
  const revoked = credentials.filter((c) => c.status === "REVOKED").length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2 no-underline hover:no-underline">
              <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm" aria-hidden="true">H</span>
              </div>
              <span className="font-bold text-gray-900 text-lg">HumanID</span>
            </Link>

            <nav className="hidden sm:flex items-center gap-6 text-sm font-medium">
              <span className="text-primary-600 border-b-2 border-primary-500 pb-0.5">Wallet</span>
              <Link href="/wallet/credentials" className="text-gray-500 hover:text-gray-900 transition-colors no-underline">
                Credentials
              </Link>
              <Link href="/wallet/sharing" className="text-gray-500 hover:text-gray-900 transition-colors no-underline">
                Sharing
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <span className="hidden sm:block text-sm text-gray-500 truncate max-w-xs" title={email}>
                {email}
              </span>
              <button
                onClick={handleLogout}
                className="btn-secondary px-3 py-1.5 text-sm"
                type="button"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Your Identity Wallet</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your decentralised identifiers and verifiable credentials.
          </p>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading wallet data">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading your wallet…</p>
            </div>
          </div>
        )}

        {/* Fetch error */}
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
            {/* Accept feedback banners */}
            {acceptSuccess && (
              <div role="status" className="mb-6 flex items-start gap-3 rounded-lg bg-success-50 border border-success-200 px-4 py-3">
                <svg className="w-5 h-5 text-success-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                <p className="text-sm text-success-700">{acceptSuccess}</p>
              </div>
            )}
            {acceptError && (
              <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3">
                <svg className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <p className="text-sm text-danger-700">{acceptError}</p>
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="card">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total</p>
                <p className="text-3xl font-bold text-gray-900">{total}</p>
                <p className="text-xs text-gray-400 mt-1">credentials</p>
              </div>
              <div className="card">
                <p className="text-xs font-medium text-success-600 uppercase tracking-wide mb-1">Active</p>
                <p className="text-3xl font-bold text-gray-900">{active}</p>
                <p className="text-xs text-gray-400 mt-1">credentials</p>
              </div>
              <div className="card">
                <p className="text-xs font-medium text-amber-600 uppercase tracking-wide mb-1">Offered</p>
                <p className="text-3xl font-bold text-gray-900">{offered}</p>
                <p className="text-xs text-gray-400 mt-1">pending accept</p>
              </div>
              <div className="card">
                <p className="text-xs font-medium text-danger-600 uppercase tracking-wide mb-1">Revoked</p>
                <p className="text-3xl font-bold text-gray-900">{revoked}</p>
                <p className="text-xs text-gray-400 mt-1">credentials</p>
              </div>
            </div>

            {/* Two-column layout: credentials list + sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Credentials list */}
              <div className="lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-900">Credentials</h2>
                  <Link
                    href="/wallet/credentials"
                    className="text-sm font-medium text-primary-500 hover:text-primary-600 no-underline"
                  >
                    View all
                  </Link>
                </div>

                {credentials.length === 0 ? (
                  <div className="card text-center py-12">
                    <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                    </svg>
                    <p className="text-sm text-gray-500">No credentials in your wallet yet.</p>
                  </div>
                ) : (
                  <ul className="space-y-3" role="list" aria-label="Credential list">
                    {credentials.map((cred) => (
                      <li key={cred.id} className="card hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <p className="text-sm font-semibold text-gray-900 truncate">
                                {cred.credentialType}
                              </p>
                              <StatusBadge status={cred.status} />
                            </div>
                            <p className="text-xs text-gray-400 font-mono truncate" title={cred.issuerDid}>
                              Issuer: {truncateDid(cred.issuerDid)}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              Issued {formatDate(cred.issuedAt)}
                              {cred.expiresAt ? ` · Expires ${formatDate(cred.expiresAt)}` : ""}
                            </p>
                          </div>

                          {cred.status === "OFFERED" && (
                            <button
                              type="button"
                              onClick={() => handleAccept(cred.id)}
                              disabled={acceptingId === cred.id}
                              className="btn-primary px-3 py-1.5 text-xs shrink-0"
                              aria-label={`Accept credential ${cred.credentialType}`}
                            >
                              {acceptingId === cred.id ? (
                                <span className="flex items-center gap-1.5">
                                  <Spinner />
                                  Accepting…
                                </span>
                              ) : (
                                "Accept"
                              )}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* DID info card */}
                <div className="card">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">
                    Decentralised Identifiers
                  </h2>
                  {dids.length === 0 ? (
                    <p className="text-sm text-gray-500">No DIDs registered yet.</p>
                  ) : (
                    <ul className="space-y-3" role="list" aria-label="DID list">
                      {dids.map((d) => (
                        <li key={d.id} className="flex items-start gap-2">
                          <span
                            className={`mt-1 inline-block w-2 h-2 rounded-full shrink-0 ${
                              d.status === "ACTIVE" ? "bg-success-500" : "bg-gray-300"
                            }`}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-mono text-gray-700 truncate" title={d.did}>
                              {truncateDid(d.did, 24)}
                            </p>
                            <p className="text-xs text-gray-400">
                              {d.method.toUpperCase()} · {d.status}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
                    {dids.length} DID{dids.length !== 1 ? "s" : ""} registered
                  </p>
                </div>

                {/* Quick links */}
                <div className="card">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">Quick Links</h2>
                  <nav className="space-y-2" aria-label="Wallet quick links">
                    <Link
                      href="/wallet/credentials"
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors no-underline text-gray-700 hover:text-gray-900"
                    >
                      <svg className="w-4 h-4 text-primary-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                      </svg>
                      <span className="text-sm font-medium">All Credentials</span>
                    </Link>
                    <Link
                      href="/wallet/sharing"
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors no-underline text-gray-700 hover:text-gray-900"
                    >
                      <svg className="w-4 h-4 text-primary-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                      </svg>
                      <span className="text-sm font-medium">Sharing</span>
                      <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                        Soon
                      </span>
                    </Link>
                  </nav>
                </div>
              </div>
            </div>
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
