import { createHash } from 'node:crypto';
import { RateLimitError } from '../../errors/index.js';

interface RedisLike {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
}

const WINDOW_SECONDS = 15 * 60;
const LOCK_SECONDS = 15 * 60;
const MAX_FAILURES = 5;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function attemptKey(email: string, ipAddress: string): string {
  return `auth:fail:${sha256(`${ipAddress}:${email.trim().toLowerCase()}`)}`;
}

function lockKey(email: string, ipAddress: string): string {
  return `auth:lock:${sha256(`${ipAddress}:${email.trim().toLowerCase()}`)}`;
}

export class LoginProtectionService {
  constructor(private client?: RedisLike) {}

  private async getClient(): Promise<RedisLike> {
    if (!this.client) {
      const { redis } = await import('../../db/redis.js');
      this.client = redis;
    }
    return this.client;
  }

  async assertCanAttempt(email: string, ipAddress: string): Promise<void> {
    const client = await this.getClient();
    const locked = await client.get(lockKey(email, ipAddress));
    if (locked) {
      throw new RateLimitError('Too many failed login attempts. Try again later.');
    }
  }

  async recordFailure(email: string, ipAddress: string): Promise<void> {
    const client = await this.getClient();
    const key = attemptKey(email, ipAddress);
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, WINDOW_SECONDS);
    }

    if (count >= MAX_FAILURES) {
      await client.set(lockKey(email, ipAddress), '1', 'EX', LOCK_SECONDS);
      await client.del(key);
    }
  }

  async recordSuccess(email: string, ipAddress: string): Promise<void> {
    const client = await this.getClient();
    await client.del(attemptKey(email, ipAddress));
    await client.del(lockKey(email, ipAddress));
  }
}
