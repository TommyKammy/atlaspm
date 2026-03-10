import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { createSecretKey } from 'crypto';
import type { AuthUser } from '../common/types';
import { getValidatedDevAuthSecret } from './dev-auth-environment';
import { readAtlaspmSessionCookie } from './session-cookie';

@Injectable()
export class AuthService {
  async verify(authHeader?: string, cookieHeader?: string): Promise<AuthUser> {
    const token = this.extractToken(authHeader, cookieHeader);
    const devEnabled = process.env.DEV_AUTH_ENABLED === 'true';
    if (devEnabled) {
      const secret = createSecretKey(Buffer.from(getValidatedDevAuthSecret()));
      let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
      try {
        ({ payload } = await jwtVerify(token, secret, { issuer: 'atlaspm-dev', audience: 'atlaspm-dev' }));
      } catch {
        throw new UnauthorizedException('Invalid or expired token');
      }
      if (!payload.sub) throw new UnauthorizedException('Missing sub');
      return { sub: payload.sub, email: payload.email as string | undefined, name: payload.name as string | undefined };
    }

    const jwks = createRemoteJWKSet(new URL(process.env.OIDC_JWKS_URI ?? ''));
    let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
    try {
      ({ payload } = await jwtVerify(token, jwks, {
        issuer: process.env.OIDC_ISSUER,
        audience: process.env.OIDC_AUDIENCE,
      }));
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (!payload.sub) throw new UnauthorizedException('Missing sub');
    return { sub: payload.sub, email: payload.email as string | undefined, name: payload.name as string | undefined };
  }

  private extractToken(authHeader?: string, cookieHeader?: string): string {
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length);
    }

    const sessionToken = readAtlaspmSessionCookie(cookieHeader);
    if (sessionToken) return sessionToken;

    throw new UnauthorizedException('Missing bearer token');
  }

  async mintDevToken(sub: string, email?: string, name?: string) {
    if (process.env.DEV_AUTH_ENABLED !== 'true') throw new UnauthorizedException('Dev auth disabled');
    const secret = createSecretKey(Buffer.from(getValidatedDevAuthSecret()));
    const ttl = process.env.DEV_AUTH_TOKEN_TTL ?? '8h';
    return new SignJWT({ email, name })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(ttl)
      .setIssuer('atlaspm-dev')
      .setAudience('atlaspm-dev')
      .setSubject(sub)
      .sign(secret);
  }
}
