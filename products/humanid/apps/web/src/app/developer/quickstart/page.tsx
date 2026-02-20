"use client";

import { useState } from "react";
import Link from "next/link";

interface Step {
  number: number;
  title: string;
  description: string;
  code: string;
  note?: string;
}

const STEPS: Step[] = [
  {
    number: 1,
    title: "Install the SDK",
    description: "Add the HumanID SDK to your project using npm, yarn, or pnpm.",
    code: `# npm
npm install @humanid/sdk

# yarn
yarn add @humanid/sdk

# pnpm
pnpm add @humanid/sdk`,
    note: "Requires Node.js 18+ or a modern browser environment.",
  },
  {
    number: 2,
    title: "Create an Account",
    description: "Register for a HumanID account to get access to the platform.",
    code: `import { HumanID } from '@humanid/sdk';

const client = new HumanID({
  apiKey: process.env.HUMANID_API_KEY,
  environment: 'sandbox', // or 'production'
});

// Create a user account
const account = await client.auth.register({
  email: 'user@example.com',
  password: 'SecurePassword123!',
});

console.log('Account created:', account.userId);`,
  },
  {
    number: 3,
    title: "Get an API Key",
    description:
      "Generate an API key from the Developer Portal to authenticate server-side requests.",
    code: `// After logging in, create an API key via the portal
// or programmatically:

const apiKey = await client.developer.createKey({
  name: 'My Production App',
  environment: 'sandbox',
});

// Store securely — the full key is only shown once
console.log('API key:', apiKey.key);
console.log('Prefix:', apiKey.prefix);`,
    note:
      "Store your API key in environment variables. Never commit it to source control.",
  },
  {
    number: 4,
    title: "Create a DID",
    description:
      "A Decentralised Identifier (DID) is the foundation of your identity on HumanID.",
    code: `const did = await client.dids.create({
  method: 'key', // or 'web'
});

console.log('DID:', did.did);
// => did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuias8siQSrzBk...

console.log('Public key:', did.publicKey);
console.log('Status:', did.status); // => ACTIVE`,
  },
  {
    number: 5,
    title: "Issue a Credential",
    description:
      "Issue a verifiable credential to a holder's DID. Credentials are cryptographically signed.",
    code: `const credential = await client.credentials.issue({
  holderDid: did.did,
  credentialType: 'IdentityCredential',
  claims: {
    givenName: 'Alice',
    familyName: 'Smith',
    dateOfBirth: '1990-01-15',
    nationality: 'GB',
  },
  expiresInDays: 365,
});

console.log('Credential ID:', credential.id);
console.log('Status:', credential.status); // => OFFERED

// The holder accepts the credential
await client.wallet.acceptCredential(credential.id);`,
  },
  {
    number: 6,
    title: "Verify a Credential",
    description:
      "Verify the authenticity and validity of a credential — checking signature, trust, revocation, and expiry.",
    code: `const result = await client.verify.credential({
  credentialId: credential.id,
});

console.log('Verified:', result.verified); // => true
console.log('Checks:', result.checks);
// {
//   signature: true,
//   issuerTrust: true,
//   revocation: true,
//   expiry: true,
// }

if (result.verified) {
  console.log('Credential is valid and trusted');
} else {
  console.error('Verification failed:', result.errors);
}`,
  },
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="relative group">
      <pre className="bg-gray-900 text-green-400 rounded-xl p-5 text-sm font-mono overflow-x-auto whitespace-pre leading-relaxed">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-400 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors opacity-0 group-hover:opacity-100"
        aria-label="Copy code to clipboard"
      >
        {copied ? (
          <>
            <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            Copied
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
            </svg>
            Copy
          </>
        )}
      </button>
    </div>
  );
}

export default function QuickstartPage() {
  const [activeStep, setActiveStep] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link
              href="/developer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors no-underline"
              aria-label="Back to Developer Portal"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Developer Portal
            </Link>
            <span className="text-gray-300" aria-hidden="true">/</span>
            <span className="text-sm font-medium text-gray-900">Quickstart</span>
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

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero section */}
        <div className="mb-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-50 border border-primary-100 text-xs font-medium text-primary-700 mb-4">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
            Get started in under 5 minutes
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Quickstart Guide</h1>
          <p className="text-gray-600">
            Follow these steps to integrate HumanID into your application. Issue your first
            verifiable credential and verify it end-to-end using the{" "}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-gray-800">@humanid/sdk</code>.
          </p>
        </div>

        <div className="flex gap-8">
          {/* Sticky step nav (desktop) */}
          <aside className="hidden lg:block w-48 shrink-0">
            <div className="sticky top-24">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Steps</p>
              <nav aria-label="Quickstart steps">
                {STEPS.map((step) => (
                  <button
                    key={step.number}
                    type="button"
                    onClick={() => {
                      const el = document.getElementById(`step-${step.number}`);
                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm mb-1 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                  >
                    <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {step.number}
                    </span>
                    <span className="truncate">{step.title}</span>
                  </button>
                ))}
              </nav>
              <div className="mt-6 pt-6 border-t border-gray-200 space-y-2">
                <Link
                  href="/developer/docs"
                  className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-600 hover:text-primary-600 transition-colors no-underline"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                  </svg>
                  Full API Docs
                </Link>
                <Link
                  href="/developer/sandbox"
                  className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-600 hover:text-primary-600 transition-colors no-underline"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 1-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                  </svg>
                  Sandbox
                </Link>
              </div>
            </div>
          </aside>

          {/* Steps content */}
          <div className="flex-1 min-w-0 space-y-6">
            {STEPS.map((step, idx) => {
              const isActive = activeStep === step.number;
              const isLast = idx === STEPS.length - 1;

              return (
                <div key={step.number} className="relative" id={`step-${step.number}`}>
                  {/* Connector line */}
                  {!isLast && (
                    <div
                      className="absolute left-5 top-12 bottom-0 w-0.5 bg-gray-200"
                      style={{ marginBottom: "-1.5rem" }}
                      aria-hidden="true"
                    />
                  )}

                  <div className="card hover:shadow-md transition-shadow">
                    <button
                      type="button"
                      onClick={() => setActiveStep(isActive ? null : step.number)}
                      className="w-full text-left"
                      aria-expanded={isActive}
                      aria-controls={`step-content-${step.number}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center shrink-0 shadow-sm">
                          <span className="text-white font-bold text-sm">{step.number}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h2 className="text-base font-semibold text-gray-900">{step.title}</h2>
                          <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{step.description}</p>
                        </div>
                        <svg
                          className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${isActive ? "rotate-180" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </div>
                    </button>

                    <div
                      id={`step-content-${step.number}`}
                      className={`mt-4 ${isActive ? "block" : "hidden"}`}
                    >
                      <p className="text-sm text-gray-600 mb-4">{step.description}</p>
                      <CodeBlock code={step.code} />
                      {step.note && (
                        <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                          </svg>
                          {step.note}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Expand all / Show full example */}
            <div className="card bg-gradient-to-br from-primary-50 to-blue-50 border-primary-100">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary-500 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-gray-900 mb-1">
                    You&rsquo;re ready to build
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">
                    That&rsquo;s the full integration flow. Explore the full API reference for advanced
                    features like presentation exchange, revocation lists, and OIDC configuration.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href="/developer/docs"
                      className="btn-primary text-sm no-underline"
                    >
                      Explore API Docs
                    </Link>
                    <Link
                      href="/developer/sandbox"
                      className="btn-secondary text-sm no-underline"
                    >
                      Test in Sandbox
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Full end-to-end example */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-1">
                Complete end-to-end example
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Copy the full integration script below to get started immediately.
              </p>
              <CodeBlock
                code={`import { HumanID } from '@humanid/sdk';

// Initialize the client
const client = new HumanID({
  apiKey: process.env.HUMANID_API_KEY,
  environment: 'sandbox',
});

async function main() {
  // Step 1: Create a DID
  const did = await client.dids.create({ method: 'key' });
  console.log('DID:', did.did);

  // Step 2: Issue a credential
  const credential = await client.credentials.issue({
    holderDid: did.did,
    credentialType: 'IdentityCredential',
    claims: {
      givenName: 'Alice',
      familyName: 'Smith',
      dateOfBirth: '1990-01-15',
    },
    expiresInDays: 365,
  });
  console.log('Credential:', credential.id);

  // Step 3: Accept the credential (as the holder)
  await client.wallet.acceptCredential(credential.id);

  // Step 4: Verify the credential
  const result = await client.verify.credential({
    credentialId: credential.id,
  });

  if (result.verified) {
    console.log('Identity verified successfully');
    console.log('Checks passed:', result.checks);
  } else {
    console.error('Verification failed');
  }
}

main().catch(console.error);`}
              />
            </div>
          </div>
        </div>
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
