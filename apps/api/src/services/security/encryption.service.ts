import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

export class EncryptionService {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = createHash('sha256').update(secret).digest();
  }

  encryptJson(value: unknown) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString('base64url'),
      authTag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decryptJson<T = Record<string, string>>(payload: string): T {
    const [ivText, authTagText, ciphertextText] = payload.split('.');
    if (!ivText || !authTagText || !ciphertextText) return {} as T;
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(authTagText, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext) as T;
  }
}
