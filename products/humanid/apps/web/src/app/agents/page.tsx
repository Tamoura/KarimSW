"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE = "http://localhost:5013/api/v1";

type AgentStatus = "ACTIVE" | "SUSPENDED" | "REVOKED";

interface Agent {
  id: string;
  name: string;
  description?: string;
  did?: string;
  capabilities: string[];
  status: AgentStatus;
  delegationCount: number;
  createdAt: string;
}

interface Delegation {
  id: string;
  agentId: string;
  permissions: string[];
  expiresAt?: string;
  createdAt: string;
  humanAuthorized: boolean;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const styles: Record<AgentStatus, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    SUSPENDED: "bg-amber-100 text-amber-800",
    REVOKED: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
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

export default function AgentsPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected agent detail
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loadingDelegations, setLoadingDelegations] = useState(false);

  // Register agent form
  const [agentName, setAgentName] = useState("");
  const [agentDesc, setAgentDesc] = useState("");
  const [agentDid, setAgentDid] = useState("");
  const [agentCapabilities, setAgentCapabilities] = useState("");
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

  // Delegation form
  const [delPermissions, setDelPermissions] = useState("");
  const [delExpiry, setDelExpiry] = useState("");
  const [delegating, setDelegating] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  const [delSuccess, setDelSuccess] = useState<string | null>(null);

  // Verify proof-of-human
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifySuccess, setVerifySuccess] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Suspend / Revoke
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    router.push("/login");
  }, [router]);

  const fetchAgents = useCallback(async (token: string) => {
    const res = await fetch(`${API_BASE}/agents`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error("Failed to load agents.");

    const data = await res.json();
    setAgents(data.agents ?? []);
  }, [handleUnauthorized]);

  const fetchDelegations = useCallback(async (token: string, agentId: string) => {
    setLoadingDelegations(true);
    try {
      const res = await fetch(`${API_BASE}/agents/${agentId}/delegations`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      const data = await res.json();
      setDelegations(data.delegations ?? []);
    } catch {
      setDelegations([]);
    } finally {
      setLoadingDelegations(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const storedEmail = localStorage.getItem("user_email");

    if (!token) { router.push("/login"); return; }

    setEmail(storedEmail ?? "");
    fetchAgents(token)
      .catch(() => setError("Could not load agent data. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchAgents]);

  function handleSelectAgent(agent: Agent) {
    setSelectedAgent(agent);
    setDelPermissions("");
    setDelExpiry("");
    setDelError(null);
    setDelSuccess(null);
    setActionError(null);
    setActionSuccess(null);
    setVerifySuccess(null);
    setVerifyError(null);

    const token = localStorage.getItem("access_token");
    if (token) fetchDelegations(token, agent.id);
  }

  async function handleRegisterAgent(e: React.FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    if (!agentName.trim()) { setRegError("Agent name is required."); return; }

    setRegistering(true);
    setRegError(null);
    setRegSuccess(null);

    try {
      const caps = agentCapabilities.split(",").map((c) => c.trim()).filter(Boolean);
      const res = await fetch(`${API_BASE}/agents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: agentName.trim(),
          description: agentDesc.trim() || undefined,
          did: agentDid.trim() || undefined,
          capabilities: caps,
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRegError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to register agent."
        );
        return;
      }

      const data = await res.json();
      const newAgent: Agent = data.agent ?? data;
      setAgents((prev) => [newAgent, ...prev]);
      setRegSuccess(`Agent "${newAgent.name}" registered successfully.`);
      setAgentName("");
      setAgentDesc("");
      setAgentDid("");
      setAgentCapabilities("");
    } catch {
      setRegError("Could not connect to the server.");
    } finally {
      setRegistering(false);
    }
  }

  async function handleCreateDelegation(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAgent) return;

    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    if (!delPermissions.trim()) { setDelError("Permissions are required."); return; }

    setDelegating(true);
    setDelError(null);
    setDelSuccess(null);

    try {
      const perms = delPermissions.split(",").map((p) => p.trim()).filter(Boolean);
      const res = await fetch(`${API_BASE}/agents/${selectedAgent.id}/delegations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          permissions: perms,
          expiresAt: delExpiry || undefined,
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDelError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to create delegation."
        );
        return;
      }

      const data = await res.json();
      const newDel: Delegation = data.delegation ?? data;
      setDelegations((prev) => [newDel, ...prev]);
      setAgents((prev) =>
        prev.map((a) => (a.id === selectedAgent.id ? { ...a, delegationCount: a.delegationCount + 1 } : a))
      );
      setDelSuccess("Delegation created successfully.");
      setDelPermissions("");
      setDelExpiry("");
    } catch {
      setDelError("Could not connect to the server.");
    } finally {
      setDelegating(false);
    }
  }

  async function handleVerifyProof(agentId: string) {
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    setVerifying(agentId);
    setVerifySuccess(null);
    setVerifyError(null);

    try {
      const res = await fetch(`${API_BASE}/agents/${agentId}/verify-human`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setVerifyError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Verification failed."
        );
        return;
      }

      setVerifySuccess("Proof of human authorization verified.");
    } catch {
      setVerifyError("Could not connect to the server.");
    } finally {
      setVerifying(null);
    }
  }

  async function handleAgentAction(agentId: string, action: "suspend" | "revoke") {
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    if (!window.confirm(`${action === "suspend" ? "Suspend" : "Revoke"} this agent?`)) return;

    setActionLoading(agentId);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/agents/${agentId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          `Failed to ${action} agent.`
        );
        return;
      }

      const newStatus: AgentStatus = action === "suspend" ? "SUSPENDED" : "REVOKED";
      setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, status: newStatus } : a)));
      if (selectedAgent?.id === agentId) {
        setSelectedAgent((prev) => prev ? { ...prev, status: newStatus } : prev);
      }
      setActionSuccess(`Agent ${action === "suspend" ? "suspended" : "revoked"} successfully.`);
    } catch {
      setActionError("Could not connect to the server.");
    } finally {
      setActionLoading(null);
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
      {/* Header */}
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
              <span className="text-sm font-medium text-primary-600">AI Agents</span>
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
          <h1 className="text-2xl font-bold text-gray-900">AI Agent Identity Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Register, manage, and delegate permissions for AI agents acting on behalf of humans.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading agents">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading agents&hellip;</p>
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: agent list + register form */}
            <div className="lg:col-span-1 space-y-6">
              {/* Register agent */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Register Agent</h2>
                {regSuccess && <SuccessBanner message={regSuccess} />}
                <form onSubmit={handleRegisterAgent} noValidate>
                  {regError && <ErrorBanner message={regError} />}
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="agent-name" className="block text-xs font-medium text-gray-700 mb-1">
                        Name <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="agent-name"
                        type="text"
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        placeholder="My AI Assistant"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="agent-desc" className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                      <textarea
                        id="agent-desc"
                        value={agentDesc}
                        onChange={(e) => setAgentDesc(e.target.value)}
                        placeholder="Optional description"
                        rows={2}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="agent-did" className="block text-xs font-medium text-gray-700 mb-1">DID (optional)</label>
                      <input
                        id="agent-did"
                        type="text"
                        value={agentDid}
                        onChange={(e) => setAgentDid(e.target.value)}
                        placeholder="did:example:..."
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="agent-caps" className="block text-xs font-medium text-gray-700 mb-1">
                        Capabilities (comma-separated)
                      </label>
                      <input
                        id="agent-caps"
                        type="text"
                        value={agentCapabilities}
                        onChange={(e) => setAgentCapabilities(e.target.value)}
                        placeholder="read:credentials, issue:credentials"
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <button type="submit" disabled={registering} className="btn-primary text-sm w-full">
                      {registering ? (
                        <span className="flex items-center justify-center gap-2"><Spinner />Registering&hellip;</span>
                      ) : (
                        "Register Agent"
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Agent list */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Agents ({agents.length})</h2>
                {agents.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6">No agents registered.</p>
                ) : (
                  <ul className="space-y-2" role="list">
                    {agents.map((agent) => (
                      <li key={agent.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectAgent(agent)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            selectedAgent?.id === agent.id
                              ? "border-primary-400 bg-primary-50"
                              : "border-gray-200 bg-white hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{agent.name}</p>
                              <p className="text-xs text-gray-500">{agent.delegationCount} delegation{agent.delegationCount !== 1 ? "s" : ""}</p>
                            </div>
                            <AgentStatusBadge status={agent.status} />
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Right: agent detail / delegation */}
            <div className="lg:col-span-2 space-y-6">
              {selectedAgent ? (
                <>
                  {/* Agent detail card */}
                  <div className="card">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base font-semibold text-gray-900">{selectedAgent.name}</h2>
                          <AgentStatusBadge status={selectedAgent.status} />
                        </div>
                        {selectedAgent.description && (
                          <p className="text-sm text-gray-500 mt-1">{selectedAgent.description}</p>
                        )}
                        {selectedAgent.did && (
                          <p className="text-xs font-mono text-gray-400 mt-1 truncate" title={selectedAgent.did}>
                            {selectedAgent.did}
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 shrink-0">Created {formatDate(selectedAgent.createdAt)}</p>
                    </div>

                    {selectedAgent.capabilities.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-medium text-gray-500 mb-2">Capabilities</p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedAgent.capabilities.map((cap) => (
                            <span key={cap} className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-mono">
                              {cap}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Verify + Actions */}
                    {verifySuccess && <SuccessBanner message={verifySuccess} />}
                    {verifyError && <ErrorBanner message={verifyError} />}
                    {actionSuccess && <SuccessBanner message={actionSuccess} />}
                    {actionError && <ErrorBanner message={actionError} />}

                    <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => handleVerifyProof(selectedAgent.id)}
                        disabled={verifying === selectedAgent.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors disabled:opacity-50"
                      >
                        {verifying === selectedAgent.id ? <Spinner /> : null}
                        Verify Proof-of-Human
                      </button>

                      {selectedAgent.status === "ACTIVE" && (
                        <button
                          type="button"
                          onClick={() => handleAgentAction(selectedAgent.id, "suspend")}
                          disabled={actionLoading === selectedAgent.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === selectedAgent.id ? <Spinner /> : null}
                          Suspend
                        </button>
                      )}

                      {selectedAgent.status !== "REVOKED" && (
                        <button
                          type="button"
                          onClick={() => handleAgentAction(selectedAgent.id, "revoke")}
                          disabled={actionLoading === selectedAgent.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === selectedAgent.id ? <Spinner /> : null}
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Create delegation */}
                  <div className="card">
                    <h2 className="text-base font-semibold text-gray-900 mb-4">Create Delegation</h2>
                    {delSuccess && <SuccessBanner message={delSuccess} />}
                    <form onSubmit={handleCreateDelegation} noValidate>
                      {delError && <ErrorBanner message={delError} />}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label htmlFor="del-permissions" className="block text-xs font-medium text-gray-700 mb-1">
                            Permissions (comma-separated) <span className="text-red-500" aria-hidden="true">*</span>
                          </label>
                          <input
                            id="del-permissions"
                            type="text"
                            value={delPermissions}
                            onChange={(e) => setDelPermissions(e.target.value)}
                            placeholder="read:wallet, present:credential"
                            required
                            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </div>
                        <div>
                          <label htmlFor="del-expiry" className="block text-xs font-medium text-gray-700 mb-1">
                            Expiry Date (optional)
                          </label>
                          <input
                            id="del-expiry"
                            type="datetime-local"
                            value={delExpiry}
                            onChange={(e) => setDelExpiry(e.target.value)}
                            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={delegating || selectedAgent.status !== "ACTIVE"}
                        className="btn-primary text-sm"
                      >
                        {delegating ? (
                          <span className="flex items-center gap-2"><Spinner />Creating&hellip;</span>
                        ) : (
                          "Create Delegation"
                        )}
                      </button>
                      {selectedAgent.status !== "ACTIVE" && (
                        <p className="text-xs text-amber-600 mt-2">Delegations can only be created for active agents.</p>
                      )}
                    </form>
                  </div>

                  {/* Delegations list */}
                  <div className="card">
                    <h2 className="text-base font-semibold text-gray-900 mb-4">Delegations</h2>
                    {loadingDelegations ? (
                      <div className="flex justify-center py-8" role="status">
                        <Spinner />
                      </div>
                    ) : delegations.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-6">No delegations yet.</p>
                    ) : (
                      <ul className="divide-y divide-gray-100" role="list">
                        {delegations.map((del) => (
                          <li key={del.id} className="py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap gap-1.5 mb-1">
                                  {del.permissions.map((p) => (
                                    <span key={p} className="inline-block px-2 py-0.5 rounded bg-primary-50 text-primary-700 text-xs font-mono">
                                      {p}
                                    </span>
                                  ))}
                                </div>
                                <p className="text-xs text-gray-500">
                                  Created {formatDate(del.createdAt)}
                                  {del.expiresAt && ` \u00b7 Expires ${formatDate(del.expiresAt)}`}
                                </p>
                              </div>
                              {del.humanAuthorized && (
                                <span className="shrink-0 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                                  Human Authorized
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : (
                <div className="card flex flex-col items-center justify-center py-20 text-center">
                  <svg className="w-12 h-12 text-gray-200 mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 1-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                  </svg>
                  <p className="text-sm text-gray-500">Select an agent to view details and manage delegations.</p>
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
