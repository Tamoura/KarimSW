"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAccessToken, setAccessToken } from "@/lib/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5013/api/v1";

type RegionHealth = "HEALTHY" | "DEGRADED" | "OFFLINE";

interface Region {
  id: string;
  name: string;
  code: string;
  location: string;
  health: RegionHealth;
  latencyMs?: number;
  dataResidency?: string;
  active: boolean;
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

function HealthBadge({ health }: { health: RegionHealth }) {
  const styles: Record<RegionHealth, string> = {
    HEALTHY: "bg-green-100 text-green-800",
    DEGRADED: "bg-amber-100 text-amber-800",
    OFFLINE: "bg-red-100 text-red-700",
  };
  const dots: Record<RegionHealth, string> = {
    HEALTHY: "bg-green-500",
    DEGRADED: "bg-amber-500",
    OFFLINE: "bg-red-500",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[health]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[health]}`} aria-hidden="true" />
      {health.charAt(0) + health.slice(1).toLowerCase()}
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

export default function RegionsPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Register region form
  const [regName, setRegName] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regLocation, setRegLocation] = useState("");
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

  // Config update panel
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [cfgLatency, setCfgLatency] = useState("");
  const [cfgResidency, setCfgResidency] = useState("");
  const [cfgUpdating, setCfgUpdating] = useState(false);
  const [cfgError, setCfgError] = useState<string | null>(null);
  const [cfgSuccess, setCfgSuccess] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchRegions = useCallback(async (token: string) => {
    const res = await fetch(`${API_BASE}/regions`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error("Failed to load regions.");

    const data = await res.json();
    setRegions(data.regions ?? []);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) { router.push("/login"); return; }

    setEmail("");
    fetchRegions(token)
      .catch(() => setError("Could not load region data. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchRegions]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    if (!regName.trim()) { setRegError("Region name is required."); return; }
    if (!regCode.trim()) { setRegError("Region code is required."); return; }
    if (!regLocation.trim()) { setRegError("Location is required."); return; }

    setRegistering(true);
    setRegError(null);
    setRegSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/regions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: regName.trim(),
          code: regCode.trim().toUpperCase(),
          location: regLocation.trim(),
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRegError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to register region."
        );
        return;
      }

      const data = await res.json();
      const newRegion: Region = data.region ?? data;
      setRegions((prev) => [newRegion, ...prev]);
      setRegSuccess(`Region "${newRegion.name}" registered successfully.`);
      setRegName("");
      setRegCode("");
      setRegLocation("");
    } catch {
      setRegError("Could not connect to the server.");
    } finally {
      setRegistering(false);
    }
  }

  async function handleConfigUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRegion) return;

    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    setCfgUpdating(true);
    setCfgError(null);
    setCfgSuccess(null);

    try {
      const payload: Record<string, unknown> = {};
      if (cfgLatency.trim()) payload.latencyMs = parseInt(cfgLatency, 10);
      if (cfgResidency.trim()) payload.dataResidency = cfgResidency.trim();

      const res = await fetch(`${API_BASE}/regions/${selectedRegion.id}/config`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCfgError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to update config."
        );
        return;
      }

      const data = await res.json();
      const updated: Region = data.region ?? { ...selectedRegion, latencyMs: parseInt(cfgLatency, 10) || selectedRegion.latencyMs, dataResidency: cfgResidency || selectedRegion.dataResidency };
      setRegions((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setCfgSuccess("Region configuration updated.");
      setSelectedRegion(null);
    } catch {
      setCfgError("Could not connect to the server.");
    } finally {
      setCfgUpdating(false);
    }
  }

  function handleLogout() {
    setAccessToken(null);
    router.push("/login");
  }

  function openConfigPanel(region: Region) {
    setSelectedRegion(region);
    setCfgLatency(region.latencyMs?.toString() ?? "");
    setCfgResidency(region.dataResidency ?? "");
    setCfgError(null);
    setCfgSuccess(null);
  }

  const healthyCount = regions.filter((r) => r.health === "HEALTHY").length;
  const degradedCount = regions.filter((r) => r.health === "DEGRADED").length;
  const offlineCount = regions.filter((r) => r.health === "OFFLINE").length;

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
              <span className="text-sm font-medium text-primary-600">Regions</span>
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
          <h1 className="text-2xl font-bold text-gray-900">Multi-Region Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor and configure data-residency regions for EU, US, and APAC deployments.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading regions">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading regions&hellip;</p>
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
            {/* Health overview */}
            <div className="grid grid-cols-3 gap-4">
              <div className="card text-center">
                <p className="text-3xl font-bold text-green-600">{healthyCount}</p>
                <p className="text-xs text-gray-500 mt-1">Healthy</p>
              </div>
              <div className="card text-center">
                <p className="text-3xl font-bold text-amber-600">{degradedCount}</p>
                <p className="text-xs text-gray-500 mt-1">Degraded</p>
              </div>
              <div className="card text-center">
                <p className="text-3xl font-bold text-red-600">{offlineCount}</p>
                <p className="text-xs text-gray-500 mt-1">Offline</p>
              </div>
            </div>

            {/* Region cards */}
            {regions.length === 0 ? (
              <div className="card text-center py-12">
                <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                </svg>
                <p className="text-sm text-gray-500">No regions registered.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {regions.map((region) => (
                  <div key={region.id} className="card">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-mono font-semibold">
                            {region.code}
                          </span>
                          {!region.active && (
                            <span className="text-xs text-gray-400">(Inactive)</span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900 mt-1">{region.name}</h3>
                        <p className="text-xs text-gray-500">{region.location}</p>
                      </div>
                      <HealthBadge health={region.health} />
                    </div>

                    <div className="space-y-1.5 text-xs text-gray-600 mb-4">
                      {region.latencyMs !== undefined && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Latency</span>
                          <span className="font-medium">{region.latencyMs} ms</span>
                        </div>
                      )}
                      {region.dataResidency && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Data Residency</span>
                          <span className="font-medium">{region.dataResidency}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Registered</span>
                        <span className="font-medium">{formatDate(region.createdAt)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openConfigPanel(region)}
                      className="w-full text-center text-xs font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg px-3 py-1.5 hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 transition-colors"
                    >
                      Configure
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Config update panel */}
            {selectedRegion && (
              <div className="card border-l-4 border-l-primary-500">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-900">
                    Configure: <span className="font-mono text-primary-600">{selectedRegion.code}</span> &mdash; {selectedRegion.name}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSelectedRegion(null)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Close config panel"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {cfgSuccess && <SuccessBanner message={cfgSuccess} />}
                <form onSubmit={handleConfigUpdate} noValidate>
                  {cfgError && <ErrorBanner message={cfgError} />}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label htmlFor="cfg-latency" className="block text-xs font-medium text-gray-700 mb-1">
                        Target Latency (ms)
                      </label>
                      <input
                        id="cfg-latency"
                        type="number"
                        min="0"
                        value={cfgLatency}
                        onChange={(e) => setCfgLatency(e.target.value)}
                        placeholder="e.g. 25"
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="cfg-residency" className="block text-xs font-medium text-gray-700 mb-1">
                        Data Residency
                      </label>
                      <input
                        id="cfg-residency"
                        type="text"
                        value={cfgResidency}
                        onChange={(e) => setCfgResidency(e.target.value)}
                        placeholder="e.g. EU, US-East, APAC"
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={cfgUpdating} className="btn-primary text-sm">
                    {cfgUpdating ? (
                      <span className="flex items-center gap-2"><Spinner />Saving&hellip;</span>
                    ) : (
                      "Save Config"
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* Register new region */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Register New Region</h2>
              {regSuccess && <SuccessBanner message={regSuccess} />}
              <form onSubmit={handleRegister} noValidate>
                {regError && <ErrorBanner message={regError} />}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label htmlFor="reg-name" className="block text-xs font-medium text-gray-700 mb-1">
                      Name <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="reg-name"
                      type="text"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Europe West"
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-code" className="block text-xs font-medium text-gray-700 mb-1">
                      Code <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="reg-code"
                      type="text"
                      value={regCode}
                      onChange={(e) => setRegCode(e.target.value.toUpperCase())}
                      placeholder="EU-WEST"
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-location" className="block text-xs font-medium text-gray-700 mb-1">
                      Location <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="reg-location"
                      type="text"
                      value={regLocation}
                      onChange={(e) => setRegLocation(e.target.value)}
                      placeholder="Frankfurt, DE"
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <button type="submit" disabled={registering} className="btn-primary text-sm">
                  {registering ? (
                    <span className="flex items-center gap-2"><Spinner />Registering&hellip;</span>
                  ) : (
                    "Register Region"
                  )}
                </button>
              </form>
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
