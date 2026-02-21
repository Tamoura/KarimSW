/**
 * Shared API client for HumanID frontend.
 *
 * Token strategy (RISK-026):
 * - access_token: stored in module-level memory (survives re-renders, cleared on page unload)
 * - refresh_token: stored in httpOnly cookie set by the API (sent automatically)
 * - No tokens are written to localStorage or sessionStorage
 */

// Module-level in-memory token store — not accessible from the DOM or other scripts
let _accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5013/api/v1';

/**
 * Fetch wrapper that automatically attaches the in-memory access token.
 * Pass `credentials: 'include'` so the browser sends the httpOnly refresh cookie.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
}

export { API_BASE };
