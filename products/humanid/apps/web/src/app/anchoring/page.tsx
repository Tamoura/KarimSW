"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE = "http://localhost:5013/api/v1";

type AnchorEntityType = "DID" | "CREDENTIAL";
type AnchorChain = "ETHEREUM" | "SOLANA" | "ARBITRUM" | "POLYGON";
type AnchorStatus = "PENDING" | "CONFIRMED" | "FAILED";

interface Anchor {
  id: string;
  entityType: AnchorEntityType;
  entityId: string;
  chain: AnchorChain;
  dataHash: string;
  status: AnchorStatus;
  txHash?: string;
  createdAt: string;
  confirmedAt?: string;
}

interface ChainHealth {
  chain: AnchorChain;
  healthy: boolean;
  latency?: number;
  blockHeight?: number;
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

function ChainBadge({ chain }: { chain: AnchorChain }) {
  const styles: Record<AnchorChain, string> = {
    ETHEREUM: "bg-purple-100 text-purple-700",
    SOLANA: "bg-green-100 text-green-700",
    ARBITRUM: "bg-blue-100 text-blue-700",
    POLYGON: "bg-indigo-100 text-indigo-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[chain]}`}>
      {chain}
    </span>
  );
}

function StatusBadge({ status }: { status: AnchorStatus }) {
  const styles: Record<AnchorStatus, string> = {
    PENDING: "bg-amber-100 text-amber-800",
    CONFIRMED: "bg-green-100 text-green-800",
    FAILED: "bg-red-100 text-red-800",
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
  });
}

export default function AnchoringPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [chainHealthList, setChainHealthList] = useState<ChainHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Submit form state
  const [submitEntityType, setSubmitEntityType] = useState<AnchorEntityType>("DID");
  const [submitEntityId, setSubmitEntityId] = useState("");
  const [submitChain, setSubmitChain] = useState<AnchorChain>("ETHEREUM");
  const [submitDataHash, setSubmitDataHash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Verify panel state
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, unknown> | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyAnchorId, setVerifyAnchorId] = useState<string | null>(null);

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
    const [anchorsRes, chainsRes] = await Promise.all([
      fetch(`${API_BASE}/anchoring`, { headers }),
      fetch(`${API_BASE}/anchoring/chains`, { headers }),
    ]);

    if (anchorsRes.status === 401 || chainsRes.status === 401) {
      handleUnauthorized();
      return;
    }
    if (!anchorsRes.ok) throw new Error("Failed to load anchors.");
    if (!chainsRes.ok) throw new Error("Failed to load chain health.");

    const anchorsData = await anchorsRes.json();
    const chainsData = await chainsRes.json();

    setAnchors(anchorsData.anchors ?? anchorsData ?? []);
    setChainHealthList(chainsData.chains ?? chainsData ?? []);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const storedEmail = localStorage.getItem("user_email");

    if (!token) { router.push("/login"); return; }

    setEmail(storedEmail ?? "");
    fetchData(token)
      .catch(() => setError("Could not load anchoring data. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    if (!submitEntityId.trim()) { setSubmitError("Entity ID is required."); return; }
    if (!submitDataHash.trim()) { setSubmitError("Data hash is required."); return; }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/anchoring/submit`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entityType: submitEntityType,
          entityId: submitEntityId.trim(),
          chain: submitChain,
          dataHash: submitDataHash.trim(),
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to submit anchor."
        );
        return;
      }

      const data = await res.json();
      const newAnchor: Anchor = data.anchor ?? data;
      setAnchors((prev) => [newAnchor, ...prev]);
      setSubmitSuccess(`Anchor submitted successfully on ${submitChain}.`);
      setSubmitEntityId("");
      setSubmitDataHash("");
    } catch {
      setSubmitError("Could not connect to the server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(anchorId: string) {
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    if (verifyAnchorId === anchorId) {
      setVerifyAnchorId(null);
      setVerifyResult(null);
      return;
    }

    setVerifyingId(anchorId);
    setVerifyError(null);
    setVerifyResult(null);

    try {
      const res = await fetch(`${API_BASE}/anchoring/${anchorId}/verify`, {
        headers: { Authorization: `Bearer ${token}` },
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
      setVerifyAnchorId(anchorId);
    } catch {
      setVerifyError("Could not connect to the server.");
    } finally {
      setVerifyingId(null);
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
              <span className="text-sm font-medium text-primary-600">Cross-Chain Anchoring</span>
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
          <h1 className="text-2xl font-bold text-gray-900">Cross-Chain Anchoring</h1>
          <p className="mt-1 text-sm text-gray-500">
            Anchor DIDs and credentials on-chain for tamper-evident verification across multiple blockchains.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading anchoring data">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading anchoring data&hellip;</p>
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
            {/* Chain health cards */}
            {chainHealthList.length > 0 && (
              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-3">Chain Health</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {chainHealthList.map((ch) => (
                    <div key={ch.chain} className="card">
                      <div className="flex items-center justify-between mb-2">
                        <ChainBadge chain={ch.chain as AnchorChain} />
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${ch.healthy ? "bg-green-500" : "bg-red-500"}`}
                          aria-label={ch.healthy ? "healthy" : "unhealthy"}
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        {ch.healthy ? "Operational" : "Degraded"}
                      </p>
                      {ch.latency !== undefined && (
                        <p className="text-xs text-gray-400 mt-0.5">{ch.latency}ms latency</p>
                      )}
                      {ch.blockHeight !== undefined && (
                        <p className="text-xs text-gray-400 mt-0.5">Block #{ch.blockHeight.toLocaleString()}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Submit anchor form */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Submit Anchor</h2>
              {submitSuccess && <SuccessBanner message={submitSuccess} />}
              <form onSubmit={handleSubmit} noValidate>
                {submitError && <ErrorBanner message={submitError} />}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label htmlFor="anchor-entity-type" className="block text-xs font-medium text-gray-700 mb-1">
                      Entity Type <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <select
                      id="anchor-entity-type"
                      value={submitEntityType}
                      onChange={(e) => setSubmitEntityType(e.target.value as AnchorEntityType)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="DID">DID</option>
                      <option value="CREDENTIAL">Credential</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="anchor-entity-id" className="block text-xs font-medium text-gray-700 mb-1">
                      Entity ID <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="anchor-entity-id"
                      type="text"
                      value={submitEntityId}
                      onChange={(e) => setSubmitEntityId(e.target.value)}
                      placeholder="did:key:... or credential ID"
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="anchor-chain" className="block text-xs font-medium text-gray-700 mb-1">
                      Chain <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <select
                      id="anchor-chain"
                      value={submitChain}
                      onChange={(e) => setSubmitChain(e.target.value as AnchorChain)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="ETHEREUM">Ethereum</option>
                      <option value="SOLANA">Solana</option>
                      <option value="ARBITRUM">Arbitrum</option>
                      <option value="POLYGON">Polygon</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="anchor-data-hash" className="block text-xs font-medium text-gray-700 mb-1">
                      Data Hash <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="anchor-data-hash"
                      type="text"
                      value={submitDataHash}
                      onChange={(e) => setSubmitDataHash(e.target.value)}
                      placeholder="0x..."
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <button type="submit" disabled={submitting} className="btn-primary text-sm">
                  {submitting ? (
                    <span className="flex items-center gap-2"><Spinner />Submitting&hellip;</span>
                  ) : (
                    "Submit Anchor"
                  )}
                </button>
              </form>
            </div>

            {/* Verify result panel */}
            {verifyError && <ErrorBanner message={verifyError} />}
            {verifyResult && verifyAnchorId && (
              <div className="card border-l-4 border-l-primary-500">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold text-gray-900">Verification Result</h2>
                  <button
                    type="button"
                    onClick={() => { setVerifyAnchorId(null); setVerifyResult(null); }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Close verification result"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 overflow-x-auto">
                  {JSON.stringify(verifyResult, null, 2)}
                </pre>
              </div>
            )}

            {/* Anchors table */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Anchors</h2>
              {anchors.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                  </svg>
                  <p className="text-sm text-gray-500">No anchors submitted yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200" role="table" aria-label="Anchors list">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Entity Type</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Entity ID</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Chain</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {anchors.map((anchor) => (
                        <tr key={anchor.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-xs font-mono text-gray-700">{anchor.entityType}</td>
                          <td className="px-4 py-3 text-xs text-gray-700 font-mono max-w-[160px] truncate" title={anchor.entityId}>
                            {anchor.entityId}
                          </td>
                          <td className="px-4 py-3">
                            <ChainBadge chain={anchor.chain} />
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={anchor.status} />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(anchor.createdAt)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleVerify(anchor.id)}
                              disabled={verifyingId === anchor.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 transition-colors disabled:opacity-50"
                              aria-label={`Verify anchor ${anchor.id}`}
                            >
                              {verifyingId === anchor.id ? (
                                <><Spinner />Verifying&hellip;</>
                              ) : verifyAnchorId === anchor.id ? (
                                "Hide"
                              ) : (
                                "Verify"
                              )}
                            </button>
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
