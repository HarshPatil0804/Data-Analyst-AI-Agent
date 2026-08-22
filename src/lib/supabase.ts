import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Explicit auth config — do NOT rely on the library default here. The plain
// @supabase/supabase-js client (unlike @supabase/ssr) defaults to the
// IMPLICIT OAuth flow, which returns the raw access_token directly in a URL
// hash fragment (#access_token=...). That has well-documented race
// conditions in SPAs — the client's automatic hash-detection can lose the
// race against React Router mounting/rendering, leaving the hash sitting
// unconsumed and the login state never updating (see supabase-js/auth-js
// issues #455, #1691, #15930 — this is a known, recurring class of bug, not
// a one-off). PKCE avoids the whole failure class: the redirect carries a
// short-lived, single-use ?code= query param instead of a live token, which
// gets explicitly exchanged for a session — nothing sensitive ever sits
// exposed in the URL, and there's no hash-parsing race to lose.
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

export const isAuthConfigured = supabase !== null;

if (!isAuthConfigured && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — login and saved history are disabled. " +
      "See .env.local.example."
  );
}
