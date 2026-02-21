import Link from "next/link";
import CredentialCarousel from "@/components/CredentialCarousel";

export const metadata = {
  title: "HumanID — The Internet's Identity Layer",
  description:
    "Issue, hold, and verify tamper-proof credentials. Built on W3C DIDs and Verifiable Credentials — the open standard for digital identity.",
};

// ---------------------------------------------------------------------------
// Inline SVG icons — no external libraries
// ---------------------------------------------------------------------------

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
      />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
      />
    </svg>
  );
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
      />
    </svg>
  );
}

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
      />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
      />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
      />
    </svg>
  );
}

function VerifyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ------------------------------------------------------------------ */}
      {/* 1. Navigation                                                        */}
      {/* ------------------------------------------------------------------ */}
      <nav
        aria-label="Main navigation"
        className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-50"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link
              href="/"
              className="flex items-center gap-2"
              aria-label="HumanID home"
            >
              <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm" aria-hidden="true">
                  H
                </span>
              </div>
              <span className="font-bold text-gray-900 text-lg">HumanID</span>
            </Link>

            {/* Center nav — hidden on mobile */}
            <div className="hidden md:flex items-center gap-7">
              <Link
                href="/about"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                About
              </Link>
              <Link
                href="/docs"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Docs
              </Link>
              <Link
                href="/docs/organizations"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                For Organizations
              </Link>
              <Link
                href="/developer"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Developers
              </Link>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-4">
              <Link
                href="/login"
                className="hidden sm:block text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Sign In
              </Link>
              <Link href="/register" className="btn-primary text-sm px-4 py-2">
                Get Your Wallet
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main>
        {/* ---------------------------------------------------------------- */}
        {/* 2. Hero — dark, gradient mesh                                     */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="hero-heading"
          className="relative overflow-hidden bg-[#0a0f1e] pt-20 pb-28 px-4 sm:px-6 lg:px-8"
        >
          {/* Gradient mesh blobs */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
            <div className="absolute -top-40 -right-32 w-[600px] h-[600px] rounded-full bg-primary-700 opacity-10 blur-3xl" />
            <div className="absolute top-1/2 -left-40 w-96 h-96 rounded-full bg-cyan-700 opacity-10 blur-3xl" />
            <div className="absolute -bottom-20 right-1/4 w-72 h-72 rounded-full bg-primary-600 opacity-10 blur-3xl" />
          </div>

          <div className="relative max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Left column */}
              <div>
                {/* Badge */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-700 text-gray-400 text-xs font-medium mb-8">
                  <span aria-hidden="true">🔒</span>
                  Open Standard · W3C Verified
                </div>

                <h1
                  id="hero-heading"
                  className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight leading-tight mb-6"
                >
                  The Internet&apos;s
                  <br />
                  <span className="bg-gradient-to-r from-primary-400 to-cyan-400 bg-clip-text text-transparent">
                    Identity
                  </span>{" "}
                  Layer
                </h1>

                <p className="text-lg text-gray-400 leading-relaxed mb-8 max-w-lg">
                  Issue, hold, and verify tamper-proof credentials. Built on
                  W3C DIDs and Verifiable Credentials — the open standard for
                  digital identity.
                </p>

                {/* CTA row */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
                  <Link
                    href="/register"
                    className="btn-primary text-base px-7 py-3.5 w-full sm:w-auto"
                  >
                    Get Your Wallet — Free
                  </Link>
                  <Link
                    href="/about"
                    className="text-gray-300 hover:text-white text-base font-medium transition-colors flex items-center gap-1.5"
                  >
                    See how it works
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>

                {/* Trust micro-copy */}
                <p className="text-sm text-gray-500">
                  No password · No central server · Your keys, your identity
                </p>
              </div>

              {/* Right column — rotating credential carousel (desktop only) */}
              <div className="hidden lg:flex justify-center lg:justify-end">
                <CredentialCarousel />
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 3. Stats Row                                                       */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-label="Platform statistics"
          className="border-t border-b border-gray-100 py-10 bg-white"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <dl className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-gray-100">
              {[
                { value: "10,000+", label: "Wallet holders" },
                { value: "50,000+", label: "Credentials issued" },
                { value: "28", label: "API endpoints" },
                { value: "99.9%", label: "Uptime SLA" },
              ].map((stat) => (
                <div key={stat.label} className="px-6 sm:px-10 text-center first:pl-0 last:pr-0 py-2">
                  <dt className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-1">
                    {stat.value}
                  </dt>
                  <dd className="text-sm text-gray-500 font-medium">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 4. Compliance / Trust Strip                                        */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-label="Compliance standards"
          className="bg-[#0a0f1e] py-6 px-4 sm:px-6 lg:px-8"
        >
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <span className="text-gray-500 text-sm font-medium mr-2 shrink-0">
                Compliant with:
              </span>
              {[
                { icon: "📋", label: "W3C DID Core" },
                { icon: "✅", label: "W3C Verifiable Credentials" },
                { icon: "🔐", label: "OpenID4VC" },
                { icon: "🇪🇺", label: "GDPR / PDPL" },
                { icon: "🏛️", label: "eIDAS 2.0" },
              ].map((badge) => (
                <span
                  key={badge.label}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-700 text-gray-400 text-xs font-medium"
                >
                  <span aria-hidden="true">{badge.icon}</span>
                  {badge.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 5. Who It's For — 3 audience cards                                */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="audience-heading"
          className="py-24 px-4 sm:px-6 lg:px-8 bg-white"
        >
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-14">
              <h2
                id="audience-heading"
                className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
              >
                Built for every role in the identity ecosystem
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Consumers */}
              <article className="card hover:shadow-md transition-shadow flex flex-col">
                <div className="w-12 h-12 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-5 flex-shrink-0">
                  <PersonIcon className="w-6 h-6 text-primary-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Own your identity
                </h3>
                <p className="text-gray-500 leading-relaxed flex-1">
                  Store government IDs, degrees, certifications, and health
                  records in your self-custody wallet. Share only what&apos;s
                  needed — nothing more.
                </p>
                <Link
                  href="/register"
                  className="mt-5 text-sm font-semibold text-primary-500 hover:text-primary-600 transition-colors inline-flex items-center gap-1"
                >
                  Get your wallet
                  <span aria-hidden="true">→</span>
                </Link>
              </article>

              {/* Developers */}
              <article className="card hover:shadow-md transition-shadow flex flex-col border-purple-100">
                <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center mb-5 flex-shrink-0">
                  <CodeIcon className="w-6 h-6 text-purple-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Build on open standards
                </h3>
                <p className="text-gray-500 leading-relaxed flex-1">
                  REST API, WebAuthn, SSO (OIDC + SAML), and webhook
                  integrations. Issue and verify credentials in minutes with
                  our SDK.
                </p>
                <Link
                  href="/developer"
                  className="mt-5 text-sm font-semibold text-purple-600 hover:text-purple-700 transition-colors inline-flex items-center gap-1"
                >
                  Read the docs
                  <span aria-hidden="true">→</span>
                </Link>
              </article>

              {/* Organizations */}
              <article className="card hover:shadow-md transition-shadow flex flex-col border-success-100">
                <div className="w-12 h-12 rounded-xl bg-success-50 border border-success-100 flex items-center justify-center mb-5 flex-shrink-0">
                  <BuildingIcon className="w-6 h-6 text-success-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Become a trusted issuer
                </h3>
                <p className="text-gray-500 leading-relaxed flex-1">
                  Issue verifiable credentials to your members, employees, and
                  customers. Trusted by universities, healthcare providers, and
                  government agencies.
                </p>
                <Link
                  href="/docs/organizations"
                  className="mt-5 text-sm font-semibold text-success-600 hover:text-success-700 transition-colors inline-flex items-center gap-1"
                >
                  Apply as issuer
                  <span aria-hidden="true">→</span>
                </Link>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 6. How It Works — 3 steps                                          */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="how-it-works-heading"
          className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-50"
        >
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2
                id="how-it-works-heading"
                className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
              >
                From credential to verification in 3 steps
              </h2>
            </div>

            <ol className="relative grid grid-cols-1 md:grid-cols-3 gap-0">
              {/* Connecting line — desktop only */}
              <div
                className="hidden md:block absolute top-10 left-1/6 right-1/6 h-px bg-gradient-to-r from-primary-200 via-primary-300 to-primary-200"
                aria-hidden="true"
              />

              {[
                {
                  step: "1",
                  title: "Issue",
                  description:
                    "A trusted organisation signs and sends a credential to your wallet DID.",
                  icon: <UploadIcon className="w-6 h-6 text-primary-500" />,
                },
                {
                  step: "2",
                  title: "Hold",
                  description:
                    "You receive, review, and accept it into your encrypted self-custody wallet.",
                  icon: <WalletIcon className="w-6 h-6 text-primary-500" />,
                },
                {
                  step: "3",
                  title: "Verify",
                  description:
                    "Share a cryptographic proof with any verifier — they confirm it instantly, no issuer contact needed.",
                  icon: <VerifyIcon className="w-6 h-6 text-primary-500" />,
                },
              ].map((item) => (
                <li key={item.step} className="relative flex flex-col items-center text-center px-6 md:px-10 pb-10 md:pb-0">
                  {/* Circle number */}
                  <div className="relative z-10 w-20 h-20 rounded-full bg-white border-2 border-primary-200 flex flex-col items-center justify-center mb-6 shadow-sm">
                    <span className="text-xs font-bold text-primary-400 uppercase tracking-widest leading-none mb-0.5">
                      Step
                    </span>
                    <span className="text-2xl font-extrabold text-primary-500 leading-none">
                      {item.step}
                    </span>
                  </div>

                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-4">
                    {item.icon}
                  </div>

                  <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                  <p className="text-gray-500 leading-relaxed max-w-xs">{item.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 7. Open Standards Section                                          */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="standards-heading"
          className="py-24 px-4 sm:px-6 lg:px-8 bg-white"
        >
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-14">
              <h2
                id="standards-heading"
                className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
              >
                Built on protocols you can trust
              </h2>
              <p className="text-lg text-gray-500 max-w-2xl mx-auto">
                Every HumanID credential is interoperable with the global
                digital identity ecosystem.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  initial: "W3C",
                  color: "bg-primary-500",
                  name: "W3C DID Core",
                  description:
                    "Decentralized Identifiers. Your cryptographic address on the internet.",
                },
                {
                  initial: "VC",
                  color: "bg-success-600",
                  name: "W3C Verifiable Credentials",
                  description:
                    "The tamper-proof credential format accepted by EU Digital Identity Wallets.",
                },
                {
                  initial: "OID",
                  color: "bg-purple-600",
                  name: "OpenID4VC",
                  description:
                    "Present credentials via standard OAuth 2.0 flows. Works with any OIDC provider.",
                },
                {
                  initial: "ZKP",
                  color: "bg-warning-600",
                  name: "Zero-Knowledge Proofs",
                  description:
                    "Prove facts about yourself without revealing the underlying data.",
                },
              ].map((standard) => (
                <div
                  key={standard.name}
                  className="card hover:shadow-md transition-shadow flex flex-col"
                >
                  <div
                    className={`w-12 h-12 rounded-xl ${standard.color} flex items-center justify-center mb-4 flex-shrink-0`}
                  >
                    <span className="text-white text-xs font-bold tracking-tight">
                      {standard.initial}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-2">
                    {standard.name}
                  </h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    {standard.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 8. CTA Section                                                     */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="cta-heading"
          className="py-24 px-4 sm:px-6 lg:px-8 bg-[#0a0f1e]"
        >
          <div className="max-w-2xl mx-auto text-center">
            <h2
              id="cta-heading"
              className="text-3xl sm:text-4xl font-bold text-white mb-4"
            >
              Ready to own your digital identity?
            </h2>
            <p className="text-gray-400 text-lg mb-10">
              Free for individuals. Enterprise pricing for organisations.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
              <Link href="/register" className="btn-primary text-base px-8 py-3.5 w-full sm:w-auto">
                Create your wallet
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center px-8 py-3.5 rounded-lg bg-transparent text-white font-semibold border border-white/30 hover:border-white/60 hover:bg-white/5 transition-colors text-base w-full sm:w-auto"
              >
                Talk to sales
              </Link>
            </div>

            {/* Compliance logos strip */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              {["GDPR", "W3C", "eIDAS 2.0", "SOC2"].map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center px-3 py-1 rounded-full border border-gray-700 text-gray-500 text-xs font-medium"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* 9. Footer                                                            */}
      {/* ------------------------------------------------------------------ */}
      <footer className="bg-gray-950 px-4 sm:px-6 lg:px-8 pt-16 pb-8" aria-label="Footer">
        <div className="max-w-7xl mx-auto">
          {/* 4-column grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pb-12 border-b border-gray-800">
            {/* Col 1 — Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-xs" aria-hidden="true">H</span>
                </div>
                <span className="font-bold text-white text-base">HumanID</span>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed mb-5">
                The open standard for digital identity. Built for people, developers, and organisations.
              </p>
              {/* Social links placeholder */}
              <div className="flex gap-3">
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="HumanID on GitHub"
                  className="w-8 h-8 rounded-lg border border-gray-700 flex items-center justify-center text-gray-500 hover:text-white hover:border-gray-500 transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
                  </svg>
                </a>
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="HumanID on X (Twitter)"
                  className="w-8 h-8 rounded-lg border border-gray-700 flex items-center justify-center text-gray-500 hover:text-white hover:border-gray-500 transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Col 2 — Product */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-4">Product</h3>
              <ul className="space-y-3" role="list">
                {[
                  { label: "Wallet", href: "/register" },
                  { label: "Developer Portal", href: "/developer" },
                  { label: "API Docs", href: "/docs" },
                  { label: "Sandbox", href: "/docs/sandbox" },
                ].map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 3 — Company */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-4">Company</h3>
              <ul className="space-y-3" role="list">
                {[
                  { label: "About", href: "/about" },
                  { label: "Blog", href: "/blog" },
                  { label: "Security", href: "/security" },
                  { label: "Compliance", href: "/compliance" },
                ].map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 4 — Developers */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-4">Developers</h3>
              <ul className="space-y-3" role="list">
                {[
                  { label: "Quickstart", href: "/docs/quickstart" },
                  { label: "API Reference", href: "/docs/api" },
                  { label: "SDKs", href: "/docs/sdks" },
                  { label: "Status", href: "/status" },
                ].map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-gray-600 text-sm">
              &copy; {new Date().getFullYear()} HumanID. Universal Digital Identity.
            </p>
            <div className="flex gap-6">
              <Link
                href="/privacy"
                className="text-gray-600 hover:text-gray-400 text-sm transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="text-gray-600 hover:text-gray-400 text-sm transition-colors"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
