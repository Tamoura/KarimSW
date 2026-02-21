"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAccessToken, setAccessToken } from "@/lib/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5013/api/v1";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface OpenApiParameter {
  name: string;
  in: string;
  description?: string;
  required?: boolean;
  schema?: { type?: string; example?: string | number | boolean };
}

interface OpenApiOperation {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: {
      "application/json"?: {
        schema?: {
          properties?: Record<string, { type?: string; description?: string; example?: unknown }>;
          required?: string[];
        };
        example?: unknown;
      };
    };
  };
  responses?: Record<string, { description?: string }>;
  security?: Array<Record<string, string[]>>;
}

interface ParsedEndpoint {
  method: HttpMethod;
  path: string;
  operation: OpenApiOperation;
  tag: string;
}

type CodeLanguage = "javascript" | "curl";

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

function MethodBadge({ method }: { method: HttpMethod }) {
  const styles: Record<HttpMethod, string> = {
    GET: "bg-green-100 text-green-700",
    POST: "bg-blue-100 text-blue-700",
    PUT: "bg-yellow-100 text-yellow-700",
    PATCH: "bg-yellow-100 text-yellow-700",
    DELETE: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold font-mono uppercase ${styles[method] ?? "bg-gray-100 text-gray-600"}`}>
      {method}
    </span>
  );
}

function buildJsSnippet(method: HttpMethod, path: string, op: OpenApiOperation): string {
  const hasBody = ["POST", "PUT", "PATCH"].includes(method);
  const bodyProps = op.requestBody?.content?.["application/json"]?.schema?.properties ?? {};
  const bodyExample = op.requestBody?.content?.["application/json"]?.example;

  let bodyStr = "";
  if (hasBody) {
    if (bodyExample) {
      bodyStr = JSON.stringify(bodyExample, null, 2);
    } else if (Object.keys(bodyProps).length > 0) {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(bodyProps)) {
        obj[k] = v.example ?? (v.type === "number" ? 0 : v.type === "boolean" ? false : "string");
      }
      bodyStr = JSON.stringify(obj, null, 2);
    }
  }

  const needsAuth = (op.security ?? []).length > 0 || op.security === undefined;

  const lines = [
    `const response = await fetch('${API_BASE}${path}', {`,
    `  method: '${method}',`,
    `  headers: {`,
    ...(needsAuth ? [`    'Authorization': 'Bearer YOUR_TOKEN',`] : []),
    ...(hasBody && bodyStr ? [`    'Content-Type': 'application/json',`] : []),
    `  },`,
    ...(hasBody && bodyStr ? [`  body: JSON.stringify(${bodyStr}),`] : []),
    `});`,
    ``,
    `const data = await response.json();`,
    `console.log(data);`,
  ];

  return lines.join("\n");
}

function buildCurlSnippet(method: HttpMethod, path: string, op: OpenApiOperation): string {
  const hasBody = ["POST", "PUT", "PATCH"].includes(method);
  const bodyProps = op.requestBody?.content?.["application/json"]?.schema?.properties ?? {};
  const bodyExample = op.requestBody?.content?.["application/json"]?.example;

  let bodyStr = "";
  if (hasBody) {
    if (bodyExample) {
      bodyStr = JSON.stringify(bodyExample);
    } else if (Object.keys(bodyProps).length > 0) {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(bodyProps)) {
        obj[k] = v.example ?? (v.type === "number" ? 0 : v.type === "boolean" ? false : "string");
      }
      bodyStr = JSON.stringify(obj);
    }
  }

  const parts = [
    `curl -X ${method}`,
    `  '${API_BASE}${path}'`,
    `  -H 'Authorization: Bearer YOUR_TOKEN'`,
    ...(hasBody && bodyStr
      ? [`  -H 'Content-Type: application/json'`, `  -d '${bodyStr}'`]
      : []),
  ];

  return parts.join(" \\\n");
}

function EndpointCard({ endpoint }: { endpoint: ParsedEndpoint }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<CodeLanguage>("javascript");

  const params = endpoint.operation.parameters ?? [];
  const bodySchema = endpoint.operation.requestBody?.content?.["application/json"]?.schema;
  const bodyProps = bodySchema?.properties ?? {};
  const bodyRequired = bodySchema?.required ?? [];

  const jsCode = buildJsSnippet(endpoint.method, endpoint.path, endpoint.operation);
  const curlCode = buildCurlSnippet(endpoint.method, endpoint.path, endpoint.operation);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
        aria-expanded={open}
      >
        <MethodBadge method={endpoint.method} />
        <code className="text-sm font-mono text-gray-800 flex-1 truncate">{endpoint.path}</code>
        {endpoint.operation.summary && (
          <span className="text-sm text-gray-500 hidden sm:block truncate max-w-xs">
            {endpoint.operation.summary}
          </span>
        )}
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-4">
          {endpoint.operation.description && (
            <p className="text-sm text-gray-600">{endpoint.operation.description}</p>
          )}

          {/* Parameters */}
          {params.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Parameters</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm bg-white rounded-lg border border-gray-200" role="table">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500">In</th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500">Required</th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {params.map((p) => (
                      <tr key={`${p.in}-${p.name}`}>
                        <td className="px-3 py-2 font-mono text-xs text-gray-900">{p.name}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{p.in}</td>
                        <td className="px-3 py-2 text-xs">
                          {p.required ? (
                            <span className="text-red-600 font-medium">Yes</span>
                          ) : (
                            <span className="text-gray-400">No</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">{p.description ?? "\u2014"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Request body */}
          {Object.keys(bodyProps).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Request Body</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm bg-white rounded-lg border border-gray-200" role="table">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500">Field</th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500">Required</th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {Object.entries(bodyProps).map(([field, schema]) => (
                      <tr key={field}>
                        <td className="px-3 py-2 font-mono text-xs text-gray-900">{field}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{schema.type ?? "any"}</td>
                        <td className="px-3 py-2 text-xs">
                          {bodyRequired.includes(field) ? (
                            <span className="text-red-600 font-medium">Yes</span>
                          ) : (
                            <span className="text-gray-400">No</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">{schema.description ?? "\u2014"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Code snippet */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Example</h4>
              <div className="flex rounded-lg overflow-hidden border border-gray-200">
                <button
                  type="button"
                  onClick={() => setLang("javascript")}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${lang === "javascript" ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  JavaScript
                </button>
                <button
                  type="button"
                  onClick={() => setLang("curl")}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${lang === "curl" ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  cURL
                </button>
              </div>
            </div>
            <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
              <code>{lang === "javascript" ? jsCode : curlCode}</code>
            </pre>
          </div>

          {/* Responses */}
          {endpoint.operation.responses && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Responses</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(endpoint.operation.responses).map(([code, resp]) => (
                  <div
                    key={code}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                      code.startsWith("2")
                        ? "bg-green-50 border-green-200 text-green-700"
                        : code.startsWith("4")
                        ? "bg-red-50 border-red-200 text-red-700"
                        : "bg-gray-50 border-gray-200 text-gray-600"
                    }`}
                  >
                    <span className="font-mono font-bold">{code}</span>
                    {resp.description && <span>{resp.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DocsPage() {
  const router = useRouter();

  const [endpoints, setEndpoints] = useState<ParsedEndpoint[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [activeTag, setActiveTag] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleUnauthorized = useCallback(() => {
    setAccessToken(null);
    router.push("/login");
  }, [router]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) { router.push("/login"); return; }

    async function loadSpec() {
      const res = await fetch(`${API_BASE}/openapi.json`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { handleUnauthorized(); return; }
      if (!res.ok) throw new Error("Failed to load OpenAPI spec.");

      const spec = await res.json();
      const paths: Record<string, Record<string, OpenApiOperation>> = spec.paths ?? {};

      const parsed: ParsedEndpoint[] = [];
      const tagSet = new Set<string>();

      for (const [path, methods] of Object.entries(paths)) {
        for (const [method, operation] of Object.entries(methods)) {
          if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
          const tag = (operation.tags ?? ["Other"])[0];
          tagSet.add(tag);
          parsed.push({
            method: method.toUpperCase() as HttpMethod,
            path,
            operation,
            tag,
          });
        }
      }

      setEndpoints(parsed);
      setTags(Array.from(tagSet).sort());
    }

    loadSpec()
      .catch(() => setError("Could not load API documentation. Please try again."))
      .finally(() => setLoading(false));
  }, [router, handleUnauthorized]);

  const filtered = endpoints.filter((ep) => {
    const matchesTag = activeTag === "all" || ep.tag === activeTag;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      ep.path.toLowerCase().includes(q) ||
      (ep.operation.summary ?? "").toLowerCase().includes(q) ||
      ep.tag.toLowerCase().includes(q);
    return matchesTag && matchesSearch;
  });

  const grouped = filtered.reduce<Record<string, ParsedEndpoint[]>>((acc, ep) => {
    acc[ep.tag] = acc[ep.tag] ?? [];
    acc[ep.tag].push(ep);
    return acc;
  }, {});

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
            <span className="text-sm font-medium text-gray-900">Documentation</span>
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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">API Documentation</h1>
          <p className="mt-1 text-sm text-gray-500">
            Full interactive reference for the HumanID REST API.
          </p>
        </div>

        {/* SDK Install banner */}
        <div className="card mb-6 bg-gray-900 border-gray-700">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">JavaScript SDK</p>
              <p className="text-white font-semibold">Get started in seconds</p>
            </div>
            <Link
              href="/developer/quickstart"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-300 border border-primary-700 rounded-lg hover:bg-primary-900 transition-colors no-underline"
            >
              View Quickstart Guide
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          </div>
          <pre className="mt-4 text-sm font-mono text-green-400 overflow-x-auto">
            <code>npm install @humanid/sdk</code>
          </pre>
        </div>

        {/* Auth guide */}
        <div className="card mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Authentication</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-600">
            <div>
              <p className="font-medium text-gray-800 mb-1">JWT Bearer Token</p>
              <p className="text-xs text-gray-500 mb-2">For user-authenticated requests. Obtain via <code className="bg-gray-100 px-1 rounded">POST /auth/login</code>.</p>
              <pre className="bg-gray-900 text-green-400 rounded-lg p-3 text-xs font-mono overflow-x-auto">
                <code>Authorization: Bearer &lt;jwt_token&gt;</code>
              </pre>
            </div>
            <div>
              <p className="font-medium text-gray-800 mb-1">API Key</p>
              <p className="text-xs text-gray-500 mb-2">For server-to-server requests. Create via Developer Portal.</p>
              <pre className="bg-gray-900 text-green-400 rounded-lg p-3 text-xs font-mono overflow-x-auto">
                <code>X-API-Key: hid_live_&lt;your_api_key&gt;</code>
              </pre>
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading documentation">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="text-sm text-gray-500">Loading API reference&hellip;</p>
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
          <div className="flex gap-6">
            {/* Sidebar */}
            <aside className="hidden lg:block w-52 shrink-0">
              <div className="sticky top-24">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Endpoint Groups
                </p>
                <nav aria-label="API groups">
                  <button
                    type="button"
                    onClick={() => setActiveTag("all")}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-sm font-medium mb-1 transition-colors ${
                      activeTag === "all"
                        ? "bg-primary-50 text-primary-700"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    All endpoints
                    <span className="ml-1 text-xs text-gray-400">({endpoints.length})</span>
                  </button>
                  {tags.map((tag) => {
                    const count = endpoints.filter((e) => e.tag === tag).length;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setActiveTag(tag)}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-sm font-medium mb-1 transition-colors ${
                          activeTag === tag
                            ? "bg-primary-50 text-primary-700"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        {tag}
                        <span className="ml-1 text-xs text-gray-400">({count})</span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            </aside>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              {/* Search */}
              <div className="mb-4">
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search endpoints..."
                    className="block w-full rounded-lg border border-gray-300 pl-9 pr-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    aria-label="Search API endpoints"
                  />
                </div>
              </div>

              {/* Mobile tag filter */}
              <div className="lg:hidden flex gap-2 mb-4 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setActiveTag("all")}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeTag === "all"
                      ? "bg-primary-500 text-white"
                      : "bg-white border border-gray-300 text-gray-600"
                  }`}
                >
                  All
                </button>
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setActiveTag(tag)}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      activeTag === tag
                        ? "bg-primary-500 text-white"
                        : "bg-white border border-gray-300 text-gray-600"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {Object.keys(grouped).length === 0 ? (
                <div className="card text-center py-12">
                  <p className="text-sm text-gray-500">No endpoints match your search.</p>
                </div>
              ) : (
                Object.entries(grouped).map(([tag, eps]) => (
                  <section key={tag} className="mb-8" aria-labelledby={`section-${tag}`}>
                    <h2
                      id={`section-${tag}`}
                      className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2"
                    >
                      {tag}
                      <span className="text-xs text-gray-400 font-normal">
                        {eps.length} endpoint{eps.length !== 1 ? "s" : ""}
                      </span>
                    </h2>
                    {eps.map((ep) => (
                      <EndpointCard
                        key={`${ep.method}-${ep.path}`}
                        endpoint={ep}
                      />
                    ))}
                  </section>
                ))
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
