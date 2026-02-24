"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getAccessToken, setAccessToken } from "@/lib/api-client";

type FedProtocol = "OIDC" | "SAML";
type FedDirection = "INBOUND" | "OUTBOUND";

interface FederationLink {
  id: string;
  protocol: FedProtocol;
  direction: FedDirection;
  providerName: string;
  protocolId: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface ResolveResult {
  protocolId: string;
  resolvedIdentity?: Record<string, unknown>;
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

function ProtocolBadge({ protocol }: { protocol: FedProtocol }) {
  const styles: Record<FedProtocol, string> = {
    OIDC: "bg-blue-100 text-blue-700",
    SAML: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[protocol]}`}>
      {protocol}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: FedDirection }) {
  const styles: Record<FedDirection, string> = {
    INBOUND: "bg-green-100 text-green-700",
    OUTBOUND: "bg-amber-100 text-amber-800",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[direction]}`}>
      {direction.charAt(0) + direction.slice(1).toLowerCase()}
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

export default function FederationPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [links, setLinks] = useState<FederationLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create link form
  const [createProtocol, setCreateProtocol] = useState<FedProtocol>("OIDC");
  const [createDirection, setCreateDirection] = useState<FedDirection>("INBOUND");
  const [createProviderName, setCreateProviderName] = useState("");
  const [createProtocolId, setCreateProtocolId] = useState("");
  const [createMetadata, setCreateMetadata] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Resolve panel
  const [resolveProtocolId, setResolveProtocolId] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveResult, setResolveResult] = useState<ResolveResult | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchLinks = useCallback(async () => {
    const res = await apiFetch(`/federation/links`);
    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error("Failed to load federation links.");
    const data = await res.json();
    setLinks(data.links ?? data ?? []);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) { router.push("/login"); return; }
    setEmail("");
    fetchLinks()
      .catch(() => setError("Could not load federation links. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchLinks]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    if (!createProviderName.trim()) { setCreateError("Provider name is required."); return; }
    if (!createProtocolId.trim()) { setCreateError("Protocol ID is required."); return; }

    let metadata: Record<string, unknown> | undefined;
    if (createMetadata.trim()) {
      try {
        metadata = JSON.parse(createMetadata);
      } catch {
        setCreateError("Metadata must be valid JSON.");
        return;
      }
    }

    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const res = await apiFetch(`/federation/links`, {
        method: "POST",
        body: JSON.stringify({
          protocol: createProtocol,
          direction: createDirection,
          providerName: createProviderName.trim(),
          protocolId: createProtocolId.trim(),
          metadata,
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to create federation link."
        );
        return;
      }

      const data = await res.json();
      const newLink: FederationLink = data.link ?? data;
      setLinks((prev) => [newLink, ...prev]);
      setCreateSuccess(`Federation link for "${newLink.providerName}" created.`);
      setCreateProviderName("");
      setCreateProtocolId("");
      setCreateMetadata("");
    } catch {
      setCreateError("Could not connect to the server.");
    } finally {
      setCreating(false);
    }
  }

  async function handleResolve(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    if (!resolveProtocolId.trim()) { setResolveError("Protocol ID is required."); return; }

    setResolving(true);
    setResolveError(null);
    setResolveResult(null);

    try {
      const res = await apiFetch(`/federation/resolve/${encodeURIComponent(resolveProtocolId.trim())}`);

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setResolveError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Resolution failed."
        );
        return;
      }

      const data = await res.json();
      setResolveResult(data);
    } catch {
      setResolveError("Could not connect to the server.");
    } finally {
      setResolving(false);
    }
  }

  async function handleDelete(id: string) {
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    setDeletingId(id);
    setDeleteError(null);
    setDeleteSuccess(null);

    try {
      const res = await apiFetch(`/federation/links/${id}`, {
        method: "DELETE",
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to delete link."
        );
        return;
      }

      setLinks((prev) => prev.filter((l) => l.id !== id));
      setDeleteSuccess("Federation link deleted.");
    } catch {
      setDeleteError("Could not connect to the server.");
    } finally {
      setDeletingId(null);
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
              <span className="text-sm font-medium text-primary-600">Identity Federation</span>
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
          <h1 className="text-2xl font-bold text-gray-900">Identity Federation Bridge</h1>
          <p className="mt-1 text-sm text-gray-500">
            Connect and bridge identities across OIDC and SAML providers.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading federation data">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading federation data&hellip;</p>
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
            {/* Create link form */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Create Federation Link</h2>
              {createSuccess && <SuccessBanner message={createSuccess} />}
              <form onSubmit={handleCreate} noValidate>
                {createError && <ErrorBanner message={createError} />}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label htmlFor="fed-protocol" className="block text-xs font-medium text-gray-700 mb-1">
                      Protocol <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <select
                      id="fed-protocol"
                      value={createProtocol}
                      onChange={(e) => setCreateProtocol(e.target.value as FedProtocol)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="OIDC">OIDC</option>
                      <option value="SAML">SAML</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="fed-direction" className="block text-xs font-medium text-gray-700 mb-1">
                      Direction <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <select
                      id="fed-direction"
                      value={createDirection}
                      onChange={(e) => setCreateDirection(e.target.value as FedDirection)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="INBOUND">Inbound</option>
                      <option value="OUTBOUND">Outbound</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="fed-provider-name" className="block text-xs font-medium text-gray-700 mb-1">
                      Provider Name <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="fed-provider-name"
                      type="text"
                      value={createProviderName}
                      onChange={(e) => setCreateProviderName(e.target.value)}
                      placeholder="e.g. Okta, Azure AD"
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="fed-protocol-id" className="block text-xs font-medium text-gray-700 mb-1">
                      Protocol ID <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="fed-protocol-id"
                      type="text"
                      value={createProtocolId}
                      onChange={(e) => setCreateProtocolId(e.target.value)}
                      placeholder="client_id or entity ID"
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label htmlFor="fed-metadata" className="block text-xs font-medium text-gray-700 mb-1">
                    Metadata (JSON, optional)
                  </label>
                  <textarea
                    id="fed-metadata"
                    value={createMetadata}
                    onChange={(e) => setCreateMetadata(e.target.value)}
                    placeholder='{"scope": "openid email profile"}'
                    rows={3}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                  />
                </div>
                <button type="submit" disabled={creating} className="btn-primary text-sm">
                  {creating ? (
                    <span className="flex items-center gap-2"><Spinner />Creating&hellip;</span>
                  ) : (
                    "Create Link"
                  )}
                </button>
              </form>
            </div>

            {/* Resolve identity panel */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Resolve Identity</h2>
              <form onSubmit={handleResolve} noValidate className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label htmlFor="resolve-protocol-id" className="block text-xs font-medium text-gray-700 mb-1">
                    Protocol ID
                  </label>
                  <input
                    id="resolve-protocol-id"
                    type="text"
                    value={resolveProtocolId}
                    onChange={(e) => setResolveProtocolId(e.target.value)}
                    placeholder="Enter protocol ID to resolve"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div className="flex items-end">
                  <button type="submit" disabled={resolving} className="btn-primary text-sm whitespace-nowrap">
                    {resolving ? (
                      <span className="flex items-center gap-2"><Spinner />Resolving&hellip;</span>
                    ) : (
                      "Resolve"
                    )}
                  </button>
                </div>
              </form>
              {resolveError && <div className="mt-3"><ErrorBanner message={resolveError} /></div>}
              {resolveResult && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-600 mb-2">Resolution Result</p>
                  <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(resolveResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Federation links table */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Federation Links</h2>
              {deleteSuccess && <SuccessBanner message={deleteSuccess} />}
              {deleteError && <ErrorBanner message={deleteError} />}
              {links.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                  </svg>
                  <p className="text-sm text-gray-500">No federation links configured yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200" role="table" aria-label="Federation links">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Protocol</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Direction</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Provider</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Protocol ID</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {links.map((link) => (
                        <tr key={link.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <ProtocolBadge protocol={link.protocol} />
                          </td>
                          <td className="px-4 py-3">
                            <DirectionBadge direction={link.direction} />
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{link.providerName}</td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-700 max-w-[140px] truncate" title={link.protocolId}>
                            {link.protocolId}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(link.createdAt)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDelete(link.id)}
                              disabled={deletingId === link.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors disabled:opacity-50"
                              aria-label={`Delete federation link for ${link.providerName}`}
                            >
                              {deletingId === link.id ? <><Spinner />Deleting&hellip;</> : "Delete"}
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
