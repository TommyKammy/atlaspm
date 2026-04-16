const API_URL = process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:3001';
export const apiBaseUrl = API_URL;

export type ApiOptions = {
  method?: string;
  body?: unknown | FormData;
  token?: string;
  headers?: Record<string, string>;
};

function isUnsafeMethod(method: string) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function readCookie(name: string) {
  if (typeof document === 'undefined') return '';
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!cookie) return '';
  return decodeURIComponent(cookie.slice(name.length + 1));
}

function getCsrfToken() {
  return readCookie('__Host-atlaspm_csrf') || readCookie('atlaspm_csrf');
}

export async function api(path: string, options: ApiOptions = {}) {
  const method = options.method ?? 'GET';
  const isFormData = options.body instanceof FormData;
  const csrfToken = isUnsafeMethod(method) ? getCsrfToken() : '';
  const url = path.startsWith('http://') || path.startsWith('https://') ? path : `${API_URL}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(isFormData ? {} : { 'content-type': 'application/json' }),
      ...(csrfToken ? { 'x-atlaspm-csrf': csrfToken } : {}),
      ...(options.headers ?? {}),
    },
    cache: 'no-store',
    credentials: 'include',
  };
  if (options.body !== undefined) {
    init.body = isFormData ? (options.body as FormData) : JSON.stringify(options.body);
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  return res.json();
}
