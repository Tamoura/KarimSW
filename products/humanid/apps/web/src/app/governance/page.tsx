"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE = "http://localhost:5013/api/v1";

type ProposalStatus = "ACTIVE" | "PASSED" | "REJECTED" | "EXPIRED";
type ProposalCategory = "protocol" | "parameter" | "policy" | "treasury";

interface Proposal {
  id: string;
  title: string;
  description: string;
  category: ProposalCategory;
  status: ProposalStatus;
  votingDurationHours: number;
  quorum: number;
  createdAt: string;
  expiresAt?: string;
}

interface ProposalResults {
  proposalId: string;
  forVotes: number;
  againstVotes: number;
  totalVotes: number;
  approvalPct: number;
  quorumReached: boolean;
}

interface GovernanceParams {
  minQuorum?: number;
  defaultVotingDurationHours?: number;
  [key: string]: unknown;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
      <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-8.25a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      <p className="text-xs text-red-700">{message}</p>
    </div>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div role="status" className="mb-4 flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2.5">
      <svg className="w-4 h-4 text-green-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
      <p className="text-xs text-green-700">{message}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: ProposalStatus }) {
  const styles: Record<ProposalStatus, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    PASSED: "bg-blue-100 text-blue-700",
    REJECTED: "bg-red-100 text-red-800",
    EXPIRED: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function CategoryBadge({ category }: { category: ProposalCategory }) {
  const styles: Record<ProposalCategory, string> = {
    protocol: "bg-purple-100 text-purple-700",
    parameter: "bg-blue-100 text-blue-700",
    policy: "bg-amber-100 text-amber-800",
    treasury: "bg-green-100 text-green-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${styles[category]}`}>
      {category}
    </span>
  );
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function GovernancePage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [govParams, setGovParams] = useState<GovernanceParams | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create proposal form
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createCategory, setCreateCategory] = useState<ProposalCategory>("protocol");
  const [createVotingDuration, setCreateVotingDuration] = useState("24");
  const [createQuorum, setCreateQuorum] = useState("10");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Vote panel
  const [voteProposal, setVoteProposal] = useState<Proposal | null>(null);
  const [voteChoice, setVoteChoice] = useState<"for" | "against">("for");
  const [voteReason, setVoteReason] = useState("");
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voteSuccess, setVoteSuccess] = useState<string | null>(null);

  // Results panel
  const [resultsProposalId, setResultsProposalId] = useState<string | null>(null);
  const [resultsData, setResultsData] = useState<ProposalResults | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    router.push("/login");
  }, [router]);

  const fetchData = useCallback(async (token: string) => {
    const headers = { Authorization: `Bearer ${token}` };
    const [proposalsRes, paramsRes] = await Promise.all([
      fetch(`${API_BASE}/governance/proposals`, { headers }),
      fetch(`${API_BASE}/governance/params`, { headers }),
    ]);

    if (proposalsRes.status === 401 || paramsRes.status === 401) {
      handleUnauthorized();
      return;
    }
    if (!proposalsRes.ok) throw new Error("Failed to load proposals.");
    if (!paramsRes.ok) throw new Error("Failed to load governance params.");

    const proposalsData = await proposalsRes.json();
    const paramsData = await paramsRes.json();

    setProposals(proposalsData.proposals ?? proposalsData ?? []);
    setGovParams(paramsData.params ?? paramsData ?? null);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const storedEmail = localStorage.getItem("user_email");
    if (!token) { router.push("/login"); return; }
    setEmail(storedEmail ?? "");
    fetchData(token)
      .catch(() => setError("Could not load governance data. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchData]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }
    if (!createTitle.trim()) { setCreateError("Title is required."); return; }
    if (!createDescription.trim()) { setCreateError("Description is required."); return; }

    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/governance/proposals`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: createTitle.trim(),
          description: createDescription.trim(),
          category: createCategory,
          votingDurationHours: Number(createVotingDuration),
          quorum: Number(createQuorum),
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to create proposal."
        );
        return;
      }

      const data = await res.json();
      const newProposal: Proposal = data.proposal ?? data;
      setProposals((prev) => [newProposal, ...prev]);
      setCreateSuccess(`Proposal "${newProposal.title}" created.`);
      setCreateTitle("");
      setCreateDescription("");
    } catch {
      setCreateError("Could not connect to the server.");
    } finally {
      setCreating(false);
    }
  }

  async function handleVote(e: React.FormEvent) {
    e.preventDefault();
    if (!voteProposal) return;
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    setVoting(true);
    setVoteError(null);
    setVoteSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/governance/proposals/${voteProposal.id}/vote`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vote: voteChoice,
          reason: voteReason.trim() || undefined,
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setVoteError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to submit vote."
        );
        return;
      }

      setVoteSuccess(`Vote "${voteChoice}" submitted for "${voteProposal.title}".`);
      setVoteProposal(null);
      setVoteReason("");
    } catch {
      setVoteError("Could not connect to the server.");
    } finally {
      setVoting(false);
    }
  }

  async function handleLoadResults(proposalId: string) {
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    if (resultsProposalId === proposalId) {
      setResultsProposalId(null);
      setResultsData(null);
      return;
    }

    setLoadingResults(true);
    setResultsError(null);
    setResultsData(null);

    try {
      const res = await fetch(`${API_BASE}/governance/proposals/${proposalId}/results`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setResultsError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to load results."
        );
        return;
      }

      const data = await res.json();
      setResultsData(data.results ?? data);
      setResultsProposalId(proposalId);
    } catch {
      setResultsError("Could not connect to the server.");
    } finally {
      setLoadingResults(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 no-underline hover:no-underline">
                <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
                  <span className="text-white font-bold text-sm" aria-hidden="true">H</span>
                </div>
                <span className="font-bold text-gray-900 text-lg">HumanID</span>
              </Link>
              <span className="text-gray-300" aria-hidden="true">/</span>
              <span className="text-sm font-medium text-primary-600">Governance</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:block text-sm text-gray-500 truncate max-w-xs" title={email}>
                {email}
              </span>
              <button onClick={handleLogout} className="btn-secondary px-3 py-1.5 text-sm" type="button">
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Decentralized Governance</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create proposals, cast votes, and participate in protocol governance decisions.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading governance data">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading governance data&hellip;</p>
            </div>
          </div>
        )}

        {!loading && error && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-6">
            {/* Governance params */}
            {govParams && (
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-3">Governance Parameters</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {Object.entries(govParams).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-xs text-gray-500 capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Create proposal form */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Create Proposal</h2>
              {createSuccess && <SuccessBanner message={createSuccess} />}
              <form onSubmit={handleCreate} noValidate>
                {createError && <ErrorBanner message={createError} />}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className="sm:col-span-2">
                    <label htmlFor="prop-title" className="block text-xs font-medium text-gray-700 mb-1">
                      Title <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="prop-title"
                      type="text"
                      value={createTitle}
                      onChange={(e) => setCreateTitle(e.target.value)}
                      placeholder="Proposal title"
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="prop-category" className="block text-xs font-medium text-gray-700 mb-1">
                      Category <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <select
                      id="prop-category"
                      value={createCategory}
                      onChange={(e) => setCreateCategory(e.target.value as ProposalCategory)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="protocol">Protocol</option>
                      <option value="parameter">Parameter</option>
                      <option value="policy">Policy</option>
                      <option value="treasury">Treasury</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="prop-duration" className="block text-xs font-medium text-gray-700 mb-1">
                        Voting Duration (hours)
                      </label>
                      <input
                        id="prop-duration"
                        type="number"
                        min={1}
                        value={createVotingDuration}
                        onChange={(e) => setCreateVotingDuration(e.target.value)}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="prop-quorum" className="block text-xs font-medium text-gray-700 mb-1">
                        Quorum
                      </label>
                      <input
                        id="prop-quorum"
                        type="number"
                        min={1}
                        value={createQuorum}
                        onChange={(e) => setCreateQuorum(e.target.value)}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="prop-description" className="block text-xs font-medium text-gray-700 mb-1">
                      Description <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <textarea
                      id="prop-description"
                      value={createDescription}
                      onChange={(e) => setCreateDescription(e.target.value)}
                      placeholder="Describe the proposal in detail"
                      rows={4}
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                    />
                  </div>
                </div>
                <button type="submit" disabled={creating} className="btn-primary text-sm">
                  {creating ? (
                    <span className="flex items-center gap-2"><Spinner />Submitting&hellip;</span>
                  ) : (
                    "Create Proposal"
                  )}
                </button>
              </form>
            </div>

            {/* Vote panel */}
            {voteProposal && (
              <div className="card border-l-4 border-l-primary-500">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-900">
                    Vote on: <span className="text-primary-600">{voteProposal.title}</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => setVoteProposal(null)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Close vote panel"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {voteSuccess && <SuccessBanner message={voteSuccess} />}
                <form onSubmit={handleVote} noValidate>
                  {voteError && <ErrorBanner message={voteError} />}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <fieldset>
                        <legend className="block text-xs font-medium text-gray-700 mb-2">Your Vote</legend>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="vote-choice"
                              value="for"
                              checked={voteChoice === "for"}
                              onChange={() => setVoteChoice("for")}
                              className="text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-sm text-green-700 font-medium">For</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="vote-choice"
                              value="against"
                              checked={voteChoice === "against"}
                              onChange={() => setVoteChoice("against")}
                              className="text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-sm text-red-700 font-medium">Against</span>
                          </label>
                        </div>
                      </fieldset>
                    </div>
                    <div>
                      <label htmlFor="vote-reason" className="block text-xs font-medium text-gray-700 mb-1">
                        Reason (optional)
                      </label>
                      <input
                        id="vote-reason"
                        type="text"
                        value={voteReason}
                        onChange={(e) => setVoteReason(e.target.value)}
                        placeholder="Why are you voting this way?"
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={voting} className="btn-primary text-sm">
                    {voting ? (
                      <span className="flex items-center gap-2"><Spinner />Submitting vote&hellip;</span>
                    ) : (
                      "Submit Vote"
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* Results panel */}
            {resultsError && <ErrorBanner message={resultsError} />}
            {resultsData && resultsProposalId && (
              <div className="card border-l-4 border-l-blue-500">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold text-gray-900">Voting Results</h2>
                  <button
                    type="button"
                    onClick={() => { setResultsProposalId(null); setResultsData(null); }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Close results panel"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">For</p>
                    <p className="text-xl font-bold text-green-700">{resultsData.forVotes}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Against</p>
                    <p className="text-xl font-bold text-red-700">{resultsData.againstVotes}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Total</p>
                    <p className="text-xl font-bold text-gray-900">{resultsData.totalVotes}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Approval</p>
                    <p className="text-xl font-bold text-primary-600">{resultsData.approvalPct.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3" role="progressbar" aria-valuenow={resultsData.approvalPct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${resultsData.approvalPct}%` }} />
                </div>
                <p className={`text-xs font-medium ${resultsData.quorumReached ? "text-green-700" : "text-amber-700"}`}>
                  {resultsData.quorumReached ? "Quorum reached" : "Quorum not yet reached"}
                </p>
              </div>
            )}

            {/* Proposals table */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Proposals</h2>
              {proposals.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                  <p className="text-sm text-gray-500">No governance proposals yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200" role="table" aria-label="Governance proposals">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Title</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Category</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Quorum</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {proposals.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">{p.title}</p>
                            <p className="text-xs text-gray-500 truncate max-w-[200px]">{p.description}</p>
                          </td>
                          <td className="px-4 py-3">
                            <CategoryBadge category={p.category} />
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={p.status} />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">{p.quorum}</td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(p.createdAt)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {p.status === "ACTIVE" && (
                                <button
                                  type="button"
                                  onClick={() => { setVoteProposal(p); setVoteError(null); setVoteSuccess(null); }}
                                  className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 transition-colors"
                                  aria-label={`Vote on proposal ${p.title}`}
                                >
                                  Vote
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleLoadResults(p.id)}
                                disabled={loadingResults && resultsProposalId !== p.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-colors disabled:opacity-50"
                                aria-label={`View results for proposal ${p.title}`}
                              >
                                {loadingResults && resultsProposalId !== p.id ? <Spinner /> : null}
                                {resultsProposalId === p.id ? "Hide" : "Results"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
