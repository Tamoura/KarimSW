"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getAccessToken, setAccessToken } from "@/lib/api-client";

type TokenStatus = "ACTIVE" | "EXPIRED" | "USED";

interface OfflineToken {
  id: string;
  credentialId: string;
  token: string;
  status: TokenStatus;
  expiresAt: string;
  createdAt: string;
}

interface VerificationResult {
  valid: boolean;
  credentialId?: string;
  holderDid?: string;
  error?: string;
}

interface SyncResult {
  synced: number;
  failed: number;
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

function TokenStatusBadge({ status }: { status: TokenStatus }) {
  const styles: Record<TokenStatus, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    EXPIRED: "bg-gray-100 text-gray-500",
    USED: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
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

function isExpired(iso: string): boolean {
  return new Date(iso) < new Date();
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

export default function OfflinePage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [tokens, setTokens] = useState<OfflineToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate token form
  const [genCredentialId, setGenCredentialId] = useState("");
  const [genTtlHours, setGenTtlHours] = useState("24");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genSuccess, setGenSuccess] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  // Verify presentation
  const [verifyTokenValue, setVerifyTokenValue] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Sync
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchTokens = useCallback(async () => {
    const res = await apiFetch(`/offline/tokens`);

    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error("Failed to load offline tokens.");

    const data = await res.json();
    setTokens(data.tokens ?? []);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) { router.push("/login"); return; }

    setEmail("");
    fetchTokens()
      .catch(() => setError("Could not load offline token data. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchTokens]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    if (!genCredentialId.trim()) { setGenError("Credential ID is required."); return; }

    setGenerating(true);
    setGenError(null);
    setGenSuccess(null);
    setGeneratedToken(null);

    try {
      const res = await apiFetch(`/offline/tokens`, {
        method: "POST",
        body: JSON.stringify({
          credentialId: genCredentialId.trim(),
          ttlHours: parseInt(genTtlHours, 10) || 24,
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGenError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to generate token."
        );
        return;
      }

      const data = await res.json();
      const newToken: OfflineToken = data.token ?? data;
      setTokens((prev) => [newToken, ...prev]);
      setGeneratedToken(newToken.token);
      setGenSuccess("Offline token generated. Share or QR-encode it for offline presentation.");
      setGenCredentialId("");
    } catch {
      setGenError("Could not connect to the server.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    if (!verifyTokenValue.trim()) { setVerifyError("Token value is required."); return; }

    setVerifying(true);
    setVerifyResult(null);
    setVerifyError(null);

    try {
      const res = await apiFetch(`/offline/verify`, {
        method: "POST",
        body: JSON.stringify({ token: verifyTokenValue.trim() }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setVerifyError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Verification failed."
        );
        return;
      }

      const data = await res.json();
      setVerifyResult(data);
    } catch {
      setVerifyError("Could not connect to the server.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleSync() {
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);

    try {
      const res = await apiFetch(`/offline/sync`, { method: "POST" });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSyncError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Sync failed."
        );
        return;
      }

      const data = await res.json();
      setSyncResult(data);

      // Refresh token list after sync
      const freshRes = await apiFetch(`/offline/tokens`);
      if (freshRes.ok) {
        const freshData = await freshRes.json();
        setTokens(freshData.tokens ?? []);
      }
    } catch {
      setSyncError("Could not connect to the server.");
    } finally {
      setSyncing(false);
    }
  }

  function handleLogout() {
    setAccessToken(null);
    router.push("/login");
  }

  const activeCount = tokens.filter((t) => t.status === "ACTIVE" && !isExpired(t.expiresAt)).length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
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
              <span className="text-sm font-medium text-primary-600">Offline</span>
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
          <h1 className="text-2xl font-bold text-gray-900">Offline Credential Presentation</h1>
          <p className="mt-1 text-sm text-gray-500">
            Generate offline tokens for credentials and verify presentations without network connectivity.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading offline tokens">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading offline tokens&hellip;</p>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Generate + Token list */}
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="card text-center">
                  <p className="text-3xl font-bold text-primary-600">{activeCount}</p>
                  <p className="text-xs text-gray-500 mt-1">Active Tokens</p>
                </div>
                <div className="card text-center">
                  <p className="text-3xl font-bold text-gray-700">{tokens.length}</p>
                  <p className="text-xs text-gray-500 mt-1">Total Tokens</p>
                </div>
              </div>

              {/* Generate token */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Generate Offline Token</h2>
                {genSuccess && <SuccessBanner message={genSuccess} />}

                {/* Display generated token */}
                {generatedToken && (
                  <div className="mb-4 p-3 bg-gray-900 rounded-lg">
                    <p className="text-xs text-gray-400 mb-1.5">Token (copy and store securely)</p>
                    <code className="text-xs text-green-400 break-all leading-relaxed">
                      {generatedToken}
                    </code>
                  </div>
                )}

                <form onSubmit={handleGenerate} noValidate>
                  {genError && <ErrorBanner message={genError} />}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label htmlFor="gen-cred-id" className="block text-xs font-medium text-gray-700 mb-1">
                        Credential ID <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="gen-cred-id"
                        type="text"
                        value={genCredentialId}
                        onChange={(e) => setGenCredentialId(e.target.value)}
                        placeholder="Enter credential ID"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="gen-ttl" className="block text-xs font-medium text-gray-700 mb-1">
                        TTL (hours)
                      </label>
                      <select
                        id="gen-ttl"
                        value={genTtlHours}
                        onChange={(e) => setGenTtlHours(e.target.value)}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        <option value="1">1 hour</option>
                        <option value="6">6 hours</option>
                        <option value="24">24 hours</option>
                        <option value="72">72 hours</option>
                        <option value="168">1 week</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" disabled={generating} className="btn-primary text-sm">
                    {generating ? (
                      <span className="flex items-center gap-2"><Spinner />Generating&hellip;</span>
                    ) : (
                      "Generate Token"
                    )}
                  </button>
                </form>
              </div>

              {/* Token list */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-900">Offline Tokens</h2>
                  <span className="text-xs text-gray-400">{tokens.length} total</span>
                </div>

                {tokens.length === 0 ? (
                  <div className="text-center py-10">
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
                    </svg>
                    <p className="text-sm text-gray-500">No offline tokens generated.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100" role="list">
                    {tokens.map((tok) => {
                      const expired = isExpired(tok.expiresAt);
                      const effectiveStatus: TokenStatus = expired && tok.status === "ACTIVE" ? "EXPIRED" : tok.status;
                      return (
                        <li key={tok.id} className="py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-mono text-gray-700 truncate" title={tok.credentialId}>
                                Cred: {tok.credentialId}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                Expires {formatDate(tok.expiresAt)}
                                {expired && <span className="ml-1 text-red-500">(expired)</span>}
                              </p>
                              <p className="text-xs text-gray-400">Created {formatDate(tok.createdAt)}</p>
                            </div>
                            <TokenStatusBadge status={effectiveStatus} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Right: Verify + Sync */}
            <div className="space-y-6">
              {/* Verify offline presentation */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-1">Verify Offline Presentation</h2>
                <p className="text-xs text-gray-500 mb-4">
                  Validate an offline credential token presented by a holder.
                </p>

                <form onSubmit={handleVerify} noValidate>
                  {verifyError && <ErrorBanner message={verifyError} />}
                  <div className="mb-4">
                    <label htmlFor="verify-token" className="block text-xs font-medium text-gray-700 mb-1">
                      Offline Token <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <textarea
                      id="verify-token"
                      value={verifyTokenValue}
                      onChange={(e) => setVerifyTokenValue(e.target.value)}
                      placeholder="Paste the offline token here"
                      rows={4}
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                    />
                  </div>
                  <button type="submit" disabled={verifying} className="btn-primary text-sm">
                    {verifying ? (
                      <span className="flex items-center gap-2"><Spinner />Verifying&hellip;</span>
                    ) : (
                      "Verify Token"
                    )}
                  </button>
                </form>

                {/* Verification result */}
                {verifyResult && (
                  <div className={`mt-4 p-4 rounded-lg border ${verifyResult.valid ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`} role="status">
                    <div className="flex items-center gap-2 mb-3">
                      {verifyResult.valid ? (
                        <>
                          <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                          </svg>
                          <p className="text-sm font-semibold text-green-800">Token Valid</p>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                          </svg>
                          <p className="text-sm font-semibold text-red-800">Token Invalid</p>
                        </>
                      )}
                    </div>
                    {verifyResult.credentialId && (
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className={verifyResult.valid ? "text-green-700" : "text-red-700"}>Credential ID:</span>
                          <span className="font-mono text-gray-700">{verifyResult.credentialId}</span>
                        </div>
                        {verifyResult.holderDid && (
                          <div className="flex items-center gap-2">
                            <span className={verifyResult.valid ? "text-green-700" : "text-red-700"}>Holder DID:</span>
                            <span className="font-mono text-gray-700 truncate">{verifyResult.holderDid}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {verifyResult.error && (
                      <p className="text-xs text-red-700 mt-1">{verifyResult.error}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Sync offline verifications */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-1">Sync Offline Verifications</h2>
                <p className="text-xs text-gray-500 mb-4">
                  Upload cached offline verification records to the network when connectivity is restored.
                </p>

                {syncError && <ErrorBanner message={syncError} />}

                {syncResult && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg" role="status">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                      <p className="text-sm font-medium text-blue-800">Sync complete</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-blue-600">Synced: </span>
                        <span className="font-semibold text-blue-900">{syncResult.synced}</span>
                      </div>
                      <div>
                        <span className="text-blue-600">Failed: </span>
                        <span className="font-semibold text-blue-900">{syncResult.failed}</span>
                      </div>
                    </div>
                    {syncResult.message && (
                      <p className="text-xs text-blue-700 mt-1">{syncResult.message}</p>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSync}
                  disabled={syncing}
                  className="btn-primary text-sm"
                >
                  {syncing ? (
                    <span className="flex items-center gap-2"><Spinner />Syncing&hellip;</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                      Sync Now
                    </span>
                  )}
                </button>
              </div>

              {/* Info card */}
              <div className="card bg-amber-50 border-amber-200">
                <h3 className="text-sm font-semibold text-amber-900 mb-3">Offline Mode Information</h3>
                <ul className="space-y-2 text-xs text-amber-800">
                  {[
                    "Tokens are cryptographically signed and can be verified without network access.",
                    "Tokens have a configurable TTL (time-to-live) after which they expire.",
                    "Once a token is used, it cannot be reused (single-use by default).",
                    "Sync uploads cached verification records when connectivity returns.",
                    "Revoked credentials will invalidate any offline tokens issued for them.",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <svg className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
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
