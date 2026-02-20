"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";

const API_BASE = "http://localhost:5013/api/v1";

type CredentialStatus = "OFFERED" | "ACTIVE" | "REVOKED" | "EXPIRED" | "SUSPENDED";

interface Credential {
  id: string;
  credentialType: string;
  status: CredentialStatus;
  issuerDid: string;
  issuedAt: string;
  expiresAt: string | null;
  acceptedAt: string | null;
  attributes?: Record<string, unknown>;
  proof?: Record<string, unknown>;
}

interface VerificationChecks {
  signature: boolean;
  issuerTrust: boolean;
  revocation: boolean;
  expiry: boolean;
}

interface VerificationResult {
  verified: boolean;
  checks: VerificationChecks;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
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

function CheckRow({ label, pass }: { label: string; pass: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${pass ? "bg-success-50 text-success-700" : "bg-danger-50 text-danger-700"}`}
      >
        {pass ? (
          <>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            Pass
          </>
        ) : (
          <>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
            Fail
          </>
        )}
      </span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-4 py-2.5 border-b border-gray-100 last:border-0">
      <dt className="text-xs font-medium text-gray-500 sm:w-36 shrink-0 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-gray-900 font-mono break-all">{value}</dd>
    </div>
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

export default function CredentialDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [credential, setCredential] = useState<Credential | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    router.push("/login");
  }, [router]);

  useEffect(() => {
    if (!id) return;
    const token = localStorage.getItem("access_token");
    if (!token) { router.push("/login"); return; }

    fetch(`${API_BASE}/wallet/credentials/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.status === 401) { handleUnauthorized(); return; }
        if (res.status === 404) { setError("Credential not found."); return; }
        if (!res.ok) throw new Error();
        const data = await res.json();
        setCredential(data.credential ?? data);
      })
      .catch(() => setError("Could not load credential. Please try again."))
      .finally(() => setLoading(false));
  }, [id, router, handleUnauthorized]);

  async function handleVerify() {
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    setVerifying(true);
    setVerifyError(null);
    setVerifyResult(null);

    try {
      const res = await fetch(`${API_BASE}/verify/credentials`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ credentialId: id }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setVerifyError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Verification request failed."
        );
        return;
      }

      const result: VerificationResult = await res.json();
      setVerifyResult(result);
    } catch {
      setVerifyError("Could not connect to verification service.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link
              href="/wallet/credentials"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors no-underline"
              aria-label="Back to credentials"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Credentials
            </Link>
            <span className="text-gray-300" aria-hidden="true">/</span>
            <span className="text-sm font-medium text-gray-900 truncate max-w-xs">
              {credential?.credentialType ?? "Credential"}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/" className="flex items-center gap-2 no-underline hover:no-underline">
                <div className="w-7 h-7 rounded-lg bg-primary-500 flex items-center justify-center">
                  <span className="text-white font-bold text-xs" aria-hidden="true">H</span>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading credential">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading credential&hellip;</p>
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

        {!loading && !error && credential && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main detail panel */}
            <div className="lg:col-span-2 space-y-6">
              {/* Credential header card */}
              <div className="card">
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h1 className="text-xl font-bold text-gray-900">{credential.credentialType}</h1>
                      <StatusBadge status={credential.status} />
                    </div>
                    <p className="text-xs text-gray-400 font-mono" title={credential.id}>
                      {credential.id}
                    </p>
                  </div>
                  {credential.status === "ACTIVE" && (
                    <button
                      type="button"
                      onClick={handleVerify}
                      disabled={verifying}
                      className="btn-primary text-sm px-4 py-2 shrink-0"
                    >
                      {verifying ? (
                        <span className="flex items-center gap-2">
                          <Spinner />
                          Verifying&hellip;
                        </span>
                      ) : (
                        "Verify Credential"
                      )}
                    </button>
                  )}
                </div>

                <dl>
                  <DetailRow label="Type" value={credential.credentialType} />
                  <DetailRow label="Status" value={credential.status} />
                  <DetailRow label="Issuer DID" value={credential.issuerDid} />
                  <DetailRow label="Issued At" value={formatDate(credential.issuedAt)} />
                  <DetailRow label="Expires At" value={formatDate(credential.expiresAt)} />
                  <DetailRow label="Accepted At" value={formatDate(credential.acceptedAt)} />
                </dl>
              </div>

              {/* Attributes */}
              {credential.attributes && Object.keys(credential.attributes).length > 0 && (
                <div className="card">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">Credential Attributes</h2>
                  <dl>
                    {Object.entries(credential.attributes).map(([key, value]) => (
                      <DetailRow
                        key={key}
                        label={key}
                        value={typeof value === "object" ? JSON.stringify(value) : String(value)}
                      />
                    ))}
                  </dl>
                </div>
              )}

              {/* Proof */}
              {credential.proof && Object.keys(credential.proof).length > 0 && (
                <div className="card">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">Cryptographic Proof</h2>
                  <dl>
                    {Object.entries(credential.proof).map(([key, value]) => (
                      <DetailRow
                        key={key}
                        label={key}
                        value={typeof value === "object" ? JSON.stringify(value) : String(value)}
                      />
                    ))}
                  </dl>
                </div>
              )}
            </div>

            {/* Sidebar: verification panel */}
            <div className="space-y-4">
              {/* Verification result */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Verification</h2>

                {!verifyResult && !verifyError && !verifying && (
                  <div className="text-center py-6">
                    <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                    </svg>
                    <p className="text-sm text-gray-400">
                      {credential.status === "ACTIVE"
                        ? "Click \"Verify Credential\" to run all checks."
                        : "Verification is only available for active credentials."}
                    </p>
                  </div>
                )}

                {verifying && (
                  <div className="flex items-center justify-center py-6 gap-2 text-gray-500">
                    <Spinner />
                    <span className="text-sm">Running checks&hellip;</span>
                  </div>
                )}

                {verifyError && (
                  <p className="text-sm text-danger-600">{verifyError}</p>
                )}

                {verifyResult && (
                  <>
                    <div className={`rounded-lg px-3 py-2.5 mb-4 ${verifyResult.verified ? "bg-success-50 border border-success-200" : "bg-danger-50 border border-danger-200"}`}>
                      <p className={`text-sm font-semibold ${verifyResult.verified ? "text-success-700" : "text-danger-700"}`}>
                        {verifyResult.verified ? "Credential Verified" : "Verification Failed"}
                      </p>
                      <p className={`text-xs mt-0.5 ${verifyResult.verified ? "text-success-600" : "text-danger-600"}`}>
                        {verifyResult.verified
                          ? "All checks passed. This credential is authentic."
                          : "One or more checks failed."}
                      </p>
                    </div>

                    <div>
                      <CheckRow label="Cryptographic Signature" pass={verifyResult.checks.signature} />
                      <CheckRow label="Issuer Trust" pass={verifyResult.checks.issuerTrust} />
                      <CheckRow label="Revocation Status" pass={verifyResult.checks.revocation} />
                      <CheckRow label="Expiry Valid" pass={verifyResult.checks.expiry} />
                    </div>

                    <button
                      type="button"
                      onClick={() => setVerifyResult(null)}
                      className="mt-4 text-xs text-gray-400 hover:text-gray-600 transition-colors w-full text-center"
                    >
                      Clear result
                    </button>
                  </>
                )}
              </div>

              {/* Navigation */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-3">Navigation</h2>
                <nav className="space-y-1" aria-label="Credential navigation">
                  <Link
                    href="/wallet/credentials"
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors no-underline text-gray-700 text-sm"
                  >
                    All Credentials
                  </Link>
                  <Link
                    href="/wallet"
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors no-underline text-gray-700 text-sm"
                  >
                    Wallet Overview
                  </Link>
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
