"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getAccessToken, setAccessToken } from "@/lib/api-client";

type ControlStatus = "NOT_STARTED" | "IN_PROGRESS" | "IMPLEMENTED" | "VERIFIED";
type Framework = "SOC2" | "ISO27001" | "GDPR";

interface ComplianceControl {
  id: string;
  framework: Framework;
  controlId: string;
  title: string;
  description?: string;
  status: ControlStatus;
  evidence?: string;
  updatedAt: string;
}

interface FrameworkSummary {
  framework: Framework;
  total: number;
  verified: number;
  implemented: number;
  inProgress: number;
  notStarted: number;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function StatusBadge({ status }: { status: ControlStatus }) {
  const styles: Record<ControlStatus, string> = {
    NOT_STARTED: "bg-gray-100 text-gray-600",
    IN_PROGRESS: "bg-amber-100 text-amber-800",
    IMPLEMENTED: "bg-blue-100 text-blue-700",
    VERIFIED: "bg-green-100 text-green-800",
  };
  const labels: Record<ControlStatus, string> = {
    NOT_STARTED: "Not Started",
    IN_PROGRESS: "In Progress",
    IMPLEMENTED: "Implemented",
    VERIFIED: "Verified",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function FrameworkBadge({ framework }: { framework: Framework }) {
  const styles: Record<Framework, string> = {
    SOC2: "bg-purple-100 text-purple-700",
    ISO27001: "bg-blue-100 text-blue-700",
    GDPR: "bg-green-100 text-green-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium ${styles[framework]}`}>
      {framework}
    </span>
  );
}

function formatDate(iso: string): string {
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

export default function CompliancePage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [controls, setControls] = useState<ComplianceControl[]>([]);
  const [summaries, setSummaries] = useState<FrameworkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [filterFramework, setFilterFramework] = useState<Framework | "">("");
  const [filterStatus, setFilterStatus] = useState<ControlStatus | "">("");

  // Create control form
  const [createFramework, setCreateFramework] = useState<Framework>("SOC2");
  const [createControlId, setCreateControlId] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Update status/evidence
  const [selectedControl, setSelectedControl] = useState<ComplianceControl | null>(null);
  const [updateStatus, setUpdateStatus] = useState<ControlStatus>("NOT_STARTED");
  const [updateEvidence, setUpdateEvidence] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchControls = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterFramework) params.set("framework", filterFramework);
    if (filterStatus) params.set("status", filterStatus);

    const res = await apiFetch(`/compliance/controls?${params.toString()}`);

    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error("Failed to load controls.");

    const data = await res.json();
    setControls(data.controls ?? []);
    setSummaries(data.summaries ?? []);
  }, [filterFramework, filterStatus, handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) { router.push("/login"); return; }

    setEmail("");
    fetchControls()
      .catch(() => setError("Could not load compliance data. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchControls]);

  async function handleCreateControl(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    if (!createControlId.trim()) { setCreateError("Control ID is required."); return; }
    if (!createTitle.trim()) { setCreateError("Title is required."); return; }

    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const res = await apiFetch(`/compliance/controls`, {
        method: "POST",
        body: JSON.stringify({
          framework: createFramework,
          controlId: createControlId.trim(),
          title: createTitle.trim(),
          description: createDescription.trim() || undefined,
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to create control."
        );
        return;
      }

      const data = await res.json();
      const newControl: ComplianceControl = data.control ?? data;
      setControls((prev) => [newControl, ...prev]);
      setCreateSuccess(`Control "${newControl.controlId}" created successfully.`);
      setCreateControlId("");
      setCreateTitle("");
      setCreateDescription("");
    } catch {
      setCreateError("Could not connect to the server.");
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateControl(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedControl) return;

    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    setUpdating(true);
    setUpdateError(null);
    setUpdateSuccess(null);

    try {
      const res = await apiFetch(`/compliance/controls/${selectedControl.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: updateStatus,
          evidence: updateEvidence.trim() || undefined,
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUpdateError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to update control."
        );
        return;
      }

      const data = await res.json();
      const updated: ComplianceControl = data.control ?? { ...selectedControl, status: updateStatus, evidence: updateEvidence };
      setControls((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setUpdateSuccess("Control updated successfully.");
      setSelectedControl(null);
    } catch {
      setUpdateError("Could not connect to the server.");
    } finally {
      setUpdating(false);
    }
  }

  function handleLogout() {
    setAccessToken(null);
    router.push("/login");
  }

  function openUpdatePanel(control: ComplianceControl) {
    setSelectedControl(control);
    setUpdateStatus(control.status);
    setUpdateEvidence(control.evidence ?? "");
    setUpdateError(null);
    setUpdateSuccess(null);
  }

  const filteredControls = controls.filter((c) => {
    if (filterFramework && c.framework !== filterFramework) return false;
    if (filterStatus && c.status !== filterStatus) return false;
    return true;
  });

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
              <span className="text-sm font-medium text-primary-600">Compliance</span>
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
          <h1 className="text-2xl font-bold text-gray-900">SOC 2 Compliance Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track and manage compliance controls across SOC 2, ISO 27001, and GDPR frameworks.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading compliance data">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading compliance data&hellip;</p>
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
            {/* Framework summary cards */}
            {summaries.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {summaries.map((s) => {
                  const pct = s.total > 0 ? Math.round(((s.verified + s.implemented) / s.total) * 100) : 0;
                  return (
                    <div key={s.framework} className="card">
                      <div className="flex items-center justify-between mb-3">
                        <FrameworkBadge framework={s.framework} />
                        <span className="text-lg font-bold text-gray-900">{pct}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full bg-primary-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
                        <span><span className="font-semibold text-green-700">{s.verified}</span> Verified</span>
                        <span><span className="font-semibold text-blue-700">{s.implemented}</span> Implemented</span>
                        <span><span className="font-semibold text-amber-700">{s.inProgress}</span> In Progress</span>
                        <span><span className="font-semibold text-gray-500">{s.notStarted}</span> Not Started</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Create control form */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Add Compliance Control</h2>
              {createSuccess && <SuccessBanner message={createSuccess} />}
              <form onSubmit={handleCreateControl} noValidate>
                {createError && <ErrorBanner message={createError} />}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label htmlFor="ctrl-framework" className="block text-xs font-medium text-gray-700 mb-1">
                      Framework <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <select
                      id="ctrl-framework"
                      value={createFramework}
                      onChange={(e) => setCreateFramework(e.target.value as Framework)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="SOC2">SOC 2</option>
                      <option value="ISO27001">ISO 27001</option>
                      <option value="GDPR">GDPR</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ctrl-id" className="block text-xs font-medium text-gray-700 mb-1">
                      Control ID <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="ctrl-id"
                      type="text"
                      value={createControlId}
                      onChange={(e) => setCreateControlId(e.target.value)}
                      placeholder="e.g. CC6.1"
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="ctrl-title" className="block text-xs font-medium text-gray-700 mb-1">
                      Title <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="ctrl-title"
                      type="text"
                      value={createTitle}
                      onChange={(e) => setCreateTitle(e.target.value)}
                      placeholder="Control title"
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label htmlFor="ctrl-description" className="block text-xs font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    id="ctrl-description"
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                    placeholder="Optional description of the control"
                    rows={2}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                  />
                </div>
                <button type="submit" disabled={creating} className="btn-primary text-sm">
                  {creating ? (
                    <span className="flex items-center gap-2"><Spinner />Adding&hellip;</span>
                  ) : (
                    "Add Control"
                  )}
                </button>
              </form>
            </div>

            {/* Update control panel */}
            {selectedControl && (
              <div className="card border-l-4 border-l-primary-500">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-900">
                    Update Control: <span className="font-mono text-primary-600">{selectedControl.controlId}</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSelectedControl(null)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Close update panel"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {updateSuccess && <SuccessBanner message={updateSuccess} />}
                <form onSubmit={handleUpdateControl} noValidate>
                  {updateError && <ErrorBanner message={updateError} />}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label htmlFor="update-status" className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                      <select
                        id="update-status"
                        value={updateStatus}
                        onChange={(e) => setUpdateStatus(e.target.value as ControlStatus)}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        <option value="NOT_STARTED">Not Started</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="IMPLEMENTED">Implemented</option>
                        <option value="VERIFIED">Verified</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="update-evidence" className="block text-xs font-medium text-gray-700 mb-1">Evidence URL or Note</label>
                      <input
                        id="update-evidence"
                        type="text"
                        value={updateEvidence}
                        onChange={(e) => setUpdateEvidence(e.target.value)}
                        placeholder="Link to evidence or description"
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={updating} className="btn-primary text-sm">
                    {updating ? (
                      <span className="flex items-center gap-2"><Spinner />Saving&hellip;</span>
                    ) : (
                      "Save Changes"
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* Controls list */}
            <div className="card">
              <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                <h2 className="text-base font-semibold text-gray-900">Controls</h2>
                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    <label htmlFor="filter-fw" className="sr-only">Filter by framework</label>
                    <select
                      id="filter-fw"
                      value={filterFramework}
                      onChange={(e) => setFilterFramework(e.target.value as Framework | "")}
                      className="block rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="">All Frameworks</option>
                      <option value="SOC2">SOC 2</option>
                      <option value="ISO27001">ISO 27001</option>
                      <option value="GDPR">GDPR</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="filter-status" className="sr-only">Filter by status</label>
                    <select
                      id="filter-status"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value as ControlStatus | "")}
                      className="block rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="">All Statuses</option>
                      <option value="NOT_STARTED">Not Started</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="IMPLEMENTED">Implemented</option>
                      <option value="VERIFIED">Verified</option>
                    </select>
                  </div>
                </div>
              </div>

              {filteredControls.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                  </svg>
                  <p className="text-sm text-gray-500">No controls found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200" role="table" aria-label="Compliance controls">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Framework</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Control ID</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Title</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Updated</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {filteredControls.map((control) => (
                        <tr key={control.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <FrameworkBadge framework={control.framework} />
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-700">{control.controlId}</td>
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{control.title}</p>
                              {control.description && (
                                <p className="text-xs text-gray-500 truncate max-w-xs">{control.description}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={control.status} />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(control.updatedAt)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openUpdatePanel(control)}
                              className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 transition-colors"
                            >
                              Update
                            </button>
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
