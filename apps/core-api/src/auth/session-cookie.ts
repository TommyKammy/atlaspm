import type { Request } from 'express';

const SECURE_SESSION_COOKIE = '__Host-atlaspm_session';
const DEV_SESSION_COOKIE = 'atlaspm_session';
const SECURE_CSRF_COOKIE = '__Host-atlaspm_csrf';
const DEV_CSRF_COOKIE = 'atlaspm_csrf';

type CookieContext = Pick<Request, 'headers'> & {
  protocol?: string;
  secure?: boolean;
};

export function shouldUseSecureAuthCookies(req?: CookieContext): boolean {
  const forwardedProto = req?.headers['x-forwarded-proto'];
  const normalizedProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return req?.secure === true || req?.protocol === 'https' || normalizedProto === 'https';
}

export function getAuthCookieNames(req?: CookieContext) {
  const secure = shouldUseSecureAuthCookies(req);
  return {
    secure,
    session: secure ? SECURE_SESSION_COOKIE : DEV_SESSION_COOKIE,
    csrf: secure ? SECURE_CSRF_COOKIE : DEV_CSRF_COOKIE,
  };
}

export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((cookies, part) => {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName) return cookies;
    cookies[rawName] = decodeURIComponent(rawValue.join('='));
    return cookies;
  }, {});
}

export function readAtlaspmSessionCookie(cookieHeader?: string): string | undefined {
  const cookies = parseCookieHeader(cookieHeader);
  return cookies[SECURE_SESSION_COOKIE] ?? cookies[DEV_SESSION_COOKIE];
}

export function readAtlaspmCsrfCookie(cookieHeader?: string): string | undefined {
  const cookies = parseCookieHeader(cookieHeader);
  return cookies[SECURE_CSRF_COOKIE] ?? cookies[DEV_CSRF_COOKIE];
}
