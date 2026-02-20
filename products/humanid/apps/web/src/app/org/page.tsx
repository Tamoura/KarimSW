"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE = "http://localhost:5013/api/v1";

type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

interface Org {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

interface OrgMember {
  userId: string;
  email?: string;
  name?: string;
  role: OrgRole;
  joinedAt?: string;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function RoleBadge({ role }: { role: OrgRole }) {
  const styles: Record<OrgRole, string> = {
    OWNER: "bg-purple-100 text-purple-800",
    ADMIN: "bg-blue-100 text-blue-700",
    MEMBER: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[role]}`}>
      {role.charAt(0) + role.slice(1).toLowerCase()}
    </span>
  );
}

function formatDate(iso: string | null | undefined): string {
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

export default function OrgPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [myRole, setMyRole] = useState<OrgRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create org form
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Invite member form
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Role update / remove
  const [updatingMember, setUpdatingMember] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [memberActionSuccess, setMemberActionSuccess] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    router.push("/login");
  }, [router]);

  const fetchOrgData = useCallback(async (token: string, orgId: string) => {
    const headers = { Authorization: `Bearer ${token}` };
    const [orgRes, membersRes] = await Promise.all([
      fetch(`${API_BASE}/orgs/${orgId}`, { headers }),
      fetch(`${API_BASE}/orgs/${orgId}/members`, { headers }),
    ]);

    if (orgRes.status === 401 || membersRes.status === 401) {
      handleUnauthorized();
      return;
    }

    if (orgRes.ok) {
      const data = await orgRes.json();
      setOrg(data.org ?? data);
    }

    if (membersRes.ok) {
      const data = await membersRes.json();
      const memberList: OrgMember[] = data.members ?? [];
      setMembers(memberList);

      const userId = localStorage.getItem("user_id");
      const me = memberList.find((m) => m.userId === userId);
      if (me) setMyRole(me.role);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const storedEmail = localStorage.getItem("user_email");
    const orgId = localStorage.getItem("org_id");

    if (!token) {
      router.push("/login");
      return;
    }

    setEmail(storedEmail ?? "");

    if (orgId) {
      fetchOrgData(token, orgId)
        .catch(() => setError("Could not load organisation data. Please try again."))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [router, fetchOrgData]);

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    if (!createName.trim()) { setCreateError("Organisation name is required."); return; }
    if (!createSlug.trim()) { setCreateError("Slug is required."); return; }

    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch(`${API_BASE}/orgs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: createName.trim(), slug: createSlug.trim() }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to create organisation."
        );
        return;
      }

      const data = await res.json();
      const createdOrg: Org = data.org ?? data;
      setOrg(createdOrg);
      localStorage.setItem("org_id", createdOrg.id);
      setMyRole("OWNER");

      // Fetch members for new org
      fetchOrgData(token, createdOrg.id).catch(() => {});
    } catch {
      setCreateError("Could not connect to the server.");
    } finally {
      setCreating(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    const orgId = localStorage.getItem("org_id");
    if (!token || !orgId) return;

    if (!inviteUserId.trim()) { setInviteError("User ID is required."); return; }

    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/orgs/${orgId}/members`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: inviteUserId.trim(), role: inviteRole }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setInviteError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to invite member."
        );
        return;
      }

      const data = await res.json();
      const newMember: OrgMember = data.member ?? data;
      setMembers((prev) => [...prev, newMember]);
      setInviteSuccess(`Member invited successfully with role ${inviteRole}.`);
      setInviteUserId("");
      setInviteRole("MEMBER");
    } catch {
      setInviteError("Could not connect to the server.");
    } finally {
      setInviting(false);
    }
  }

  async function handleUpdateRole(userId: string, newRole: OrgRole) {
    const token = localStorage.getItem("access_token");
    const orgId = localStorage.getItem("org_id");
    if (!token || !orgId) return;

    setUpdatingMember(userId);
    setMemberActionError(null);
    setMemberActionSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/orgs/${orgId}/members/${userId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMemberActionError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to update role."
        );
        return;
      }

      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, role: newRole } : m))
      );
      setMemberActionSuccess("Role updated successfully.");
    } catch {
      setMemberActionError("Could not connect to the server.");
    } finally {
      setUpdatingMember(null);
    }
  }

  async function handleRemoveMember(userId: string) {
    const token = localStorage.getItem("access_token");
    const orgId = localStorage.getItem("org_id");
    if (!token || !orgId) return;

    if (!window.confirm("Remove this member from the organisation?")) return;

    setRemovingMember(userId);
    setMemberActionError(null);
    setMemberActionSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/orgs/${orgId}/members/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMemberActionError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to remove member."
        );
        return;
      }

      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      setMemberActionSuccess("Member removed successfully.");
    } catch {
      setMemberActionError("Could not connect to the server.");
    } finally {
      setRemovingMember(null);
    }
  }

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    localStorage.removeItem("org_id");
    router.push("/login");
  }

  const canManageMembers = myRole === "OWNER" || myRole === "ADMIN";

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
              <span className="text-sm font-medium text-primary-600">Organisation</span>
            </div>

            <nav className="hidden sm:flex items-center gap-6 text-sm font-medium">
              <span className="text-primary-600 border-b-2 border-primary-500 pb-0.5">Overview</span>
              <Link href="/org/audit" className="text-gray-500 hover:text-gray-900 transition-colors no-underline">
                Audit Trail
              </Link>
              <Link href="/org/sso" className="text-gray-500 hover:text-gray-900 transition-colors no-underline">
                SSO
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <span className="hidden sm:block text-sm text-gray-500 truncate max-w-xs" title={email}>
                {email}
              </span>
              <button
                onClick={handleLogout}
                className="btn-secondary px-3 py-1.5 text-sm"
                type="button"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Organisation Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create or manage your organisation, members, and access controls.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading organisation">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading organisation&hellip;</p>
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
          <>
            {/* No org yet — show create form */}
            {!org && (
              <div className="card max-w-lg">
                <h2 className="text-base font-semibold text-gray-900 mb-1">Create Organisation</h2>
                <p className="text-sm text-gray-500 mb-6">
                  Set up your organisation to manage teams, SSO, and audit trails.
                </p>

                <form onSubmit={handleCreateOrg} noValidate>
                  {createError && <ErrorBanner message={createError} />}

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="org-name" className="block text-sm font-medium text-gray-700 mb-1">
                        Organisation Name <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="org-name"
                        type="text"
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        placeholder="Acme Corp"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>

                    <div>
                      <label htmlFor="org-slug" className="block text-sm font-medium text-gray-700 mb-1">
                        Slug <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="org-slug"
                        type="text"
                        value={createSlug}
                        onChange={(e) => setCreateSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                        placeholder="acme-corp"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <p className="mt-1 text-xs text-gray-400">Lowercase, hyphens only. Used in URLs.</p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <button
                      type="submit"
                      disabled={creating}
                      className="btn-primary text-sm"
                    >
                      {creating ? (
                        <span className="flex items-center gap-2">
                          <Spinner />
                          Creating&hellip;
                        </span>
                      ) : (
                        "Create Organisation"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Org exists — show details and members */}
            {org && (
              <div className="space-y-6">
                {/* Org details card */}
                <div className="card border-l-4 border-l-primary-500">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{org.name}</h2>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Slug: <span className="font-mono text-gray-700">{org.slug}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Created {formatDate(org.createdAt)}
                      </p>
                    </div>
                    {myRole && (
                      <RoleBadge role={myRole} />
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
                    <Link href="/org/audit" className="btn-secondary text-sm px-4 py-2">
                      Audit Trail
                    </Link>
                    <Link href="/org/sso" className="btn-secondary text-sm px-4 py-2">
                      SSO Configuration
                    </Link>
                  </div>
                </div>

                {/* Member action feedback */}
                {memberActionSuccess && <SuccessBanner message={memberActionSuccess} />}
                {memberActionError && <ErrorBanner message={memberActionError} />}

                {/* Member list */}
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-gray-900">Members</h2>
                    <span className="text-xs text-gray-400">{members.length} member{members.length !== 1 ? "s" : ""}</span>
                  </div>

                  {members.length === 0 ? (
                    <div className="text-center py-8">
                      <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                      </svg>
                      <p className="text-sm text-gray-500">No members yet.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200" role="table" aria-label="Organisation members">
                        <thead className="bg-gray-50">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">User</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Role</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Joined</th>
                            {canManageMembers && (
                              <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {members.map((member) => (
                            <tr key={member.userId} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3">
                                <div>
                                  {member.name && (
                                    <p className="text-sm font-medium text-gray-900">{member.name}</p>
                                  )}
                                  <p className="text-xs text-gray-500 font-mono">{member.email ?? member.userId}</p>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <RoleBadge role={member.role} />
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                                {formatDate(member.joinedAt)}
                              </td>
                              {canManageMembers && (
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <select
                                      value={member.role}
                                      onChange={(e) => handleUpdateRole(member.userId, e.target.value as OrgRole)}
                                      disabled={updatingMember === member.userId || member.role === "OWNER"}
                                      className="text-xs rounded border border-gray-300 px-2 py-1 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                      aria-label={`Change role for ${member.email ?? member.userId}`}
                                    >
                                      <option value="MEMBER">Member</option>
                                      <option value="ADMIN">Admin</option>
                                      <option value="OWNER">Owner</option>
                                    </select>
                                    {updatingMember === member.userId && <Spinner />}
                                    {member.role !== "OWNER" && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveMember(member.userId)}
                                        disabled={removingMember === member.userId}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        aria-label={`Remove ${member.email ?? member.userId}`}
                                      >
                                        {removingMember === member.userId ? <Spinner /> : null}
                                        Remove
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Invite member form (OWNER/ADMIN only) */}
                {canManageMembers && (
                  <div className="card">
                    <h2 className="text-base font-semibold text-gray-900 mb-4">Invite Member</h2>

                    {inviteSuccess && <SuccessBanner message={inviteSuccess} />}

                    <form onSubmit={handleInvite} noValidate>
                      {inviteError && <ErrorBanner message={inviteError} />}

                      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                        <div className="flex-1">
                          <label htmlFor="invite-user" className="block text-xs font-medium text-gray-700 mb-1">
                            User ID <span className="text-red-500" aria-hidden="true">*</span>
                          </label>
                          <input
                            id="invite-user"
                            type="text"
                            value={inviteUserId}
                            onChange={(e) => setInviteUserId(e.target.value)}
                            placeholder="User ID to invite"
                            required
                            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </div>

                        <div>
                          <label htmlFor="invite-role" className="block text-xs font-medium text-gray-700 mb-1">
                            Role
                          </label>
                          <select
                            id="invite-role"
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as OrgRole)}
                            className="block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          >
                            <option value="MEMBER">Member</option>
                            <option value="ADMIN">Admin</option>
                            <option value="OWNER">Owner</option>
                          </select>
                        </div>

                        <button
                          type="submit"
                          disabled={inviting}
                          className="btn-primary text-sm shrink-0"
                        >
                          {inviting ? (
                            <span className="flex items-center gap-2">
                              <Spinner />
                              Inviting&hellip;
                            </span>
                          ) : (
                            "Invite Member"
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}
          </>
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
