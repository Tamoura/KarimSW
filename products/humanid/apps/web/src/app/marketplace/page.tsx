"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAccessToken, setAccessToken } from "@/lib/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5013/api/v1";

type TrustTier = "UNVERIFIED" | "VERIFIED" | "TRUSTED";

interface CredentialTemplate {
  id: string;
  name: string;
  type: string;
  description?: string;
  issuerName: string;
  issuerTrust: TrustTier;
  forkCount: number;
  schemaPreview?: Record<string, unknown>;
  createdAt: string;
}

interface IssuerDirectory {
  id: string;
  organizationName: string;
  trustLevel: TrustTier;
  did?: string;
  credentialCount?: number;
  description?: string;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function TrustBadge({ level }: { level: TrustTier }) {
  const styles: Record<TrustTier, string> = {
    UNVERIFIED: "bg-gray-100 text-gray-600",
    VERIFIED: "bg-blue-100 text-blue-700",
    TRUSTED: "bg-green-100 text-green-800",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[level]}`}>
      {level === "TRUSTED" && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      )}
      {level.charAt(0) + level.slice(1).toLowerCase()}
    </span>
  );
}

export default function MarketplacePage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [templates, setTemplates] = useState<CredentialTemplate[]>([]);
  const [issuers, setIssuers] = useState<IssuerDirectory[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingIssuers, setLoadingIssuers] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Template filters
  const [searchTemplate, setSearchTemplate] = useState("");
  const [filterType, setFilterType] = useState("");
  const [debouncedTemplateSearch, setDebouncedTemplateSearch] = useState("");

  // Issuer filters
  const [searchIssuer, setSearchIssuer] = useState("");
  const [filterTier, setFilterTier] = useState<TrustTier | "">("");
  const [debouncedIssuerSearch, setDebouncedIssuerSearch] = useState("");

  // Fork state
  const [forking, setForking] = useState<string | null>(null);
  const [forkSuccess, setForkSuccess] = useState<string | null>(null);
  const [forkError, setForkError] = useState<string | null>(null);

  // Schema preview expand
  const [expandedSchema, setExpandedSchema] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchTemplates = useCallback(async (token: string, search: string, type: string) => {
    setLoadingTemplates(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (type) params.set("type", type);

    try {
      const res = await fetch(`${API_BASE}/marketplace/templates?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }
      if (!res.ok) throw new Error("Failed to load templates.");

      const data = await res.json();
      setTemplates(data.templates ?? []);
    } catch {
      setError("Could not load marketplace templates.");
    } finally {
      setLoadingTemplates(false);
    }
  }, [handleUnauthorized]);

  const fetchIssuers = useCallback(async (token: string, search: string, tier: string) => {
    setLoadingIssuers(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (tier) params.set("tier", tier);

    try {
      const res = await fetch(`${API_BASE}/issuers/directory?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }
      if (!res.ok) return;

      const data = await res.json();
      setIssuers(data.issuers ?? []);
    } catch {
      // silently degrade issuer directory
    } finally {
      setLoadingIssuers(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    setEmail("");
    fetchTemplates(token, "", "");
    fetchIssuers(token, "", "");
  }, [router, fetchTemplates, fetchIssuers]);

  // Debounce template search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTemplateSearch(searchTemplate), 350);
    return () => clearTimeout(t);
  }, [searchTemplate]);

  // Debounce issuer search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedIssuerSearch(searchIssuer), 350);
    return () => clearTimeout(t);
  }, [searchIssuer]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    fetchTemplates(token, debouncedTemplateSearch, filterType);
  }, [debouncedTemplateSearch, filterType, fetchTemplates]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    fetchIssuers(token, debouncedIssuerSearch, filterTier);
  }, [debouncedIssuerSearch, filterTier, fetchIssuers]);

  async function handleFork(templateId: string, templateName: string) {
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    setForking(templateId);
    setForkSuccess(null);
    setForkError(null);

    try {
      const res = await fetch(`${API_BASE}/marketplace/templates/${templateId}/fork`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setForkError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to fork template."
        );
        return;
      }

      setForkSuccess(`Template "${templateName}" forked to your issuer profile.`);
      // Bump fork count locally
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, forkCount: t.forkCount + 1 } : t))
      );
    } catch {
      setForkError("Could not connect to the server.");
    } finally {
      setForking(null);
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
              <span className="text-sm font-medium text-primary-600">Marketplace</span>
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
          <h1 className="text-2xl font-bold text-gray-900">Credential Template Marketplace</h1>
          <p className="mt-1 text-sm text-gray-500">
            Browse, fork, and build on credential templates from trusted issuers.
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Fork feedback */}
        {forkSuccess && (
          <div role="status" className="mb-6 flex items-start gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
            <svg className="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <p className="text-sm text-green-700">{forkSuccess}</p>
          </div>
        )}
        {forkError && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-sm text-red-700">{forkError}</p>
          </div>
        )}

        {/* Templates section */}
        <section aria-labelledby="templates-heading" className="mb-12">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <h2 id="templates-heading" className="text-lg font-semibold text-gray-900">
              Credential Templates
            </h2>
          </div>

          {/* Template filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="search"
                value={searchTemplate}
                onChange={(e) => setSearchTemplate(e.target.value)}
                placeholder="Search templates&hellip;"
                className="block w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                aria-label="Search credential templates"
              />
            </div>
            <div>
              <label htmlFor="filter-type" className="sr-only">Filter by type</label>
              <input
                id="filter-type"
                type="text"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                placeholder="Filter by type&hellip;"
                className="block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>

          {loadingTemplates ? (
            <div className="flex items-center justify-center py-16" role="status" aria-label="Loading templates">
              <div className="flex flex-col items-center gap-3">
                <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                </svg>
                <p className="text-sm text-gray-500">Loading templates&hellip;</p>
              </div>
            </div>
          ) : templates.length === 0 ? (
            <div className="card text-center py-12">
              <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375Z" />
              </svg>
              <p className="text-sm text-gray-500">No templates found.</p>
              {(searchTemplate || filterType) && (
                <button
                  type="button"
                  onClick={() => { setSearchTemplate(""); setFilterType(""); }}
                  className="mt-3 text-sm text-primary-500 hover:text-primary-600"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {templates.map((tpl) => (
                <div key={tpl.id} className="card flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate" title={tpl.name}>
                        {tpl.name}
                      </h3>
                      <span className="inline-block mt-0.5 text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {tpl.type}
                      </span>
                    </div>
                    <TrustBadge level={tpl.issuerTrust} />
                  </div>

                  {tpl.description && (
                    <p className="text-xs text-gray-500 mb-3 line-clamp-2">{tpl.description}</p>
                  )}

                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                    </svg>
                    <span className="text-xs text-gray-600 truncate" title={tpl.issuerName}>
                      {tpl.issuerName}
                    </span>
                  </div>

                  {/* Schema preview */}
                  {tpl.schemaPreview && (
                    <div className="mb-3">
                      <button
                        type="button"
                        onClick={() => setExpandedSchema(expandedSchema === tpl.id ? null : tpl.id)}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                        aria-expanded={expandedSchema === tpl.id}
                      >
                        <svg
                          className={`w-3 h-3 transition-transform ${expandedSchema === tpl.id ? "rotate-90" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                        </svg>
                        Schema Preview
                      </button>
                      {expandedSchema === tpl.id && (
                        <pre className="mt-2 text-xs bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto max-h-40">
                          {JSON.stringify(tpl.schemaPreview, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                      </svg>
                      {tpl.forkCount} fork{tpl.forkCount !== 1 ? "s" : ""}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFork(tpl.id, tpl.name)}
                      disabled={forking === tpl.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label={`Fork template ${tpl.name}`}
                    >
                      {forking === tpl.id ? (
                        <>
                          <Spinner />
                          Forking&hellip;
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                          </svg>
                          Fork
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Issuer directory section */}
        <section aria-labelledby="issuers-heading">
          <div className="mb-4">
            <h2 id="issuers-heading" className="text-lg font-semibold text-gray-900 mb-1">
              Issuer Directory
            </h2>
            <p className="text-sm text-gray-500">Browse verified and trusted credential issuers.</p>
          </div>

          {/* Issuer filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="search"
                value={searchIssuer}
                onChange={(e) => setSearchIssuer(e.target.value)}
                placeholder="Search issuers&hellip;"
                className="block w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                aria-label="Search issuers"
              />
            </div>
            <div>
              <label htmlFor="filter-tier" className="sr-only">Filter by trust tier</label>
              <select
                id="filter-tier"
                value={filterTier}
                onChange={(e) => setFilterTier(e.target.value as TrustTier | "")}
                className="block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">All Trust Levels</option>
                <option value="TRUSTED">Trusted</option>
                <option value="VERIFIED">Verified</option>
                <option value="UNVERIFIED">Unverified</option>
              </select>
            </div>
          </div>

          {loadingIssuers ? (
            <div className="flex items-center justify-center py-12" role="status" aria-label="Loading issuers">
              <div className="flex flex-col items-center gap-3">
                <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                </svg>
                <p className="text-sm text-gray-500">Loading issuers&hellip;</p>
              </div>
            </div>
          ) : issuers.length === 0 ? (
            <div className="card text-center py-10">
              <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
              <p className="text-sm text-gray-500">No issuers found.</p>
            </div>
          ) : (
            <div className="card overflow-hidden p-0">
              <ul className="divide-y divide-gray-100" role="list" aria-label="Issuer directory">
                {issuers.map((issuer) => (
                  <li key={issuer.id} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="text-sm font-semibold text-gray-900">{issuer.organizationName}</p>
                        <TrustBadge level={issuer.trustLevel} />
                      </div>
                      {issuer.description && (
                        <p className="text-xs text-gray-500 truncate">{issuer.description}</p>
                      )}
                      {issuer.did && (
                        <p className="text-xs font-mono text-gray-400 truncate" title={issuer.did}>
                          {issuer.did.length > 40 ? `${issuer.did.slice(0, 40)}\u2026` : issuer.did}
                        </p>
                      )}
                    </div>
                    {issuer.credentialCount !== undefined && (
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-gray-900">{issuer.credentialCount}</p>
                        <p className="text-xs text-gray-400">credentials</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
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
