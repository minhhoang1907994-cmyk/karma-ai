/**
 * BR-17: rate limit noi bo 10 request / phut / IP.
 *
 * Muc dich la kiem soat chi phi model anh co phi, khong phai chong tan cong.
 * Counter nam trong bo nho: mat khi restart va khong dung chung giua nhieu
 * instance - chap nhan duoc o Phase 1 vi chi chay 1 instance (spec section 15).
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

export function createRateLimiter({ windowMs = WINDOW_MS, max = MAX_REQUESTS } = {}) {
  /** @type {Map<string, number[]>} ip -> danh sach timestamp trong cua so hien tai */
  const hits = new Map();

  return function rateLimit(req, res, next) {
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);

    if (recent.length >= max) {
      const oldest = recent[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
      hits.set(ip, recent);
      res.set('retry-after', String(retryAfterSeconds));
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: `Bạn gọi quá nhanh, thử lại sau ${retryAfterSeconds} giây`,
          retryAfterSeconds,
        },
      });
    }

    recent.push(now);
    hits.set(ip, recent);

    // Don dep dinh ky de Map khong phinh vo han
    if (hits.size > 1000) {
      for (const [key, times] of hits) {
        if (times.every((t) => now - t >= windowMs)) hits.delete(key);
      }
    }
    return next();
  };
}
