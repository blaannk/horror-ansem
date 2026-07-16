// In-memory rate limiter (fixed window per IP). No external dependency.
// NB: per-instance memory, for multiple instances behind a load balancer you'd need
// a shared store (Redis). Sufficient to throttle floods on a single instance.
export function rateLimit({ windowMs = 60_000, max = 40 } = {}) {
  const hits = new Map(); // ip -> { count, reset }

  // Periodic cleanup of expired entries (doesn't keep the process alive).
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, e] of hits) if (now > e.reset) hits.delete(ip);
  }, windowMs);
  timer.unref?.();

  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    let e = hits.get(ip);
    if (!e || now > e.reset) {
      e = { count: 0, reset: now + windowMs };
      hits.set(ip, e);
    }
    e.count++;
    if (e.count > max) {
      res.setHeader('Retry-After', Math.ceil((e.reset - now) / 1000));
      return res.status(429).json({ error: 'too many requests, try again shortly' });
    }
    next();
  };
}
