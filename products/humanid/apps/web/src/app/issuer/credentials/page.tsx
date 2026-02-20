"use client";

import { useEffect, useState, useCallback, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE = "http://localhost:5013/api/v1";

interface Did {
  id: string;
  did: string;
  method: string;
  status: string;
}

interface Claim {
  key: string;
  value: string;
}

interface IssuedCredential {
  id: string;
  credentialType: string;
  status: string;
  credentialHash: string;
  proof: unknown;
  issuedAt: string;
}

function Spinner() {
  return (
    <svg
      className="w-4 h-4 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function newClaim(): Claim {
  return { key: "", value: "" };
}

export default function IssuerCredentialsPage() {
  const router = useRouter();

  const [dids, setDids] = useState<Did[]>([]);
  const [didsLoading, setDidsLoading] = useState(true);
  const [didsError, setDidsError] = useState<string | null>(null);

  const [issuerDidId, setIssuerDidId] = useState("");
  const [holderDid, setHolderDid] = useState("");
  const [credentialType, setCredentialType] = useState("");
  const [claims, setClaims] = useState<Claim[]>([newClaim()]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedCredential | null>(null);

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    router.push("/login");
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");

    if (!token) {
      router.push("/login");
      return;
    }

    fetch(`${API_BASE}/dids`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.status === 401) { handleUnauthorized(); return; }
        if (!res.ok) throw new Error("Failed to load DIDs.");
        const data = await res.json();
        const activeDids: Did[] = (data.dids ?? []).filter(
          (d: Did) => d.status === "ACTIVE"
        );
        setDids(activeDids);
        if (activeDids.length > 0) setIssuerDidId(activeDids[0].id);
      })
      .catch(() => setDidsError("Could not load your DIDs. Please go back and try again."))
      .finally(() => setDidsLoading(false));
  }, [router, handleUnauthorized]);

  function addClaim() {
    setClaims((prev) => [...prev, newClaim()]);
  }

  function removeClaim(index: number) {
    setClaims((prev) => prev.filter((_, i) => i !== index));
  }

  function updateClaim(index: number, field: "key" | "value", val: string) {
    setClaims((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: val } : c))
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);

    const validClaims = claims.filter((c) => c.key.trim() !== "");
    const claimsObj = Object.fromEntries(validClaims.map((c) => [c.key.trim(), c.value.trim()]));

    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/credentials`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          holderDidId: holderDid.trim(),
          issuerDidId,
          credentialType: credentialType.trim(),
          claims: claimsObj,
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      const data = await res.json();

      if (!res.ok) {
        const errMsg = (data as { detail?: string; title?: string; message?: string }).detail
          ?? (data as { title?: string }).title
          ?? (data as { message?: string }).message
          ?? "Failed to issue credential. Please check your inputs.";
        setSubmitError(errMsg);
        return;
      }

      setIssued(data as IssuedCredential);
    } catch {
      setSubmitError("Could not connect to the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleIssueAnother() {
    setIssued(null);
    setHolderDid("");
    setCredentialType("");
    setClaims([newClaim()]);
    setSubmitError(null);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link
              href="/issuer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors no-underline"
              aria-label="Back to issuer dashboard"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Issuer Dashboard
            </Link>
            <span className="text-gray-300" aria-hidden="true">/</span>
            <span className="text-sm font-medium text-gray-900">Issue Credential</span>

            <div className="ml-auto">
              <Link href="/" className="flex items-center gap-2 no-underline hover:no-underline">
                <div className="w-7 h-7 rounded-lg bg-primary-500 flex items-center justify-center">
                  <span className="text-white font-bold text-xs" aria-hidden="true">H</span>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Issue a Credential</h1>
          <p className="mt-1 text-sm text-gray-500">
            Issue a verifiable credential to a holder using your organisation&apos;s trusted DID.
          </p>
        </div>

        {/* DIDs loading error */}
        {didsError && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3">
            <svg className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-sm text-danger-700">{didsError}</p>
          </div>
        )}

        {/* Success state */}
        {issued && (
          <div className="card">
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-success-50 border border-success-200 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-success-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900">Credential Issued</h2>
              <p className="mt-1 text-sm text-gray-500">
                The credential has been issued and is now pending holder acceptance.
              </p>
            </div>

            <dl className="space-y-3 border border-gray-100 rounded-lg p-4 bg-gray-50 text-sm">
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-4">
                <dt className="text-xs font-medium text-gray-500 sm:w-32 shrink-0">ID</dt>
                <dd className="font-mono text-xs text-gray-800 break-all">{issued.id}</dd>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-4">
                <dt className="text-xs font-medium text-gray-500 sm:w-32 shrink-0">Type</dt>
                <dd className="text-xs text-gray-800">{issued.credentialType}</dd>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-4">
                <dt className="text-xs font-medium text-gray-500 sm:w-32 shrink-0">Status</dt>
                <dd>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                    {issued.status.charAt(0) + issued.status.slice(1).toLowerCase()}
                  </span>
                </dd>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-4">
                <dt className="text-xs font-medium text-gray-500 sm:w-32 shrink-0">Credential Hash</dt>
                <dd className="font-mono text-xs text-gray-800 break-all">{issued.credentialHash}</dd>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-4">
                <dt className="text-xs font-medium text-gray-500 sm:w-32 shrink-0">Issued At</dt>
                <dd className="text-xs text-gray-800">
                  {new Date(issued.issuedAt).toLocaleString("en-GB")}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleIssueAnother}
                className="btn-primary flex-1"
              >
                Issue Another Credential
              </button>
              <Link href="/issuer" className="btn-secondary flex-1 text-center">
                Back to Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* Issue form */}
        {!issued && (
          <div className="card">
            {/* Submit error */}
            {submitError && (
              <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3">
                <svg className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <p className="text-sm text-danger-700">{submitError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-6">
              {/* Issuer DID */}
              <div>
                <label
                  htmlFor="issuerDidId"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Issuer DID
                  <span className="text-danger-500 ml-0.5" aria-hidden="true">*</span>
                </label>

                {didsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                    <Spinner />
                    Loading your DIDs…
                  </div>
                ) : dids.length === 0 ? (
                  <p className="text-sm text-danger-600">
                    No active DIDs found. Please register a DID before issuing credentials.
                  </p>
                ) : (
                  <select
                    id="issuerDidId"
                    name="issuerDidId"
                    required
                    value={issuerDidId}
                    onChange={(e) => setIssuerDidId(e.target.value)}
                    disabled={submitting}
                    className="block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 text-sm transition-colors"
                    aria-describedby="issuerDid-hint"
                  >
                    {dids.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.did.length > 48 ? `${d.did.slice(0, 48)}…` : d.did} ({d.method.toUpperCase()})
                      </option>
                    ))}
                  </select>
                )}
                <p id="issuerDid-hint" className="mt-1 text-xs text-gray-400">
                  Select the DID your organisation will use to sign this credential.
                </p>
              </div>

              {/* Holder DID */}
              <div>
                <label
                  htmlFor="holderDid"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Holder DID ID
                  <span className="text-danger-500 ml-0.5" aria-hidden="true">*</span>
                </label>
                <input
                  id="holderDid"
                  name="holderDid"
                  type="text"
                  required
                  value={holderDid}
                  onChange={(e) => setHolderDid(e.target.value)}
                  disabled={submitting}
                  placeholder="e.g. clxyz1234..."
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 text-sm transition-colors"
                  aria-describedby="holderDid-hint"
                />
                <p id="holderDid-hint" className="mt-1 text-xs text-gray-400">
                  The internal DID record ID of the credential recipient.
                </p>
              </div>

              {/* Credential type */}
              <div>
                <label
                  htmlFor="credentialType"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Credential Type
                  <span className="text-danger-500 ml-0.5" aria-hidden="true">*</span>
                </label>
                <input
                  id="credentialType"
                  name="credentialType"
                  type="text"
                  required
                  value={credentialType}
                  onChange={(e) => setCredentialType(e.target.value)}
                  disabled={submitting}
                  placeholder="e.g. VerifiedEmployee, UniversityDegree"
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 text-sm transition-colors"
                  aria-describedby="credType-hint"
                />
                <p id="credType-hint" className="mt-1 text-xs text-gray-400">
                  A descriptive type identifier for this credential class.
                </p>
              </div>

              {/* Claims */}
              <fieldset>
                <legend className="block text-sm font-medium text-gray-700 mb-2">
                  Claims
                </legend>
                <p className="text-xs text-gray-400 mb-3">
                  Add key-value claim pairs that will be included in the credential.
                </p>

                <div className="space-y-2" role="group" aria-label="Credential claims">
                  {claims.map((claim, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={claim.key}
                        onChange={(e) => updateClaim(index, "key", e.target.value)}
                        disabled={submitting}
                        placeholder="Key (e.g. name)"
                        aria-label={`Claim ${index + 1} key`}
                        className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 text-sm transition-colors"
                      />
                      <input
                        type="text"
                        value={claim.value}
                        onChange={(e) => updateClaim(index, "value", e.target.value)}
                        disabled={submitting}
                        placeholder="Value (e.g. Jane Doe)"
                        aria-label={`Claim ${index + 1} value`}
                        className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 text-sm transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => removeClaim(index)}
                        disabled={claims.length === 1 || submitting}
                        aria-label={`Remove claim ${index + 1}`}
                        className="p-2 text-gray-400 hover:text-danger-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-500 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addClaim}
                  disabled={submitting}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary-500 hover:text-primary-600 focus:outline-none focus-visible:underline disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add claim
                </button>
              </fieldset>

              {/* Submit */}
              <div className="pt-2 border-t border-gray-100 flex flex-col sm:flex-row gap-3">
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    didsLoading ||
                    dids.length === 0 ||
                    !issuerDidId ||
                    !holderDid.trim() ||
                    !credentialType.trim()
                  }
                  className="btn-primary flex-1"
                  aria-busy={submitting}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Spinner />
                      Issuing…
                    </span>
                  ) : (
                    "Issue Credential"
                  )}
                </button>
                <Link href="/issuer" className="btn-secondary flex-1 text-center">
                  Cancel
                </Link>
              </div>
            </form>
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
