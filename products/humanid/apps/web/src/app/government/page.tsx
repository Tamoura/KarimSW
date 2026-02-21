"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAccessToken, setAccessToken } from "@/lib/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5013/api/v1";

type PartnershipStatus = "PENDING" | "APPROVED" | "REJECTED" | "ACTIVE";

interface Partnership {
  id: string;
  organizationName: string;
  country: string;
  contactEmail: string;
  purpose: string;
  status: PartnershipStatus;
  createdAt: string;
}

interface CredentialScheme {
  id: string;
  name: string;
  schemaType: string;
  version: string;
  description?: string;
  partnershipId?: string;
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

function PartnerStatusBadge({ status }: { status: PartnershipStatus }) {
  const styles: Record<PartnershipStatus, string> = {
    PENDING: "bg-gray-100 text-gray-600",
    APPROVED: "bg-blue-100 text-blue-700",
    ACTIVE: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-700",
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

export default function GovernmentPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [schemes, setSchemes] = useState<CredentialScheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Partnership application form
  const [appOrg, setAppOrg] = useState("");
  const [appCountry, setAppCountry] = useState("");
  const [appEmail, setAppEmail] = useState("");
  const [appPurpose, setAppPurpose] = useState("");
  const [applying, setApplying] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [appSuccess, setAppSuccess] = useState<string | null>(null);

  // Credential scheme registration
  const [schemeName, setSchemeName] = useState("");
  const [schemeType, setSchemeType] = useState("");
  const [schemeVersion, setSchemeVersion] = useState("1.0");
  const [schemeDesc, setSchemeDesc] = useState("");
  const [schemePartnership, setSchemePartnership] = useState("");
  const [schemeCreating, setSchemeCreating] = useState(false);
  const [schemeError, setSchemeError] = useState<string | null>(null);
  const [schemeSuccess, setSchemeSuccess] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchData = useCallback(async (token: string) => {
    const headers = { Authorization: `Bearer ${token}` };

    const [partRes, schemeRes] = await Promise.all([
      fetch(`${API_BASE}/government/partnerships`, { headers }),
      fetch(`${API_BASE}/government/schemes`, { headers }),
    ]);

    if (partRes.status === 401) { handleUnauthorized(); return; }

    if (partRes.ok) {
      const data = await partRes.json();
      setPartnerships(data.partnerships ?? []);
    }

    if (schemeRes.ok) {
      const data = await schemeRes.json();
      setSchemes(data.schemes ?? []);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) { router.push("/login"); return; }

    setEmail("");
    fetchData(token)
      .catch(() => setError("Could not load government partnership data. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchData]);

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    if (!appOrg.trim()) { setAppError("Organisation name is required."); return; }
    if (!appCountry.trim()) { setAppError("Country is required."); return; }
    if (!appEmail.trim()) { setAppError("Contact email is required."); return; }
    if (!appPurpose.trim()) { setAppError("Purpose is required."); return; }

    setApplying(true);
    setAppError(null);
    setAppSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/government/partnerships`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationName: appOrg.trim(),
          country: appCountry.trim(),
          contactEmail: appEmail.trim(),
          purpose: appPurpose.trim(),
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAppError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to submit application."
        );
        return;
      }

      const data = await res.json();
      const newPartnership: Partnership = data.partnership ?? data;
      setPartnerships((prev) => [newPartnership, ...prev]);
      setAppSuccess("Partnership application submitted successfully.");
      setAppOrg("");
      setAppCountry("");
      setAppEmail("");
      setAppPurpose("");
    } catch {
      setAppError("Could not connect to the server.");
    } finally {
      setApplying(false);
    }
  }

  async function handleRegisterScheme(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    if (!schemeName.trim()) { setSchemeError("Scheme name is required."); return; }
    if (!schemeType.trim()) { setSchemeError("Schema type is required."); return; }

    setSchemeCreating(true);
    setSchemeError(null);
    setSchemeSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/government/schemes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: schemeName.trim(),
          schemaType: schemeType.trim(),
          version: schemeVersion.trim() || "1.0",
          description: schemeDesc.trim() || undefined,
          partnershipId: schemePartnership.trim() || undefined,
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSchemeError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to register scheme."
        );
        return;
      }

      const data = await res.json();
      const newScheme: CredentialScheme = data.scheme ?? data;
      setSchemes((prev) => [newScheme, ...prev]);
      setSchemeSuccess(`Scheme "${newScheme.name}" registered successfully.`);
      setSchemeName("");
      setSchemeType("");
      setSchemeVersion("1.0");
      setSchemeDesc("");
      setSchemePartnership("");
    } catch {
      setSchemeError("Could not connect to the server.");
    } finally {
      setSchemeCreating(false);
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
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 no-underline hover:no-underline">
                <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
                  <span className="text-white font-bold text-sm" aria-hidden="true">H</span>
                </div>
                <span className="font-bold text-gray-900 text-lg">HumanID</span>
              </Link>
              <span className="text-gray-300" aria-hidden="true">/</span>
              <span className="text-sm font-medium text-primary-600">Government</span>
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
          <h1 className="text-2xl font-bold text-gray-900">Government Partnership Program</h1>
          <p className="mt-1 text-sm text-gray-500">
            Apply for government partnerships and register national credential schemes.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading government data">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading partnership data&hellip;</p>
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
            {/* Left: Partnership */}
            <div className="space-y-6">
              {/* Partnership application */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Apply for Partnership</h2>
                {appSuccess && <SuccessBanner message={appSuccess} />}
                <form onSubmit={handleApply} noValidate>
                  {appError && <ErrorBanner message={appError} />}
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="app-org" className="block text-xs font-medium text-gray-700 mb-1">
                        Organisation Name <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="app-org"
                        type="text"
                        value={appOrg}
                        onChange={(e) => setAppOrg(e.target.value)}
                        placeholder="Ministry of Digital Affairs"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="app-country" className="block text-xs font-medium text-gray-700 mb-1">
                          Country <span className="text-red-500" aria-hidden="true">*</span>
                        </label>
                        <input
                          id="app-country"
                          type="text"
                          value={appCountry}
                          onChange={(e) => setAppCountry(e.target.value)}
                          placeholder="Germany"
                          required
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label htmlFor="app-email" className="block text-xs font-medium text-gray-700 mb-1">
                          Contact Email <span className="text-red-500" aria-hidden="true">*</span>
                        </label>
                        <input
                          id="app-email"
                          type="email"
                          value={appEmail}
                          onChange={(e) => setAppEmail(e.target.value)}
                          placeholder="contact@gov.de"
                          required
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="app-purpose" className="block text-xs font-medium text-gray-700 mb-1">
                        Purpose <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <textarea
                        id="app-purpose"
                        value={appPurpose}
                        onChange={(e) => setAppPurpose(e.target.value)}
                        placeholder="Describe the purpose and intended use of the partnership"
                        rows={3}
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <button type="submit" disabled={applying} className="btn-primary text-sm">
                      {applying ? (
                        <span className="flex items-center gap-2"><Spinner />Submitting&hellip;</span>
                      ) : (
                        "Submit Application"
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Partnership list */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Partnerships ({partnerships.length})</h2>
                {partnerships.length === 0 ? (
                  <div className="text-center py-10">
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" />
                    </svg>
                    <p className="text-sm text-gray-500">No partnerships yet.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100" role="list">
                    {partnerships.map((p) => (
                      <li key={p.id} className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900 truncate">{p.organizationName}</p>
                            <p className="text-xs text-gray-500">{p.country} &middot; {p.contactEmail}</p>
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{p.purpose}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <PartnerStatusBadge status={p.status} />
                            <p className="text-xs text-gray-400 mt-1">{formatDate(p.createdAt)}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Right: Credential schemes */}
            <div className="space-y-6">
              {/* Register scheme */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Register Credential Scheme</h2>
                {schemeSuccess && <SuccessBanner message={schemeSuccess} />}
                <form onSubmit={handleRegisterScheme} noValidate>
                  {schemeError && <ErrorBanner message={schemeError} />}
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="scheme-name" className="block text-xs font-medium text-gray-700 mb-1">
                        Scheme Name <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="scheme-name"
                        type="text"
                        value={schemeName}
                        onChange={(e) => setSchemeName(e.target.value)}
                        placeholder="National eID Credential"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="scheme-type" className="block text-xs font-medium text-gray-700 mb-1">
                          Schema Type <span className="text-red-500" aria-hidden="true">*</span>
                        </label>
                        <input
                          id="scheme-type"
                          type="text"
                          value={schemeType}
                          onChange={(e) => setSchemeType(e.target.value)}
                          placeholder="VerifiableCredential"
                          required
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label htmlFor="scheme-version" className="block text-xs font-medium text-gray-700 mb-1">Version</label>
                        <input
                          id="scheme-version"
                          type="text"
                          value={schemeVersion}
                          onChange={(e) => setSchemeVersion(e.target.value)}
                          placeholder="1.0"
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="scheme-desc" className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                      <textarea
                        id="scheme-desc"
                        value={schemeDesc}
                        onChange={(e) => setSchemeDesc(e.target.value)}
                        placeholder="Optional description of the credential scheme"
                        rows={2}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="scheme-partnership" className="block text-xs font-medium text-gray-700 mb-1">
                        Partnership ID (optional)
                      </label>
                      {partnerships.length > 0 ? (
                        <select
                          id="scheme-partnership"
                          value={schemePartnership}
                          onChange={(e) => setSchemePartnership(e.target.value)}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                          <option value="">None</option>
                          {partnerships.map((p) => (
                            <option key={p.id} value={p.id}>{p.organizationName}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id="scheme-partnership"
                          type="text"
                          value={schemePartnership}
                          onChange={(e) => setSchemePartnership(e.target.value)}
                          placeholder="Partnership ID"
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      )}
                    </div>
                  </div>
                  <div className="mt-4">
                    <button type="submit" disabled={schemeCreating} className="btn-primary text-sm">
                      {schemeCreating ? (
                        <span className="flex items-center gap-2"><Spinner />Registering&hellip;</span>
                      ) : (
                        "Register Scheme"
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Scheme list */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Credential Schemes ({schemes.length})</h2>
                {schemes.length === 0 ? (
                  <div className="text-center py-10">
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375Z" />
                    </svg>
                    <p className="text-sm text-gray-500">No credential schemes registered.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100" role="list">
                    {schemes.map((scheme) => (
                      <li key={scheme.id} className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900">{scheme.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{scheme.schemaType}</span>
                              <span className="text-xs text-gray-400">v{scheme.version}</span>
                            </div>
                            {scheme.description && (
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{scheme.description}</p>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 shrink-0">{formatDate(scheme.createdAt)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
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
