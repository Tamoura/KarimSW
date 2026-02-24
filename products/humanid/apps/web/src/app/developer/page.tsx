"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getAccessToken, setAccessToken } from "@/lib/api-client";

interface UsageStats {
  totalKeys: number;
  activeKeys: number;
  revokedKeys: number;
  totalRequests: number;
}

interface SandboxStatus {
  environment: string;
  didCount: number;
  credentialCount: number;
  apiKeyCount: number;
  features: string[];
}

interface AuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatCard({
  label,
  value,
  sub,
  color = "gray",
}: {
  label: string;
  value: number | string;
  sub?: string;
  color?: "gray" | "green" | "red" | "blue" | "orange";
}) {
  const colorMap: Record<string, string> = {
    gray: "text-gray-500",
    green: "text-green-600",
    red: "text-red-600",
    blue: "text-blue-600",
    orange: "text-orange-600",
  };
  return (
    <div className="card">
      <p className={`text-xs font-medium uppercase tracking-wide mb-1 ${colorMap[color]}`}>{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function DeveloperPage() {
  const router = useRouter();

  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [sandbox, setSandbox] = useState<SandboxStatus | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchAll = useCallback(async () => {
    const [usageRes, sandboxRes, logsRes] = await Promise.all([
      apiFetch("/developer/keys/usage"),
      apiFetch("/developer/sandbox/status"),
      apiFetch("/developer/logs?limit=5"),
    ]);

    if ([usageRes, sandboxRes, logsRes].some((r) => r.status === 401)) {
      handleUnauthorized();
      return;
    }

    const usageData = usageRes.ok ? await usageRes.json() : null;
    const sandboxData = sandboxRes.ok ? await sandboxRes.json() : null;
    const logsData = logsRes.ok ? await logsRes.json() : null;

    if (usageData) setUsage(usageData);
    if (sandboxData) setSandbox(sandboxData);
    if (logsData) setLogs(logsData.logs ?? []);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    setEmail("");

    fetchAll()
      .catch(() => setError("Could not load developer portal data. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchAll]);

  function handleLogout() {
    setAccessToken(null);
    router.push("/login");
  }

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
              <span className="text-sm font-medium text-primary-600">Developer Portal</span>
            </div>

            <nav className="hidden sm:flex items-center gap-6 text-sm font-medium">
              <span className="text-primary-600 border-b-2 border-primary-500 pb-0.5">Dashboard</span>
              <Link href="/developer/api-keys" className="text-gray-500 hover:text-gray-900 transition-colors no-underline">
                API Keys
              </Link>
              <Link href="/developer/sandbox" className="text-gray-500 hover:text-gray-900 transition-colors no-underline">
                Sandbox
              </Link>
              <Link href="/developer/docs" className="text-gray-500 hover:text-gray-900 transition-colors no-underline">
                Docs
              </Link>
              <Link href="/developer/quickstart" className="text-gray-500 hover:text-gray-900 transition-colors no-underline">
                Quickstart
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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Developer Portal</h1>
          <p className="mt-1 text-sm text-gray-500">
            Build identity-powered applications with the HumanID API.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading developer portal">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading developer portal&hellip;</p>
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
            {/* Overview stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <StatCard
                label="Total API Keys"
                value={usage?.totalKeys ?? 0}
                sub={`${usage?.activeKeys ?? 0} active, ${usage?.revokedKeys ?? 0} revoked`}
                color="blue"
              />
              <StatCard
                label="Total Requests"
                value={usage?.totalRequests ?? 0}
                sub="all time"
                color="green"
              />
              <StatCard
                label="Sandbox DIDs"
                value={sandbox?.didCount ?? 0}
                sub="test identifiers"
                color="orange"
              />
              <StatCard
                label="Sandbox Credentials"
                value={sandbox?.credentialCount ?? 0}
                sub="test credentials"
                color="gray"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left column */}
              <div className="lg:col-span-2 space-y-6">
                {/* Quick Actions */}
                <div className="card">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">Quick Actions</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Link
                      href="/developer/api-keys"
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors no-underline group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center shrink-0 group-hover:bg-primary-200 transition-colors">
                        <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Create API Key</p>
                        <p className="text-xs text-gray-500">Generate new credentials</p>
                      </div>
                    </Link>

                    <Link
                      href="/developer/docs"
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors no-underline group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 group-hover:bg-blue-200 transition-colors">
                        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">View Docs</p>
                        <p className="text-xs text-gray-500">Interactive API reference</p>
                      </div>
                    </Link>

                    <Link
                      href="/developer/sandbox"
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors no-underline group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center shrink-0 group-hover:bg-orange-200 transition-colors">
                        <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 1-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Seed Sandbox</p>
                        <p className="text-xs text-gray-500">Generate test data</p>
                      </div>
                    </Link>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-gray-900">Recent Activity</h2>
                    <Link
                      href="/developer/sandbox"
                      className="text-sm font-medium text-primary-500 hover:text-primary-600 no-underline"
                    >
                      View all logs
                    </Link>
                  </div>

                  {logs.length === 0 ? (
                    <div className="text-center py-8">
                      <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                      </svg>
                      <p className="text-sm text-gray-500">No activity yet.</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-100" role="list" aria-label="Recent activity">
                      {logs.map((log) => (
                        <li key={log.id} className="py-3 flex items-start gap-3">
                          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-900">
                              <span className="font-medium">{log.action}</span>
                              {log.resourceType && (
                                <span className="text-gray-500"> on {log.resourceType}</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {formatDate(log.createdAt)}
                              {log.ipAddress && (
                                <span className="ml-2 font-mono">{log.ipAddress}</span>
                              )}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-4">
                {/* Sandbox Status */}
                <div className="card">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">Sandbox Status</h2>
                  {sandbox ? (
                    <>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" aria-hidden="true" />
                        <span className="text-sm font-medium text-gray-700 capitalize">{sandbox.environment}</span>
                        <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Online
                        </span>
                      </div>
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">DIDs</span>
                          <span className="font-medium text-gray-900">{sandbox.didCount}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">Credentials</span>
                          <span className="font-medium text-gray-900">{sandbox.credentialCount}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">API Keys</span>
                          <span className="font-medium text-gray-900">{sandbox.apiKeyCount}</span>
                        </div>
                      </div>
                      {sandbox.features && sandbox.features.length > 0 && (
                        <div className="border-t border-gray-100 pt-3">
                          <p className="text-xs font-medium text-gray-500 mb-2">Features</p>
                          <ul className="space-y-1">
                            {sandbox.features.map((f) => (
                              <li key={f} className="flex items-center gap-1.5 text-xs text-gray-600">
                                <svg className="w-3 h-3 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0Z" clipRule="evenodd" />
                                </svg>
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <Link href="/developer/sandbox" className="mt-4 btn-secondary text-sm w-full text-center no-underline block">
                        Manage Sandbox
                      </Link>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">Sandbox status unavailable.</p>
                  )}
                </div>

                {/* Navigation links */}
                <div className="card">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">Navigation</h2>
                  <nav className="space-y-2" aria-label="Developer portal navigation">
                    {[
                      { href: "/developer/api-keys", label: "API Keys", desc: "Manage credentials" },
                      { href: "/developer/sandbox", label: "Sandbox", desc: "Test environment" },
                      { href: "/developer/docs", label: "Documentation", desc: "API reference" },
                      { href: "/developer/quickstart", label: "Quickstart", desc: "Step-by-step guide" },
                    ].map(({ href, label, desc }) => (
                      <Link
                        key={href}
                        href={href}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors no-underline group"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900 group-hover:text-primary-600 transition-colors">
                            {label}
                          </p>
                          <p className="text-xs text-gray-400">{desc}</p>
                        </div>
                        <svg className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                        </svg>
                      </Link>
                    ))}
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
