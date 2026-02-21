import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Consumer Guide — HumanID Docs",
  description:
    "Learn how to use your HumanID wallet to manage digital credentials, share them selectively, and protect your privacy.",
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
            <Link href="/register" className="btn-primary text-sm">Get Your Wallet</Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const sections = [
  { id: "getting-started", label: "Getting Started" },
  { id: "managing-credentials", label: "Managing Credentials" },
  { id: "sharing-credentials", label: "Sharing Credentials" },
  { id: "privacy-security", label: "Privacy & Security" },
  { id: "account-security", label: "Account Security" },
  { id: "faq", label: "FAQ" },
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
            <Link href="/developer" className="block text-sm text-gray-600 hover:text-primary-500 py-1 hover:underline">
              Developer Docs
            </Link>
            <Link href="/docs/organizations" className="block text-sm text-gray-600 hover:text-primary-500 py-1 hover:underline">
              Organization Guide
            </Link>
          </nav>
        </div>
      </div>
    </aside>
  );
}

// ─── Content Sections ─────────────────────────────────────────────────────────

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

// ─── FAQ Item ─────────────────────────────────────────────────────────────────

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-5 mb-4">
      <p className="font-semibold text-gray-900 mb-2">{question}</p>
      <p className="text-gray-600 text-sm leading-relaxed">{answer}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConsumerGuidePage() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />

      {/* Breadcrumb */}
      <div className="border-b border-gray-100 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <nav className="text-sm text-gray-500" aria-label="Breadcrumb">
            <Link href="/docs" className="hover:text-primary-500">Docs</Link>
            <span className="mx-2">›</span>
            <span className="text-gray-900 font-medium">Consumer Guide</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex gap-12">
          <Sidebar />

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {/* Hero */}
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 bg-primary-50 text-primary-500 text-xs font-semibold px-3 py-1 rounded-full mb-4">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
                Consumer Guide
              </div>
              <h1 className="text-4xl font-bold text-gray-900 mb-4">
                Your HumanID Wallet
              </h1>
              <p className="text-xl text-gray-500 leading-relaxed max-w-2xl">
                Everything you need to know about managing your digital identity, storing
                credentials, and sharing them selectively — with full privacy control.
              </p>
            </div>

            {/* Getting Started */}
            <SectionHeading id="getting-started">Getting Started</SectionHeading>
            <Para>
              HumanID gives you a personal digital wallet for your identity credentials. Think of it
              like a physical wallet — but instead of holding plastic cards, it holds cryptographically
              signed digital credentials that can&apos;t be forged, can&apos;t be tampered with, and
              can only be shared with your explicit consent.
            </Para>
            <Para>
              Your wallet is built on <strong>W3C Decentralized Identifiers (DIDs)</strong> — a
              global open standard for self-sovereign identity. This means your identity is controlled
              by you, not by HumanID, not by any government, and not by any company.
            </Para>
            <SubHeading>Creating your wallet</SubHeading>
            <StepList
              steps={[
                {
                  title: "Register an account",
                  body: "Visit humanid.app/register and enter your email address. You'll receive a verification email — click the link to activate your account.",
                },
                {
                  title: "Set up passkey authentication",
                  body: "On first login, you'll be prompted to create a passkey using your device's biometrics (Face ID, Touch ID, or Windows Hello). This is your primary authentication method — no password required.",
                },
                {
                  title: "Your first DID is created",
                  body: "Immediately after setup, HumanID automatically creates your first Decentralized Identifier (DID). This is your unique, cryptographically verifiable identifier on the internet.",
                },
                {
                  title: "Request or receive credentials",
                  body: "Contact a trusted issuer (your university, employer, or government) to issue credentials to your DID. Some issuers have direct HumanID integrations and will issue automatically.",
                },
              ]}
            />
            <InfoBox>
              <strong>What is a DID?</strong> A Decentralized Identifier looks like
              &ldquo;did:web:example.com&rdquo; or &ldquo;did:key:z6Mk...&rdquo;. It&apos;s a
              globally unique identifier that you control — similar to a username, but backed by
              cryptography rather than a central registry. You can have multiple DIDs for different
              contexts (personal, professional, pseudonymous).
            </InfoBox>

            {/* Managing Credentials */}
            <SectionHeading id="managing-credentials">Managing Credentials</SectionHeading>
            <Para>
              Verifiable Credentials (VCs) are the digital equivalent of certificates, ID cards, and
              licenses. They are cryptographically signed by a trusted issuer and stored in your
              wallet. Because they&apos;re signed, anyone can verify their authenticity
              instantly — without contacting the issuer.
            </Para>
            <SubHeading>Types of credentials</SubHeading>
            <Para>
              Common credential types you might hold in your HumanID wallet include: university
              degrees and transcripts, professional certifications, government-issued ID documents,
              health records and vaccination certificates, employment verification letters, and
              age proofs. Each credential specifies exactly which claims it contains — for example,
              a university degree credential contains your name, institution, degree title, and
              graduation date.
            </Para>
            <SubHeading>Receiving a credential</SubHeading>
            <Para>
              When an issuer sends you a credential, it appears in your wallet&apos;s inbox. You
              must explicitly <strong>accept</strong> each credential before it is stored in your
              wallet. Accepting means you acknowledge the claims it contains. You can always
              reject a credential if it contains incorrect information — contact the issuer to
              request a corrected version.
            </Para>
            <SubHeading>Credential expiry and revocation</SubHeading>
            <Para>
              Credentials can have an expiry date set by the issuer (for example, a professional
              license that must be renewed annually). Your wallet shows a badge when a credential
              is approaching expiry. Issuers can also revoke credentials — for example, if your
              employment ends. Revoked credentials remain visible in your wallet history but are
              marked as revoked, and verifiers will see them as invalid.
            </Para>

            {/* Sharing Credentials */}
            <SectionHeading id="sharing-credentials">Sharing Credentials</SectionHeading>
            <Para>
              The most powerful feature of HumanID is <strong>selective disclosure</strong>. When you
              share a credential, you can choose to reveal only the specific claims that the verifier
              needs — nothing more. You never have to hand over an entire document.
            </Para>
            <SubHeading>Selective disclosure</SubHeading>
            <Para>
              For example, if a bar needs to verify you are over 18, you can share an &ldquo;Age
              ≥ 18&rdquo; proof derived from your government ID credential — without revealing your
              actual birthdate, your name, or any other information. This is called a
              zero-knowledge proof, and it is mathematically guaranteed: the verifier learns only
              the fact (you are over 18), not the underlying data.
            </Para>
            <SubHeading>How to share a credential</SubHeading>
            <StepList
              steps={[
                {
                  title: "Navigate to the credential",
                  body: "Open your wallet and find the credential you want to share from the Credentials tab.",
                },
                {
                  title: "Choose what to disclose",
                  body: "Select which claims within the credential to include in the presentation. Un-check claims you prefer to keep private.",
                },
                {
                  title: "Set an expiry (optional)",
                  body: "You can limit how long the verifier can use your presentation — for example, 1 hour for a one-time verification or 30 days for a recurring service.",
                },
                {
                  title: "Share via QR code or link",
                  body: "HumanID generates a signed Verifiable Presentation. Share it as a QR code (for in-person), a link (for online), or via an API callback (for automated systems).",
                },
              ]}
            />
            <SubHeading>Reviewing your sharing history</SubHeading>
            <Para>
              Every sharing event is recorded in your{" "}
              <Link href="/wallet/sharing" className="text-primary-500 hover:underline">
                Sharing History
              </Link>
              . You can see exactly who received your credentials, which claims were disclosed, when
              the sharing occurred, and whether the session is still active. You can revoke any
              active sharing session at any time — the verifier&apos;s access is immediately
              invalidated.
            </Para>

            {/* Privacy & Security */}
            <SectionHeading id="privacy-security">Privacy &amp; Security</SectionHeading>
            <Para>
              Privacy is not an afterthought at HumanID — it is designed into every layer of the
              system. Here is what you can rely on:
            </Para>
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              {[
                {
                  title: "HumanID never sees your credential data",
                  body: "Your credentials are end-to-end encrypted in your wallet. HumanID stores only encrypted blobs — we cannot read the contents of your credentials.",
                },
                {
                  title: "No tracking of your presentations",
                  body: "HumanID does not log who you share credentials with or what verifiers you interact with. Your sharing activity stays between you and the verifier.",
                },
                {
                  title: "Zero-knowledge proofs",
                  body: "For supported credential types, you can prove facts (age ≥ 18, income > threshold) without revealing the underlying values — mathematically guaranteed privacy.",
                },
                {
                  title: "You own your keys",
                  body: "Your DID private keys are generated on your device and encrypted with your passkey. HumanID never has access to your private keys. Losing your device is handled via recovery codes.",
                },
                {
                  title: "Data minimization",
                  body: "We only collect the minimum data required to operate the service. We do not sell, rent, or share your personal data with third parties for advertising.",
                },
                {
                  title: "Right to erasure",
                  body: "You can delete your account and all associated data at any time from your security settings. Deletion is permanent and irreversible.",
                },
              ].map((item) => (
                <div key={item.title} className="card">
                  <p className="font-semibold text-gray-900 mb-1 text-sm">{item.title}</p>
                  <p className="text-gray-500 text-sm leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>

            {/* Account Security */}
            <SectionHeading id="account-security">Account Security</SectionHeading>
            <Para>
              Your HumanID account uses modern security practices that eliminate the need for
              passwords. Here is how your account is protected.
            </Para>
            <SubHeading>Passkey authentication (WebAuthn)</SubHeading>
            <Para>
              HumanID uses <strong>passkeys</strong> — the industry&apos;s strongest authentication
              standard (FIDO2/WebAuthn). A passkey is a cryptographic key pair stored securely in
              your device&apos;s hardware security module. Authentication requires both your device
              and your biometric (face or fingerprint). There is no password to phish, no SMS code
              to intercept, and no server-side password database to breach.
            </Para>
            <SubHeading>Recovery</SubHeading>
            <Para>
              When you set up your account, HumanID generates a set of recovery codes. Store these
              in a safe place — they are the only way to recover access if you lose all your devices.
              Recovery codes are one-time-use and regenerate after use. You can also add a second
              device as a trusted backup authenticator from your{" "}
              <Link href="/wallet/security" className="text-primary-500 hover:underline">
                Security Settings
              </Link>
              .
            </Para>
            <SubHeading>Session management</SubHeading>
            <Para>
              You can view all active sessions from the Security tab in your wallet. Each session
              shows the device type, location, and last active time. You can revoke any session
              remotely — useful if you lose a device or notice unfamiliar access.
            </Para>

            {/* FAQ */}
            <SectionHeading id="faq">Frequently Asked Questions</SectionHeading>
            <FaqItem
              question="Is my personal data stored on HumanID's servers?"
              answer="Your credential contents are end-to-end encrypted. HumanID's servers store encrypted blobs that we cannot read. Your DID private keys are generated on your device and never leave your hardware security module."
            />
            <FaqItem
              question="Who can revoke my credentials?"
              answer="Only the original issuer can revoke a credential — for example, a university can revoke a degree credential if it was issued in error. HumanID does not have the ability to revoke credentials on an issuer's behalf. You can always delete a credential from your wallet locally, though it remains technically valid for verifiers unless the issuer revokes it."
            />
            <FaqItem
              question="How is HumanID different from a password manager?"
              answer="A password manager stores passwords for websites. HumanID stores cryptographically verifiable credentials about who you are — your qualifications, identity attributes, and professional certifications. Credentials cannot be forged or tampered with because they are signed by trusted issuers using public-key cryptography."
            />
            <FaqItem
              question="Can I use HumanID without a smartphone?"
              answer="Yes. HumanID is accessible via web browser on any device. While native apps provide the best experience for biometric authentication, you can use security keys (YubiKey, etc.) as a passkey on desktop browsers."
            />
            <FaqItem
              question="What happens if I delete my account?"
              answer="Deleting your account permanently removes all your data from HumanID's servers, including your encrypted credential store, DID records, and activity logs. This action cannot be undone. Your DIDs will no longer resolve, but credentials already issued to them remain on the issuer's systems — contact issuers directly if you need credentials reissued to a new identity."
            />
            <FaqItem
              question="Are my credentials accepted internationally?"
              answer="HumanID uses the W3C Verifiable Credentials standard and OpenID4VC — the same standards adopted by the EU Digital Identity Wallet (eIDAS 2.0), NIST guidelines, and major international identity frameworks. Acceptance depends on whether the verifier has integrated support for these standards."
            />

            {/* CTA */}
            <div className="mt-16 bg-primary-50 rounded-2xl p-8 text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Ready to get started?</h2>
              <p className="text-gray-500 mb-6">
                Create your wallet in under 2 minutes. No credit card, no password.
              </p>
              <Link href="/register" className="btn-primary">
                Create your free wallet
              </Link>
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
              <Link href="/security" className="hover:text-gray-600">Security</Link>
              <Link href="/docs/organizations" className="hover:text-gray-600">Organizations</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
