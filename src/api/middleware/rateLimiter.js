import { CONFIG } from '../../config.js';

/**
 * Sliding-window rate limiter.
 *
 * Designed for easy storage-backend swapping:
 *   MVP  → in-memory Map (resets on cold start, fine for serverless)
 *   Prod → replace this._store with Netlify Blobs, Upstash Redis, etc.
 *          Only the constructor and the two _store calls need changing.
 *
 * The public interface (check()) stays identical regardless of backend.
 */
export class RateLimiter {
  /**
   * @param {object} [opts]
   * @param {number} [opts.max]            Max requests per window.
   * @param {number} [opts.windowMs=3600000] Window duration in ms.
   */
  constructor({ max = CONFIG.HOURLY_REQUEST_LIMIT, windowMs = 60 * 60 * 1000 } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    /** @type {Map<string, { count: number, windowStart: number }>} */
    this._store = new Map();
  }

  /**
   * Check and consume one token for the given identifier.
   *
   * @param {string} id  Unique user identifier (e.g. IP + UA fingerprint).
   * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
   */
  check(id) {
    const now = Date.now();
    const entry = this._store.get(id);

    // First request, or previous window has expired → start fresh
    if (!entry || now - entry.windowStart > this.windowMs) {
      this._store.set(id, { count: 1, windowStart: now });
      return { allowed: true, remaining: this.max - 1, resetAt: now + this.windowMs };
    }

    // Window active, limit reached → reject
    if (entry.count >= this.max) {
      return { allowed: false, remaining: 0, resetAt: entry.windowStart + this.windowMs };
    }

    // Consume one token
    entry.count += 1;
    return {
      allowed: true,
      remaining: this.max - entry.count,
      resetAt: entry.windowStart + this.windowMs,
    };
  }
}

/**
 * Singleton shared across requests within the same process / function instance.
 * Import this directly — no need to construct your own unless you need
 * different limits (e.g. for tests).
 */
export const rateLimiter = new RateLimiter();
