# Auth + saved history — setup order matters here

Unzip at your project root — folders mirror the real structure exactly.

| Path | Status |
|---|---|
| `supabase/migrations/001_conversation_history.sql` | **new** — run this in Supabase, not npm |
| `src/lib/supabase.ts` | new |
| `src/lib/history.ts` | new |
| `src/contexts/AuthContext.tsx` | new |
| `src/pages/HistoryPage.tsx` | new |
| `src/hooks/useAskQuestion.ts` | overwrite |
| `src/App.tsx` | overwrite |
| `src/components/Navbar.tsx` | overwrite |
| `.env.local.example` | overwrite (reference only — see below) |
| `package.json` | overwrite (adds `@supabase/supabase-js`) |

## Do this in order

1. **Create the Supabase project** (free tier) at supabase.com
2. **Authentication → Providers → Google** — enable it, paste in your Google OAuth client ID + secret
3. **SQL Editor → New query** — paste in the full contents of
   `supabase/migrations/001_conversation_history.sql` and run it. This
   creates the `conversation_history` table with row-level security, so
   users can only ever see their own rows.
4. **Project Settings → API** — copy the Project URL and anon public key
5. Copy all files from this zip into your project (overwriting where noted)
6. In your **real** `.env.local` (not the `.example` file), add:
   ```
   VITE_SUPABASE_URL=<your project URL>
   VITE_SUPABASE_ANON_KEY=<your anon key>
   ```
7. In **Vercel → Project Settings → Environment Variables**, add the same
   two variables for your production deploy
8. `npm install` (pulls in `@supabase/supabase-js`), then `npm run dev`

## What happens if you skip the Supabase setup

Nothing breaks. `isAuthConfigured` in `supabase.ts` checks for both env vars
at startup — if they're missing, the login button simply doesn't render and
the app behaves exactly as it did before this feature existed. Anonymous use
was, and stays, the fully-working default.

## What gets saved

Every completed question while logged in: the question text, which engine
answered it (sql/python/insights/meta), the generated SQL/Python code (null
for insights/meta), a compact text form of the result, and the 1-2 line
summary caption if one resolved. The uploaded CSV/data itself is never sent
anywhere — only text about the Q&A.

## Verified before packaging
- `npx tsc --noEmit` — clean, both configs
- `npx vitest run` — 208/226 passing (18 pre-existing unrelated failures in
  `api/generate-query.test.ts`, flagged in an earlier zip's README — not
  touched by this change)
- `npm run build` — clean production build
