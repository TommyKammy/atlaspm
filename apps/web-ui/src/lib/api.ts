const API_URL = process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:3001';
export const apiBaseUrl = API_URL;

export type ApiOptions = {
  method?: string;
  body?: unknown | FormData;
  token?: string;
};

export function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('atlaspm_token') ?? '';
}

export function setToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem('atlaspm_token', token);
}

export async function api(path: string, options: ApiOptions = {}) {
  const token = options.token ?? getToken();
  const isFormData = options.body instanceof FormData;
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(isFormData ? {} : { 'content-type': 'application/json' }),
    },
    cache: 'no-store',
  };
  if (options.body !== undefined) {
    init.body = isFormData ? (options.body as FormData) : JSON.stringify(options.body);
  }

  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  return res.json();
}
