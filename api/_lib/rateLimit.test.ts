import { describe, it, expect } from "vitest";
import { getClientIp, checkRateLimit } from "./rateLimit";

describe("getClientIp", () => {
  it("takes the first entry from a multi-hop x-forwarded-for header", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178" },
    });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("trims whitespace around the first IP", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "  203.0.113.5  , 70.41.3.18" },
    });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("handles a single-IP header with no comma", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.5" },
    });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("falls back to a shared bucket when the header is missing entirely", () => {
    const req = new Request("https://example.com");
    expect(getClientIp(req)).toBe("unknown");
  });
});

describe("checkRateLimit — fails open when Upstash isn't configured", () => {
  // This test environment never sets UPSTASH_REDIS_REST_URL/TOKEN, which is
  // itself the important case to cover: someone who hasn't set up Upstash
  // yet (or whose env vars are momentarily wrong) must never have every
  // request silently blocked. The module reads these as undefined and the
  // limiter stays null — checkRateLimit should always report "not limited".
  it("never limits when the limiter isn't configured", async () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.5" },
    });
    const result = await checkRateLimit(req);
    expect(result.limited).toBe(false);
    expect(result.remaining).toBe(Infinity);
  });

  it("still returns a result even with no identifying headers at all", async () => {
    const req = new Request("https://example.com");
    const result = await checkRateLimit(req);
    expect(result.limited).toBe(false);
  });
});
