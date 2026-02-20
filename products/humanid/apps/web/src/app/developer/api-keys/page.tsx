"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE = "http://localhost:5013/api/v1";

type KeyEnvironment = "SANDBOX" | "PRODUCTION";
type KeyStatus = "ACTIVE" | "REVOKED";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  environment: KeyEnvironment;
  status: KeyStatus;
  rateLimit: number;
  lastUsedAt: string | null;
  createdAt: string;
}

interface UsageStats {
  totalKeys: number;
  activeKeys: number;
  revokedKeys: number;
  totalRequests: number;
}

interface NewKeyReveal {
  id: string;
  key: string;
  name: string;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function StatusBadge({ status }: { status: KeyStatus }) {
  const styles: Record<KeyStatus, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    REVOKED: "bg-red-100 text-red-600",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function EnvBadge({ env }: { env: KeyEnvironment }) {
  const styles: Record<KeyEnvironment, string> = {
    SANDBOX: "bg-orange-100 text-orange-700",
    PRODUCTION: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[env]}`}>
      {env.charAt(0) + env.slice(1).toLowerCase()}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function KeyRevealPanel({ reveal, onDismiss }: { reveal: NewKeyReveal; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(reveal.key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4" role="alert">
      <div className="flex items-start gap-3 mb-3">
        <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-amber-900">
            Copy your API key now &mdash; it will not be shown again
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            Key <span className="font-medium">{reveal.name}</span> has been created. Store it securely.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 block bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 break-all">
          {reveal.key}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-800 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors shrink-0"
          aria-label="Copy API key to clipboard"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 text-xs text-amber-600 hover:text-amber-900 transition-colors"
      >
        I have saved the key &mdash; dismiss
      </button>
    </div>
  );
}

export default function ApiKeysPage() {
  const router = useRouter();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [reveal, setReveal] = useState<NewKeyReveal | null>(null);

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEnv, setNewEnv] = useState<KeyEnvironment>("SANDBOX");
  const [creating, setCreating] = useState(false);

  // Per-key action state
  const [revoking, setRevoking] = useState<string | null>(null);
  const [rotating, setRotating] = useState<string | null>(null);

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
    const [keysRes, usageRes] = await Promise.all([
      fetch(`${API_BASE}/developer/keys`, { headers }),
      fetch(`${API_BASE}/developer/keys/usage`, { headers }),
    ]);

    if (keysRes.status === 401 || usageRes.status === 401) {
      handleUnauthorized();
      return;
    }

    if (!keysRes.ok) throw new Error("Failed to load API keys.");
    if (!usageRes.ok) throw new Error("Failed to load usage stats.");

    const keysData = await keysRes.json();
    const usageData = await usageRes.json();

    setKeys(keysData.keys ?? []);
    setUsage(usageData);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { router.push("/login"); return; }

    fetchData(token)
      .catch(() => setError("Could not load API keys. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchData]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    if (!newName.trim()) {
      setActionError("Key name is required.");
      return;
    }

    setCreating(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/developer/keys`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newName.trim(), environment: newEnv }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to create API key."
        );
        return;
      }

      const created = await res.json();
      setKeys((prev) => [created, ...prev]);
      setReveal({ id: created.id, key: created.key, name: created.name });
      setNewName("");
      setNewEnv("SANDBOX");
      setShowCreateForm(false);
      setUsage((prev) =>
        prev
          ? { ...prev, totalKeys: prev.totalKeys + 1, activeKeys: prev.activeKeys + 1 }
          : prev
      );
    } catch {
      setActionError("Could not connect to the server.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string, name: string) {
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    if (!window.confirm(`Revoke API key "${name}"? This cannot be undone.`)) return;

    setRevoking(id);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/developer/keys/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to revoke API key."
        );
        return;
      }

      setKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, status: "REVOKED" } : k))
      );
      setActionSuccess(`API key "${name}" has been revoked.`);
      setUsage((prev) =>
        prev
          ? { ...prev, activeKeys: Math.max(0, prev.activeKeys - 1), revokedKeys: prev.revokedKeys + 1 }
          : prev
      );
    } catch {
      setActionError("Could not connect to the server.");
    } finally {
      setRevoking(null);
    }
  }

  async function handleRotate(id: string, name: string) {
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    if (!window.confirm(`Rotate API key "${name}"? The old key will be revoked immediately.`)) return;

    setRotating(id);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/developer/keys/${id}/rotate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to rotate API key."
        );
        return;
      }

      const rotated = await res.json();
      setKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...rotated, key: undefined } : k))
      );
      setReveal({ id: rotated.id, key: rotated.key, name: rotated.name });
      setActionSuccess(`API key "${name}" has been rotated. Copy your new key below.`);
    } catch {
      setActionError("Could not connect to the server.");
    } finally {
      setRotating(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link
              href="/developer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors no-underline"
              aria-label="Back to Developer Portal"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Developer Portal
            </Link>
            <span className="text-gray-300" aria-hidden="true">/</span>
            <span className="text-sm font-medium text-gray-900">API Keys</span>
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
            <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
            <p className="mt-1 text-sm text-gray-500">
              Create and manage API keys for authenticating your application requests.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setShowCreateForm((v) => !v); setActionError(null); }}
            className="btn-primary text-sm shrink-0"
          >
            {showCreateForm ? "Cancel" : "+ New API Key"}
          </button>
        </div>

        {/* Usage summary */}
        {usage && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="card">
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Total Keys</p>
              <p className="text-2xl font-bold text-gray-900">{usage.totalKeys}</p>
            </div>
            <div className="card">
              <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Active</p>
              <p className="text-2xl font-bold text-gray-900">{usage.activeKeys}</p>
            </div>
            <div className="card">
              <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">Revoked</p>
              <p className="text-2xl font-bold text-gray-900">{usage.revokedKeys}</p>
            </div>
            <div className="card">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total Requests</p>
              <p className="text-2xl font-bold text-gray-900">{usage.totalRequests}</p>
            </div>
          </div>
        )}

        {/* Create form */}
        {showCreateForm && (
          <div className="card mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Create New API Key</h2>
            <form onSubmit={handleCreate} className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
              <div className="flex-1">
                <label htmlFor="key-name" className="block text-xs font-medium text-gray-700 mb-1">
                  Key Name <span className="text-red-500" aria-hidden="true">*</span>
                </label>
                <input
                  id="key-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Production Backend, Dev Testing"
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  required
                  aria-required="true"
                />
              </div>
              <div>
                <label htmlFor="key-env" className="block text-xs font-medium text-gray-700 mb-1">
                  Environment
                </label>
                <select
                  id="key-env"
                  value={newEnv}
                  onChange={(e) => setNewEnv(e.target.value as KeyEnvironment)}
                  className="block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="SANDBOX">Sandbox</option>
                  <option value="PRODUCTION">Production</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={creating}
                className="btn-primary text-sm shrink-0"
              >
                {creating ? (
                  <span className="flex items-center gap-2">
                    <Spinner />
                    Creating&hellip;
                  </span>
                ) : (
                  "Create Key"
                )}
              </button>
            </form>
            <p className="mt-3 text-xs text-gray-400">
              The full key value will only be shown once immediately after creation.
            </p>
          </div>
        )}

        {/* New key reveal panel */}
        {reveal && (
          <KeyRevealPanel reveal={reveal} onDismiss={() => setReveal(null)} />
        )}

        {/* Feedback banners */}
        {actionSuccess && (
          <div role="status" className="mb-6 flex items-start gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
            <svg className="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <p className="text-sm text-green-700">{actionSuccess}</p>
          </div>
        )}
        {actionError && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-sm text-red-700">{actionError}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading API keys">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading API keys&hellip;</p>
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
            {keys.length === 0 ? (
              <div className="card text-center py-16">
                <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z" />
                </svg>
                <p className="text-sm text-gray-500 mb-4">No API keys yet. Create your first key to get started.</p>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(true)}
                  className="btn-primary text-sm"
                >
                  Create Your First Key
                </button>
              </div>
            ) : (
              <div className="card overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200" role="table" aria-label="API keys">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Prefix</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Environment</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Rate Limit</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Last Used</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {keys.map((key) => (
                        <tr key={key.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                            {key.name}
                          </td>
                          <td className="px-4 py-3">
                            <code className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                              {key.prefix}&hellip;
                            </code>
                          </td>
                          <td className="px-4 py-3">
                            <EnvBadge env={key.environment} />
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={key.status} />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                            {key.rateLimit ? `${key.rateLimit}/min` : "\u2014"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                            {formatDate(key.lastUsedAt)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                            {formatDate(key.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {key.status === "ACTIVE" ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleRotate(key.id, key.name)}
                                  disabled={rotating === key.id || revoking === key.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  aria-label={`Rotate key ${key.name}`}
                                >
                                  {rotating === key.id ? <Spinner /> : null}
                                  Rotate
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRevoke(key.id, key.name)}
                                  disabled={revoking === key.id || rotating === key.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  aria-label={`Revoke key ${key.name}`}
                                >
                                  {revoking === key.id ? <Spinner /> : null}
                                  Revoke
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic">Revoked</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                  <p className="text-xs text-gray-400">
                    {keys.length} key{keys.length !== 1 ? "s" : ""} total
                  </p>
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
