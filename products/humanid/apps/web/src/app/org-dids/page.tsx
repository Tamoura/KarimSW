"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE = "http://localhost:5013/api/v1";

type OrgDidType = "COMPANY" | "DEPARTMENT" | "DEVICE";

interface OrgDid {
  id: string;
  name: string;
  type: OrgDidType;
  did: string;
  domain?: string;
  parentId?: string;
  createdAt: string;
}

interface HierarchyNode {
  id: string;
  name: string;
  type: OrgDidType;
  did: string;
  children?: HierarchyNode[];
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

function TypeBadge({ type }: { type: OrgDidType }) {
  const styles: Record<OrgDidType, string> = {
    COMPANY: "bg-purple-100 text-purple-700",
    DEPARTMENT: "bg-blue-100 text-blue-700",
    DEVICE: "bg-green-100 text-green-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[type]}`}>
      {type.charAt(0) + type.slice(1).toLowerCase()}
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

function HierarchyTree({ node, depth = 0 }: { node: HierarchyNode; depth?: number }) {
  return (
    <li>
      <div
        className="flex items-center gap-2 py-1.5"
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        {depth > 0 && (
          <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5v-15m0 0 7.5 7.5M4.5 4.5l7.5 7.5" />
          </svg>
        )}
        <TypeBadge type={node.type} />
        <span className="text-sm font-medium text-gray-900">{node.name}</span>
        <span className="text-xs font-mono text-gray-400 truncate max-w-[180px]" title={node.did}>
          {node.did}
        </span>
      </div>
      {node.children && node.children.length > 0 && (
        <ul className="list-none p-0 m-0">
          {node.children.map((child) => (
            <HierarchyTree key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function OrgDidsPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [orgDids, setOrgDids] = useState<OrgDid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create org DID form
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState<OrgDidType>("COMPANY");
  const [createDomain, setCreateDomain] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Create child form
  const [childParentId, setChildParentId] = useState("");
  const [childName, setChildName] = useState("");
  const [childType, setChildType] = useState<OrgDidType>("DEPARTMENT");
  const [creatingChild, setCreatingChild] = useState(false);
  const [childError, setChildError] = useState<string | null>(null);
  const [childSuccess, setChildSuccess] = useState<string | null>(null);

  // Hierarchy panel
  const [hierarchyOrgId, setHierarchyOrgId] = useState("");
  const [loadingHierarchy, setLoadingHierarchy] = useState(false);
  const [hierarchyResult, setHierarchyResult] = useState<HierarchyNode | null>(null);
  const [hierarchyError, setHierarchyError] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    router.push("/login");
  }, [router]);

  const fetchOrgDids = useCallback(async (token: string) => {
    const res = await fetch(`${API_BASE}/org-dids`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error("Failed to load org DIDs.");
    const data = await res.json();
    setOrgDids(data.orgDids ?? data ?? []);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const storedEmail = localStorage.getItem("user_email");
    if (!token) { router.push("/login"); return; }
    setEmail(storedEmail ?? "");
    fetchOrgDids(token)
      .catch(() => setError("Could not load organizational DIDs. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchOrgDids]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }
    if (!createName.trim()) { setCreateError("Name is required."); return; }

    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/org-dids`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: createName.trim(),
          type: createType,
          domain: createDomain.trim() || undefined,
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to create org DID."
        );
        return;
      }

      const data = await res.json();
      const newOrg: OrgDid = data.orgDid ?? data;
      setOrgDids((prev) => [newOrg, ...prev]);
      setCreateSuccess(`Org DID "${newOrg.name}" created successfully.`);
      setCreateName("");
      setCreateDomain("");
    } catch {
      setCreateError("Could not connect to the server.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateChild(e: React.FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }
    if (!childParentId) { setChildError("Parent org DID is required."); return; }
    if (!childName.trim()) { setChildError("Child name is required."); return; }

    setCreatingChild(true);
    setChildError(null);
    setChildSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/org-dids/${childParentId}/children`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: childName.trim(),
          type: childType,
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setChildError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to create child DID."
        );
        return;
      }

      const data = await res.json();
      const newChild: OrgDid = data.orgDid ?? data;
      setOrgDids((prev) => [newChild, ...prev]);
      setChildSuccess(`Child DID "${newChild.name}" created.`);
      setChildName("");
    } catch {
      setChildError("Could not connect to the server.");
    } finally {
      setCreatingChild(false);
    }
  }

  async function handleLoadHierarchy(e: React.FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }
    if (!hierarchyOrgId) { setHierarchyError("Select an org DID."); return; }

    setLoadingHierarchy(true);
    setHierarchyError(null);
    setHierarchyResult(null);

    try {
      const res = await fetch(`${API_BASE}/org-dids/${hierarchyOrgId}/hierarchy`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setHierarchyError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to load hierarchy."
        );
        return;
      }

      const data = await res.json();
      setHierarchyResult(data.hierarchy ?? data);
    } catch {
      setHierarchyError("Could not connect to the server.");
    } finally {
      setLoadingHierarchy(false);
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
              <span className="text-sm font-medium text-primary-600">Organizational DIDs</span>
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
          <h1 className="text-2xl font-bold text-gray-900">Organizational DIDs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and manage hierarchical decentralized identifiers for companies, departments, and devices.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading org DIDs">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading org DIDs&hellip;</p>
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Create org DID form */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Create Org DID</h2>
                {createSuccess && <SuccessBanner message={createSuccess} />}
                <form onSubmit={handleCreate} noValidate>
                  {createError && <ErrorBanner message={createError} />}
                  <div className="space-y-4 mb-4">
                    <div>
                      <label htmlFor="org-name" className="block text-xs font-medium text-gray-700 mb-1">
                        Name <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="org-name"
                        type="text"
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        placeholder="e.g. Acme Corp"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="org-type" className="block text-xs font-medium text-gray-700 mb-1">
                        Type <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <select
                        id="org-type"
                        value={createType}
                        onChange={(e) => setCreateType(e.target.value as OrgDidType)}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        <option value="COMPANY">Company</option>
                        <option value="DEPARTMENT">Department</option>
                        <option value="DEVICE">Device</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="org-domain" className="block text-xs font-medium text-gray-700 mb-1">
                        Domain (optional)
                      </label>
                      <input
                        id="org-domain"
                        type="text"
                        value={createDomain}
                        onChange={(e) => setCreateDomain(e.target.value)}
                        placeholder="e.g. acme.com"
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={creating} className="btn-primary text-sm">
                    {creating ? (
                      <span className="flex items-center gap-2"><Spinner />Creating&hellip;</span>
                    ) : (
                      "Create Org DID"
                    )}
                  </button>
                </form>
              </div>

              {/* Create child DID form */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Create Child DID</h2>
                {childSuccess && <SuccessBanner message={childSuccess} />}
                <form onSubmit={handleCreateChild} noValidate>
                  {childError && <ErrorBanner message={childError} />}
                  <div className="space-y-4 mb-4">
                    <div>
                      <label htmlFor="child-parent" className="block text-xs font-medium text-gray-700 mb-1">
                        Parent Org DID <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <select
                        id="child-parent"
                        value={childParentId}
                        onChange={(e) => setChildParentId(e.target.value)}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        <option value="">Select parent&hellip;</option>
                        {orgDids.map((o) => (
                          <option key={o.id} value={o.id}>{o.name} ({o.type})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="child-name" className="block text-xs font-medium text-gray-700 mb-1">
                        Name <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="child-name"
                        type="text"
                        value={childName}
                        onChange={(e) => setChildName(e.target.value)}
                        placeholder="e.g. Engineering Dept"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="child-type" className="block text-xs font-medium text-gray-700 mb-1">
                        Type <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <select
                        id="child-type"
                        value={childType}
                        onChange={(e) => setChildType(e.target.value as OrgDidType)}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        <option value="COMPANY">Company</option>
                        <option value="DEPARTMENT">Department</option>
                        <option value="DEVICE">Device</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" disabled={creatingChild} className="btn-primary text-sm">
                    {creatingChild ? (
                      <span className="flex items-center gap-2"><Spinner />Creating&hellip;</span>
                    ) : (
                      "Create Child DID"
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Hierarchy viewer */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">View Hierarchy</h2>
              <form onSubmit={handleLoadHierarchy} noValidate className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="flex-1">
                  <label htmlFor="hierarchy-org" className="block text-xs font-medium text-gray-700 mb-1">
                    Select Org DID
                  </label>
                  <select
                    id="hierarchy-org"
                    value={hierarchyOrgId}
                    onChange={(e) => setHierarchyOrgId(e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">Select org&hellip;</option>
                    {orgDids.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button type="submit" disabled={loadingHierarchy} className="btn-primary text-sm whitespace-nowrap">
                    {loadingHierarchy ? (
                      <span className="flex items-center gap-2"><Spinner />Loading&hellip;</span>
                    ) : (
                      "Load Hierarchy"
                    )}
                  </button>
                </div>
              </form>
              {hierarchyError && <ErrorBanner message={hierarchyError} />}
              {hierarchyResult && (
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                  <ul className="list-none p-0 m-0" role="tree" aria-label="Org DID hierarchy">
                    <HierarchyTree node={hierarchyResult} />
                  </ul>
                </div>
              )}
            </div>

            {/* Org DIDs table */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">All Org DIDs</h2>
              {orgDids.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                  </svg>
                  <p className="text-sm text-gray-500">No organizational DIDs created yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200" role="table" aria-label="Organizational DIDs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">DID</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Domain</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {orgDids.map((org) => (
                        <tr key={org.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{org.name}</td>
                          <td className="px-4 py-3">
                            <TypeBadge type={org.type} />
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-700 max-w-[180px] truncate" title={org.did}>
                            {org.did}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{org.domain ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(org.createdAt)}</td>
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
