"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAccessToken, setAccessToken } from "@/lib/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5013/api/v1";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type ReportStatus = "OPEN" | "TRIAGED" | "IN_PROGRESS" | "RESOLVED" | "DUPLICATE" | "INVALID";

interface VulnerabilityReport {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: ReportStatus;
  reporterEmail?: string;
  bountyUsd?: number;
  createdAt: string;
  updatedAt: string;
}

interface SecurityAdvisory {
  id: string;
  title: string;
  summary: string;
  cveId?: string;
  severity: Severity;
  publishedAt: string;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    LOW: "bg-gray-100 text-gray-600",
    MEDIUM: "bg-amber-100 text-amber-800",
    HIGH: "bg-orange-100 text-orange-800",
    CRITICAL: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[severity]}`}>
      {severity.charAt(0) + severity.slice(1).toLowerCase()}
    </span>
  );
}

function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const styles: Record<ReportStatus, string> = {
    OPEN: "bg-blue-100 text-blue-700",
    TRIAGED: "bg-purple-100 text-purple-700",
    IN_PROGRESS: "bg-amber-100 text-amber-800",
    RESOLVED: "bg-green-100 text-green-800",
    DUPLICATE: "bg-gray-100 text-gray-500",
    INVALID: "bg-gray-100 text-gray-500",
  };
  const labels: Record<ReportStatus, string> = {
    OPEN: "Open",
    TRIAGED: "Triaged",
    IN_PROGRESS: "In Progress",
    RESOLVED: "Resolved",
    DUPLICATE: "Duplicate",
    INVALID: "Invalid",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
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

export default function SecurityPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [reports, setReports] = useState<VulnerabilityReport[]>([]);
  const [advisories, setAdvisories] = useState<SecurityAdvisory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Submit vulnerability report (public form)
  const [rptTitle, setRptTitle] = useState("");
  const [rptDescription, setRptDescription] = useState("");
  const [rptSeverity, setRptSeverity] = useState<Severity>("MEDIUM");
  const [rptEmail, setRptEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Update report (admin)
  const [selectedReport, setSelectedReport] = useState<VulnerabilityReport | null>(null);
  const [updateStatus, setUpdateStatus] = useState<ReportStatus>("OPEN");
  const [updateBounty, setUpdateBounty] = useState("");
  const [updatingReport, setUpdatingReport] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);

  // Publish advisory
  const [advTitle, setAdvTitle] = useState("");
  const [advSummary, setAdvSummary] = useState("");
  const [advCve, setAdvCve] = useState("");
  const [advSeverity, setAdvSeverity] = useState<Severity>("MEDIUM");
  const [publishing, setPublishing] = useState(false);
  const [advError, setAdvError] = useState<string | null>(null);
  const [advSuccess, setAdvSuccess] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchData = useCallback(async (token: string) => {
    const headers = { Authorization: `Bearer ${token}` };

    const [reportsRes, advisoriesRes] = await Promise.all([
      fetch(`${API_BASE}/security/reports`, { headers }),
      fetch(`${API_BASE}/security/advisories`, { headers }),
    ]);

    if (reportsRes.status === 401) { handleUnauthorized(); return; }

    if (reportsRes.ok) {
      const data = await reportsRes.json();
      setReports(data.reports ?? []);
    }

    if (advisoriesRes.ok) {
      const data = await advisoriesRes.json();
      setAdvisories(data.advisories ?? []);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) { router.push("/login"); return; }

    setEmail("");
    fetchData(token)
      .catch(() => setError("Could not load security data. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchData]);

  async function handleSubmitReport(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    if (!rptTitle.trim()) { setSubmitError("Title is required."); return; }
    if (!rptDescription.trim()) { setSubmitError("Description is required."); return; }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/security/reports`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: rptTitle.trim(),
          description: rptDescription.trim(),
          severity: rptSeverity,
          reporterEmail: rptEmail.trim() || undefined,
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to submit report."
        );
        return;
      }

      const data = await res.json();
      const newReport: VulnerabilityReport = data.report ?? data;
      setReports((prev) => [newReport, ...prev]);
      setSubmitSuccess("Vulnerability report submitted. Our security team will review it shortly.");
      setRptTitle("");
      setRptDescription("");
      setRptSeverity("MEDIUM");
      setRptEmail("");
    } catch {
      setSubmitError("Could not connect to the server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateReport(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedReport) return;

    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    setUpdatingReport(true);
    setUpdateError(null);
    setUpdateSuccess(null);

    try {
      const payload: Record<string, unknown> = { status: updateStatus };
      if (updateBounty.trim()) payload.bountyUsd = parseFloat(updateBounty);

      const res = await fetch(`${API_BASE}/security/reports/${selectedReport.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUpdateError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to update report."
        );
        return;
      }

      const data = await res.json();
      const updated: VulnerabilityReport = data.report ?? {
        ...selectedReport,
        status: updateStatus,
        bountyUsd: updateBounty ? parseFloat(updateBounty) : selectedReport.bountyUsd,
      };
      setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setUpdateSuccess("Report updated successfully.");
      setSelectedReport(null);
    } catch {
      setUpdateError("Could not connect to the server.");
    } finally {
      setUpdatingReport(false);
    }
  }

  async function handlePublishAdvisory(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }

    if (!advTitle.trim()) { setAdvError("Title is required."); return; }
    if (!advSummary.trim()) { setAdvError("Summary is required."); return; }

    setPublishing(true);
    setAdvError(null);
    setAdvSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/security/advisories`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: advTitle.trim(),
          summary: advSummary.trim(),
          cveId: advCve.trim() || undefined,
          severity: advSeverity,
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAdvError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to publish advisory."
        );
        return;
      }

      const data = await res.json();
      const newAdvisory: SecurityAdvisory = data.advisory ?? data;
      setAdvisories((prev) => [newAdvisory, ...prev]);
      setAdvSuccess("Security advisory published.");
      setAdvTitle("");
      setAdvSummary("");
      setAdvCve("");
      setAdvSeverity("MEDIUM");
    } catch {
      setAdvError("Could not connect to the server.");
    } finally {
      setPublishing(false);
    }
  }

  function handleLogout() {
    setAccessToken(null);
    router.push("/login");
  }

  function openUpdatePanel(report: VulnerabilityReport) {
    setSelectedReport(report);
    setUpdateStatus(report.status);
    setUpdateBounty(report.bountyUsd?.toString() ?? "");
    setUpdateError(null);
    setUpdateSuccess(null);
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
              <span className="text-sm font-medium text-primary-600">Security</span>
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
          <h1 className="text-2xl font-bold text-gray-900">Bug Bounty &amp; Security</h1>
          <p className="mt-1 text-sm text-gray-500">
            Report vulnerabilities, manage security disclosures, and publish advisories.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading security data">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading security data&hellip;</p>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Report submission + report list */}
            <div className="space-y-6">
              {/* Submit report */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-1">Report a Vulnerability</h2>
                <p className="text-xs text-gray-500 mb-4">Responsible disclosure. Reports are reviewed within 72 hours.</p>
                {submitSuccess && <SuccessBanner message={submitSuccess} />}
                <form onSubmit={handleSubmitReport} noValidate>
                  {submitError && <ErrorBanner message={submitError} />}
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="rpt-title" className="block text-xs font-medium text-gray-700 mb-1">
                        Title <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="rpt-title"
                        type="text"
                        value={rptTitle}
                        onChange={(e) => setRptTitle(e.target.value)}
                        placeholder="Brief description of the vulnerability"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="rpt-desc" className="block text-xs font-medium text-gray-700 mb-1">
                        Description <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <textarea
                        id="rpt-desc"
                        value={rptDescription}
                        onChange={(e) => setRptDescription(e.target.value)}
                        placeholder="Steps to reproduce, impact, affected components, proof-of-concept..."
                        rows={4}
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="rpt-severity" className="block text-xs font-medium text-gray-700 mb-1">Severity</label>
                        <select
                          id="rpt-severity"
                          value={rptSeverity}
                          onChange={(e) => setRptSeverity(e.target.value as Severity)}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                          <option value="CRITICAL">Critical</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="rpt-email" className="block text-xs font-medium text-gray-700 mb-1">
                          Your Email (optional)
                        </label>
                        <input
                          id="rpt-email"
                          type="email"
                          value={rptEmail}
                          onChange={(e) => setRptEmail(e.target.value)}
                          placeholder="reporter@example.com"
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <button type="submit" disabled={submitting} className="btn-primary text-sm">
                      {submitting ? (
                        <span className="flex items-center gap-2"><Spinner />Submitting&hellip;</span>
                      ) : (
                        "Submit Report"
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Update report panel */}
              {selectedReport && (
                <div className="card border-l-4 border-l-primary-500">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-gray-900">Update Report</h2>
                    <button
                      type="button"
                      onClick={() => setSelectedReport(null)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      aria-label="Close update panel"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-sm font-medium text-gray-700 mb-4 truncate" title={selectedReport.title}>
                    {selectedReport.title}
                  </p>
                  {updateSuccess && <SuccessBanner message={updateSuccess} />}
                  <form onSubmit={handleUpdateReport} noValidate>
                    {updateError && <ErrorBanner message={updateError} />}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label htmlFor="update-rpt-status" className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                        <select
                          id="update-rpt-status"
                          value={updateStatus}
                          onChange={(e) => setUpdateStatus(e.target.value as ReportStatus)}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                          <option value="OPEN">Open</option>
                          <option value="TRIAGED">Triaged</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="RESOLVED">Resolved</option>
                          <option value="DUPLICATE">Duplicate</option>
                          <option value="INVALID">Invalid</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="update-bounty" className="block text-xs font-medium text-gray-700 mb-1">
                          Bounty (USD)
                        </label>
                        <input
                          id="update-bounty"
                          type="number"
                          min="0"
                          step="0.01"
                          value={updateBounty}
                          onChange={(e) => setUpdateBounty(e.target.value)}
                          placeholder="0.00"
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                    <button type="submit" disabled={updatingReport} className="btn-primary text-sm">
                      {updatingReport ? (
                        <span className="flex items-center gap-2"><Spinner />Saving&hellip;</span>
                      ) : (
                        "Save Changes"
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* Reports list */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Vulnerability Reports ({reports.length})</h2>
                {reports.length === 0 ? (
                  <div className="text-center py-10">
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                    </svg>
                    <p className="text-sm text-gray-500">No vulnerability reports yet.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100" role="list">
                    {reports.map((report) => (
                      <li key={report.id} className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900 truncate">{report.title}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <SeverityBadge severity={report.severity} />
                              <ReportStatusBadge status={report.status} />
                              {report.bountyUsd !== undefined && report.bountyUsd > 0 && (
                                <span className="text-xs font-medium text-green-700">${report.bountyUsd.toFixed(2)}</span>
                              )}
                            </div>
                            {report.reporterEmail && (
                              <p className="text-xs text-gray-400 mt-0.5">{report.reporterEmail}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs text-gray-400">{formatDate(report.createdAt)}</p>
                            <button
                              type="button"
                              onClick={() => openUpdatePanel(report)}
                              className="mt-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
                            >
                              Update
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Right: Advisories */}
            <div className="space-y-6">
              {/* Publish advisory */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Publish Security Advisory</h2>
                {advSuccess && <SuccessBanner message={advSuccess} />}
                <form onSubmit={handlePublishAdvisory} noValidate>
                  {advError && <ErrorBanner message={advError} />}
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="adv-title" className="block text-xs font-medium text-gray-700 mb-1">
                        Title <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="adv-title"
                        type="text"
                        value={advTitle}
                        onChange={(e) => setAdvTitle(e.target.value)}
                        placeholder="Advisory title"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="adv-summary" className="block text-xs font-medium text-gray-700 mb-1">
                        Summary <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <textarea
                        id="adv-summary"
                        value={advSummary}
                        onChange={(e) => setAdvSummary(e.target.value)}
                        placeholder="Description, impact, mitigations, affected versions..."
                        rows={4}
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="adv-cve" className="block text-xs font-medium text-gray-700 mb-1">CVE ID (optional)</label>
                        <input
                          id="adv-cve"
                          type="text"
                          value={advCve}
                          onChange={(e) => setAdvCve(e.target.value)}
                          placeholder="CVE-2025-XXXXX"
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label htmlFor="adv-severity" className="block text-xs font-medium text-gray-700 mb-1">Severity</label>
                        <select
                          id="adv-severity"
                          value={advSeverity}
                          onChange={(e) => setAdvSeverity(e.target.value as Severity)}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                          <option value="CRITICAL">Critical</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <button type="submit" disabled={publishing} className="btn-primary text-sm">
                      {publishing ? (
                        <span className="flex items-center gap-2"><Spinner />Publishing&hellip;</span>
                      ) : (
                        "Publish Advisory"
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Advisory list */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Security Advisories ({advisories.length})</h2>
                {advisories.length === 0 ? (
                  <div className="text-center py-10">
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                    </svg>
                    <p className="text-sm text-gray-500">No advisories published.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100" role="list">
                    {advisories.map((adv) => (
                      <li key={adv.id} className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-gray-900">{adv.title}</p>
                              {adv.cveId && (
                                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                  {adv.cveId}
                                </span>
                              )}
                            </div>
                            <div className="mt-1">
                              <SeverityBadge severity={adv.severity} />
                            </div>
                            <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{adv.summary}</p>
                          </div>
                          <p className="text-xs text-gray-400 shrink-0 whitespace-nowrap">{formatDate(adv.publishedAt)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
