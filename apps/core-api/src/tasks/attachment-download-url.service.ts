import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getValidatedDevAuthSecret, isDevAuthEnabled, isSafeDevAuthEnvironment } from '../auth/dev-auth-environment';

const DEFAULT_ATTACHMENT_DOWNLOAD_URL_TTL_SEC = 300;
const MIN_ATTACHMENT_DOWNLOAD_URL_TTL_SEC = 1;
const MAX_ATTACHMENT_DOWNLOAD_URL_TTL_SEC = 24 * 60 * 60;
const ATTACHMENT_DOWNLOAD_SECRET_MIN_LENGTH = 16;
const DISALLOWED_ATTACHMENT_DOWNLOAD_SECRETS = new Set([
  'replace-me',
  'change-me',
  'changeme',
  'secret',
  'password',
  'attachment-download-secret',
  'attachment-download-secret-change-me',
]);

type AttachmentDownloadSubject = {
  id: string;
  uploadToken: string | null;
};

@Injectable()
export class AttachmentDownloadUrlService {
  buildUrl(attachment: AttachmentDownloadSubject): string | null {
    if (!attachment.uploadToken) {
      return null;
    }

    const secret = this.signingSecret();
    if (!secret) {
      return null;
    }

    const expires = Math.floor(Date.now() / 1000) + this.ttlSec();
    const signature = this.sign(secret, attachment.id, attachment.uploadToken, expires);
    return `/public/attachments/${attachment.id}?expires=${expires}&signature=${signature}`;
  }

  isValid(attachment: AttachmentDownloadSubject, expiresRaw: string | undefined, signatureRaw: string | undefined): boolean {
    if (!attachment.uploadToken || !expiresRaw || !signatureRaw) {
      return false;
    }

    const secret = this.signingSecret();
    if (!secret) {
      return false;
    }

    const expires = Number(expiresRaw);
    if (!Number.isInteger(expires) || expires <= Math.floor(Date.now() / 1000)) {
      return false;
    }

    const expected = this.sign(secret, attachment.id, attachment.uploadToken, expires);
    const expectedBuf = Buffer.from(expected, 'utf8');
    const receivedBuf = Buffer.from(signatureRaw, 'utf8');
    return expectedBuf.length === receivedBuf.length && timingSafeEqual(expectedBuf, receivedBuf);
  }

  private signingSecret(): string | null {
    const configuredSecret = process.env.ATTACHMENT_DOWNLOAD_URL_SECRET?.trim();
    if (configuredSecret) {
      return this.isStrongConfiguredSecret(configuredSecret) ? configuredSecret : null;
    }

    if (isDevAuthEnabled() && isSafeDevAuthEnvironment()) {
      return getValidatedDevAuthSecret();
    }

    return null;
  }

  private isStrongConfiguredSecret(secret: string): boolean {
    return (
      secret.length >= ATTACHMENT_DOWNLOAD_SECRET_MIN_LENGTH &&
      !DISALLOWED_ATTACHMENT_DOWNLOAD_SECRETS.has(secret.toLowerCase())
    );
  }

  private sign(secret: string, attachmentId: string, token: string, expires: number): string {
    return createHmac('sha256', secret).update(`${attachmentId}.${expires}.${token}`, 'utf8').digest('base64url');
  }

  private ttlSec(): number {
    const raw = Number(process.env.ATTACHMENT_DOWNLOAD_URL_TTL_SEC ?? DEFAULT_ATTACHMENT_DOWNLOAD_URL_TTL_SEC);
    if (!Number.isFinite(raw)) {
      return DEFAULT_ATTACHMENT_DOWNLOAD_URL_TTL_SEC;
    }
    const normalized = Math.floor(raw);
    if (normalized < MIN_ATTACHMENT_DOWNLOAD_URL_TTL_SEC || normalized > MAX_ATTACHMENT_DOWNLOAD_URL_TTL_SEC) {
      return DEFAULT_ATTACHMENT_DOWNLOAD_URL_TTL_SEC;
    }
    return normalized;
  }
}
