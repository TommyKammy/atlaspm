const API_URL = process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:3001';

export type ApiOptions = {
  method?: string;
  body?: unknown;
  token?: string;
};

export async function api(path: string, options: ApiOptions = {}) {
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    cache: 'no-store',
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

export function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('atlaspm_token') ?? '';
}

export function setToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem('atlaspm_token', token);
}
