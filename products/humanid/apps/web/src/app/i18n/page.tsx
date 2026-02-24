"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getAccessToken, setAccessToken } from "@/lib/api-client";

interface Locale {
  id: string;
  code: string;
  name: string;
  nativeName: string;
  completionPct: number;
  translationCount: number;
  totalKeys: number;
  createdAt: string;
}

interface Translation {
  key: string;
  value: string;
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

function CompletionBar({ pct }: { pct: number }) {
  const color =
    pct >= 80 ? "bg-green-500" :
    pct >= 50 ? "bg-amber-400" :
    "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}% complete`}
      >
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 tabular-nums w-10 text-right">{pct}%</span>
    </div>
  );
}

// A simple editable key-value pair list for translations
interface KVEntry { key: string; value: string; }

function KVEditor({
  entries,
  onChange,
}: {
  entries: KVEntry[];
  onChange: (entries: KVEntry[]) => void;
}) {
  function updateKey(i: number, v: string) {
    const next = entries.map((e, idx) => idx === i ? { ...e, key: v } : e);
    onChange(next);
  }
  function updateValue(i: number, v: string) {
    const next = entries.map((e, idx) => idx === i ? { ...e, value: v } : e);
    onChange(next);
  }
  function addRow() {
    onChange([...entries, { key: "", value: "" }]);
  }
  function removeRow(i: number) {
    onChange(entries.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={entry.key}
            onChange={(e) => updateKey(i, e.target.value)}
            placeholder="key"
            aria-label={`Translation key ${i + 1}`}
            className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-mono focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <input
            type="text"
            value={entry.value}
            onChange={(e) => updateValue(i, e.target.value)}
            placeholder="value"
            aria-label={`Translation value ${i + 1}`}
            className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <button
            type="button"
            onClick={() => removeRow(i)}
            className="text-gray-400 hover:text-red-500 transition-colors"
            aria-label={`Remove row ${i + 1}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="text-xs text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1 mt-1"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add row
      </button>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function I18nPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [locales, setLocales] = useState<Locale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add locale form
  const [addCode, setAddCode] = useState("");
  const [addName, setAddName] = useState("");
  const [addNativeName, setAddNativeName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Update translations form
  const [updateLocale, setUpdateLocale] = useState("");
  const [kvEntries, setKvEntries] = useState<KVEntry[]>([{ key: "", value: "" }]);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);

  // View translations panel
  const [viewLocale, setViewLocale] = useState("");
  const [translations, setTranslations] = useState<Translation[] | null>(null);
  const [loadingTranslations, setLoadingTranslations] = useState(false);
  const [translationsError, setTranslationsError] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  const fetchLocales = useCallback(async () => {
    const res = await apiFetch(`/i18n/locales`);
    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error("Failed to load locales.");
    const data = await res.json();
    setLocales(data.locales ?? data ?? []);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) { router.push("/login"); return; }
    setEmail("");
    fetchLocales()
      .catch(() => setError("Could not load locales. Please try again."))
      .finally(() => setLoading(false));
  }, [router, fetchLocales]);

  async function handleAddLocale(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }
    if (!addCode.trim()) { setAddError("Locale code is required."); return; }
    if (!addName.trim()) { setAddError("Name is required."); return; }
    if (!addNativeName.trim()) { setAddError("Native name is required."); return; }

    setAdding(true);
    setAddError(null);
    setAddSuccess(null);

    try {
      const res = await apiFetch(`/i18n/locales`, {
        method: "POST",
        body: JSON.stringify({
          code: addCode.trim(),
          name: addName.trim(),
          nativeName: addNativeName.trim(),
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAddError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to add locale."
        );
        return;
      }

      const data = await res.json();
      const newLocale: Locale = data.locale ?? data;
      setLocales((prev) => [...prev, newLocale]);
      setAddSuccess(`Locale "${addName.trim()}" (${addCode.trim()}) added.`);
      setAddCode("");
      setAddName("");
      setAddNativeName("");
    } catch {
      setAddError("Could not connect to the server.");
    } finally {
      setAdding(false);
    }
  }

  async function handleUpdateTranslations(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }
    if (!updateLocale) { setUpdateError("Select a locale."); return; }

    const validEntries = kvEntries.filter((e) => e.key.trim());
    if (validEntries.length === 0) { setUpdateError("Add at least one key-value pair."); return; }

    const translations: Record<string, string> = {};
    for (const entry of validEntries) {
      translations[entry.key.trim()] = entry.value;
    }

    setUpdating(true);
    setUpdateError(null);
    setUpdateSuccess(null);

    try {
      const res = await apiFetch(`/i18n/translations`, {
        method: "PUT",
        body: JSON.stringify({
          locale: updateLocale,
          translations,
        }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUpdateError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to update translations."
        );
        return;
      }

      setUpdateSuccess(`${validEntries.length} translation(s) updated for "${updateLocale}".`);
      setKvEntries([{ key: "", value: "" }]);
      // Refresh locales to update completion
      fetchLocales().catch(() => {});
    } catch {
      setUpdateError("Could not connect to the server.");
    } finally {
      setUpdating(false);
    }
  }

  async function handleViewTranslations(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) { handleUnauthorized(); return; }
    if (!viewLocale) { setTranslationsError("Select a locale."); return; }

    setLoadingTranslations(true);
    setTranslationsError(null);
    setTranslations(null);

    try {
      const res = await apiFetch(`/i18n/translations/${encodeURIComponent(viewLocale)}`);

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTranslationsError(
          (data as { detail?: string }).detail ??
          (data as { message?: string }).message ??
          "Failed to load translations."
        );
        return;
      }

      const data = await res.json();
      const raw: Record<string, string> = data.translations ?? data ?? {};
      setTranslations(Object.entries(raw).map(([key, value]) => ({ key, value })));
    } catch {
      setTranslationsError("Could not connect to the server.");
    } finally {
      setLoadingTranslations(false);
    }
  }

  function handleLogout() {
    setAccessToken(null);
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
              <span className="text-sm font-medium text-primary-600">Internationalization</span>
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
          <h1 className="text-2xl font-bold text-gray-900">Internationalization</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage locales, translation keys, and completion coverage for multi-language support.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading locales">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading locales&hellip;</p>
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
              {/* Add locale form */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Add Locale</h2>
                {addSuccess && <SuccessBanner message={addSuccess} />}
                <form onSubmit={handleAddLocale} noValidate>
                  {addError && <ErrorBanner message={addError} />}
                  <div className="space-y-4 mb-4">
                    <div>
                      <label htmlFor="locale-code" className="block text-xs font-medium text-gray-700 mb-1">
                        Code (BCP 47) <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="locale-code"
                        type="text"
                        value={addCode}
                        onChange={(e) => setAddCode(e.target.value)}
                        placeholder="e.g. en-US, fr, ar"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="locale-name" className="block text-xs font-medium text-gray-700 mb-1">
                        Name (English) <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="locale-name"
                        type="text"
                        value={addName}
                        onChange={(e) => setAddName(e.target.value)}
                        placeholder="e.g. French"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="locale-native-name" className="block text-xs font-medium text-gray-700 mb-1">
                        Native Name <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="locale-native-name"
                        type="text"
                        value={addNativeName}
                        onChange={(e) => setAddNativeName(e.target.value)}
                        placeholder="e.g. Fran&#231;ais"
                        required
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={adding} className="btn-primary text-sm">
                    {adding ? (
                      <span className="flex items-center gap-2"><Spinner />Adding&hellip;</span>
                    ) : (
                      "Add Locale"
                    )}
                  </button>
                </form>
              </div>

              {/* Update translations form */}
              <div className="card">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Update Translations</h2>
                {updateSuccess && <SuccessBanner message={updateSuccess} />}
                <form onSubmit={handleUpdateTranslations} noValidate>
                  {updateError && <ErrorBanner message={updateError} />}
                  <div className="mb-4">
                    <label htmlFor="update-locale" className="block text-xs font-medium text-gray-700 mb-1">
                      Locale <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <select
                      id="update-locale"
                      value={updateLocale}
                      onChange={(e) => setUpdateLocale(e.target.value)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 mb-4"
                    >
                      <option value="">Select locale&hellip;</option>
                      {locales.map((l) => (
                        <option key={l.id} value={l.code}>{l.name} ({l.code})</option>
                      ))}
                    </select>
                    <p className="text-xs font-medium text-gray-700 mb-2">Key-Value Pairs</p>
                    <KVEditor entries={kvEntries} onChange={setKvEntries} />
                  </div>
                  <button type="submit" disabled={updating} className="btn-primary text-sm">
                    {updating ? (
                      <span className="flex items-center gap-2"><Spinner />Saving&hellip;</span>
                    ) : (
                      "Save Translations"
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Locales list with completion bars */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Locales</h2>
              {locales.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802" />
                  </svg>
                  <p className="text-sm text-gray-500">No locales configured yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200" role="table" aria-label="Locales">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Code</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Native Name</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide min-w-[160px]">Completion</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Keys</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Added</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {locales.map((locale) => (
                        <tr key={locale.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-xs font-mono font-medium text-gray-900">{locale.code}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{locale.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{locale.nativeName}</td>
                          <td className="px-4 py-3 min-w-[160px]">
                            <CompletionBar pct={locale.completionPct ?? 0} />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {locale.translationCount ?? 0}{locale.totalKeys ? `/${locale.totalKeys}` : ""}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(locale.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* View translations panel */}
            <div className="card">
              <h2 className="text-base font-semibold text-gray-900 mb-4">View Translations</h2>
              <form onSubmit={handleViewTranslations} noValidate className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="flex-1">
                  <label htmlFor="view-locale" className="block text-xs font-medium text-gray-700 mb-1">
                    Select Locale
                  </label>
                  <select
                    id="view-locale"
                    value={viewLocale}
                    onChange={(e) => setViewLocale(e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">Select locale&hellip;</option>
                    {locales.map((l) => (
                      <option key={l.id} value={l.code}>{l.name} ({l.code})</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button type="submit" disabled={loadingTranslations} className="btn-primary text-sm whitespace-nowrap">
                    {loadingTranslations ? (
                      <span className="flex items-center gap-2"><Spinner />Loading&hellip;</span>
                    ) : (
                      "Load Translations"
                    )}
                  </button>
                </div>
              </form>
              {translationsError && <ErrorBanner message={translationsError} />}
              {translations !== null && (
                translations.length === 0 ? (
                  <p className="text-sm text-gray-500">No translations found for this locale.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200" role="table" aria-label="Translation entries">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Key</th>
                          <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Value</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {translations.map((t) => (
                          <tr key={t.key} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-2 text-xs font-mono text-gray-700">{t.key}</td>
                            <td className="px-4 py-2 text-xs text-gray-900">{t.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
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
