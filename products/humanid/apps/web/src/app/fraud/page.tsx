"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAccessToken, setAccessToken } from "@/lib/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5013/api/v1";

type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type AlertStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "FALSE_POSITIVE";

interface FraudAlert {
  id: string;
  credentialId: string;
  severity: AlertSeverity;
  status: AlertStatus;
  description?: string;
  detectedAt: string;
  updatedAt: string;
}

interface FraudStats {
  totalScans: number;
  alertsRaised: number;
  falsePositives: number;
  truePositives: number;
  detectionRate: number;
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

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const styles: Record<AlertSeverity, string> = {
    LOW: "bg-gray-100 text-gray-600",
    MEDIUM: "bg-amber-100 text-amber-800",
    HIGH: "bg-orange-100 text-orange-700",
    CRITICAL: "bg-red-100 text-red-800",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[severity]}`}>
      {severity.charAt(0) + severity.slice(1).toLowerCase()}
    </span>
  );
}

function AlertStatusBadge({ status }: { status: AlertStatus }) {
  const styles: Record<AlertStatus, string> = {
    OPEN: "bg-red-100 text-red-800",
    INVESTIGATING: "bg-amber-100 text-amber-800",
    RESOLVED: "bg-green-100 text-green-800",
    FALSE_POSITIVE: "bg-gray-100 text-gray-600",
  };
  const labels: Record<AlertStatus, string> = {
    OPEN: "Open",
    INVESTIGATING: "Investigating",
    RESOLVED: "Resolved",
    FALSE_POSITIVE: "False Positive",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
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

export default function FraudPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [stats, setStats] = useState<FraudStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scan form
  const [scanCredentialId, setScanCredentialId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);

  // Update alert panel
  const [selectedAlert, setSelectedAlert] = useState<FraudAlert | null>(null);
  const [updateStatus, setUpdateStatus] = useState<AlertStatus>("OPEN");
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchData = useCallback(async (token: string) => {
    const headers = { Authorization: `Bearer ${token}` };
    const [alertsRes, statsRes] = await Promise.all([
      fetch(`${API_BASE}/fraud/alerts`, { headers }),
      fetch(`${API_BASE}/fraud/stats`, { headers }),
    ]);

    if (alertsRes.status === 401 || statsRes.status === 401) {
      handleUnauthorized();
      return;
    }
    if (!alertsRes.ok) throw new Error("Failed to load fraud alerts.");
    if (!statsRes.ok) throw new Error("Failed to load fraud stats.");

    const alertsData = await alertsRes.json();
    const statsData = await statsRes.json();

    setAlerts(alertsData.alerts ?? alertsData ?? []);
    setStats(statsData.stats ?? statsData ?? null);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) { router.push("/login"); return; }
    setEmail("");
    fetchData(token)
      .catch(() => setError("Could not load fraud data. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchData]);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }
    if (!scanCredentialId.trim()) { setScanError("Credential ID is required."); return; }

    setScanning(true);
    setScanError(null);
    setScanSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/fraud/scan/${encodeURIComponent(scanCredentialId.trim())}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setScanError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Scan failed."
        );
        return;
      }

      const data = await res.json();
      if (data.alert) {
        setAlerts((prev) => [data.alert, ...prev]);
        setScanSuccess(`Scan complete. Alert raised: ${data.alert.severity} severity.`);
      } else {
        setScanSuccess("Scan complete. No fraud detected.");
      }
      setScanCredentialId("");
    } catch {
      setScanError("Could not connect to the server.");
    } finally {
      setScanning(false);
    }
  }

  async function handleUpdateAlert(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAlert) return;
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    setUpdating(true);
    setUpdateError(null);
    setUpdateSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/fraud/alerts/${selectedAlert.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: updateStatus }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUpdateError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to update alert."
        );
        return;
      }

      const data = await res.json();
      const updated: FraudAlert = data.alert ?? { ...selectedAlert, status: updateStatus };
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setUpdateSuccess("Alert status updated.");
      setSelectedAlert(null);
    } catch {
      setUpdateError("Could not connect to the server.");
    } finally {
      setUpdating(false);
    }
  }

  function handleLogout() {
    setAccessToken(null);
    router.push("/login");
  }

  function openUpdatePanel(alert: FraudAlert) {
    setSelectedAlert(alert);
    setUpdateStatus(alert.status);
    setUpdateError(null);
    setUpdateSuccess(null);
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
              <span className="text-sm font-medium text-primary-600">AI Fraud Detection</span>
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
          <h1 className="text-2xl font-bold text-gray-900">AI Fraud Detection</h1>
          <p className="mt-1 text-sm text-gray-500">
            Scan credentials for fraudulent patterns and manage fraud alerts with AI-powered detection.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading fraud data">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading fraud data&hellip;</p>
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
            {/* Stats cards */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div className="card">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total Scans</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.totalScans}</p>
                </div>
                <div className="card">
                  <p className="text-xs font-medium text-amber-600 uppercase tracking-wide mb-1">Alerts Raised</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.alertsRaised}</p>
                </div>
                <div className="card">
                  <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">True Positives</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.truePositives}</p>
                </div>
                <div className="card">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">False Positives</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.falsePositives}</p>
                </div>
                <div className="card">
                  <p className="text-xs font-medium text-primary-600 uppercase tracking-wide mb-1">Detection Rate</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {typeof stats.detectionRate === "number" ? `${(stats.detectionRate * 100).toFixed(1)}%` : stats.detectionRate}
                  </p>
                </div>
              </div>
            )}

            {/* Scan form */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Scan Credential</h2>
              {scanSuccess && <SuccessBanner message={scanSuccess} />}
              <form onSubmit={handleScan} noValidate className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label htmlFor="scan-credential-id" className="block text-xs font-medium text-gray-700 mb-1">
                    Credential ID <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="scan-credential-id"
                    type="text"
                    value={scanCredentialId}
                    onChange={(e) => setScanCredentialId(e.target.value)}
                    placeholder="Enter credential ID to scan"
                    required
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div className="flex items-end">
                  <button type="submit" disabled={scanning} className="btn-primary text-sm whitespace-nowrap">
                    {scanning ? (
                      <span className="flex items-center gap-2"><Spinner />Scanning&hellip;</span>
                    ) : (
                      "Run Scan"
                    )}
                  </button>
                </div>
              </form>
              {scanError && <div className="mt-3"><ErrorBanner message={scanError} /></div>}
            </div>

            {/* Update alert panel */}
            {selectedAlert && (
              <div className="card border-l-4 border-l-primary-500">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-900">
                    Update Alert: <span className="font-mono text-primary-600 text-sm">{selectedAlert.id.slice(0, 8)}&hellip;</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSelectedAlert(null)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Close update panel"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {updateSuccess && <SuccessBanner message={updateSuccess} />}
                <form onSubmit={handleUpdateAlert} noValidate>
                  {updateError && <ErrorBanner message={updateError} />}
                  <div className="mb-4">
                    <label htmlFor="update-alert-status" className="block text-xs font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      id="update-alert-status"
                      value={updateStatus}
                      onChange={(e) => setUpdateStatus(e.target.value as AlertStatus)}
                      className="block w-full sm:w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="OPEN">Open</option>
                      <option value="INVESTIGATING">Investigating</option>
                      <option value="RESOLVED">Resolved</option>
                      <option value="FALSE_POSITIVE">False Positive</option>
                    </select>
                  </div>
                  <button type="submit" disabled={updating} className="btn-primary text-sm">
                    {updating ? (
                      <span className="flex items-center gap-2"><Spinner />Saving&hellip;</span>
                    ) : (
                      "Save Status"
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* Alerts table */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Fraud Alerts</h2>
              {alerts.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                  </svg>
                  <p className="text-sm text-gray-500">No fraud alerts found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200" role="table" aria-label="Fraud alerts">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Credential ID</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Severity</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Description</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Detected</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {alerts.map((alert) => (
                        <tr key={alert.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-xs font-mono text-gray-700 max-w-[120px] truncate" title={alert.credentialId}>
                            {alert.credentialId}
                          </td>
                          <td className="px-4 py-3">
                            <SeverityBadge severity={alert.severity} />
                          </td>
                          <td className="px-4 py-3">
                            <AlertStatusBadge status={alert.status} />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate" title={alert.description}>
                            {alert.description ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(alert.detectedAt)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openUpdatePanel(alert)}
                              className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 transition-colors"
                              aria-label={`Update alert ${alert.id}`}
                            >
                              Update
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
