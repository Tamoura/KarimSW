"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Credential data
// ---------------------------------------------------------------------------

const credentials = [
  {
    id: "university",
    accentFrom: "from-primary-400",
    accentTo: "to-cyan-400",
    glowColor: "from-primary-500 to-cyan-500",
    type: "University Degree",
    fields: [
      { label: "Holder", value: "Lena Müller" },
      { label: "Degree", value: "MSc Computer Science" },
      { label: "Institution", value: "Technical University of Berlin" },
      { label: "Issued", value: "2024-07-20" },
    ],
    did: "did:web:tu.berlin",
    issuer: "TU Berlin",
  },
  {
    id: "government-id",
    accentFrom: "from-emerald-400",
    accentTo: "to-teal-400",
    glowColor: "from-emerald-500 to-teal-500",
    type: "National Identity",
    fields: [
      { label: "Holder", value: "Wei Tanaka" },
      { label: "ID Number", value: "S8901234•-•" },
      { label: "Nationality", value: "Singapore" },
      { label: "Expires", value: "2031-05-18" },
    ],
    did: "did:web:ica.gov.sg",
    issuer: "Immigration & Checkpoints Authority",
  },
  {
    id: "health",
    accentFrom: "from-rose-400",
    accentTo: "to-pink-400",
    glowColor: "from-rose-500 to-pink-500",
    type: "Health Certificate",
    fields: [
      { label: "Holder", value: "Amara Osei" },
      { label: "Certificate", value: "Vaccination Record" },
      { label: "Issuer", value: "NHS England" },
      { label: "Issued", value: "2024-02-14" },
    ],
    did: "did:web:nhs.uk",
    issuer: "NHS England",
  },
  {
    id: "professional",
    accentFrom: "from-violet-400",
    accentTo: "to-purple-400",
    glowColor: "from-violet-500 to-purple-500",
    type: "Professional License",
    fields: [
      { label: "Holder", value: "Dr. Sofia Reyes" },
      { label: "License", value: "Medical Practitioner" },
      { label: "Specialty", value: "Cardiology" },
      { label: "Expires", value: "2027-03-31" },
    ],
    did: "did:web:cofepris.gob.mx",
    issuer: "COFEPRIS — Mexico",
  },
  {
    id: "employment",
    accentFrom: "from-amber-400",
    accentTo: "to-orange-400",
    glowColor: "from-amber-500 to-orange-500",
    type: "Employment Verification",
    fields: [
      { label: "Holder", value: "James Okafor" },
      { label: "Title", value: "Lead Data Engineer" },
      { label: "Employer", value: "Zenith Analytics" },
      { label: "Start Date", value: "2023-01-16" },
    ],
    did: "did:web:zenithanalytics.io",
    issuer: "Zenith Analytics",
  },
  {
    id: "age-proof",
    accentFrom: "from-sky-400",
    accentTo: "to-indigo-400",
    glowColor: "from-sky-500 to-indigo-500",
    type: "Age Proof (ZKP)",
    fields: [
      { label: "Holder", value: "Anonymous" },
      { label: "Claim", value: "Age ≥ 18 ✓" },
      { label: "Method", value: "Zero-Knowledge Proof" },
      { label: "Reveals", value: "Nothing else" },
    ],
    did: "did:key:z6Mk••••••••",
    issuer: "Self-proved",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CredentialCarousel() {
  const [active, setActive] = useState(0);
  const [fading, setFading] = useState(false);

  // Auto-advance every 3.5 s.
  // Uses the functional updater (prev => ...) so the interval never captures
  // a stale `active` value — React always supplies the current state.
  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setActive((prev) => (prev + 1) % credentials.length);
        setFading(false);
      }, 250);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  function handleDotClick(i: number) {
    if (i === active) return;
    setFading(true);
    setTimeout(() => {
      setActive(i);
      setFading(false);
    }, 250);
  }

  const cred = credentials[active];

  return (
    <div className="flex flex-col items-center gap-4" aria-label="Credential examples carousel">
      {/* Card */}
      <div className="relative w-80">
        {/* Glow */}
        <div
          className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${cred.glowColor} opacity-20 blur-xl scale-105 transition-all duration-700`}
        />

        {/* Card shell */}
        <div
          className={`relative bg-gray-800 rounded-2xl overflow-hidden border border-gray-700 shadow-2xl transition-opacity duration-250 ${fading ? "opacity-0" : "opacity-100"}`}
          style={{ transition: "opacity 0.25s ease" }}
        >
          {/* Top accent bar */}
          <div className={`h-1.5 w-full bg-gradient-to-r ${cred.accentFrom} ${cred.accentTo}`} />

          {/* Header */}
          <div className="px-6 pt-5 pb-4 flex items-center justify-between border-b border-gray-700">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary-500 flex items-center justify-center">
                <span className="text-white font-bold text-xs">H</span>
              </div>
              <span className="text-white text-sm font-semibold">HumanID</span>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-success-500/10 text-success-400 border border-success-500/20 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-success-400 inline-block" />
              Verified
            </span>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Credential Type</p>
              <p className="text-white font-semibold text-base">{cred.type}</p>
            </div>
            {cred.fields.map((field) => (
              <div key={field.label}>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-0.5">{field.label}</p>
                <p className="text-gray-300 text-sm">{field.value}</p>
              </div>
            ))}
            <div className="pt-1">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-0.5">Issuer DID</p>
              <p className="text-gray-400 text-xs font-mono break-all">{cred.did}</p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-5">
            <div className="h-px w-full bg-gray-700 mb-4" />
            <div className="flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success-400 shadow-[0_0_6px_2px_rgba(81,207,102,0.5)]" />
              <span className="text-success-400 text-sm font-semibold tracking-wide">Valid</span>
              <span className="w-2 h-2 rounded-full bg-success-400 shadow-[0_0_6px_2px_rgba(81,207,102,0.5)]" />
            </div>
          </div>
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex items-center gap-2" role="tablist" aria-label="Select credential">
        {credentials.map((c, i) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={i === active}
            aria-label={c.type}
            onClick={() => handleDotClick(i)}
            className={`rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
              i === active
                ? "w-6 h-2 bg-white"
                : "w-2 h-2 bg-gray-600 hover:bg-gray-400"
            }`}
          />
        ))}
      </div>

      {/* Current type label */}
      <p className="text-xs text-gray-500 tracking-wide">{cred.type}</p>
    </div>
  );
}
