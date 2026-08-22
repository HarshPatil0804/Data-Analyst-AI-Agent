# PITCH addendum — this session's work

Not the full PITCH.md (that lives elsewhere in the repo and wasn't in the
zip this was generated from). Merge these in wherever it lives — this
covers only what was built/fixed in this session: three iterations on
outlier detection, a routing-classification fix, Google auth + saved
history, and API rate limiting.

---

## Resume bullets

- Diagnosed and resolved a statistical "masking" failure in an AI-generated
  outlier-detection feature where a single extreme data point inflated its
  own group's standard deviation enough to hide from a z-score test;
  iterated through three detection methods (mean/std → median/MAD → Tukey
  IQR fences) and validated the final fix against three independently-sized
  datasets (10/12/20 rows) before shipping.
- Redesigned an LLM routing prompt's request-classification boundary,
  fixing false rejections of safe computed-transformation queries (e.g.
  "increase salaries by 10%") that were being misclassified as destructive
  write operations — recovered a full class of valid questions with zero
  new engine code, since the underlying SQL/Python execution layer was
  already read-only by design.
- Implemented Google OAuth authentication and persistent conversation
  history (Supabase Auth + Postgres, row-level security) for a client-side
  AI data analysis tool, debugging three distinct integration failures
  across the OAuth handshake, session flow (implicit → PKCE), and a
  Content-Security-Policy misconfiguration blocking the token exchange.
- Added server-side rate limiting (Upstash Redis, sliding window) shared
  across three LLM-calling API routes to protect a shared multi-provider
  quota from direct API abuse, designed to fail open on any limiter outage
  so a defensive feature could never become a new single point of failure.
- Wrote regression tests for previously-uncovered core logic (SQL
  post-processing, rate-limit IP extraction and fail-open behavior),
  bringing the project's test suite to 224 passing tests across 19 files
  with zero known gaps.

---

## Interview stories

**"Tell me about a bug you fixed that taught you something."**
The outlier detection story (journal #10) is the strongest one here — it's
not "I found a bug," it's "I found a bug, fixed it, found the fix was
itself wrong in a different way, and only caught that because I insisted on
testing against more than the one failing example." Good answer to
"how do you know when you're actually done" — the honest answer is
"when I've tried to break it with a case I didn't design the fix around,"
not "when the reported case passes."

**"Describe a time you disagreed with your own earlier decision."**
Same story works here too — the second "fix" (median/MAD z-score) was a
defensible, textbook-correct choice that still turned out wrong for this
specific scale of data. Talks well about being willing to revisit a fix
you already shipped once new evidence shows up, instead of defending it.

**"How do you debug something you can't reproduce locally?"**
The three-layer auth bug (journal #12) — each failure looked unrelated to
the last, and the actual breakthrough in the third one was concrete:
open the browser console before theorizing further. Good contrast between
"reasoning from first principles" (which correctly solved failures 1 and 2)
and "just go look" (which is what actually solved failure 3 in one shot,
after guesses about race conditions and storage partitioning went nowhere).

**"How do you think about defensive/non-critical features?"**
The rate limiter's fail-open design is a clean, concrete answer: a feature
whose entire job is protecting against abuse should never become a new way
for the app to break for everyone if its own dependency has downtime.
Same principle shows up in the answer-summary caption feature earlier in
the project — cosmetic additions should degrade silently, never take the
real feature down with them.
