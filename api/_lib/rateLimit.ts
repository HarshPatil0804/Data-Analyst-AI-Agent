import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { log } from "./util";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

// One shared limiter across generate-query, generate-insights, and
// generate-answer-summary — they all draw from the same pool of LLM
// provider keys (Groq/Gemini/Mistral/Cerebras/Cohere), so a caller hammering
// any one of them drains the same shared quota as hammering all three. A
// separate budget per endpoint would let someone triple their effective
// rate just by round-robining across routes.
//
// 20 requests / 60s per IP: generous enough that no real person asking
// questions through the UI (which already has its own 3s client-side
// cooldown) will ever notice it, but a tight scripted loop hitting the
// endpoint directly gets stopped almost immediately.
const ratelimit: Ratelimit | null =
  url && token
    ? new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(20, "60 s"),
        analytics: true,
        prefix: "ai-data-analyst-agent",
      })
    : null;

if (!ratelimit && process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line no-console
  console.warn(
    "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — API rate limiting is disabled. " +
      "See .env.local.example."
  );
}

export function getClientIp(req: Request): string {
  // Vercel sets this automatically; the first entry is the original client.
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim();
  // Every unidentifiable request shares one bucket rather than each getting
  // its own unlimited pass — better to be slightly too strict for a rare
  // edge case (proxies stripping the header) than to leave a bypass wide
  // open for anyone who can also strip it deliberately.
  return ip || "unknown";
}

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
}

/**
 * Checks the shared rate limit for a given IP. Fails OPEN, not closed: if
 * Upstash is unreachable, misconfigured, or simply not set up at all, this
 * always allows the request through and just logs the situation. A rate
 * limiter existing to protect against abuse should never itself become the
 * reason the app goes down for everyone when it — or its dependency — has a
 * bad day.
 */
export async function checkRateLimit(req: Request): Promise<RateLimitResult> {
  if (!ratelimit) return { limited: false, remaining: Infinity };

  const ip = getClientIp(req);
  try {
    const { success, remaining } = await ratelimit.limit(ip);
    if (!success) log("rate_limit_exceeded", { ip });
    return { limited: !success, remaining };
  } catch (err) {
    log("rate_limit_check_failed", { message: err instanceof Error ? err.message : String(err) });
    return { limited: false, remaining: Infinity };
  }
}
