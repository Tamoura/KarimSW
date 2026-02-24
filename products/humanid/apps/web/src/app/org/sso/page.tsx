"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAccessToken, setAccessToken, apiFetch } from "@/lib/api-client";

type SSOProtocol = "OIDC" | "SAML";

interface SSOProvider {
  id: string;
  protocol: SSOProtocol;
  orgId: string;
  discoveryUrl?: string;
  clientId?: string;
  metadataUrl?: string;
  entityId?: string;
  enabled: boolean;
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
  });
}

function ProtocolBadge({ protocol }: { protocol: SSOProtocol }) {
  const styles: Record<SSOProtocol, string> = {
    OIDC: "bg-blue-100 text-blue-700",
    SAML: "bg-orange-100 text-orange-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[protocol]}`}>
      {protocol}
    </span>
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

export default function SSOPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [providers, setProviders] = useState<SSOProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // OIDC form
  const [oidcDiscoveryUrl, setOidcDiscoveryUrl] = useState("");
  const [oidcClientId, setOidcClientId] = useState("");
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [oidcSubmitting, setOidcSubmitting] = useState(false);
  const [oidcError, setOidcError] = useState<string | null>(null);
  const [oidcSuccess, setOidcSuccess] = useState<string | null>(null);

  // SAML form
  const [samlMetadataUrl, setSamlMetadataUrl] = useState("");
  const [samlEntityId, setSamlEntityId] = useState("");
  const [samlSubmitting, setSamlSubmitting] = useState(false);
  const [samlError, setSamlError] = useState<string | null>(null);
  const [samlSuccess, setSamlSuccess] = useState<string | null>(null);

  // Remove provider
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeSuccess, setRemoveSuccess] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchProviders = useCallback(async (orgId: string) => {
    const res = await apiFetch(`/sso/providers?orgId=${orgId}`);

    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error("Failed to load SSO providers.");

    const data = await res.json();
    setProviders(data.providers ?? []);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();
    const orgId = localStorage.getItem("org_id");

    if (!token) {
      router.push("/login");
      return;
    }

    setEmail("");

    if (orgId) {
      fetchProviders(orgId)
        .catch(() => setError("Could not load SSO providers. Please try again."))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [router, fetchProviders]);

  async function handleOidcSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    const orgId = localStorage.getItem("org_id");
    if (!token) { handleUnauthorized(); return; }

    if (!orgId) { setOidcError("No organisation found. Please set up your organisation first."); return; }
    if (!oidcDiscoveryUrl.trim()) { setOidcError("Discovery URL is required."); return; }
    if (!oidcClientId.trim()) { setOidcError("Client ID is required."); return; }
    if (!oidcClientSecret.trim()) { setOidcError("Client Secret is required."); return; }

    setOidcSubmitting(true);
    setOidcError(null);
    setOidcSuccess(null);

    try {
      const res = await apiFetch(`/sso/oidc`, {
        method: "POST",
        body: JSON.stringify({
          orgId,
          discoveryUrl: oidcDiscoveryUrl.trim(),
          clientId: oidcClientId.trim(),
          clientSecret: oidcClientSecret.trim(),
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setOidcError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to configure OIDC."
        );
        return;
      }

      const data = await res.json();
      const newProvider: SSOProvider = data.provider ?? data;
      setProviders((prev) => {
        const filtered = prev.filter((p) => p.protocol !== "OIDC");
        return [newProvider, ...filtered];
      });
      setOidcSuccess("OIDC provider configured successfully.");
      setOidcDiscoveryUrl("");
      setOidcClientId("");
      setOidcClientSecret("");
    } catch {
      setOidcError("Could not connect to the server.");
    } finally {
      setOidcSubmitting(false);
    }
  }

  async function handleSamlSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    const orgId = localStorage.getItem("org_id");
    if (!token) { handleUnauthorized(); return; }

    if (!orgId) { setSamlError("No organisation found. Please set up your organisation first."); return; }
    if (!samlMetadataUrl.trim()) { setSamlError("Metadata URL is required."); return; }
    if (!samlEntityId.trim()) { setSamlError("Entity ID is required."); return; }

    setSamlSubmitting(true);
    setSamlError(null);
    setSamlSuccess(null);

    try {
      const res = await apiFetch(`/sso/saml`, {
        method: "POST",
        body: JSON.stringify({
          orgId,
          metadataUrl: samlMetadataUrl.trim(),
          entityId: samlEntityId.trim(),
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSamlError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to configure SAML."
        );
        return;
      }

      const data = await res.json();
      const newProvider: SSOProvider = data.provider ?? data;
      setProviders((prev) => {
        const filtered = prev.filter((p) => p.protocol !== "SAML");
        return [newProvider, ...filtered];
      });
      setSamlSuccess("SAML provider configured successfully.");
      setSamlMetadataUrl("");
      setSamlEntityId("");
    } catch {
      setSamlError("Could not connect to the server.");
    } finally {
      setSamlSubmitting(false);
    }
  }

  async function handleRemove(protocol: SSOProtocol) {
    const token = getAccessToken();
    const orgId = localStorage.getItem("org_id");
    if (!token || !orgId) return;

    if (!window.confirm(`Remove ${protocol} SSO provider? Users will no longer be able to sign in via this provider.`)) return;

    setRemoving(protocol);
    setRemoveError(null);
    setRemoveSuccess(null);

    try {
      const endpoint = protocol === "OIDC" ? "oidc" : "saml";
      const res = await apiFetch(`/sso/${endpoint}?orgId=${orgId}`, {
        method: "DELETE",
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRemoveError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          `Failed to remove ${protocol} provider.`
        );
        return;
      }

      setProviders((prev) => prev.filter((p) => p.protocol !== protocol));
      setRemoveSuccess(`${protocol} provider removed.`);
    } catch {
      setRemoveError("Could not connect to the server.");
    } finally {
      setRemoving(null);
    }
  }

  function handleLogout() {
    setAccessToken(null);
    router.push("/login");
  }

  const orgId = typeof window !== "undefined" ? localStorage.getItem("org_id") : null;
  const hasOidc = providers.some((p) => p.protocol === "OIDC");
  const hasSaml = providers.some((p) => p.protocol === "SAML");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link
              href="/org"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors no-underline"
              aria-label="Back to Organisation"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Organisation
            </Link>
            <span className="text-gray-300" aria-hidden="true">/</span>
            <span className="text-sm font-medium text-gray-900">SSO Configuration</span>
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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">SSO Configuration</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure OIDC or SAML single sign-on for your organisation.
          </p>
        </div>

        {!orgId && !loading && (
          <div className="card max-w-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-900">No organisation set up</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  You need to create an organisation before configuring SSO.{" "}
                  <Link href="/org" className="text-primary-500 hover:text-primary-600">
                    Set up organisation
                  </Link>
                </p>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading SSO configuration">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading SSO configuration&hellip;</p>
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

        {!loading && !error && orgId && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column: config forms */}
            <div className="space-y-6">
              {/* OIDC form */}
              <div className="card">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">OIDC Provider</h2>
                    <p className="text-xs text-gray-500">OpenID Connect (e.g. Okta, Auth0, Azure AD)</p>
                  </div>
                  {hasOidc && (
                    <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Configured
                    </span>
                  )}
                </div>

                {oidcSuccess && <SuccessBanner message={oidcSuccess} />}

                <form onSubmit={handleOidcSubmit} noValidate>
                  {oidcError && <ErrorBanner message={oidcError} />}

                  <div className="space-y-3">
                    <div>
                      <label htmlFor="oidc-discovery" className="block text-xs font-medium text-gray-700 mb-1">
                        Discovery URL <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="oidc-discovery"
                        type="url"
                        value={oidcDiscoveryUrl}
                        onChange={(e) => setOidcDiscoveryUrl(e.target.value)}
                        placeholder="https://accounts.google.com/.well-known/openid-configuration"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="oidc-client-id" className="block text-xs font-medium text-gray-700 mb-1">
                        Client ID <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="oidc-client-id"
                        type="text"
                        value={oidcClientId}
                        onChange={(e) => setOidcClientId(e.target.value)}
                        placeholder="your-client-id"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="oidc-client-secret" className="block text-xs font-medium text-gray-700 mb-1">
                        Client Secret <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="oidc-client-secret"
                        type="password"
                        value={oidcClientSecret}
                        onChange={(e) => setOidcClientSecret(e.target.value)}
                        placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <button
                      type="submit"
                      disabled={oidcSubmitting}
                      className="btn-primary text-sm"
                    >
                      {oidcSubmitting ? (
                        <span className="flex items-center gap-2">
                          <Spinner />
                          Saving&hellip;
                        </span>
                      ) : (
                        hasOidc ? "Update OIDC" : "Save OIDC"
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* SAML form */}
              <div className="card">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-orange-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">SAML Provider</h2>
                    <p className="text-xs text-gray-500">SAML 2.0 (e.g. ADFS, Ping Identity)</p>
                  </div>
                  {hasSaml && (
                    <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Configured
                    </span>
                  )}
                </div>

                {samlSuccess && <SuccessBanner message={samlSuccess} />}

                <form onSubmit={handleSamlSubmit} noValidate>
                  {samlError && <ErrorBanner message={samlError} />}

                  <div className="space-y-3">
                    <div>
                      <label htmlFor="saml-metadata" className="block text-xs font-medium text-gray-700 mb-1">
                        Metadata URL <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="saml-metadata"
                        type="url"
                        value={samlMetadataUrl}
                        onChange={(e) => setSamlMetadataUrl(e.target.value)}
                        placeholder="https://your-idp.com/saml/metadata"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="saml-entity-id" className="block text-xs font-medium text-gray-700 mb-1">
                        Entity ID <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="saml-entity-id"
                        type="text"
                        value={samlEntityId}
                        onChange={(e) => setSamlEntityId(e.target.value)}
                        placeholder="https://your-idp.com/entity"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <button
                      type="submit"
                      disabled={samlSubmitting}
                      className="btn-primary text-sm"
                    >
                      {samlSubmitting ? (
                        <span className="flex items-center gap-2">
                          <Spinner />
                          Saving&hellip;
                        </span>
                      ) : (
                        hasSaml ? "Update SAML" : "Save SAML"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Right column: current providers */}
            <div>
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Configured Providers</h2>

                {removeSuccess && <SuccessBanner message={removeSuccess} />}
                {removeError && <ErrorBanner message={removeError} />}

                {providers.length === 0 ? (
                  <div className="text-center py-8">
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                    </svg>
                    <p className="text-sm text-gray-500">No SSO providers configured.</p>
                    <p className="text-xs text-gray-400 mt-1">Configure OIDC or SAML using the forms on the left.</p>
                  </div>
                ) : (
                  <ul className="space-y-4" role="list" aria-label="SSO providers">
                    {providers.map((provider) => (
                      <li key={provider.id} className="flex items-start justify-between gap-4 p-4 rounded-lg border border-gray-200">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <ProtocolBadge protocol={provider.protocol} />
                            {provider.enabled ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                Enabled
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                                Disabled
                              </span>
                            )}
                          </div>
                          {provider.protocol === "OIDC" && provider.discoveryUrl && (
                            <p className="text-xs text-gray-500 truncate" title={provider.discoveryUrl}>
                              Discovery: <span className="font-mono">{provider.discoveryUrl}</span>
                            </p>
                          )}
                          {provider.protocol === "OIDC" && provider.clientId && (
                            <p className="text-xs text-gray-500">
                              Client ID: <span className="font-mono">{provider.clientId}</span>
                            </p>
                          )}
                          {provider.protocol === "SAML" && provider.entityId && (
                            <p className="text-xs text-gray-500 truncate" title={provider.entityId}>
                              Entity ID: <span className="font-mono">{provider.entityId}</span>
                            </p>
                          )}
                          {provider.protocol === "SAML" && provider.metadataUrl && (
                            <p className="text-xs text-gray-500 truncate" title={provider.metadataUrl}>
                              Metadata: <span className="font-mono">{provider.metadataUrl}</span>
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">Configured {formatDate(provider.createdAt)}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemove(provider.protocol)}
                          disabled={removing === provider.protocol}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                          aria-label={`Remove ${provider.protocol} provider`}
                        >
                          {removing === provider.protocol ? <Spinner /> : null}
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Info card */}
              <div className="card mt-4 bg-blue-50 border-blue-200">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">SSO Notes</h3>
                <ul className="space-y-1.5 text-xs text-blue-700">
                  <li className="flex items-start gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    Configuring OIDC replaces any existing OIDC provider for this org.
                  </li>
                  <li className="flex items-start gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    Removing a provider immediately disables SSO login for all users.
                  </li>
                  <li className="flex items-start gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    Both OIDC and SAML can be active simultaneously.
                  </li>
                </ul>
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
