# API rate limiting — setup

Unzip at your project root, folders mirror the real structure.

| Path | Status |
|---|---|
| `api/_lib/rateLimit.ts` | **new** — the shared limiter |
| `api/_lib/rateLimit.test.ts` | **new** — 6 tests |
| `api/generate-query.ts` | overwrite (added the check) |
| `api/generate-insights.ts` | overwrite (added the check) |
| `api/generate-answer-summary.ts` | overwrite (added the check) |
| `package.json` | overwrite (adds `@upstash/ratelimit`, `@upstash/redis`) |
| `.env.local.example` | overwrite (reference only) |

## Setup

1. Create a free Redis database at **upstash.com** (any region is fine for a project this size)
2. Copy the **REST URL** and **REST token** from its dashboard
3. Add to your real `.env.local`:
   ```
   UPSTASH_REDIS_REST_URL=<your url>
   UPSTASH_REDIS_REST_TOKEN=<your token>
   ```
4. Add the same two to **Vercel → Project Settings → Environment Variables**
5. `npm install`, redeploy

## What it does

All three LLM-calling routes (`generate-query`, `generate-insights`,
`generate-answer-summary`) now share **one** budget: 20 requests per 60
seconds per IP address. They share a budget on purpose — all three draw from
the same pool of LLM provider keys, so limiting them separately would let
someone triple their effective rate by spreading requests across routes.

Real usage through the UI (which already has its own 3-second cooldown
between asks) will never come close to this limit. It's aimed at someone
hitting an endpoint directly in a script.

## Fails open, not closed

If Upstash is down, misconfigured, or you simply haven't set it up yet,
every request is allowed through — rate limiting silently does nothing
rather than taking the whole app down. You'll see a console warning in dev
mode if the env vars are missing, but production stays quiet and just lets
requests through.

## Verified before packaging
- `npx tsc --noEmit` — clean, both configs
- `npx vitest run` — 214/232 passing (18 pre-existing unrelated failures,
  same as flagged in earlier zips — not touched by this change)
- `npm run build` — clean production build
