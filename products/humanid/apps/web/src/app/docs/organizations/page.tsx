import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Organization Guide — HumanID Docs",
  description:
    "Issue verifiable credentials, set up SSO, manage your organization's identity infrastructure, and integrate with HumanID's API.",
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
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center" aria-hidden="true">
              <span className="text-white font-bold text-sm">H</span>
            </div>
            <span className="font-bold text-gray-900 text-lg">HumanID</span>
          </Link>
          <div className="hidden sm:flex items-center gap-6">
            <Link href="/docs" className="text-sm text-gray-600 hover:text-gray-900">Docs</Link>
            <Link href="/about" className="text-sm text-gray-600 hover:text-gray-900">About</Link>
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">Sign In</Link>
            <Link href="/developer" className="btn-primary text-sm">Developer Portal</Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const sections = [
  { id: "overview", label: "Overview" },
  { id: "becoming-an-issuer", label: "Becoming an Issuer" },
  { id: "issuing-credentials", label: "Issuing Credentials" },
  { id: "sso-setup", label: "Setting Up SSO" },
  { id: "webhooks", label: "Webhooks" },
  { id: "compliance-audit", label: "Compliance & Audit" },
  { id: "api-reference", label: "API Reference" },
];

function Sidebar() {
  return (
    <aside className="hidden lg:block w-56 flex-shrink-0">
      <div className="sticky top-24">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          On this page
        </p>
        <nav className="space-y-1" aria-label="Page sections">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="block text-sm text-gray-600 hover:text-primary-500 py-1 hover:underline"
            >
              {s.label}
            </a>
          ))}
        </nav>
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Other Guides
          </p>
          <nav className="space-y-1">
            <Link href="/docs/consumers" className="block text-sm text-gray-600 hover:text-primary-500 py-1 hover:underline">
              Consumer Guide
            </Link>
            <Link href="/developer" className="block text-sm text-gray-600 hover:text-primary-500 py-1 hover:underline">
              Developer Docs
            </Link>
          </nav>
        </div>
      </div>
    </aside>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="text-2xl font-bold text-gray-900 mt-12 mb-4 scroll-mt-24 pb-3 border-b border-gray-100"
    >
      {children}
    </h2>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-2">{children}</h3>;
}

function Para({ children }: { children: React.ReactNode }) {
  return <p className="text-gray-600 leading-relaxed mb-4">{children}</p>;
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-primary-50 border border-primary-100 rounded-lg p-4 mb-6 text-sm text-gray-700 leading-relaxed">
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto mb-6 leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function StepList({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="space-y-4 mb-6">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-4">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-500 text-white text-sm font-bold flex items-center justify-center">
            {i + 1}
          </div>
          <div>
            <p className="font-medium text-gray-900 mb-1">{step.title}</p>
            <p className="text-gray-600 text-sm leading-relaxed">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function TrustLevelBadge({ level }: { level: "self-asserted" | "verified" | "government-backed" }) {
  const map = {
    "self-asserted": "bg-gray-100 text-gray-600",
    "verified": "bg-blue-100 text-blue-700",
    "government-backed": "bg-green-100 text-green-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${map[level]}`}>
      {level === "self-asserted" ? "Self-Asserted" : level === "verified" ? "Verified" : "Government-Backed"}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrganizationsGuidePage() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />

      {/* Breadcrumb */}
      <div className="border-b border-gray-100 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <nav className="text-sm text-gray-500" aria-label="Breadcrumb">
            <Link href="/docs" className="hover:text-primary-500">Docs</Link>
            <span className="mx-2">›</span>
            <span className="text-gray-900 font-medium">Organization Guide</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex gap-12">
          <Sidebar />

          <main className="flex-1 min-w-0">
            {/* Hero */}
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 bg-green-50 text-green-600 text-xs font-semibold px-3 py-1 rounded-full mb-4">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
                Organization Guide
              </div>
              <h1 className="text-4xl font-bold text-gray-900 mb-4">
                HumanID for Organizations
              </h1>
              <p className="text-xl text-gray-500 leading-relaxed max-w-2xl">
                Issue verifiable credentials to your members, employees, and customers.
                Integrate HumanID identity verification into your services. Become a trusted
                issuer in the global digital identity ecosystem.
              </p>
            </div>

            {/* Overview */}
            <SectionHeading id="overview">Overview</SectionHeading>
            <Para>
              Organizations — universities, employers, government agencies, healthcare providers, and
              professional certification bodies — play a crucial role in the HumanID ecosystem as
              <strong> credential issuers</strong>. When your organization issues a verifiable
              credential to an individual, you are cryptographically attesting to facts about that
              person: their qualifications, their identity, their employment status, or any other
              attribute your organization is authoritative over.
            </Para>
            <Para>
              Your issued credentials can then be used by your members across the entire digital
              ecosystem — at any verifier that accepts W3C Verifiable Credentials and OpenID4VC.
              This means your credentials work with HumanID wallets, EU Digital Identity Wallets
              (eIDAS 2.0), and any other compliant wallet worldwide.
            </Para>
            <div className="grid sm:grid-cols-3 gap-4 mb-8">
              {[
                { icon: "🏛️", title: "Issue credentials", desc: "Cryptographically sign and issue digital credentials to your members, students, or employees." },
                { icon: "🔐", title: "Verify identities", desc: "Accept credential presentations from users — verify who they are without contacting issuer." },
                { icon: "🔗", title: "SSO integration", desc: "Let users authenticate to your services using their HumanID wallet via OIDC or SAML 2.0." },
              ].map((item) => (
                <div key={item.title} className="card text-center">
                  <div className="text-3xl mb-3">{item.icon}</div>
                  <p className="font-semibold text-gray-900 mb-1 text-sm">{item.title}</p>
                  <p className="text-gray-500 text-xs leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>

            {/* Becoming an Issuer */}
            <SectionHeading id="becoming-an-issuer">Becoming an Issuer</SectionHeading>
            <Para>
              To issue credentials on HumanID, your organization must first apply for issuer status.
              This process verifies your organization&apos;s identity and grants you an appropriate
              trust level. Higher trust levels mean your credentials carry more weight with verifiers
              and users.
            </Para>
            <SubHeading>Trust levels</SubHeading>
            <div className="space-y-4 mb-6">
              {[
                {
                  level: "self-asserted" as const,
                  title: "Self-Asserted",
                  desc: "For small organizations, startups, and private entities. You register your organization's DID and begin issuing credentials immediately. No verification is performed by HumanID — verifiers and users must decide whether to trust self-asserted issuers.",
                  time: "Instant",
                },
                {
                  level: "verified" as const,
                  title: "Verified",
                  desc: "For established businesses and institutions. HumanID performs domain verification (proving you control the organization's domain) and reviews your business registration. Verified issuers are listed in the HumanID Trust Registry.",
                  time: "3–5 business days",
                },
                {
                  level: "government-backed" as const,
                  title: "Government-Backed",
                  desc: "For government agencies and formally accredited institutions. Requires submission of official accreditation documents, government registration numbers, and a formal legal review. Government-backed credentials carry the highest trust and are accepted by regulated verifiers.",
                  time: "2–4 weeks",
                },
              ].map((item) => (
                <div key={item.level} className="card">
                  <div className="flex items-center gap-3 mb-2">
                    <TrustLevelBadge level={item.level} />
                    <span className="text-xs text-gray-400">Approval: {item.time}</span>
                  </div>
                  <p className="font-semibold text-gray-900 mb-1 text-sm">{item.title}</p>
                  <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
            <SubHeading>Application process</SubHeading>
            <StepList
              steps={[
                {
                  title: "Register your organization account",
                  body: "Visit the developer portal and register as an organization. Provide your organization's legal name, country of registration, primary domain, and contact email.",
                },
                {
                  title: "Create your organization's DID",
                  body: "HumanID automatically creates a did:web DID for your organization anchored to your domain (e.g., did:web:yourdomain.com). This becomes your organization's cryptographic identity.",
                },
                {
                  title: "Generate an API key",
                  body: "Create an API key in the Developer Portal. Keep it secret — this key is used to sign and issue credentials on behalf of your organization.",
                },
                {
                  title: "Submit for trust level upgrade (optional)",
                  body: "If you need Verified or Government-Backed status, submit the required documentation via the Admin portal. The HumanID Trust team will review and notify you by email.",
                },
              ]}
            />

            {/* Issuing Credentials */}
            <SectionHeading id="issuing-credentials">Issuing Credentials</SectionHeading>
            <Para>
              Once your organization has issuer status, you can issue credentials via the HumanID
              API or by using the issuer portal UI. Credentials are issued to a holder&apos;s DID —
              the holder must then accept the credential into their wallet.
            </Para>
            <SubHeading>Credential templates</SubHeading>
            <Para>
              Define the structure of your credentials using templates. A template specifies the
              credential type, the claims it contains, and any constraints (e.g., expiry duration).
              Templates are versioned — changes to a template create a new version without
              invalidating existing issued credentials.
            </Para>
            <SubHeading>Issuing via API</SubHeading>
            <CodeBlock>{`POST /api/v1/credentials/issue
Authorization: Bearer <your-api-key>
Content-Type: application/json

{
  "holderDid": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "templateId": "tmpl_university_degree_v1",
  "claims": {
    "fullName": "Jane Smith",
    "degreeTitle": "Bachelor of Computer Science",
    "institution": "University of Toronto",
    "graduationDate": "2025-06-15",
    "honours": "First Class"
  },
  "expiresAt": "2035-06-15T00:00:00Z"
}

// Response:
{
  "id": "cred_01J9X...",
  "status": "issued",
  "holderDid": "did:key:z6Mk...",
  "issuedAt": "2026-01-16T09:00:00Z",
  "verificationUrl": "https://humanid.app/verify/cred_01J9X..."
}`}</CodeBlock>
            <SubHeading>Bulk issuance</SubHeading>
            <Para>
              For large-scale credential issuance (e.g., graduation ceremonies, employee onboarding),
              use the bulk issuance endpoint. Submit a CSV or JSON array of up to 10,000 credential
              records. HumanID processes them asynchronously and notifies you via webhook when
              complete.
            </Para>
            <SubHeading>Revocation</SubHeading>
            <Para>
              Revoke a credential at any time — for example, when an employee leaves your
              organization or a certification is withdrawn. Revoked credentials are tracked in the
              W3C Status List 2021 published on your DID document. Verifiers check this list in
              real time, so revocation takes effect immediately without any action by the holder.
            </Para>

            {/* SSO Setup */}
            <SectionHeading id="sso-setup">Setting Up SSO</SectionHeading>
            <Para>
              Allow users to authenticate to your services using their HumanID wallet. HumanID
              supports both <strong>OpenID Connect (OIDC)</strong> and <strong>SAML 2.0</strong>
              — the same protocols used by enterprise identity providers like Okta and Azure AD.
            </Para>
            <SubHeading>OIDC integration</SubHeading>
            <Para>
              Configure HumanID as an OIDC provider in your application. Users who sign in via
              HumanID will present their wallet credentials, and your application receives standard
              OIDC claims (sub, email, name) plus any custom verified claims from their credentials.
            </Para>
            <CodeBlock>{`// OIDC Discovery endpoint:
https://humanid.app/.well-known/openid-configuration

// Example: Next.js with NextAuth
import NextAuth from "next-auth"

export default NextAuth({
  providers: [
    {
      id: "humanid",
      name: "HumanID",
      type: "oauth",
      wellKnown: "https://humanid.app/.well-known/openid-configuration",
      clientId: process.env.HUMANID_CLIENT_ID,
      clientSecret: process.env.HUMANID_CLIENT_SECRET,
      authorization: { params: { scope: "openid email profile credentials:read" } },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          // Verified credential claims
          verifiedCredentials: profile.verified_credentials,
        };
      },
    },
  ],
})`}</CodeBlock>
            <SubHeading>SAML 2.0 integration</SubHeading>
            <Para>
              For enterprise environments that use SAML, configure HumanID as an Identity Provider
              (IdP) in your Service Provider (SP). Download the HumanID SAML metadata XML from
              the developer portal and import it into your SP configuration.
            </Para>
            <CodeBlock>{`// HumanID SAML Metadata URL:
https://humanid.app/saml/metadata.xml

// Entity ID (use in your SP config):
https://humanid.app/saml/idp

// SSO URL (POST binding):
https://humanid.app/saml/sso

// Certificate: Download from developer portal under
// Organization > SSO > SAML Certificate`}</CodeBlock>
            <InfoBox>
              <strong>Requesting specific credentials via SSO:</strong> Add the{" "}
              <code className="bg-primary-100 px-1 rounded text-primary-700">claims</code> parameter to
              your OIDC authorization request to specify which credential types you want the user to
              present. For example,{" "}
              <code className="bg-primary-100 px-1 rounded text-primary-700">
                claims=&#123;&quot;id_token&quot;:&#123;&quot;UniversityDegree&quot;:&#123;&quot;essential&quot;:true&#125;&#125;&#125;
              </code>{" "}
              requires users to present a verified university degree during login.
            </InfoBox>

            {/* Webhooks */}
            <SectionHeading id="webhooks">Webhooks</SectionHeading>
            <Para>
              HumanID sends real-time webhook notifications when events occur on your
              organization&apos;s account — credential issuance confirmations, revocation
              acknowledgements, and verification events (when your credentials are presented to
              verifiers, if you have opted in to receive these notifications).
            </Para>
            <SubHeading>Event types</SubHeading>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-6 font-semibold text-gray-700">Event</th>
                    <th className="text-left py-2 font-semibold text-gray-700">Description</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  {[
                    ["credential.issued", "A credential was successfully issued to a holder's wallet"],
                    ["credential.accepted", "The holder accepted the credential into their wallet"],
                    ["credential.rejected", "The holder rejected the issued credential"],
                    ["credential.revoked", "A credential was revoked by your organization"],
                    ["credential.expired", "A credential reached its expiry date"],
                    ["verification.completed", "A verifier successfully verified one of your credentials"],
                  ].map(([event, desc]) => (
                    <tr key={event} className="border-b border-gray-100">
                      <td className="py-2.5 pr-6">
                        <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-xs">{event}</code>
                      </td>
                      <td className="py-2.5">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SubHeading>Webhook payload &amp; signature verification</SubHeading>
            <CodeBlock>{`// Example webhook payload (credential.issued):
{
  "id": "evt_01J9X...",
  "type": "credential.issued",
  "timestamp": "2026-01-16T09:00:00Z",
  "data": {
    "credentialId": "cred_01J9X...",
    "holderDid": "did:key:z6Mk...",
    "templateId": "tmpl_university_degree_v1",
    "issuedAt": "2026-01-16T09:00:00Z"
  }
}

// Verify the webhook signature (Node.js):
import crypto from "crypto";

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(\`sha256=\${expected}\`)
  );
}`}</CodeBlock>

            {/* Compliance & Audit */}
            <SectionHeading id="compliance-audit">Compliance &amp; Audit</SectionHeading>
            <Para>
              HumanID is designed to help your organization meet regulatory requirements for
              data protection and identity management. Every action performed by your organization
              account — credential issuance, revocation, API key usage, SSO logins — is recorded
              in a tamper-evident audit log.
            </Para>
            <SubHeading>GDPR compliance</SubHeading>
            <Para>
              As a credential issuer, your organization processes personal data subject to GDPR
              (or applicable local data protection law). HumanID supports your compliance in several
              ways: credentials are issued to DIDs (not email addresses), minimizing direct personal
              data in the issuance flow; audit logs record the DID and credential type, not personal
              details; and your holders can request that you revoke and delete their credentials at
              any time.
            </Para>
            <Para>
              For data subject access requests (DSARs), use the audit log export in the Admin portal
              to retrieve all records associated with a particular DID. You can export up to 10,000
              audit records at a time in CSV or JSON format.
            </Para>
            <SubHeading>Audit log</SubHeading>
            <Para>
              The audit log is accessible from your organization&apos;s Admin portal. Every entry
              includes a timestamp (UTC), the actor (API key ID or user ID), the action type, the
              affected resource (credential ID, DID), and the originating IP address. Audit logs are
              retained for 7 years by default, configurable to your organization&apos;s retention
              policy.
            </Para>
            <InfoBox>
              <strong>ISO 27001 and SOC 2:</strong> HumanID&apos;s platform infrastructure is
              designed to support ISO 27001 and SOC 2 Type II compliance for your organization.
              Contact our enterprise team for audit-ready documentation packages including our
              shared responsibility model and security controls matrix.
            </InfoBox>

            {/* API Reference */}
            <SectionHeading id="api-reference">API Reference</SectionHeading>
            <Para>
              The full HumanID REST API is documented in our interactive API Explorer. All API
              endpoints require an API key for authentication. The base URL for the API is{" "}
              <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm">
                https://api.humanid.app/v1
              </code>
              .
            </Para>
            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {[
                { title: "API Reference", desc: "Interactive OpenAPI explorer with live request/response examples for all endpoints.", href: "/developer/docs", label: "Open API Explorer" },
                { title: "Quickstart Guide", desc: "Get your first credential issued in under 10 minutes with our step-by-step guide.", href: "/developer/quickstart", label: "Start the Guide" },
                { title: "SDKs", desc: "Official SDKs for Node.js, Python, Go, and Java. Install via npm, pip, or your package manager.", href: "/developer", label: "View SDKs" },
                { title: "Sandbox Environment", desc: "Test your integration against a fully functional sandbox with pre-seeded test data and DIDs.", href: "/developer/sandbox", label: "Open Sandbox" },
              ].map((item) => (
                <div key={item.title} className="card flex flex-col gap-3">
                  <div>
                    <p className="font-semibold text-gray-900 mb-1">{item.title}</p>
                    <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                  <Link
                    href={item.href}
                    className="btn-secondary text-sm text-center mt-auto"
                  >
                    {item.label}
                  </Link>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-12 bg-gray-900 rounded-2xl p-8 text-center">
              <h2 className="text-2xl font-bold text-white mb-3">
                Ready to become a trusted issuer?
              </h2>
              <p className="text-gray-400 mb-6">
                Join universities, hospitals, and government agencies already issuing
                verifiable credentials on HumanID.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/developer" className="btn-primary">
                  Go to Developer Portal
                </Link>
                <Link href="/docs" className="btn-secondary bg-transparent text-white border-gray-600 hover:bg-gray-800">
                  Back to Docs Hub
                </Link>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary-500 flex items-center justify-center">
                <span className="text-white font-bold text-xs">H</span>
              </div>
              <span className="text-sm font-semibold text-gray-700">HumanID</span>
            </div>
            <div className="flex gap-6 text-sm text-gray-400">
              <Link href="/docs" className="hover:text-gray-600">Docs</Link>
              <Link href="/about" className="hover:text-gray-600">About</Link>
              <Link href="/developer" className="hover:text-gray-600">Developer Portal</Link>
              <Link href="/docs/consumers" className="hover:text-gray-600">Consumer Guide</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
