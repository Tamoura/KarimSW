"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setAccessToken, apiFetch } from "@/lib/api-client";

type Role = "HOLDER" | "ISSUER" | "DEVELOPER";

interface ApiError {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  message?: string;
}

interface PasswordStrength {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasDigit: boolean;
}

function getPasswordStrength(password: string): PasswordStrength {
  return {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasDigit: /[0-9]/.test(password),
  };
}

function isPasswordValid(strength: PasswordStrength): boolean {
  return Object.values(strength).every(Boolean);
}

function resolveErrorMessage(err: ApiError): string {
  return err.detail ?? err.title ?? err.message ?? "An unexpected error occurred. Please try again.";
}

const ROLES: { value: Role; label: string; description: string }[] = [
  {
    value: "HOLDER",
    label: "Individual (Wallet)",
    description: "Manage your personal digital identity and credentials",
  },
  {
    value: "ISSUER",
    label: "Organisation (Issuer)",
    description: "Issue verifiable credentials to your users or members",
  },
  {
    value: "DEVELOPER",
    label: "Developer",
    description: "Access the HumanID API to build identity-powered applications",
  },
];

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>("HOLDER");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const strength = getPasswordStrength(password);
  const passwordOk = isPasswordValid(strength);
  const passwordsMatch = password === confirmPassword;

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!email.trim()) {
      errors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "Enter a valid email address.";
    }

    if (!passwordOk) {
      errors.password = "Password does not meet the requirements below.";
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your password.";
    } else if (!passwordsMatch) {
      errors.confirmPassword = "Passwords do not match.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!validate()) return;

    setLoading(true);

    try {
      const res = await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(resolveErrorMessage(data as ApiError));
        return;
      }

      // If the API returns tokens on register, store access token in memory — no localStorage (RISK-026)
      if (data.access_token) {
        setAccessToken(data.access_token);
        router.push("/wallet");
      } else {
        router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
      }
    } catch {
      setError("Could not connect to the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handlePasswordChange(e: ChangeEvent<HTMLInputElement>) {
    setPassword(e.target.value);
    if (fieldErrors.password) {
      setFieldErrors((prev) => ({ ...prev, password: "" }));
    }
  }

  function handleConfirmChange(e: ChangeEvent<HTMLInputElement>) {
    setConfirmPassword(e.target.value);
    if (fieldErrors.confirmPassword) {
      setFieldErrors((prev) => ({ ...prev, confirmPassword: "" }));
    }
  }

  const strengthRules = [
    { key: "minLength" as const, label: "At least 8 characters" },
    { key: "hasUppercase" as const, label: "One uppercase letter" },
    { key: "hasLowercase" as const, label: "One lowercase letter" },
    { key: "hasDigit" as const, label: "One number" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <Link href="/" className="flex items-center gap-2 no-underline hover:no-underline">
              <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm" aria-hidden="true">H</span>
              </div>
              <span className="font-bold text-gray-900 text-lg">HumanID</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="card shadow-md">
            {/* Card header */}
            <div className="mb-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-primary-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Create your identity</h1>
              <p className="mt-1 text-sm text-gray-500">
                Free forever. Your data stays yours.
              </p>
            </div>

            {/* Error alert */}
            {error && (
              <div
                role="alert"
                className="mb-6 flex items-start gap-3 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3"
              >
                <svg
                  className="w-5 h-5 text-danger-500 shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <p className="text-sm text-danger-700">{error}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: "" }));
                  }}
                  disabled={loading}
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? "email-error" : undefined}
                  className={`block w-full rounded-lg border bg-white px-3.5 py-2.5 text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 text-sm transition-colors ${
                    fieldErrors.email
                      ? "border-danger-400 focus:border-danger-500 focus:ring-danger-500/20"
                      : "border-gray-300 focus:border-primary-500 focus:ring-primary-500/20"
                  }`}
                  placeholder="you@example.com"
                />
                {fieldErrors.email && (
                  <p id="email-error" role="alert" className="mt-1.5 text-xs text-danger-600">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={handlePasswordChange}
                    disabled={loading}
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby="password-rules"
                    className={`block w-full rounded-lg border bg-white px-3.5 py-2.5 pr-10 text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 text-sm transition-colors ${
                      fieldErrors.password
                        ? "border-danger-400 focus:border-danger-500 focus:ring-danger-500/20"
                        : "border-gray-300 focus:border-primary-500 focus:ring-primary-500/20"
                    }`}
                    placeholder="Create a strong password"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 rounded-sm"
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Password requirements */}
                {password.length > 0 && (
                  <ul
                    id="password-rules"
                    className="mt-2 space-y-1"
                    aria-label="Password requirements"
                  >
                    {strengthRules.map(({ key, label }) => (
                      <li key={key} className="flex items-center gap-2">
                        {strength[key] ? (
                          <svg className="w-3.5 h-3.5 text-success-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        )}
                        <span className={`text-xs ${strength[key] ? "text-success-600" : "text-gray-400"}`}>
                          {label}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {fieldErrors.password && (
                  <p role="alert" className="mt-1.5 text-xs text-danger-600">{fieldErrors.password}</p>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={handleConfirmChange}
                    disabled={loading}
                    aria-invalid={!!fieldErrors.confirmPassword}
                    aria-describedby={fieldErrors.confirmPassword ? "confirm-error" : undefined}
                    className={`block w-full rounded-lg border bg-white px-3.5 py-2.5 pr-10 text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 text-sm transition-colors ${
                      fieldErrors.confirmPassword
                        ? "border-danger-400 focus:border-danger-500 focus:ring-danger-500/20"
                        : confirmPassword && passwordsMatch
                        ? "border-success-400 focus:border-success-500 focus:ring-success-500/20"
                        : "border-gray-300 focus:border-primary-500 focus:ring-primary-500/20"
                    }`}
                    placeholder="Re-enter your password"
                  />
                  <button
                    type="button"
                    aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 rounded-sm"
                  >
                    {showConfirm ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                    )}
                  </button>
                </div>
                {fieldErrors.confirmPassword && (
                  <p id="confirm-error" role="alert" className="mt-1.5 text-xs text-danger-600">
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>

              {/* Role selector */}
              <fieldset>
                <legend className="block text-sm font-medium text-gray-700 mb-2">
                  Account type
                </legend>
                <div className="space-y-2">
                  {ROLES.map(({ value, label, description }) => (
                    <label
                      key={value}
                      className={`flex items-start gap-3 rounded-lg border p-3.5 cursor-pointer transition-colors ${
                        role === value
                          ? "border-primary-400 bg-primary-50"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={value}
                        checked={role === value}
                        onChange={() => setRole(value)}
                        disabled={loading}
                        className="mt-0.5 h-4 w-4 text-primary-500 border-gray-300 focus:ring-primary-500 shrink-0"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-gray-900">{label}</span>
                        <span className="block text-xs text-gray-500 mt-0.5">{description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !email || !password || !confirmPassword}
                className="btn-primary w-full mt-2"
                aria-busy={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                    </svg>
                    Creating account…
                  </span>
                ) : (
                  "Create Account"
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" aria-hidden="true" />
              <span className="text-xs text-gray-400 font-medium">OR</span>
              <div className="h-px flex-1 bg-gray-200" aria-hidden="true" />
            </div>

            {/* Login link */}
            <p className="text-center text-sm text-gray-500">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-primary-500 hover:text-primary-600">
                Sign in
              </Link>
            </p>
          </div>

          {/* Trust note */}
          <p className="mt-6 text-center text-xs text-gray-400">
            By creating an account you agree to our{" "}
            <Link href="/terms" className="underline hover:text-gray-600">Terms of Service</Link>
            {" "}and{" "}
            <Link href="/privacy" className="underline hover:text-gray-600">Privacy Policy</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
