"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5013/api/v1";

type VerifyState = "loading" | "success" | "error" | "missing";

interface ApiError {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  message?: string;
}

function resolveErrorMessage(err: ApiError): string {
  return (
    err.detail ??
    err.title ??
    err.message ??
    "Verification failed. The link may have expired or already been used."
  );
}

// ---- Inner component that consumes useSearchParams ----
function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [state, setState] = useState<VerifyState>(token ? "loading" : "missing");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const hasFired = useRef(false);

  useEffect(() => {
    // Guard: only run once, only when a token is present
    if (!token || hasFired.current) return;
    hasFired.current = true;

    async function verify() {
      try {
        const res = await fetch(`${API_BASE}/auth/verify-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (res.ok) {
          setState("success");
        } else {
          setErrorMessage(resolveErrorMessage(data as ApiError));
          setState("error");
        }
      } catch {
        setErrorMessage(
          "Could not connect to the server. Please try again or contact support."
        );
        setState("error");
      }
    }

    verify();
  }, [token]);

  return (
    <div className="w-full max-w-md">
      {/* Loading */}
      {state === "loading" && (
        <div className="card shadow-md text-center">
          <div className="w-14 h-14 rounded-full bg-primary-50 border border-primary-100 flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-7 h-7 text-primary-500 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Verifying your email…
          </h1>
          <p className="text-sm text-gray-500">
            Please wait while we activate your account.
          </p>
        </div>
      )}

      {/* Success */}
      {state === "success" && (
        <div className="card shadow-md text-center">
          <div className="w-14 h-14 rounded-full bg-success-50 border border-success-200 flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-7 h-7 text-success-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m4.5 12.75 6 6 9-13.5"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Email verified!</h1>
          <p className="text-sm text-gray-500 mb-8">
            Your account is now active. You can sign in and start using your
            HumanID wallet.
          </p>
          <Link href="/login" className="btn-primary w-full">
            Sign In to Your Account
          </Link>
          <p className="mt-4 text-xs text-gray-400">
            Your decentralised identity is ready. No central authority controls
            your data.
          </p>
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div className="card shadow-md text-center">
          <div className="w-14 h-14 rounded-full bg-danger-50 border border-danger-200 flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-7 h-7 text-danger-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Verification failed
          </h1>
          <p className="text-sm text-gray-500 mb-6">{errorMessage}</p>

          <div className="space-y-3">
            <Link href="/register" className="btn-primary w-full">
              Create a New Account
            </Link>
            <Link href="/login" className="btn-secondary w-full">
              Back to Sign In
            </Link>
          </div>

          <p className="mt-6 text-xs text-gray-400">
            Still having trouble?{" "}
            <Link
              href="/support"
              className="text-primary-500 hover:text-primary-600 underline"
            >
              Contact support
            </Link>
          </p>
        </div>
      )}

      {/* Missing token — arrived without a ?token= param */}
      {state === "missing" && (
        <div className="card shadow-md text-center">
          <div className="w-14 h-14 rounded-full bg-primary-50 border border-primary-100 flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-7 h-7 text-primary-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Check your inbox
          </h1>
          {email ? (
            <p className="text-sm text-gray-500 mb-2">
              We sent a verification link to{" "}
              <span className="font-medium text-gray-900">{email}</span>.
            </p>
          ) : (
            <p className="text-sm text-gray-500 mb-2">
              We sent a verification link to your email address.
            </p>
          )}
          <p className="text-sm text-gray-500 mb-8">
            Click the link in the email to activate your account. The link
            expires in 24 hours.
          </p>

          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 mb-6 text-left space-y-2">
            <p className="text-xs font-semibold text-gray-700">
              Didn&apos;t receive it?
            </p>
            <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
              <li>Check your spam or junk folder</li>
              <li>Make sure you entered the correct email</li>
              <li>Allow a few minutes for delivery</li>
            </ul>
          </div>

          <div className="space-y-3">
            <Link href="/register" className="btn-secondary w-full">
              Back to Registration
            </Link>
            <Link href="/login" className="btn-secondary w-full">
              Already verified? Sign in
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Skeleton shown while the inner component hydrates ----
function VerifyEmailSkeleton() {
  return (
    <div className="w-full max-w-md">
      <div className="card shadow-md text-center">
        <div className="w-14 h-14 rounded-full bg-primary-50 border border-primary-100 flex items-center justify-center mx-auto mb-5">
          <svg
            className="w-7 h-7 text-primary-500 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
            />
          </svg>
        </div>
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    </div>
  );
}

// ---- Page export: wraps in Suspense as required by Next.js 14 ----
export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <Link
              href="/"
              className="flex items-center gap-2 no-underline hover:no-underline"
            >
              <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
                <span
                  className="text-white font-bold text-sm"
                  aria-hidden="true"
                >
                  H
                </span>
              </div>
              <span className="font-bold text-gray-900 text-lg">HumanID</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <Suspense fallback={<VerifyEmailSkeleton />}>
          <VerifyEmailContent />
        </Suspense>
      </main>
    </div>
  );
}
