"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE = "http://localhost:5013/api/v1";

interface TemplateAttribute {
  name: string;
  type: "string" | "number" | "boolean" | "date";
  description?: string;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  version: string;
  status: "ACTIVE" | "INACTIVE";
  schema?: Record<string, unknown>;
  requiredAttributes: TemplateAttribute[];
  optionalAttributes: TemplateAttribute[];
  createdAt: string;
  updatedAt: string;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function StatusBadge({ status }: { status: Template["status"] }) {
  const styles = {
    ACTIVE: "bg-green-100 text-green-800",
    INACTIVE: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
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

const ATTRIBUTE_TYPES = ["string", "number", "boolean", "date"] as const;

function AttributeEditor({
  attributes,
  onChange,
  label,
}: {
  attributes: TemplateAttribute[];
  onChange: (attrs: TemplateAttribute[]) => void;
  label: string;
}) {
  function addAttribute() {
    onChange([...attributes, { name: "", type: "string" }]);
  }

  function removeAttribute(index: number) {
    onChange(attributes.filter((_, i) => i !== index));
  }

  function updateAttribute(index: number, field: keyof TemplateAttribute, value: string) {
    onChange(
      attributes.map((attr, i) =>
        i === index ? { ...attr, [field]: value } : attr
      )
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <button
          type="button"
          onClick={addAttribute}
          className="text-xs text-primary-500 hover:text-primary-600 font-medium"
        >
          + Add
        </button>
      </div>
      {attributes.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No attributes added yet.</p>
      ) : (
        <div className="space-y-2">
          {attributes.map((attr, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={attr.name}
                onChange={(e) => updateAttribute(i, "name", e.target.value)}
                placeholder="Field name"
                className="flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <select
                value={attr.type}
                onChange={(e) => updateAttribute(i, "type", e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {ATTRIBUTE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeAttribute(i)}
                className="text-danger-400 hover:text-danger-600 transition-colors"
                aria-label={`Remove attribute ${attr.name || i}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  onEdit,
  onDeactivate,
  deactivating,
}: {
  template: Template;
  onEdit: (t: Template) => void;
  onDeactivate: (id: string) => void;
  deactivating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="w-full text-left"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-sm font-semibold text-gray-900">{template.name}</p>
              <StatusBadge status={template.status} />
              <span className="text-xs text-gray-400 font-mono">v{template.version}</span>
            </div>
            {template.description && (
              <p className="text-xs text-gray-500 leading-relaxed">{template.description}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Created {formatDate(template.createdAt)} &middot; Updated {formatDate(template.updatedAt)}
            </p>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform cursor-pointer ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
            onClick={() => setExpanded((v) => !v)}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
          {template.status === "ACTIVE" && (
            <>
              <button
                type="button"
                onClick={() => onEdit(template)}
                className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 transition-colors"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDeactivate(template.id)}
                disabled={deactivating}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-danger-600 bg-danger-50 border border-danger-200 rounded-lg hover:bg-danger-100 focus:outline-none focus:ring-2 focus:ring-danger-500 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deactivating ? <Spinner /> : null}
                Deactivate
              </button>
            </>
          )}
        </div>
      </div>

      {/* Schema preview */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Required Attributes ({template.requiredAttributes.length})
              </p>
              {template.requiredAttributes.length === 0 ? (
                <p className="text-xs text-gray-400 italic">None</p>
              ) : (
                <ul className="space-y-1">
                  {template.requiredAttributes.map((attr) => (
                    <li key={attr.name} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-800">{attr.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                        {attr.type}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Optional Attributes ({template.optionalAttributes.length})
              </p>
              {template.optionalAttributes.length === 0 ? (
                <p className="text-xs text-gray-400 italic">None</p>
              ) : (
                <ul className="space-y-1">
                  {template.optionalAttributes.map((attr) => (
                    <li key={attr.name} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-800">{attr.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                        {attr.type}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

interface TemplateFormState {
  name: string;
  description: string;
  version: string;
  requiredAttributes: TemplateAttribute[];
  optionalAttributes: TemplateAttribute[];
}

const emptyForm = (): TemplateFormState => ({
  name: "",
  description: "",
  version: "1.0",
  requiredAttributes: [],
  optionalAttributes: [],
});

function templateToForm(t: Template): TemplateFormState {
  return {
    name: t.name,
    description: t.description ?? "",
    version: t.version,
    requiredAttributes: t.requiredAttributes,
    optionalAttributes: t.optionalAttributes,
  };
}

export default function IssuerTemplatesPage() {
  const router = useRouter();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [form, setForm] = useState<TemplateFormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    router.push("/login");
  }, [router]);

  const fetchTemplates = useCallback(async (token: string) => {
    const res = await fetch(`${API_BASE}/templates`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error("Failed to load templates.");
    const data = await res.json();
    setTemplates(data.templates ?? []);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { router.push("/login"); return; }

    fetchTemplates(token)
      .catch(() => setError("Could not load templates. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchTemplates]);

  function openCreateForm() {
    setEditingTemplate(null);
    setForm(emptyForm());
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(template: Template) {
    setEditingTemplate(template);
    setForm(templateToForm(template));
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingTemplate(null);
    setForm(emptyForm());
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    if (!form.name.trim()) { setFormError("Template name is required."); return; }
    if (!form.version.trim()) { setFormError("Version is required."); return; }

    const hasEmptyAttrName = [
      ...form.requiredAttributes,
      ...form.optionalAttributes,
    ].some((a) => !a.name.trim());

    if (hasEmptyAttrName) {
      setFormError("All attribute names are required.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      version: form.version.trim(),
      requiredAttributes: form.requiredAttributes,
      optionalAttributes: form.optionalAttributes,
    };

    try {
      let res: Response;
      if (editingTemplate) {
        res = await fetch(`${API_BASE}/templates/${editingTemplate.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE}/templates`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      }

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to save template."
        );
        return;
      }

      const saved: Template = await res.json();

      if (editingTemplate) {
        setTemplates((prev) =>
          prev.map((t) => (t.id === editingTemplate.id ? saved : t))
        );
        setActionSuccess("Template updated successfully.");
      } else {
        setTemplates((prev) => [saved, ...prev]);
        setActionSuccess("Template created successfully.");
      }

      closeForm();
    } catch {
      setFormError("Could not connect to the server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(id: string) {
    const token = localStorage.getItem("access_token");
    if (!token) { handleUnauthorized(); return; }

    setDeactivatingId(id);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/templates/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to deactivate template."
        );
        return;
      }

      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: "INACTIVE" } : t))
      );
      setActionSuccess("Template deactivated.");
    } catch {
      setActionError("Could not connect to the server.");
    } finally {
      setDeactivatingId(null);
    }
  }

  const activeCount = templates.filter((t) => t.status === "ACTIVE").length;
  const inactiveCount = templates.filter((t) => t.status === "INACTIVE").length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link
              href="/issuer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors no-underline"
              aria-label="Back to issuer dashboard"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Issuer
            </Link>
            <span className="text-gray-300" aria-hidden="true">/</span>
            <span className="text-sm font-medium text-gray-900">Templates</span>
            <div className="ml-auto flex items-center gap-2">
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
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Credential Templates</h1>
            <p className="mt-1 text-sm text-gray-500">
              Define reusable schema templates for your verifiable credentials. Templates specify required and optional attributes.
            </p>
          </div>
          {!showForm && (
            <button
              type="button"
              onClick={openCreateForm}
              className="btn-primary text-sm shrink-0"
            >
              + New Template
            </button>
          )}
        </div>

        {/* Form panel */}
        {showForm && (
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">
                {editingTemplate ? "Edit Template" : "Create New Template"}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close form"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              {formError && (
                <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-danger-50 border border-danger-200 px-3 py-2.5">
                  <svg className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-8.25a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                  <p className="text-xs text-danger-700">{formError}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="tmpl-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Template Name <span className="text-danger-500" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="tmpl-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Employment Verification"
                    required
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label htmlFor="tmpl-version" className="block text-sm font-medium text-gray-700 mb-1">
                    Version <span className="text-danger-500" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="tmpl-version"
                    type="text"
                    value={form.version}
                    onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                    placeholder="1.0"
                    required
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label htmlFor="tmpl-desc" className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  id="tmpl-desc"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Describe what this credential template is used for..."
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                <div className="border border-gray-200 rounded-lg p-4">
                  <AttributeEditor
                    attributes={form.requiredAttributes}
                    onChange={(attrs) => setForm((f) => ({ ...f, requiredAttributes: attrs }))}
                    label="Required Attributes"
                  />
                </div>
                <div className="border border-gray-200 rounded-lg p-4">
                  <AttributeEditor
                    attributes={form.optionalAttributes}
                    onChange={(attrs) => setForm((f) => ({ ...f, optionalAttributes: attrs }))}
                    label="Optional Attributes"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary text-sm"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Spinner />
                      {editingTemplate ? "Saving\u2026" : "Creating\u2026"}
                    </span>
                  ) : (
                    editingTemplate ? "Save Changes" : "Create Template"
                  )}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Feedback banners */}
        {actionSuccess && (
          <div role="status" className="mb-6 flex items-start gap-3 rounded-lg bg-success-50 border border-success-200 px-4 py-3">
            <svg className="w-5 h-5 text-success-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <p className="text-sm text-success-700">{actionSuccess}</p>
          </div>
        )}
        {actionError && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3">
            <svg className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-sm text-danger-700">{actionError}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading templates">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading templates&hellip;</p>
            </div>
          </div>
        )}

        {!loading && error && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3">
            <svg className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-sm text-danger-700">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              <div className="card">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total</p>
                <p className="text-3xl font-bold text-gray-900">{templates.length}</p>
                <p className="text-xs text-gray-400 mt-1">templates</p>
              </div>
              <div className="card">
                <p className="text-xs font-medium text-success-600 uppercase tracking-wide mb-1">Active</p>
                <p className="text-3xl font-bold text-gray-900">{activeCount}</p>
                <p className="text-xs text-gray-400 mt-1">templates</p>
              </div>
              <div className="card">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Inactive</p>
                <p className="text-3xl font-bold text-gray-900">{inactiveCount}</p>
                <p className="text-xs text-gray-400 mt-1">templates</p>
              </div>
            </div>

            {/* Template list */}
            {templates.length === 0 ? (
              <div className="card text-center py-16">
                <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375Z" />
                </svg>
                <p className="text-sm text-gray-500 mb-4">No credential templates yet.</p>
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="btn-primary text-sm"
                >
                  Create Your First Template
                </button>
              </div>
            ) : (
              <ul className="space-y-4" role="list" aria-label="Credential templates">
                {templates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onEdit={openEditForm}
                    onDeactivate={handleDeactivate}
                    deactivating={deactivatingId === t.id}
                  />
                ))}
              </ul>
            )}

            <p className="mt-4 text-xs text-gray-400 text-right">
              {templates.length} template{templates.length !== 1 ? "s" : ""} total
            </p>
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
