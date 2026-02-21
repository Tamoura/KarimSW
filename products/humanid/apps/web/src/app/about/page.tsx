import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About HumanID — Universal Digital Identity",
  description:
    "Learn about HumanID's mission, the open standards we implement (W3C DID, W3C Verifiable Credentials, OpenID4VC), and our commitment to user privacy and data sovereignty.",
};

// ─── Navigation ──────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav
      className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50"
      aria-label="Main navigation"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <div
              className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center"
              aria-hidden="true"
            >
              <span className="text-white font-bold text-sm">H</span>
            </div>
            <span className="font-bold text-gray-900 text-lg">HumanID</span>
          </Link>
          <div className="hidden sm:flex items-center gap-6">
            <Link
              href="/about"
              className="text-sm font-medium text-primary-600 hover:text-gray-900 transition-colors no-underline"
              aria-current="page"
            >
              About
            </Link>
            <Link
              href="/docs"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors no-underline"
            >
              Docs
            </Link>
            <Link
              href="/developer"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors no-underline"
            >
              Developers
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors no-underline"
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
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="bg-gray-900 border-t border-gray-800 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-8 mb-8">
          <div className="sm:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-6 h-6 rounded bg-primary-500 flex items-center justify-center"
                aria-hidden="true"
              >
                <span className="text-white font-bold text-xs">H</span>
              </div>
              <span className="text-white font-semibold text-sm">HumanID</span>
            </div>
            <p className="text-gray-500 text-sm leading-relaxed">
              Universal digital identity built on open standards.
            </p>
          </div>
          <div>
            <h3 className="text-gray-300 text-sm font-semibold mb-3">Product</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/about" className="text-gray-500 hover:text-gray-300 text-sm no-underline">
                  About
                </Link>
              </li>
              <li>
                <Link href="/register" className="text-gray-500 hover:text-gray-300 text-sm no-underline">
                  Get Started
                </Link>
              </li>
              <li>
                <Link href="/wallet" className="text-gray-500 hover:text-gray-300 text-sm no-underline">
                  My Wallet
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-gray-300 text-sm font-semibold mb-3">Resources</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/docs" className="text-gray-500 hover:text-gray-300 text-sm no-underline">
                  Documentation
                </Link>
              </li>
              <li>
                <Link href="/developer" className="text-gray-500 hover:text-gray-300 text-sm no-underline">
                  Developer Portal
                </Link>
              </li>
              <li>
                <Link
                  href="/developer/docs"
                  className="text-gray-500 hover:text-gray-300 text-sm no-underline"
                >
                  API Reference
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-gray-300 text-sm font-semibold mb-3">Standards</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://www.w3.org/TR/did-core/"
                  className="text-gray-500 hover:text-gray-300 text-sm no-underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  W3C DID Core
                </a>
              </li>
              <li>
                <a
                  href="https://www.w3.org/TR/vc-data-model/"
                  className="text-gray-500 hover:text-gray-300 text-sm no-underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  W3C Verifiable Credentials
                </a>
              </li>
              <li>
                <a
                  href="https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html"
                  className="text-gray-500 hover:text-gray-300 text-sm no-underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  OpenID4VC
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-6">
          <p className="text-gray-500 text-sm text-center">
            &copy; {new Date().getFullYear()} HumanID. Universal Digital Identity. Built on open standards.
          </p>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-50 to-white pt-20 pb-24 px-4 sm:px-6 lg:px-8">
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          aria-hidden="true"
        >
          <div className="absolute -top-40 -right-32 w-96 h-96 rounded-full bg-primary-100 opacity-40 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-success-100 opacity-30 blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 border border-primary-100 text-primary-700 text-sm font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" aria-hidden="true" />
            Open Standards. User Sovereignty.
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold text-gray-900 tracking-tight mb-6 leading-tight">
            Identity should belong
            <br />
            <span className="text-primary-500">to the person.</span>
          </h1>
          <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
            HumanID is building the universal digital identity layer for the
            internet — privacy-preserving, cryptographically verifiable, and
            owned entirely by you.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" className="btn-primary text-base px-8 py-3.5 w-full sm:w-auto">
              Create Your Identity
            </Link>
            <Link href="/docs" className="btn-secondary text-base px-8 py-3.5 w-full sm:w-auto">
              Read the Docs
            </Link>
          </div>
        </div>
      </section>

      {/* Why HumanID */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Why HumanID?</h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              Today's identity systems were built for institutions, not people.
              HumanID inverts that — putting individuals at the centre of their
              own identity infrastructure.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Privacy */}
            <div className="card hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-5">
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
                    d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Privacy by Default</h3>
              <p className="text-gray-500 leading-relaxed">
                Zero-knowledge proofs let you prove facts about yourself —
                your age, your qualifications, your membership — without
                revealing the underlying data. Selective disclosure means you
                share only the minimum required for any given interaction.
              </p>
            </div>

            {/* Sovereignty */}
            <div className="card hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-success-50 border border-success-100 flex items-center justify-center mb-5">
                <svg
                  className="w-6 h-6 text-success-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">True Sovereignty</h3>
              <p className="text-gray-500 leading-relaxed">
                Your identity is anchored to cryptographic keys that only you
                hold. No corporation can delete your account, no government
                can revoke your identifier, and no platform can hold your
                credentials hostage. Your DID is yours, forever.
              </p>
            </div>

            {/* Interoperability */}
            <div className="card hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-warning-50 border border-warning-100 flex items-center justify-center mb-5">
                <svg
                  className="w-6 h-6 text-warning-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Universal Interoperability</h3>
              <p className="text-gray-500 leading-relaxed">
                Built on W3C and IETF open standards, HumanID credentials work
                across any platform that implements the same specifications.
                No vendor lock-in. No walled gardens. Your identity travels
                with you across the entire web.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The Technology */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">The Technology</h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              HumanID is built on a foundation of peer-reviewed cryptographic
              protocols and internationally ratified open standards.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* W3C DID */}
            <div className="card hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0">
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
                      d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                    />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      W3C Decentralised Identifiers (DIDs)
                    </h3>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-100">
                      W3C Rec.
                    </span>
                  </div>
                  <p className="text-gray-500 leading-relaxed text-sm">
                    A Decentralised Identifier is a globally unique identifier that
                    does not require a central registration authority. Your DID is
                    created on your device, controlled by your private key, and can
                    be resolved by anyone. It looks like{" "}
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 font-mono text-xs">
                      did:web:humanid.io:users:alice
                    </code>{" "}
                    and links to a DID Document containing your public keys, service
                    endpoints, and proof of control. DIDs form the root of your
                    cryptographic identity — everything else is anchored to it.
                  </p>
                </div>
              </div>
            </div>

            {/* W3C VC */}
            <div className="card hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-success-50 border border-success-100 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-6 h-6 text-success-500"
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
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      W3C Verifiable Credentials
                    </h3>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success-50 text-success-700 border border-success-100">
                      W3C Rec.
                    </span>
                  </div>
                  <p className="text-gray-500 leading-relaxed text-sm">
                    Verifiable Credentials (VCs) are the digital equivalent of
                    physical documents: a university degree, a driving licence, or an
                    employment record. Unlike paper documents, VCs carry a
                    cryptographic proof — a digital signature from the issuer — that
                    lets any verifier confirm authenticity without calling the issuer.
                    HumanID stores your VCs in your wallet, encrypted with your keys,
                    so only you decide when and where to present them.
                  </p>
                </div>
              </div>
            </div>

            {/* OpenID4VC */}
            <div className="card hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-warning-50 border border-warning-100 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-6 h-6 text-warning-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z"
                    />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      OpenID for Verifiable Credentials
                    </h3>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-warning-50 text-warning-700 border border-warning-100">
                      OpenID Foundation
                    </span>
                  </div>
                  <p className="text-gray-500 leading-relaxed text-sm">
                    OpenID4VC extends the widely-deployed OAuth 2.0 and OpenID
                    Connect protocols to support credential issuance
                    (OpenID4VCI) and presentation (OpenID4VP). This means
                    organisations that already run OIDC infrastructure can
                    integrate with HumanID using familiar flows and tooling.
                    It also means billions of existing OAuth-capable clients can
                    participate in the verifiable credential ecosystem with minimal
                    changes.
                  </p>
                </div>
              </div>
            </div>

            {/* ZKP */}
            <div className="card hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-danger-50 border border-danger-100 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-6 h-6 text-danger-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                    />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Zero-Knowledge Proofs
                    </h3>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-danger-50 text-danger-700 border border-danger-100">
                      Cryptography
                    </span>
                  </div>
                  <p className="text-gray-500 leading-relaxed text-sm">
                    Zero-knowledge proofs (ZKPs) are mathematical constructions that
                    allow a prover to convince a verifier that a statement is true
                    without revealing any information beyond the statement itself. In
                    practice: you can prove you are over 18 without showing your date
                    of birth; you can prove you hold a valid employment credential
                    without revealing which company issued it. HumanID uses BBS+
                    signatures, enabling selective disclosure and unlinkable
                    presentations at the cryptographic layer.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Open Standards Table */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Open Standards We Implement
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              Every protocol implemented in HumanID is publicly documented,
              peer-reviewed, and standardised by an internationally recognised
              body. No proprietary lock-in.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Standard</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Body</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Purpose in HumanID</th>
                  <th className="text-left px-6 py-4 font-semibold text-gray-700">Spec</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  {
                    name: "DID Core",
                    body: "W3C",
                    purpose: "Decentralised identifiers — the root of every HumanID identity",
                    href: "https://www.w3.org/TR/did-core/",
                  },
                  {
                    name: "Verifiable Credentials Data Model 2.0",
                    body: "W3C",
                    purpose: "Tamper-evident, cryptographically signed credentials",
                    href: "https://www.w3.org/TR/vc-data-model-2.0/",
                  },
                  {
                    name: "OpenID4VCI",
                    body: "OpenID Foundation",
                    purpose: "Protocol for issuing credentials from an issuer to a wallet",
                    href: "https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html",
                  },
                  {
                    name: "OpenID4VP",
                    body: "OpenID Foundation",
                    purpose: "Protocol for presenting credentials from a wallet to a verifier",
                    href: "https://openid.net/specs/openid-4-verifiable-presentations-1_0.html",
                  },
                  {
                    name: "Self-Issued OpenID Provider v2 (SIOPv2)",
                    body: "OpenID Foundation",
                    purpose: "Enables wallets to act as identity providers for OIDC flows",
                    href: "https://openid.net/specs/openid-connect-self-issued-v2-1_0.html",
                  },
                  {
                    name: "BBS+ Signatures",
                    body: "IETF (Draft)",
                    purpose: "Multi-message signatures enabling selective disclosure and ZKPs",
                    href: "https://identity.foundation/bbs-signature/draft-irtf-cfrg-bbs-signatures.html",
                  },
                  {
                    name: "Presentation Exchange",
                    body: "DIF",
                    purpose: "Standard format for verifiers to request specific credentials",
                    href: "https://identity.foundation/presentation-exchange/",
                  },
                  {
                    name: "WebAuthn / FIDO2",
                    body: "W3C / FIDO Alliance",
                    purpose: "Passkey-based authentication for accessing your HumanID wallet",
                    href: "https://www.w3.org/TR/webauthn-3/",
                  },
                ].map((row) => (
                  <tr key={row.name} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{row.name}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
                        {row.body}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{row.purpose}</td>
                    <td className="px-6 py-4">
                      <a
                        href={row.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700 text-xs font-medium no-underline"
                      >
                        View spec ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Privacy by Design */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Privacy by Design
              </h2>
              <p className="text-lg text-gray-500">
                Privacy is not a feature we added later. It is embedded in
                every architectural decision HumanID makes.
              </p>
            </div>

            <ol className="space-y-6">
              {[
                {
                  num: "01",
                  title: "Data Minimisation",
                  body:
                    "We collect only what is strictly necessary for the service to function. HumanID never stores your credential data on our servers — it lives in your wallet, encrypted with keys only you hold. Our servers see cryptographic hashes and signed proofs, never plaintext personal data.",
                },
                {
                  num: "02",
                  title: "Informed Consent",
                  body:
                    "Every request for your credentials is explicit and human-readable. You see exactly what is being requested and by whom before you approve. Consent is granular — you can approve a single field without exposing the rest. Consent decisions are logged in your wallet's audit trail.",
                },
                {
                  num: "03",
                  title: "End-to-End Encryption",
                  body:
                    "All credential storage and transmission uses envelope encryption with per-user keys derived from your passkey or biometric. Keys are never transmitted to our servers in plaintext. We use AES-256-GCM for symmetric encryption and X25519 for key exchange, following current NIST and IETF guidance.",
                },
                {
                  num: "04",
                  title: "No Tracking, No Profiling",
                  body:
                    "HumanID does not track how you use your credentials, who you share them with, or when you log in to third-party services. Presentation sessions are unlinkable by design — even HumanID cannot correlate your presentations across verifiers. We run no analytics on credential usage.",
                },
                {
                  num: "05",
                  title: "Self-Custody by Default",
                  body:
                    "Your private keys never leave your device in decrypted form. If you choose cloud backup, your keys are encrypted client-side before upload using a key derived from your recovery phrase — a secret only you know. HumanID operates on a zero-knowledge custody model: we cannot access your wallet even if compelled.",
                },
              ].map((principle) => (
                <li key={principle.num} className="card flex items-start gap-5">
                  <span
                    className="text-2xl font-extrabold text-primary-200 flex-shrink-0 leading-none mt-0.5"
                    aria-hidden="true"
                  >
                    {principle.num}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 mb-1">
                      {principle.title}
                    </h3>
                    <p className="text-gray-500 text-sm leading-relaxed">
                      {principle.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Our Mission */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Our Mission</h2>
          <blockquote className="text-2xl sm:text-3xl font-light text-gray-700 leading-relaxed mb-10 italic">
            &ldquo;We believe the internet deserves an identity layer that is as
            open, interoperable, and human-centric as the web itself.&rdquo;
          </blockquote>
          <p className="text-gray-500 text-lg leading-relaxed mb-6 max-w-3xl mx-auto">
            The web was designed without an identity layer. What grew in its
            absence — siloed accounts, data brokers, and surveillance advertising
            — was never inevitable. It was a consequence of the infrastructure gap.
          </p>
          <p className="text-gray-500 text-lg leading-relaxed mb-6 max-w-3xl mx-auto">
            HumanID exists to fill that gap with an infrastructure that respects
            the original values of the web: openness, decentralisation, and
            individual empowerment. We implement the standards being ratified
            today at the W3C, OpenID Foundation, and IETF so that developers,
            organisations, and individuals can participate in a trustworthy
            identity ecosystem that no single company controls.
          </p>
          <p className="text-gray-500 text-lg leading-relaxed max-w-3xl mx-auto">
            A world where your identity is portable, private, and provably yours
            is technically achievable today. Our mission is to make it the
            default.
          </p>
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" className="btn-primary text-base px-8 py-3.5 w-full sm:w-auto">
              Join HumanID — It&apos;s Free
            </Link>
            <Link href="/docs/consumers" className="btn-secondary text-base px-8 py-3.5 w-full sm:w-auto">
              Learn How It Works
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
