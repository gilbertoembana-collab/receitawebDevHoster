let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export const API_BASE_PATH = '/api/v1';

function versionedApiInput(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input !== 'string') return input;
  if (!input.startsWith('/api/')) return input;
  return `${API_BASE_PATH}${input.slice('/api'.length)}`;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE_PATH}/auth/refresh`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Client-Type': 'web' },
      body: '{}',
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = await response.json();
        if (typeof data.accessToken !== 'string') return null;
        accessToken = data.accessToken;
        return accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const requestInput = versionedApiInput(input);
  const url = typeof requestInput === 'string' ? requestInput : requestInput instanceof URL ? requestInput.pathname : requestInput.url;
  const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh');
  const request = (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Client-Type', 'web');
    return fetch(requestInput, { ...init, headers, credentials: 'same-origin' });
  };

  let response = await request(accessToken);
  if (response.status !== 401 || isAuthEndpoint) return response;

  const renewedToken = await refreshAccessToken();
  if (!renewedToken) {
    accessToken = null;
    return response;
  }
  response = await request(renewedToken);
  return response;
}

export async function logoutSession() {
  try {
    if (accessToken) {
      await apiFetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } else {
      await fetch(`${API_BASE_PATH}/auth/logout`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Client-Type': 'web' },
        body: '{}',
      });
    }
  } finally {
    accessToken = null;
  }
}
