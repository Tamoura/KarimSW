"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAccessToken, setAccessToken } from "@/lib/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5013/api/v1";

const VALID_EVENTS = [
  "credential.issued",
  "credential.verified",
  "credential.revoked",
  "did.created",
  "did.deactivated",
  "did.suspended",
  "verification.completed",
] as const;

type WebhookEvent = (typeof VALID_EVENTS)[number];

type WebhookStatus = "ACTIVE" | "INACTIVE" | "FAILING";

interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  description?: string;
  status: WebhookStatus;
  failureCount: number;
  lastDeliveredAt: string | null;
  createdAt: string;
}

interface WebhookDelivery {
  id: string;
  event: string;
  statusCode?: number;
  success: boolean;
  requestBody?: string;
  responseBody?: string;
  deliveredAt: string;
  durationMs?: number;
}

interface NewWebhookReveal {
  id: string;
  secret: string;
  url: string;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: WebhookStatus }) {
  const styles: Record<WebhookStatus, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    INACTIVE: "bg-gray-100 text-gray-600",
    FAILING: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function SecretRevealPanel({ reveal, onDismiss }: { reveal: NewWebhookReveal; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(reveal.secret).then(() => {
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
            Copy your webhook secret now &mdash; it will not be shown again
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            Webhook for <span className="font-medium font-mono">{reveal.url}</span> has been created. Use this secret to verify payloads.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 block bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 break-all">
          {reveal.secret}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-800 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors shrink-0"
          aria-label="Copy webhook secret to clipboard"
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
        I have saved the secret &mdash; dismiss
      </button>
    </div>
  );
}

function DeliveryLog({ webhookId }: { webhookId: string }) {
  const router = useRouter();
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    fetch(`${API_BASE}/webhooks/${webhookId}/deliveries`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.status === 401) { handleUnauthorized(); return; }
        if (!res.ok) return;
        const data = await res.json();
        setDeliveries(data.deliveries ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [webhookId, handleUnauthorized]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 px-4">
        <Spinner />
        <span className="text-xs text-gray-400">Loading deliveries&hellip;</span>
      </div>
    );
  }

  if (deliveries.length === 0) {
    return <p className="text-xs text-gray-400 py-4 px-4">No deliveries yet.</p>;
  }

  return (
    <ul className="divide-y divide-gray-100" role="list" aria-label="Delivery history">
      {deliveries.map((d) => (
        <li key={d.id} className="px-4 py-3">
          <button
            type="button"
            className="w-full flex items-center justify-between gap-3 text-left hover:bg-gray-50 rounded transition-colors -mx-2 px-2 py-1"
            onClick={() => setExpanded(expanded === d.id ? null : d.id)}
            aria-expanded={expanded === d.id}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${d.success ? "bg-green-500" : "bg-red-500"}`}
                aria-hidden="true"
              />
              <span className="text-xs font-mono text-gray-600 truncate">{d.event}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {d.statusCode && (
                <span className={`text-xs font-medium ${d.success ? "text-green-700" : "text-red-600"}`}>
                  {d.statusCode}
                </span>
              )}
              {d.durationMs !== undefined && (
                <span className="text-xs text-gray-400">{d.durationMs}ms</span>
              )}
              <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(d.deliveredAt)}</span>
              <svg
                className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded === d.id ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>
          {expanded === d.id && (d.requestBody || d.responseBody) && (
            <div className="mt-2 space-y-2">
              {d.requestBody && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Request Body</p>
                  <pre className="text-xs bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto">
                    {d.requestBody}
                  </pre>
                </div>
              )}
              {d.responseBody && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Response Body</p>
                  <pre className="text-xs bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto">
                    {d.responseBody}
                  </pre>
                </div>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function WebhooksPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [reveal, setReveal] = useState<NewWebhookReveal | null>(null);

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newEvents, setNewEvents] = useState<Set<WebhookEvent>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Per-webhook state
  const [testing, setTesting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchWebhooks = useCallback(async (token: string) => {
    const res = await fetch(`${API_BASE}/webhooks`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error("Failed to load webhooks.");

    const data = await res.json();
    setWebhooks(data.webhooks ?? []);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    setEmail("");

    fetchWebhooks(token)
      .catch(() => setError("Could not load webhooks. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchWebhooks]);

  function toggleEvent(event: WebhookEvent) {
    setNewEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) {
        next.delete(event);
      } else {
        next.add(event);
      }
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    if (!newUrl.trim()) { setCreateError("Endpoint URL is required."); return; }
    if (newEvents.size === 0) { setCreateError("Select at least one event to subscribe to."); return; }

    setCreating(true);
    setCreateError(null);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/webhooks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: newUrl.trim(),
          events: Array.from(newEvents),
          ...(newDescription.trim() ? { description: newDescription.trim() } : {}),
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to create webhook."
        );
        return;
      }

      const data = await res.json();
      const created: Webhook = data.webhook ?? data;
      setWebhooks((prev) => [created, ...prev]);

      if (data.secret) {
        setReveal({ id: created.id, secret: data.secret, url: created.url });
      }

      setNewUrl("");
      setNewDescription("");
      setNewEvents(new Set());
      setShowCreateForm(false);
      setActionSuccess("Webhook created successfully.");
    } catch {
      setCreateError("Could not connect to the server.");
    } finally {
      setCreating(false);
    }
  }

  async function handleTest(id: string) {
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    setTesting(id);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/webhooks/${id}/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Test delivery failed."
        );
        return;
      }

      setActionSuccess("Test delivery sent successfully.");
    } catch {
      setActionError("Could not connect to the server.");
    } finally {
      setTesting(null);
    }
  }

  async function handleDelete(id: string, url: string) {
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    if (!window.confirm(`Delete webhook for "${url}"? This cannot be undone.`)) return;

    setDeleting(id);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/webhooks/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to delete webhook."
        );
        return;
      }

      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      setActionSuccess("Webhook deleted.");
    } catch {
      setActionError("Could not connect to the server.");
    } finally {
      setDeleting(null);
    }
  }

  function handleLogout() {
    setAccessToken(null);
    router.push("/login");
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
            <span className="text-sm font-medium text-gray-900">Webhooks</span>
            <div className="ml-auto flex items-center gap-3">
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
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
            <p className="mt-1 text-sm text-gray-500">
              Receive real-time event notifications at your endpoints.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setShowCreateForm((v) => !v); setCreateError(null); }}
            className="btn-primary text-sm shrink-0"
          >
            {showCreateForm ? "Cancel" : "+ New Webhook"}
          </button>
        </div>

        {/* Secret reveal panel */}
        {reveal && <SecretRevealPanel reveal={reveal} onDismiss={() => setReveal(null)} />}

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

        {/* Create form */}
        {showCreateForm && (
          <div className="card mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Create New Webhook</h2>
            <form onSubmit={handleCreate} noValidate>
              {createError && (
                <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                  <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-8.25a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                  <p className="text-xs text-red-700">{createError}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label htmlFor="webhook-url" className="block text-sm font-medium text-gray-700 mb-1">
                    Endpoint URL <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="webhook-url"
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://example.com/webhooks/humanid"
                    required
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label htmlFor="webhook-desc" className="block text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    id="webhook-desc"
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Credential events for production"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <fieldset>
                    <legend className="block text-sm font-medium text-gray-700 mb-2">
                      Events <span className="text-red-500" aria-hidden="true">*</span>
                    </legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {VALID_EVENTS.map((event) => (
                        <label
                          key={event}
                          className="flex items-center gap-2.5 p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={newEvents.has(event)}
                            onChange={() => toggleEvent(event)}
                            className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                          />
                          <span className="text-xs font-mono text-gray-700">{event}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="btn-primary text-sm"
                >
                  {creating ? (
                    <span className="flex items-center gap-2">
                      <Spinner />
                      Creating&hellip;
                    </span>
                  ) : (
                    "Create Webhook"
                  )}
                </button>
                <p className="text-xs text-gray-400">
                  The signing secret will only be shown once on creation.
                </p>
              </div>
            </form>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading webhooks">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading webhooks&hellip;</p>
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
            {webhooks.length === 0 ? (
              <div className="card text-center py-16">
                <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
                <p className="text-sm text-gray-500 mb-4">No webhooks configured. Create one to start receiving events.</p>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(true)}
                  className="btn-primary text-sm"
                >
                  Create Your First Webhook
                </button>
              </div>
            ) : (
              <ul className="space-y-4" role="list" aria-label="Webhooks">
                {webhooks.map((wh) => (
                  <li key={wh.id} className="card overflow-hidden p-0">
                    <div className="p-6">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="text-sm font-mono font-medium text-gray-900 truncate" title={wh.url}>
                              {wh.url}
                            </p>
                            <StatusBadge status={wh.status} />
                          </div>
                          {wh.description && (
                            <p className="text-xs text-gray-500 mb-2">{wh.description}</p>
                          )}
                          <div className="flex flex-wrap gap-1 mb-2">
                            {wh.events.map((ev) => (
                              <span key={ev} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-blue-50 text-blue-700">
                                {ev}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-400">
                            {wh.failureCount > 0 && (
                              <span className="text-red-500 font-medium">{wh.failureCount} failure{wh.failureCount !== 1 ? "s" : ""}</span>
                            )}
                            <span>Last delivery: {formatDate(wh.lastDeliveredAt)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleTest(wh.id)}
                            disabled={testing === wh.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label={`Send test delivery to ${wh.url}`}
                          >
                            {testing === wh.id ? <Spinner /> : null}
                            Test
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedLog(expandedLog === wh.id ? null : wh.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-colors"
                            aria-expanded={expandedLog === wh.id}
                            aria-label={`${expandedLog === wh.id ? "Hide" : "View"} delivery logs for ${wh.url}`}
                          >
                            Logs
                            <svg
                              className={`w-3 h-3 transition-transform ${expandedLog === wh.id ? "rotate-90" : ""}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(wh.id, wh.url)}
                            disabled={deleting === wh.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label={`Delete webhook for ${wh.url}`}
                          >
                            {deleting === wh.id ? <Spinner /> : null}
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Delivery log (expandable) */}
                    {expandedLog === wh.id && (
                      <div className="border-t border-gray-100">
                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                          <p className="text-xs font-medium text-gray-600">Delivery History</p>
                        </div>
                        <DeliveryLog webhookId={wh.id} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
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
