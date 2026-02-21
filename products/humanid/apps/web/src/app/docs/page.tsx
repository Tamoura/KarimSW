import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Documentation — HumanID",
  description:
    "HumanID documentation for consumers, developers, and organisations. Get started with digital identity, verifiable credentials, and the HumanID API.",
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
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors no-underline"
            >
              About
            </Link>
            <Link
              href="/docs"
              className="text-sm font-medium text-primary-600 hover:text-gray-900 transition-colors no-underline"
              aria-current="page"
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

// ─── Audience card ────────────────────────────────────────────────────────────

interface AudienceCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href: string;
  topics: string[];
  ctaLabel: string;
}

function AudienceCard({
  icon,
  title,
  subtitle,
  href,
  topics,
  ctaLabel,
}: AudienceCardProps) {
  return (
    <div className="card hover:shadow-md transition-shadow flex flex-col">
      <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-5">
        {icon}
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">{title}</h2>
      <p className="text-gray-500 text-sm mb-5">{subtitle}</p>
      <ul className="space-y-2 mb-6 flex-1">
        {topics.map((topic) => (
          <li key={topic} className="flex items-start gap-2 text-sm text-gray-600">
            <svg
              className="w-4 h-4 text-success-500 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            {topic}
          </li>
        ))}
      </ul>
      <Link href={href} className="btn-primary text-sm w-full justify-center">
        {ctaLabel}
      </Link>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />

      {/* Hero */}
      <section className="bg-gradient-to-b from-primary-50 to-white pt-16 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 border border-primary-100 text-primary-700 text-sm font-medium mb-6">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
              />
            </svg>
            HumanID Documentation
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight mb-5">
            Everything you need to know
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Whether you are setting up your first digital wallet, building an
            integration, or issuing credentials to your community — this is where
            you start.
          </p>
        </div>
      </section>

      {/* Audience cards */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <AudienceCard
              href="/docs/consumers"
              title="Consumers"
              subtitle="Using your wallet"
              ctaLabel="Consumer Guide"
              icon={
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
                    d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                  />
                </svg>
              }
              topics={[
                "Create and manage your digital wallet",
                "Receive credentials from trusted issuers",
                "Share credentials with selective disclosure",
                "Understand zero-knowledge proofs",
                "Protect your account with passkeys",
              ]}
            />

            <AudienceCard
              href="/developer"
              title="Developers"
              subtitle="Build with HumanID"
              ctaLabel="Developer Portal"
              icon={
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
                    d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
                  />
                </svg>
              }
              topics={[
                "Quickstart: verify credentials in 5 minutes",
                "REST API and OpenID4VC endpoints",
                "Issue your first verifiable credential",
                "Webhook events and signature verification",
                "SDKs for TypeScript, Python, Go",
              ]}
            />

            <AudienceCard
              href="/docs/organizations"
              title="Organisations"
              subtitle="Issue credentials at scale"
              ctaLabel="Organisation Guide"
              icon={
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
                    d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
                  />
                </svg>
              }
              topics={[
                "Apply for issuer status and trust levels",
                "Set up SAML 2.0 and OIDC single sign-on",
                "Issue and revoke credentials in bulk",
                "GDPR compliance and audit log access",
                "Webhook integration for real-time events",
              ]}
            />
          </div>
        </div>
      </section>

      {/* Quick Links */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Quick Links</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                label: "Getting started with your wallet",
                href: "/docs/consumers#getting-started",
                badge: "Consumer",
              },
              {
                label: "API quickstart",
                href: "/developer/quickstart",
                badge: "Developer",
              },
              {
                label: "Becoming a credential issuer",
                href: "/docs/organizations#becoming-an-issuer",
                badge: "Org",
              },
              {
                label: "Selective disclosure explained",
                href: "/docs/consumers#sharing-credentials",
                badge: "Consumer",
              },
              {
                label: "OpenID4VC integration guide",
                href: "/developer/docs",
                badge: "Developer",
              },
              {
                label: "SSO setup (SAML & OIDC)",
                href: "/docs/organizations#setting-up-sso",
                badge: "Org",
              },
              {
                label: "Zero-knowledge proofs overview",
                href: "/docs/consumers#privacy-security",
                badge: "Consumer",
              },
              {
                label: "Webhook events reference",
                href: "/docs/organizations#webhooks",
                badge: "Org",
              },
              {
                label: "Full API reference",
                href: "/developer/docs",
                badge: "Developer",
              },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 hover:border-primary-200 hover:shadow-sm transition-all no-underline group"
              >
                <span className="text-sm text-gray-700 group-hover:text-gray-900">
                  {link.label}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary-50 text-primary-700">
                    {link.badge}
                  </span>
                  <svg
                    className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 border-t border-gray-800 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded bg-primary-500 flex items-center justify-center"
              aria-hidden="true"
            >
              <span className="text-white font-bold text-xs">H</span>
            </div>
            <span className="text-gray-400 text-sm">HumanID</span>
          </div>
          <p className="text-gray-500 text-sm">
            &copy; {new Date().getFullYear()} HumanID. Universal Digital Identity.
          </p>
          <div className="flex gap-6">
            <Link
              href="/about"
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors no-underline"
            >
              About
            </Link>
            <Link
              href="/developer"
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors no-underline"
            >
              Developers
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
