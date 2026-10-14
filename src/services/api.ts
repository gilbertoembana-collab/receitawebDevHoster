let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = fetch('/api/auth/refresh', {
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
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  const isAuthEndpoint = url.includes('/api/auth/login') || url.includes('/api/auth/refresh');
  const request = (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Client-Type', 'web');
    return fetch(input, { ...init, headers, credentials: 'same-origin' });
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
      await fetch('/api/auth/logout', {
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
