import path from 'node:path';

export function attachmentStorageDir() {
  return process.env.ATTACHMENT_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'attachments');
}

export function resolveAttachmentPath(storageKey: string) {
  const normalized = storageKey.replace(/\.\./g, '').replace(/^\/+/, '');
  return path.join(attachmentStorageDir(), normalized);
}
