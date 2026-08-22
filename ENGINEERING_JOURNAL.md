# Engineering Journal

Twelve real bugs hit while building this, and how they got found and fixed.
Not a highlight reel — the point of writing this down is that "I built a
thing that works" and "I can explain why it broke and how I knew the fix
was right" are different claims, and only the second one is actually
useful to demonstrate.

---

## 1. Locale-dependent number formatting

**Symptom:** Numbers displayed fine on my machine. They wouldn't necessarily
display fine on a visitor's — `value.toLocaleString()` with no explicit
locale argument formats using the *browser's* regional settings, not a
fixed standard. The same underlying number — say `361540.22` — renders as
`361,540.22` under an en-US browser locale, but as `3,61,540.22` under an
en-IN locale (Indian digit grouping uses a different pattern past the
first three digits). Same data, visibly different output depending on who's
looking at it.

**Root cause:** `toLocaleString()` without an explicit locale argument is
non-deterministic across visitors by design — that's the entire point of
the API, but it's the wrong tool when you specifically want everyone to see
the same thing, like in an analytics tool where the read has to be exact.

**Fix:** Hardcode the locale in `formatDisplayValue` (`src/lib/formatValue.ts`):
`value.toLocaleString("en-US", ...)` instead of `value.toLocaleString(...)`.
Deliberate choice, not a default — the comment in that file spells out why,
so a future me (or anyone else reading it) doesn't "fix" it back.

**Lesson:** Any API with an implicit "current environment" default
(locale, timezone, `Date.now()`) is a bug waiting for a second reader.
Explicit > default, anywhere the output needs to be consistent.

---

## 2. The CSS cascade-layer bug (twice)

**Symptom:** A Tailwind utility class silently did nothing. First time: a
`rounded-[20px]` arbitrary-value utility on a claymorphism surface had no
visible effect — the element kept its old radius. Second time, same shape
of bug: `bg-[var(--color-accent)]` on a CTA button rendered with the wrong
background, like the utility wasn't applied at all.

**Root cause:** Tailwind v4 emits its utility classes inside a CSS
`@layer utilities` block. This project also has hand-written custom CSS for
the claymorphism surfaces (`.clay`, `.clay-accent`, etc. in `src/index.css`)
that is **not** wrapped in any `@layer`. Per the CSS cascade spec, layered
rules always lose to unlayered rules of equal specificity, regardless of
which one comes later in the file or in the DOM. So `.clay`'s own
`background`/`border-radius` declarations were always going to beat a
Tailwind utility targeting the same property, no matter the class order in
`className`. It wasn't a specificity fight I was going to win by rearranging
classes — it's structural to how the two stylesheets are layered.

**Fix:** Stopped reaching for Tailwind arbitrary-value utilities to
override anything already styled by the custom `.clay*` classes. Added real,
purpose-built classes instead — `.clay-solid-accent` for the CTA background
case — so the override lives in the same (unlayered) stylesheet and
actually wins. The comment left in `index.css` calls out that this is "the
same class of bug" as the first one, specifically so it wouldn't get
mis-diagnosed as a one-off the second time it showed up.

**Lesson:** The first time looked like a one-off arbitrary-value quirk.
Recognizing the *second* occurrence as the same root cause — rather than
debugging it from scratch again — is what actually turned it into a rule
("don't fight `.clay*` with Tailwind arbitrary values") instead of a
one-time patch.

---

## 3. The outlier-grouping analytical flaw

**Symptom:** Asking "are there any outliers in revenue?" against the
sample dataset (4 products at very different price points) returned a
list of outliers that were really just... Widget C's normal price range.
The numbers weren't wrong, but the *answer* was misleading — it read like
"these transactions are unusual" when the real story was "this product
costs more than the others."

**Root cause:** A naive z-score/outlier calculation pools every row
together before computing mean and standard deviation. When the underlying
categories have genuinely different scales (a $15 widget and a $200
widget), pooling makes the cheaper product's normal range look artificially
tight and the pricier product's normal range look like it's "full of
outliers" — the statistic is technically correct and analytically wrong.

**Fix:** Added an explicit instruction in the model's system prompt
(`api/generate-query.ts`): before computing an outlier/average/z-score on a
numeric column, check whether a categorical column the metric plausibly
depends on exists (product, region, category...), and if pooling would let
one group's normal scale get flagged as anomalous relative to another's,
compute the statistic **within each group** instead — unless the question
explicitly asks for a global figure.

**Lesson:** "The math is correct" and "the answer is right" aren't the
same claim. This is the one bug in this project that wasn't a code defect
at all — it was a modeling/prompt decision, and the fix lives in English
in the system prompt, not in a function.

---

## 4. Mid-build Groq model deprecation

**Symptom:** The model this project was built and tuned against
(`llama-3.3-70b-versatile`) got a deprecation notice from Groq mid-build —
announced with a shutdown date on the calendar, not immediate, but a clock
running.

**Root cause:** Not a bug in the traditional sense — a dependency on a
third-party model that isn't guaranteed to exist forever. Zero-cost,
API-based projects inherit the provider's roadmap whether you plan for it
or not.

**Fix:** Swapped `MODEL` in `api/generate-query.ts` to Groq's recommended
replacement (`openai/gpt-oss-120b`), documented with a code comment
recording *why* — the deprecation announcement date and shutdown date —
so the swap doesn't look arbitrary to a future reader, and re-ran the
eval set (Phase 18) against the new model to confirm the prompt still held
up before considering it done.

**Lesson:** A model name in code is a dependency like any other; the fix
itself was one line, but treating "does the whole prompt still behave the
same way against a different model" as a real question — not an
assumption — is what the eval set in Phase 18 exists for.

---

## 5. `npm ci` / lockfile cross-platform issue

*(Flagged for follow-up — the fix already landed in this codebase, but the
original incident details didn't leave a trace in code comments the way the
other four did. Rather than reconstruct specifics I can't verify from
what's actually in the repo, this section is intentionally left as a
placeholder: what broke, which platforms were involved, the exact error,
and the fix, from whoever was there when it happened.)*

---

## 6. The warm-up race (Phase 25)

**Symptom:** never actually observed in production — caught while writing the
Python engine's proactive warm-up (start downloading Pyodide right after
upload, instead of waiting for the first Python question). While designing
it, tracing through what happens if a real question arrives *while* that
background warm-up is still in flight surfaced a genuine bug in code that
had shipped back in the original Pyodide integration and worked fine until
now, because nothing had ever called it twice concurrently before.

**Root cause:** `loadCsvIntoDataframe` only checked "is this file already
fully loaded" (`loadedFile === file`) before starting a new load — it had no
concept of "a load for this file is already *in progress*." Once a
background warm-up could start a load that takes several seconds, a real
question arriving during that window would trigger a second, fully
redundant `loadCsv` round trip to the worker: same file, parsed twice,
pure wasted work (and, depending on message-processing order, a small risk
of the two loads finishing in a different order than started).

**Fix:** added an in-flight promise cache in `pyodide.ts`, keyed by file
reference — a second call for the *same* file while a load is already
running just awaits the first call's promise instead of starting its own;
a call for a genuinely *different* file (someone re-uploads mid-warm-up)
still starts fresh rather than incorrectly waiting on the wrong file.

**Lesson:** this bug didn't exist until a new feature made a previously
impossible situation (the same load function being called twice
concurrently for the same input) newly possible. Adding a background/async
path to existing code is a natural moment to re-check every function that
path now touches for exactly this class of "was implicitly safe because it
was only ever called once at a time" assumption — not just to test the new
path in isolation.

---

## 7. The permanently-broken Python engine (found via live user feedback)

**Symptom:** reported from the actual deployed app, not caught in this
environment — a Python-routed question failed. The specific failure in the
report turned out to be a genuine Groq rate limit (a different, correctly-
working code path — see the "All engines" 429 handling), but tracing
through the Python path to rule it out surfaced a real, separate bug that
had nothing to do with rate limits at all.

**Root cause:** `ensurePyodide()` (added in Phase 25, adding scipy) had this
shape: create the Pyodide runtime, assign it to the module-level `pyodide`
variable, *then* call `loadPackage(["pandas", "scipy"])`. If that package
load failed for any reason — a network hiccup, scipy briefly unavailable
from the CDN — the function would throw, but `pyodide` was already
non-null. Every subsequent call to `ensurePyodide()` would see that and
return immediately without retrying the load at all. One transient failure
during a package fetch would permanently disable the entire Python engine
for the rest of the session, with no way to recover short of a full page
reload — and the failure mode wouldn't even look related to scipy from the
outside, it would just look like "Python doesn't work anymore."

**Fix:** restructured so `pyodide` is only assigned *after* the required
package (pandas) has loaded successfully — a failure there leaves it
`null`, so the next call retries cleanly from scratch. scipy specifically
was made non-fatal: wrapped in its own `try/catch`, logged if it fails, but
doesn't block `pyodide` from being marked ready. Code that tries to use
scipy anyway when it failed to load will hit a normal Python
`ImportError`, which the existing self-correction retry loop already knows
how to feed back to the model and recover from — no new error-handling
path needed, just not accidentally defeating the one that already existed.

**Lesson:** "add an optional package to make things more powerful" and "add
a package the whole engine now depends on to function at all" are
different changes wearing the same one-line diff. The second one needs to
ask what happens when *this specific new thing* fails, not just when the
thing that was already there fails — the failure mode of a formerly-solid
`if (pyodide) return pyodide;` early-return check only became load-bearing
once there were two packages instead of one, and it's easy to not notice
that a defensive-looking early return has quietly become a trap.

---

## 8. "Python sometimes works, sometimes doesn't" (found via live usage, again)

**Symptom:** reported from the deployed app — Python-routed questions
failed noticeably more often than SQL ones, with a raw error: "Model
response wasn't valid JSON and couldn't be parsed." A second screenshot of
the same underlying question, after the self-correction loop retried and
switched engines, succeeded as SQL instead — which masked the real problem
rather than fixing it: the app was quietly routing around a bug instead of
the bug getting fixed.

**Root cause:** the router asks the model for a single JSON object where
the generated code is embedded as a JSON string value. JSON strings can't
contain a literal line break — a newline inside one has to be written as
the two characters `\n`. SQL answers are usually short and single-line, so
this rarely came up. Python answers are naturally multi-line, and models
don't always escape that correctly — occasionally emitting an actual line
break inside the string instead of `\n`. That's invalid JSON syntax, so
`JSON.parse` rejected the entire response, even though the Python code
itself was perfectly fine. This explains the exact pattern reported: not
"Python is broken," but "Python's code is structurally much more likely to
trip a JSON-escaping edge case than SQL's."

**Fix:** two parts. First, `parseModelJson` (shared by both `/api/generate-query`
and `/api/generate-insights`) now has a repair pass: it walks the raw text
tracking whether each character is inside a JSON string (toggling on an
unescaped `"`), and if so, converts a literal newline/tab/carriage-return
into its escaped form before retrying `JSON.parse`. This is a *targeted*
repair for exactly this one failure mode, not a general "fix any broken
JSON" tool — it deliberately doesn't try to guess its way out of other
malformed JSON, since a wrong guess there could silently produce the wrong
code instead of a clear error. Second, the system prompt now explicitly
tells the model to escape newlines/quotes and to prefer single quotes
inside Python/SQL string literals specifically to reduce how often
escaping is even needed.

**A bug inside the bug fix:** the first draft of that second part had its
own mistake — writing `\"` inside a JS template literal to show the model
an example of an escaped quote. In a JS template string, `\"` is an
"unnecessary" escape that just evaluates to `"`, silently dropping the
backslash — so the instructional text meant to say *"escape a quote as
`\"`"* was actually rendering as *"escape a quote as `"`"*, missing the
entire point. The linter caught it (`no-useless-escape`), and checking
what the string actually evaluates to (not just what it looks like in the
source) confirmed it. Needed `\\"` — an escaped backslash followed by a
quote — to get the literal two-character sequence into the string. Fixing
a bug about JSON string escaping by writing broken JS string escaping in
the fix itself is the kind of thing worth admitting rather than quietly
correcting off-screen.

**Lesson:** when a fix's whole job is "make sure this exact character
sequence ends up in the output," the fix is exactly the kind of code that
deserves being checked by *running* it and inspecting the real value, not
just by reading the source and assuming the escaping is right — the same
principle applies to the diagnosis as to the code being diagnosed.

---

## 9. Pyodide version skew (a caret range and a hardcoded CDN path pointing at two different versions)

**Symptom:** every Python-routed question failed outright with `Pyodide version
does not match: '314.0.3' <==> '314.0.2'`. Not intermittent — deterministic,
every single time, before any generated code even ran.

**Root cause:** `package.json` pinned Pyodide with `^314.0.2` — a caret
range — which let `npm install` resolve and lock `314.0.3` instead
(confirmed by checking what `package-lock.json` had actually resolved).
Meanwhile `pyodideWorker.ts` had a hardcoded `PYODIDE_VERSION = "314.0.2"`
used to build the CDN `indexURL` Pyodide loads its stdlib and packages from.
The JS runtime bundled from npm was v314.0.3; the CDN path it was told to
pull supporting files from was pinned to v314.0.2. Pyodide's own internal
consistency check refuses to boot when these disagree, by design — loading
a mismatched runtime/stdlib pair would otherwise corrupt state silently, so
it fails loudly instead.

**Fix:** bumped the hardcoded version string to match the resolved lockfile
version, and — more importantly — removed the caret from `package.json` so
a future `npm install` can't silently resolve a different patch version out
from under the hardcoded string again. The comment already sitting above
that constant said "must match the installed npm package version" — the
caret quietly broke the promise that comment was making, without anyone
touching either line directly.

**Lesson:** a version comment next to a hardcoded string is only actually
enforced if the *other* end of that promise is pinned too. A caret range on
a dependency whose exact version has to match something else hardcoded
elsewhere is an invitation for exactly this bug.

---

## 10. Outlier detection, three tries to get right

**Symptom:** asked "is there any outlier in the data?" against a small
salary dataset where one employee's salary (₹250L against peers around
₹30-60L) was an obvious outlier by eye. The tool returned zero rows — no
outlier found at all, on data where glancing at the table catches it
instantly.

**Root cause, attempt 1 (mean/std z-score):** the prompt had the model
compute outliers per-department (a reasonable instinct — different
departments genuinely sit on different salary scales) using
`scipy.stats.zscore`, a mean/standard-deviation-based statistic. Within the
outlier's own small group (n=5), that single extreme value inflated the
group's own mean and standard deviation so much that its z-score landed
just under the flagging threshold — the outlier's presence in the very
statistic used to judge it hid it from itself. This is a textbook case of
"masking" in robust statistics, not a coding bug; the code ran correctly
and computed exactly what it was told to.

**Fix, attempt 1 → attempt 2 (median/MAD modified z-score):** switched to a
statistic that doesn't get dragged around by the point it's judging —
median and MAD (median absolute deviation) instead of mean and std, with
the standard Iglewicz & Hoaglin threshold of 3.5. This correctly caught the
salary outlier. But testing against two other sample datasets (a 20-row
exam-marks set with one clearly weak score, and a 12-row product-price set)
showed the same threshold was now *too conservative* on small samples —
genuine outliers a person would immediately flag came out just under 3.5
and got silently missed. Traded one failure mode for a different one
instead of actually fixing it.

**Fix, attempt 2 → attempt 3 (Tukey IQR fences):** switched again, this
time to the same rule boxplots use — flag anything outside
`Q1 - 1.5×IQR` to `Q3 + 1.5×IQR`. Verified this by hand against all three
test datasets before touching the prompt: it correctly caught every real
outlier, at every sample size tested (10, 12, and 20 rows), with no
masking regression on the original salary case. Also simpler code than the
MAD version (no conditional branch needed for a divide-by-zero guard),
which as a side effect reduced how often the model's generated Python broke
JSON escaping on longer, branching code.

**Lesson:** "made the answer correct on the failing example" and "made the
answer correct" are different claims, and the gap between them only shows
up when you go looking for it with a second and third test case instead of
stopping at the first green result. Two statistically-reasonable fixes in a
row both failed in a way only some *other* dataset would reveal.

---

## 11. Treating an imperative sentence as a destructive command

**Symptom:** "increase everyone's salary by 10% and show me the final list"
was declined outright — "That question doesn't seem answerable from this
dataset's columns" — even though the tool has always been fully capable of
computing and returning exactly that (a new derived column), and even
though nothing about the underlying SQL/Python engines can ever persist a
change to the source data regardless of how the question is phrased.

**Root cause:** the routing prompt's rule for declining destructive
requests was written broadly — "asks for a write/destructive operation
this tool never performs (delete, update, modify the data)" — and the
model reasonably read "increase everyone's salary" as an UPDATE-style
command and declined it, with no way to distinguish that from "compute a
new column showing what a 10% increase would look like." Those are
architecturally completely different (one mutates stored data, the other
computes and displays a value), but the prompt's wording only drew a line
based on how a sentence *sounded*, not on what the tool would actually have
to do to answer it.

**Fix:** rewrote the rule to explicitly separate the two cases — an
imperative-sounding question that's really asking for a computed or
hypothetical value now routes normally to SQL or Python, while only
requests that explicitly ask to *persist* a change, delete real rows, or
act outside the tool's scope (email, save, export) still get declined.
Verified both directions afterward: the raise question now correctly
returns a `new_salary_lakh` column for every employee, and a genuinely
destructive phrasing ("permanently update the salaries in the database")
still declines correctly.

**Lesson:** no new capability or engine was needed here — the SQL layer was
already SELECT-only and the Python layer already never reassigned the
source `df`, so both were already incapable of doing real damage regardless
of how a question was worded. The bug was entirely a classification
boundary drawn on the wrong signal (sentence mood) instead of the thing
that actually mattered (does this touch the source data). Worth checking,
before reaching for a new feature or engine: is this really a missing
capability, or a badly-drawn line around a capability that's already there?

---

## 12. Three unrelated-looking auth failures that were each a different layer of the same feature

**Symptom:** adding Google login via Supabase failed three separate times
in a row while wiring up the exact same feature, each with a completely
different-looking error.

**Failure 1** — `{"message":"No API key found in request"}`, with the
browser's address bar showing a doubled path:
`.../rest/v1/auth/v1/authorize`. Root cause: `VITE_SUPABASE_URL` had been
copied from the wrong field in Supabase's dashboard — the REST endpoint
(which already ends in `/rest/v1`) instead of the bare project URL. The SDK
builds its own auth endpoint by appending `/auth/v1/...` onto whatever base
URL it's given, so a base URL that already had a path on it produced a
doubled, invalid path. Fix: use the bare project URL with no suffix.

**Failure 2** — login appeared to succeed (Google's account picker,
redirect back) but the navbar never updated, and the URL sat there showing
a raw, unconsumed `#access_token=...` fragment. Root cause: the plain
Supabase client defaults to the *implicit* OAuth flow, which returns a live
token directly in a URL hash — a flow with well-documented race conditions
in single-page apps, where the client library's automatic hash-parsing can
lose against the app's own router mounting. Fix: explicitly configured PKCE
flow instead, which exchanges a short-lived one-time code rather than ever
exposing a live token in the URL.

**Failure 3** — after switching to PKCE, the URL correctly showed a
one-time `?code=...`, but it still sat there unconsumed with the login
button still showing. Checking the browser console — rather than
continuing to reason about it from the UI alone — showed the actual cause
immediately: a Content-Security-Policy header, already in place to lock
down which domains the app can talk to, only allowlisted the app's own
origin and the CDN Pyodide loads from. Supabase's domain was never added,
so the browser silently blocked the network call needed to exchange the
code for a session, before the request even left. Fix: added Supabase's
domain to `connect-src`.

**Lesson:** three failures, three different actual root causes, none
guessable from the symptom alone. The first two got diagnosed correctly by
reasoning about how the pieces should fit together, but the third one only
became obvious the moment the browser console was actually opened instead
of continuing to theorize about race conditions and storage partitioning.
The console had the exact answer, unambiguously, the whole time — worth
remembering as a default first step for the *next* mysterious frontend
integration bug, before spending time reasoning about internals from the
outside.

---

**Pattern across all five** *(original set — #6, #7, #8 are later additions
following the same discipline):* none of these were caught by "it works on
my machine." #1 needed a second locale. #2 needed a second occurrence to
become a rule instead of a patch. #3 needed a domain read of the *answer*,
not just the math. #4 needed watching an external dependency's own
announcements. #3 and #4 both got a regression check added (the grouping
rule is exercised by the eval set's outlier case; the model swap was
re-validated against the same eval set) specifically so the fix wouldn't
silently regress on the next prompt change. #7 needed a live deployment —
not this development environment — actually being used by someone, to
surface a code path this environment structurally couldn't exercise. #8
needed a second screenshot to see that the retry loop had been quietly
masking the real bug instead of fixing it. #9 needed reading the lockfile's
*resolved* version, not just the range written in `package.json`. #10
needed two more datasets before the fix could be trusted, since the first
"correct" fix and the second "correct" fix were each only tested against
the case that had just failed. #11 needed noticing that a declined request
wasn't actually a missing capability at all — just a rule drawing its line
on the wrong signal. #12 needed the browser console, not more reasoning
from the outside, to turn a third guess into a one-line fix.
