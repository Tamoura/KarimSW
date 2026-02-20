"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE = "http://localhost:5013/api/v1";

type CredentialStatus = "OFFERED" | "ACTIVE" | "REVOKED" | "EXPIRED" | "SUSPENDED";

interface IssuedCredential {
  id: string;
  credentialType: string;
  status: CredentialStatus;
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  holderDidId: string;
  issuerDidId: string;
}

interface Did {
  id: string;
  did: string;
  method: string;
  status: string;
  createdAt: string;
}

interface IssuerProfile {
  id: string;
  organizationName: string;
  legalEntityId?: string | null;
  trustLevel: "UNVERIFIED" | "VERIFIED" | "TRUSTED";
  did?: string;
}

function StatusBadge({ status }: { status: CredentialStatus }) {
  const styles: Record<CredentialStatus, string> = {
    OFFERED: "bg-amber-100 text-amber-800",
    ACTIVE: "bg-green-100 text-green-800",
    REVOKED: "bg-red-100 text-red-800",
    EXPIRED: "bg-gray-100 text-gray-600",
    SUSPENDED: "bg-orange-100 text-orange-700",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function TrustBadge({ level }: { level: IssuerProfile["trustLevel"] }) {
  const styles: Record<IssuerProfile["trustLevel"], string> = {
    UNVERIFIED: "bg-gray-100 text-gray-600",
    VERIFIED: "bg-primary-100 text-primary-700",
    TRUSTED: "bg-success-100 text-success-700",
  };
  const icons: Record<IssuerProfile["trustLevel"], string> = {
    UNVERIFIED: "Unverified",
    VERIFIED: "Verified",
    TRUSTED: "Trusted",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[level]}`}>
      {level === "TRUSTED" && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      )}
      {icons[level]}
    </span>
  );
}

function Spinner({ small = false }: { small?: boolean }) {
  return (
    <svg className={`${small ? "w-3.5 h-3.5" : "w-4 h-4"} animate-spin`} fill="none" viewBox="0 0 24 24" aria-hidden="true">
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
  });
}

function truncateId(id: string, chars = 16): string {
  if (id.length <= chars + 4) return id;
  return `${id.slice(0, chars)}\u2026`;
}

function IssuerProfileCard({ profile }: { profile: IssuerProfile }) {
  return (
    <div className="card mb-6 border-l-4 border-l-primary-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base font-semibold text-gray-900">{profile.organizationName}</h2>
            <TrustBadge level={profile.trustLevel} />
          </div>
          {profile.legalEntityId && (
            <p className="text-xs text-gray-400 mt-0.5">
              Legal Entity ID: <span className="font-mono">{profile.legalEntityId}</span>
            </p>
          )}
          {profile.did && (
            <p className="text-xs text-gray-400 font-mono mt-0.5 truncate" title={profile.did}>
              DID: {truncateId(profile.did, 30)}
            </p>
          )}
        </div>
        <Link
          href="/issuer/profile"
          className="text-xs font-medium text-primary-500 hover:text-primary-600 no-underline shrink-0"
        >
          Edit profile
        </Link>
      </div>
    </div>
  );
}

function IssuerRegistrationForm({
  dids,
  onRegistered,
}: {
  dids: Did[];
  onRegistered: (profile: IssuerProfile) => void;
}) {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [legalEntityId, setLegalEntityId] = useState("");
  const [selectedDid, setSelectedDid] = useState(dids[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    if (!token) { router.push("/login"); return; }

    if (!orgName.trim()) { setFormError("Organisation name is required."); return; }
    if (!selectedDid) { setFormError("Please select a DID for your issuer profile."); return; }

    setSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch(`${API_BASE}/issuers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          didId: selectedDid,
          organizationName: orgName.trim(),
          ...(legalEntityId.trim() ? { legalEntityId: legalEntityId.trim() } : {}),
        }),
      });

      if (res.status === 401) { router.push("/login"); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to register issuer profile."
        );
        return;
      }

      const data = await res.json();
      onRegistered(data.issuer ?? data);
    } catch {
      setFormError("Could not connect to the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card mb-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Register as an Issuer</h2>
      <p className="text-sm text-gray-500 mb-6">
        Create your issuer profile to start issuing verifiable credentials to your users.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        {formError && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-danger-50 border border-danger-200 px-3 py-2.5">
            <svg className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-8.25a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <p className="text-xs text-danger-700">{formError}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="org-name" className="block text-sm font-medium text-gray-700 mb-1">
              Organisation Name <span className="text-danger-500" aria-hidden="true">*</span>
            </label>
            <input
              id="org-name"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Corp"
              required
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label htmlFor="legal-id" className="block text-sm font-medium text-gray-700 mb-1">
              Legal Entity ID <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="legal-id"
              type="text"
              value={legalEntityId}
              onChange={(e) => setLegalEntityId(e.target.value)}
              placeholder="LEI or registration number"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label htmlFor="issuer-did" className="block text-sm font-medium text-gray-700 mb-1">
              Issuer DID <span className="text-danger-500" aria-hidden="true">*</span>
            </label>
            {dids.length === 0 ? (
              <p className="text-sm text-gray-500">
                No DIDs available.{" "}
                <Link href="/wallet/dids" className="text-primary-500 hover:text-primary-600">
                  Create a DID first.
                </Link>
              </p>
            ) : (
              <select
                id="issuer-did"
                value={selectedDid}
                onChange={(e) => setSelectedDid(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {dids
                  .filter((d) => d.status === "ACTIVE")
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.did.length > 50 ? `${d.did.slice(0, 50)}\u2026` : d.did}
                    </option>
                  ))}
              </select>
            )}
          </div>
        </div>

        <div className="mt-6">
          <button
            type="submit"
            disabled={submitting || dids.filter((d) => d.status === "ACTIVE").length === 0}
            className="btn-primary text-sm"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Registering&hellip;
              </span>
            ) : (
              "Register Issuer Profile"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function IssuerPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string>("");
  const [issuerProfile, setIssuerProfile] = useState<IssuerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [credentials, setCredentials] = useState<IssuedCredential[]>([]);
  const [dids, setDids] = useState<Did[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeSuccess, setRevokeSuccess] = useState<string | null>(null);

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

    const [credRes, didRes, profileRes] = await Promise.all([
      fetch(`${API_BASE}/credentials?role=issuer`, { headers }),
      fetch(`${API_BASE}/dids`, { headers }),
      fetch(`${API_BASE}/issuers/me`, { headers }),
    ]);

    if (credRes.status === 401 || didRes.status === 401) {
      handleUnauthorized();
      return;
    }

    if (!credRes.ok) throw new Error("Failed to load issued credentials.");
    if (!didRes.ok) throw new Error("Failed to load DIDs.");

    const credData = await credRes.json();
    const didData = await didRes.json();

    setCredentials(credData.credentials ?? []);
    setDids(didData.dids ?? []);

    // Issuer profile: 404 = not registered yet, that is fine
    if (profileRes.ok) {
      const profileData = await profileRes.json();
      setIssuerProfile(profileData.issuer ?? profileData);
    }

    setProfileLoading(false);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const storedEmail = localStorage.getItem("user_email");

    if (!token) {
      router.push("/login");
      return;
    }

    setEmail(storedEmail ?? "");

    fetchData(token)
      .catch(() => setError("Could not load issuer data. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchData]);

  async function handleRevoke(id: string) {
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    setRevokingId(id);
    setRevokeError(null);
    setRevokeSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/credentials/${id}/revoke`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Revoked by issuer via dashboard" }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRevokeError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to revoke credential."
        );
        return;
      }

      setCredentials((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, status: "REVOKED", revokedAt: new Date().toISOString() } : c
        )
      );
      setRevokeSuccess("Credential revoked successfully.");
    } catch {
      setRevokeError("Could not connect to the server.");
    } finally {
      setRevokingId(null);
    }
  }

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    router.push("/login");
  }

  const total = credentials.length;
  const active = credentials.filter((c) => c.status === "ACTIVE").length;
  const revoked = credentials.filter((c) => c.status === "REVOKED").length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2 no-underline hover:no-underline">
              <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm" aria-hidden="true">H</span>
              </div>
              <span className="font-bold text-gray-900 text-lg">HumanID</span>
            </Link>

            <nav className="hidden sm:flex items-center gap-6 text-sm font-medium">
              <span className="text-primary-600 border-b-2 border-primary-500 pb-0.5">Dashboard</span>
              <Link
                href="/issuer/credentials"
                className="text-gray-500 hover:text-gray-900 transition-colors no-underline"
              >
                Issue Credential
              </Link>
              <Link
                href="/issuer/templates"
                className="text-gray-500 hover:text-gray-900 transition-colors no-underline"
              >
                Templates
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
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Issuer Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">
              Monitor and manage credentials issued by your organisation.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/issuer/templates" className="btn-secondary text-sm shrink-0">
              Templates
            </Link>
            <Link href="/issuer/credentials" className="btn-primary text-sm shrink-0">
              + Issue Credential
            </Link>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading issuer data">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading dashboard&hellip;</p>
            </div>
          </div>
        )}

        {!loading && error && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3">
            <svg className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-sm text-danger-700">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Issuer profile section */}
            {!profileLoading && !issuerProfile && (
              <IssuerRegistrationForm
                dids={dids}
                onRegistered={(profile) => setIssuerProfile(profile)}
              />
            )}
            {!profileLoading && issuerProfile && (
              <IssuerProfileCard profile={issuerProfile} />
            )}

            {/* Action feedback banners */}
            {revokeSuccess && (
              <div role="status" className="mb-6 flex items-start gap-3 rounded-lg bg-success-50 border border-success-200 px-4 py-3">
                <svg className="w-5 h-5 text-success-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                <p className="text-sm text-success-700">{revokeSuccess}</p>
              </div>
            )}
            {revokeError && (
              <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3">
                <svg className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <p className="text-sm text-danger-700">{revokeError}</p>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="card">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total Issued</p>
                <p className="text-3xl font-bold text-gray-900">{total}</p>
                <p className="text-xs text-gray-400 mt-1">credentials</p>
              </div>
              <div className="card">
                <p className="text-xs font-medium text-success-600 uppercase tracking-wide mb-1">Active</p>
                <p className="text-3xl font-bold text-gray-900">{active}</p>
                <p className="text-xs text-gray-400 mt-1">credentials</p>
              </div>
              <div className="card">
                <p className="text-xs font-medium text-danger-600 uppercase tracking-wide mb-1">Revoked</p>
                <p className="text-3xl font-bold text-gray-900">{revoked}</p>
                <p className="text-xs text-gray-400 mt-1">credentials</p>
              </div>
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Issued credentials list */}
              <div className="lg:col-span-2">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Issued Credentials</h2>

                {credentials.length === 0 ? (
                  <div className="card text-center py-12">
                    <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                    <p className="text-sm text-gray-500">No credentials issued yet.</p>
                    <Link href="/issuer/credentials" className="mt-4 inline-block btn-primary text-sm">
                      Issue Your First Credential
                    </Link>
                  </div>
                ) : (
                  <ul className="space-y-3" role="list" aria-label="Issued credentials">
                    {credentials.map((cred) => (
                      <li key={cred.id} className="card hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <p className="text-sm font-semibold text-gray-900">{cred.credentialType}</p>
                              <StatusBadge status={cred.status} />
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              Holder DID:{" "}
                              <span className="font-mono" title={cred.holderDidId}>
                                {truncateId(cred.holderDidId)}
                              </span>
                            </p>
                            <p className="text-xs text-gray-400">
                              Issued {formatDate(cred.issuedAt)}
                              {cred.expiresAt ? ` \u00b7 Expires ${formatDate(cred.expiresAt)}` : ""}
                              {cred.revokedAt ? ` \u00b7 Revoked ${formatDate(cred.revokedAt)}` : ""}
                            </p>
                          </div>

                          {cred.status !== "REVOKED" && cred.status !== "EXPIRED" && (
                            <button
                              type="button"
                              onClick={() => handleRevoke(cred.id)}
                              disabled={revokingId === cred.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-danger-600 bg-danger-50 border border-danger-200 rounded-lg hover:bg-danger-100 focus:outline-none focus:ring-2 focus:ring-danger-500 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                              aria-label={`Revoke credential ${cred.credentialType}`}
                            >
                              {revokingId === cred.id ? (
                                <>
                                  <Spinner small />
                                  Revoking&hellip;
                                </>
                              ) : (
                                "Revoke"
                              )}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Sidebar */}
              <div>
                <div className="card">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">Your Issuer DIDs</h2>
                  {dids.length === 0 ? (
                    <p className="text-sm text-gray-500">No DIDs registered.</p>
                  ) : (
                    <ul className="space-y-3" role="list" aria-label="Issuer DID list">
                      {dids.map((d) => (
                        <li key={d.id} className="flex items-start gap-2">
                          <span
                            className={`mt-1 inline-block w-2 h-2 rounded-full shrink-0 ${
                              d.status === "ACTIVE" ? "bg-success-500" : "bg-gray-300"
                            }`}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-mono text-gray-700 truncate" title={d.did}>
                              {d.did.length > 26 ? `${d.did.slice(0, 26)}\u2026` : d.did}
                            </p>
                            <p className="text-xs text-gray-400">
                              {d.method.toUpperCase()} &middot; {d.status}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
                    {dids.length} DID{dids.length !== 1 ? "s" : ""} registered
                  </p>
                </div>

                <div className="card mt-4">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">Actions</h2>
                  <nav className="space-y-2" aria-label="Issuer actions">
                    <Link
                      href="/issuer/credentials"
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors no-underline text-gray-700 hover:text-gray-900"
                    >
                      <svg className="w-4 h-4 text-primary-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      <span className="text-sm font-medium">Issue New Credential</span>
                    </Link>
                    <Link
                      href="/issuer/templates"
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors no-underline text-gray-700 hover:text-gray-900"
                    >
                      <svg className="w-4 h-4 text-primary-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375Z" />
                      </svg>
                      <span className="text-sm font-medium">Credential Templates</span>
                    </Link>
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
