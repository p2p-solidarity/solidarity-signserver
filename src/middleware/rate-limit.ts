import { Context, Next } from "hono";

interface RateLimitEnv {
  RATE_LIMITER: {
    limit: (options: { key: string }) => Promise<{ success: boolean }>;
  };
}

export async function rateLimitMiddleware(
  c: Context<{ Bindings: RateLimitEnv }>,
  next: Next
) {
  // Get client IP from Cloudflare headers or fallback headers
  const clientIP =
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for") ||
    "unknown";

  // Check rate limit
  const { success } = await c.env.RATE_LIMITER.limit({ key: clientIP });

  if (!success) {
    return c.json(
      { error: "Too many requests. Please try again later." },
      429
    );
  }

  await next();
}
