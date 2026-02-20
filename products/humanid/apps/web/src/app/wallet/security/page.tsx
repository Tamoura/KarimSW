"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE = "http://localhost:5013/api/v1";

interface Passkey {
  id: string;
  credentialId: string;
  deviceName?: string;
  createdAt: string;
  lastUsedAt?: string | null;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(s: string, len = 20): string {
  if (s.length <= len + 4) return s;
  return `${s.slice(0, len)}\u2026`;
}

// Helper: convert ArrayBuffer to base64url
function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// Helper: convert base64url to Uint8Array
function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export default function WalletSecurityPage() {
  const router = useRouter();

  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [webAuthnSupported, setWebAuthnSupported] = useState(true);

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    router.push("/login");
  }, [router]);

  const fetchPasskeys = useCallback(async (token: string) => {
    const res = await fetch(`${API_BASE}/webauthn/credentials`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error("Failed to load passkeys.");
    const data = await res.json();
    setPasskeys(data.credentials ?? data.passkeys ?? []);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { router.push("/login"); return; }

    if (!window.PublicKeyCredential) {
      setWebAuthnSupported(false);
    }

    fetchPasskeys(token)
      .catch(() => setError("Could not load passkeys. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchPasskeys]);

  async function handleRegisterPasskey() {
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    if (!window.PublicKeyCredential) {
      setActionError("Your browser does not support passkeys / WebAuthn.");
      return;
    }

    setRegisteringPasskey(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      // Step 1: Get registration options from backend
      const optionsRes = await fetch(`${API_BASE}/webauthn/register/options`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (optionsRes.status === 401) { handleUnauthorized(); return; }
      if (!optionsRes.ok) {
        const data = await optionsRes.json().catch(() => ({}));
        setActionError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to get registration options."
        );
        return;
      }

      const options = await optionsRes.json();

      // Step 2: Decode challenge and user id
      const publicKey: PublicKeyCredentialCreationOptions = {
        ...options,
        challenge: base64urlToUint8Array(options.challenge),
        user: {
          ...options.user,
          id: base64urlToUint8Array(options.user.id),
        },
        excludeCredentials: (options.excludeCredentials ?? []).map(
          (c: { id: string; type: string }) => ({
            ...c,
            id: base64urlToUint8Array(c.id),
          })
        ),
      };

      // Step 3: Browser prompts user to create a passkey
      const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential | null;

      if (!credential) {
        setActionError("Passkey registration was cancelled.");
        return;
      }

      const response = credential.response as AuthenticatorAttestationResponse;

      // Step 4: Send result to backend for verification
      const verifyRes = await fetch(`${API_BASE}/webauthn/register/verify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: credential.id,
          rawId: bufferToBase64url(credential.rawId),
          type: credential.type,
          response: {
            clientDataJSON: bufferToBase64url(response.clientDataJSON),
            attestationObject: bufferToBase64url(response.attestationObject),
          },
        }),
      });

      if (verifyRes.status === 401) { handleUnauthorized(); return; }
      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => ({}));
        setActionError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Passkey verification failed."
        );
        return;
      }

      const newPasskey: Passkey = await verifyRes.json();
      setPasskeys((prev) => [newPasskey, ...prev]);
      setActionSuccess("Passkey registered successfully.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setActionError("Passkey registration was cancelled or timed out.");
      } else {
        setActionError("Could not complete passkey registration.");
      }
    } finally {
      setRegisteringPasskey(false);
    }
  }

  async function handleRemovePasskey(id: string) {
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    setRemovingId(id);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/webauthn/credentials/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to remove passkey."
        );
        return;
      }

      setPasskeys((prev) => prev.filter((p) => p.id !== id));
      setActionSuccess("Passkey removed successfully.");
    } catch {
      setActionError("Could not connect to the server.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link
              href="/wallet"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors no-underline"
              aria-label="Back to wallet"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Wallet
            </Link>
            <span className="text-gray-300" aria-hidden="true">/</span>
            <span className="text-sm font-medium text-gray-900">Security</span>
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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Security &amp; Passkeys</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your passkeys for passwordless sign-in. Passkeys use your device biometrics or PIN to authenticate you securely.
          </p>
        </div>

        {/* WebAuthn not supported warning */}
        {!webAuthnSupported && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-warning-50 border border-warning-200 px-4 py-3">
            <svg className="w-5 h-5 text-warning-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-sm text-warning-700">
              Your browser does not support WebAuthn / passkeys. Please use a modern browser like Chrome, Firefox, or Safari.
            </p>
          </div>
        )}

        {/* Feedback banners */}
        {actionSuccess && (
          <div role="status" className="mb-6 flex items-start gap-3 rounded-lg bg-success-50 border border-success-200 px-4 py-3">
            <svg className="w-5 h-5 text-success-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <p className="text-sm text-success-700">{actionSuccess}</p>
          </div>
        )}
        {actionError && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3">
            <svg className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-sm text-danger-700">{actionError}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading passkeys">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading passkeys&hellip;</p>
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Passkey list */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900">
                  Registered Passkeys
                  <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                    {passkeys.length}
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={handleRegisterPasskey}
                  disabled={registeringPasskey || !webAuthnSupported}
                  className="btn-primary text-sm px-4 py-2"
                >
                  {registeringPasskey ? (
                    <span className="flex items-center gap-2">
                      <Spinner />
                      Registering&hellip;
                    </span>
                  ) : (
                    "+ Add Passkey"
                  )}
                </button>
              </div>

              {passkeys.length === 0 ? (
                <div className="card text-center py-16">
                  <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                  <p className="text-sm text-gray-500 mb-4">
                    No passkeys registered yet.
                  </p>
                  <button
                    type="button"
                    onClick={handleRegisterPasskey}
                    disabled={!webAuthnSupported}
                    className="btn-primary text-sm"
                  >
                    Register Your First Passkey
                  </button>
                </div>
              ) : (
                <ul className="space-y-3" role="list" aria-label="Registered passkeys">
                  {passkeys.map((passkey) => (
                    <li key={passkey.id} className="card hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900">
                              {passkey.deviceName ?? "Passkey"}
                            </p>
                            <p className="text-xs text-gray-400 font-mono mt-0.5" title={passkey.credentialId}>
                              ID: {truncate(passkey.credentialId, 24)}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              Added {formatDate(passkey.createdAt)}
                              {passkey.lastUsedAt
                                ? ` \u00b7 Last used ${formatDate(passkey.lastUsedAt)}`
                                : ""}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePasskey(passkey.id)}
                          disabled={removingId === passkey.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-danger-600 bg-danger-50 border border-danger-200 rounded-lg hover:bg-danger-100 focus:outline-none focus:ring-2 focus:ring-danger-500 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                          aria-label={`Remove passkey ${passkey.deviceName ?? passkey.id}`}
                        >
                          {removingId === passkey.id ? (
                            <>
                              <Spinner />
                              Removing&hellip;
                            </>
                          ) : (
                            "Remove"
                          )}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Info sidebar */}
            <div className="space-y-4">
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-3">What are Passkeys?</h2>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Passkeys replace passwords with cryptographic key pairs. Your device stores a private key and shares the public key with HumanID. Authentication requires your device biometrics or PIN &mdash; nothing is sent over the network.
                </p>
                <ul className="mt-4 space-y-2">
                  {[
                    "Phishing-resistant by design",
                    "No password to steal or forget",
                    "Tied to your device hardware",
                    "Supported by iOS, Android, macOS, Windows",
                  ].map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <svg className="w-3.5 h-3.5 text-success-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      <span className="text-xs text-gray-600">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-3">Tips</h2>
                <ul className="space-y-2">
                  <li className="text-xs text-gray-500 leading-relaxed">
                    Register multiple passkeys (phone + laptop) so you always have a backup.
                  </li>
                  <li className="text-xs text-gray-500 leading-relaxed">
                    Remove old passkeys for devices you no longer own.
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
