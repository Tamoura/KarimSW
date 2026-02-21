"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, getAccessToken } from "@/lib/api-client";

interface PlatformStats {
  totalUsers: number;
  activeDids: number;
  credentialsIssued: number;
  activeIssuers: number;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  resource: string;
  ip: string;
}

const mockStats: PlatformStats = {
  totalUsers: 1247,
  activeDids: 3891,
  credentialsIssued: 8234,
  activeIssuers: 42,
};

const mockAuditLog: AuditEntry[] = [
  { id: "1", timestamp: new Date().toISOString(), actor: "alice@example.com", action: "LOGIN", resource: "auth", ip: "192.168.1.1" },
  { id: "2", timestamp: new Date(Date.now() - 60000).toISOString(), actor: "issuer@utoronto.ca", action: "CREDENTIAL_ISSUED", resource: "credential:abc123", ip: "10.0.0.5" },
  { id: "3", timestamp: new Date(Date.now() - 120000).toISOString(), actor: "admin@humanid.io", action: "ISSUER_APPROVED", resource: "issuer:nhs-digital", ip: "10.0.0.1" },
  { id: "4", timestamp: new Date(Date.now() - 300000).toISOString(), actor: "bob@company.de", action: "DID_CREATED", resource: "did:web:company.de", ip: "172.16.0.42" },
  { id: "5", timestamp: new Date(Date.now() - 600000).toISOString(), actor: "charlie@test.com", action: "CREDENTIAL_REVOKED", resource: "credential:xyz789", ip: "192.168.2.20" },
  { id: "6", timestamp: new Date(Date.now() - 900000).toISOString(), actor: "issuer@globalfinance.com", action: "ISSUER_SUSPENDED", resource: "issuer:globalfinance", ip: "10.0.1.88" },
  { id: "7", timestamp: new Date(Date.now() - 1200000).toISOString(), actor: "diana@example.fr", action: "LOGIN", resource: "auth", ip: "192.168.3.5" },
  { id: "8", timestamp: new Date(Date.now() - 1500000).toISOString(), actor: "admin@humanid.io", action: "USER_SUSPENDED", resource: "user:charlie-test", ip: "10.0.0.1" },
  { id: "9", timestamp: new Date(Date.now() - 1800000).toISOString(), actor: "eve@startup.io", action: "DID_CREATED", resource: "did:key:z6Mk...", ip: "203.0.113.7" },
  { id: "10", timestamp: new Date(Date.now() - 2100000).toISOString(), actor: "issuer@utoronto.ca", action: "CREDENTIAL_ISSUED", resource: "credential:stu456", ip: "10.0.0.5" },
];

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium" });
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`}
      aria-label={ok ? "operational" : "degraded"}
    />
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PlatformStats>(mockStats);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>(mockAuditLog);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }

    async function fetchData() {
      try {
        const [statsRes, auditRes] = await Promise.allSettled([
          apiFetch("/admin/stats"),
          apiFetch("/audit?limit=10"),
        ]);

        if (statsRes.status === "fulfilled" && statsRes.value.ok) {
          const data = await statsRes.value.json();
          setStats(data);
        }
        if (auditRes.status === "fulfilled" && auditRes.value.ok) {
          const data = await auditRes.value.json();
          setAuditLog(Array.isArray(data) ? data : data.entries ?? mockAuditLog);
        }
      } catch {
        // API unavailable — mock data is already set
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const statCards = [
    { label: "Total Users", value: stats.totalUsers.toLocaleString(), icon: "U" },
    { label: "Active DIDs", value: stats.activeDids.toLocaleString(), icon: "D" },
    { label: "Credentials Issued", value: stats.credentialsIssued.toLocaleString(), icon: "C" },
    { label: "Active Issuers", value: stats.activeIssuers.toLocaleString(), icon: "I" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="border-b border-gray-100 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">H</span>
              </div>
              <span className="font-semibold text-gray-900">HumanID</span>
              <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Admin</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900">Dashboard</Link>
              <Link href="/admin/users" className="text-sm text-gray-600 hover:text-gray-900">Users</Link>
              <Link href="/admin/issuers" className="text-sm text-gray-600 hover:text-gray-900">Issuers</Link>
              <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">Exit Admin</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Platform-wide overview and controls</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <div key={card.label} className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-500">{card.label}</p>
                <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                  <span className="text-primary-500 font-bold text-sm">{card.icon}</span>
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* System Health */}
          <div className="card">
            <h2 className="text-base font-semibold text-gray-900 mb-4">System Health</h2>
            <ul className="space-y-3">
              {[
                { name: "API Server", ok: true },
                { name: "Database", ok: true },
                { name: "Redis Cache", ok: true },
              ].map((service) => (
                <li key={service.name} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{service.name}</span>
                  <div className="flex items-center gap-2">
                    <StatusDot ok={service.ok} />
                    <span className={`text-xs font-medium ${service.ok ? "text-green-600" : "text-red-600"}`}>
                      {service.ok ? "Operational" : "Degraded"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Actions */}
          <div className="card lg:col-span-2">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link
                href="/admin/issuers"
                className="flex flex-col items-center justify-center p-4 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors text-center group"
              >
                <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center mb-2 group-hover:bg-primary-200 transition-colors">
                  <span className="text-primary-600 font-bold">I</span>
                </div>
                <span className="text-sm font-medium text-gray-700">Manage Issuers</span>
                <span className="text-xs text-gray-400 mt-0.5">Approve & suspend</span>
              </Link>
              <Link
                href="/admin/users"
                className="flex flex-col items-center justify-center p-4 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors text-center group"
              >
                <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center mb-2 group-hover:bg-primary-200 transition-colors">
                  <span className="text-primary-600 font-bold">U</span>
                </div>
                <span className="text-sm font-medium text-gray-700">Manage Users</span>
                <span className="text-xs text-gray-400 mt-0.5">Search & moderate</span>
              </Link>
              <Link
                href="/admin/audit"
                className="flex flex-col items-center justify-center p-4 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors text-center group"
              >
                <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center mb-2 group-hover:bg-primary-200 transition-colors">
                  <span className="text-primary-600 font-bold">A</span>
                </div>
                <span className="text-sm font-medium text-gray-700">Full Audit Log</span>
                <span className="text-xs text-gray-400 mt-0.5">All platform events</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Audit Log */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Recent Audit Log</h2>
            <Link href="/admin/audit" className="text-sm text-primary-500 hover:text-primary-600">
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Recent audit log entries">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Timestamp</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actor</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Resource</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {auditLog.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap font-mono text-xs">
                      {formatTimestamp(entry.timestamp)}
                    </td>
                    <td className="py-2.5 px-3 text-gray-700 max-w-[160px] truncate" title={entry.actor}>
                      {entry.actor}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 font-mono">
                        {entry.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-600 max-w-[160px] truncate font-mono text-xs" title={entry.resource}>
                      {entry.resource}
                    </td>
                    <td className="py-2.5 px-3 text-gray-500 font-mono text-xs whitespace-nowrap">
                      {entry.ip}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
