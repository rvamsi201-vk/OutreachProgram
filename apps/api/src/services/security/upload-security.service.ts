import { randomUUID } from 'node:crypto';
import { extname, basename } from 'node:path';
import { ValidationError } from '../../errors/index.js';

const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

export interface UploadPolicy {
  allowedExtensions: string[];
  maxBytes?: number;
}

export function sanitizeFilename(filename: string): string {
  const base = basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const safe = base.replace(/_{2,}/g, '_').replace(/^\.+/, '');
  return (safe || 'upload').slice(0, 180);
}

export function getSafeStoredFilename(filename: string): string {
  const extension = extname(sanitizeFilename(filename)).toLowerCase();
  return `${randomUUID()}${extension}`;
}

export function assertAllowedUpload(
  filename: string,
  sizeBytes: number,
  policy: UploadPolicy,
): void {
  const extension = extname(sanitizeFilename(filename)).toLowerCase();
  const allowed = policy.allowedExtensions.map((item) => item.toLowerCase());
  const maxBytes = policy.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;

  if (!extension || !allowed.includes(extension)) {
    throw new ValidationError(`Unsupported file type. Allowed: ${allowed.join(', ')}`);
  }

  if (sizeBytes > maxBytes) {
    throw new ValidationError(`File exceeds maximum size of ${Math.floor(maxBytes / 1024 / 1024)}MB`);
  }
}

export function sanitizeCsvCell(value: string): string {
  return CSV_FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

export function sanitizeCsvRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      typeof value === 'string' ? sanitizeCsvCell(value) : value,
    ]),
  );
}
