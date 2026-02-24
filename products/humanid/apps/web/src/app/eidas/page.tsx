"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getAccessToken, setAccessToken } from "@/lib/api-client";

interface EidasRequirement {
  id: string;
  label: string;
  description?: string;
  satisfied: boolean;
  category?: string;
}

interface EidasStatus {
  overallStatus: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT";
  requirements: EidasRequirement[];
  lastCheckedAt?: string;
  score?: number;
}

interface TrustFramework {
  name: string;
  version?: string;
  description?: string;
  requirements?: string[];
  links?: Array<{ label: string; url: string }>;
}

interface ConversionResult {
  credentialId: string;
  targetFormat: string;
  converted?: unknown;
  error?: string;
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

function StatusPill({ status }: { status: EidasStatus["overallStatus"] }) {
  const styles: Record<EidasStatus["overallStatus"], string> = {
    COMPLIANT: "bg-green-100 text-green-800",
    PARTIAL: "bg-amber-100 text-amber-800",
    NON_COMPLIANT: "bg-red-100 text-red-700",
  };
  const labels: Record<EidasStatus["overallStatus"], string> = {
    COMPLIANT: "Compliant",
    PARTIAL: "Partially Compliant",
    NON_COMPLIANT: "Non-Compliant",
  };
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function RequirementItem({ req }: { req: EidasRequirement }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <div
        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          req.satisfied ? "bg-green-100" : "bg-red-100"
        }`}
        aria-hidden="true"
      >
        {req.satisfied ? (
          <svg className="w-3 h-3 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="w-3 h-3 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${req.satisfied ? "text-gray-900" : "text-gray-700"}`}>
          {req.label}
        </p>
        {req.description && (
          <p className="text-xs text-gray-500 mt-0.5">{req.description}</p>
        )}
      </div>
      <span
        className={`shrink-0 text-xs font-medium ${req.satisfied ? "text-green-600" : "text-red-500"}`}
        aria-label={req.satisfied ? "Satisfied" : "Not satisfied"}
      >
        {req.satisfied ? "Pass" : "Fail"}
      </span>
    </li>
  );
}

export default function EidasPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<EidasStatus | null>(null);
  const [trustFramework, setTrustFramework] = useState<TrustFramework | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Converter
  const [convertCredentialId, setConvertCredentialId] = useState("");
  const [convertTargetFormat, setConvertTargetFormat] = useState("SD-JWT-VC");
  const [converting, setConverting] = useState(false);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchAll = useCallback(async () => {
    const [statusRes, frameworkRes] = await Promise.all([
      apiFetch(`/eidas/status`),
      apiFetch(`/eidas/trust-framework`),
    ]);

    if (statusRes.status === 401) { handleUnauthorized(); return; }

    if (statusRes.ok) {
      const data = await statusRes.json();
      setStatus(data);
    }

    if (frameworkRes.ok) {
      const data = await frameworkRes.json();
      setTrustFramework(data);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    setEmail("");

    fetchAll()
      .catch(() => setError("Could not load eIDAS compliance data. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchAll]);

  async function handleConvert(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    if (!convertCredentialId.trim()) { setConversionError("Credential ID is required."); return; }

    setConverting(true);
    setConversionResult(null);
    setConversionError(null);

    try {
      const res = await apiFetch(`/eidas/convert`, {
        method: "POST",
        body: JSON.stringify({
          credentialId: convertCredentialId.trim(),
          targetFormat: convertTargetFormat,
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setConversionError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Conversion failed."
        );
        return;
      }

      const data = await res.json();
      setConversionResult(data);
    } catch {
      setConversionError("Could not connect to the server.");
    } finally {
      setConverting(false);
    }
  }

  function handleLogout() {
    setAccessToken(null);
    router.push("/login");
  }

  const satisfiedCount = status?.requirements.filter((r) => r.satisfied).length ?? 0;
  const totalCount = status?.requirements.length ?? 0;
  const progressPercent = totalCount > 0 ? Math.round((satisfiedCount / totalCount) * 100) : 0;

  // Group requirements by category
  const groupedRequirements = status?.requirements.reduce<Record<string, EidasRequirement[]>>(
    (acc, req) => {
      const key = req.category ?? "General";
      if (!acc[key]) acc[key] = [];
      acc[key].push(req);
      return acc;
    },
    {}
  ) ?? {};

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
              <span className="text-sm font-medium text-primary-600">eIDAS Compliance</span>
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
          <h1 className="text-2xl font-bold text-gray-900">eIDAS Compliance</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor your eIDAS 2.0 compliance status and convert credentials to EU-compatible formats.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading eIDAS status">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading compliance data&hellip;</p>
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left / main column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Compliance dashboard */}
              {status && (
                <div className="card">
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900 mb-1">Compliance Status</h2>
                      {status.lastCheckedAt && (
                        <p className="text-xs text-gray-400">Last checked: {formatDate(status.lastCheckedAt)}</p>
                      )}
                    </div>
                    <StatusPill status={status.overallStatus} />
                  </div>

                  {/* Progress bar */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Requirements met</span>
                      <span className="text-sm font-bold text-gray-900">
                        {satisfiedCount}/{totalCount} ({progressPercent}%)
                      </span>
                    </div>
                    <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Compliance progress">
                      <div
                        className={`h-full rounded-full transition-all ${
                          progressPercent === 100
                            ? "bg-green-500"
                            : progressPercent >= 60
                            ? "bg-amber-400"
                            : "bg-red-400"
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Requirements checklist grouped by category */}
                  {Object.entries(groupedRequirements).map(([category, reqs]) => (
                    <div key={category} className="mb-4">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 pb-1 border-b border-gray-100">
                        {category}
                      </h3>
                      <ul className="divide-y divide-gray-100" role="list" aria-label={`${category} requirements`}>
                        {reqs.map((req) => (
                          <RequirementItem key={req.id} req={req} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {/* Credential format converter */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-1">Credential Format Converter</h2>
                <p className="text-sm text-gray-500 mb-6">
                  Convert a credential to an EU-compatible format for eIDAS cross-border recognition.
                </p>

                <form onSubmit={handleConvert} noValidate>
                  {conversionError && (
                    <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                      <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-8.25a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                      </svg>
                      <p className="text-xs text-red-700">{conversionError}</p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                    <div className="flex-1">
                      <label htmlFor="credential-id" className="block text-xs font-medium text-gray-700 mb-1">
                        Credential ID <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="credential-id"
                        type="text"
                        value={convertCredentialId}
                        onChange={(e) => setConvertCredentialId(e.target.value)}
                        placeholder="Enter credential ID"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>

                    <div>
                      <label htmlFor="target-format" className="block text-xs font-medium text-gray-700 mb-1">
                        Target Format
                      </label>
                      <select
                        id="target-format"
                        value={convertTargetFormat}
                        onChange={(e) => setConvertTargetFormat(e.target.value)}
                        className="block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        <option value="SD-JWT-VC">SD-JWT-VC</option>
                        <option value="W3C-VC">W3C-VC</option>
                        <option value="MDOC">mDOC</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={converting}
                      className="btn-primary text-sm shrink-0"
                    >
                      {converting ? (
                        <span className="flex items-center gap-2">
                          <Spinner />
                          Converting&hellip;
                        </span>
                      ) : (
                        "Convert"
                      )}
                    </button>
                  </div>
                </form>

                {/* Conversion result */}
                {conversionResult && (
                  <div className="mt-6 border-t border-gray-100 pt-6">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      <p className="text-sm font-medium text-gray-900">
                        Converted to {conversionResult.targetFormat}
                      </p>
                    </div>
                    {conversionResult.converted !== undefined && conversionResult.converted !== null && (
                      <>
                        <p className="text-xs font-medium text-gray-500 mb-2">Result</p>
                        <pre className="text-xs bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto max-h-64">
                          {JSON.stringify(conversionResult.converted as Record<string, unknown>, null, 2)}
                        </pre>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right column: trust framework */}
            <div className="space-y-4">
              {/* Score card */}
              {status?.score !== undefined && (
                <div className="card text-center">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Compliance Score</p>
                  <p className="text-5xl font-bold text-gray-900">{status.score}</p>
                  <p className="text-xs text-gray-400 mt-1">out of 100</p>
                </div>
              )}

              {/* Trust framework info */}
              {trustFramework ? (
                <div className="card">
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="w-5 h-5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                    </svg>
                    <h2 className="text-base font-semibold text-gray-900">Trust Framework</h2>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-medium text-gray-500">Framework</p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5">{trustFramework.name}</p>
                      {trustFramework.version && (
                        <p className="text-xs text-gray-400">v{trustFramework.version}</p>
                      )}
                    </div>

                    {trustFramework.description && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-0.5">About</p>
                        <p className="text-xs text-gray-600">{trustFramework.description}</p>
                      </div>
                    )}

                    {trustFramework.requirements && trustFramework.requirements.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-2">Key Requirements</p>
                        <ul className="space-y-1.5">
                          {trustFramework.requirements.map((req, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                              <svg className="w-3 h-3 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                              </svg>
                              {req}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {trustFramework.links && trustFramework.links.length > 0 && (
                      <div className="border-t border-gray-100 pt-3">
                        <p className="text-xs font-medium text-gray-500 mb-2">Resources</p>
                        <ul className="space-y-1">
                          {trustFramework.links.map((link, i) => (
                            <li key={i}>
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary-500 hover:text-primary-600 flex items-center gap-1"
                              >
                                {link.label}
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                </svg>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="card">
                  <h2 className="text-base font-semibold text-gray-900 mb-2">Trust Framework</h2>
                  <p className="text-sm text-gray-400">Trust framework information unavailable.</p>
                </div>
              )}

              {/* Quick reference */}
              <div className="card bg-blue-50 border-blue-200">
                <h3 className="text-sm font-semibold text-blue-900 mb-3">eIDAS 2.0 Quick Reference</h3>
                <ul className="space-y-2 text-xs text-blue-700">
                  {[
                    "EUDIW (EU Digital Identity Wallet) compatible",
                    "Person Identification Data (PID) support",
                    "Qualified Electronic Attestations (QEAA)",
                    "SD-JWT-VC credential format",
                    "Cross-border interoperability",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-1.5">
                      <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Navigation */}
              <div className="card">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Related</h3>
                <nav className="space-y-2" aria-label="Related pages">
                  {[
                    { href: "/issuer", label: "Issuer Dashboard", desc: "Issue credentials" },
                    { href: "/issuer/templates", label: "Templates", desc: "Credential schemas" },
                    { href: "/marketplace", label: "Marketplace", desc: "Browse public templates" },
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
