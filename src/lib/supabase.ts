import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Auth/history are an optional layer on top of a tool that fully works
// without them (anonymous use was — and stays — the default). So this is
// null, not a thrown error, when the env vars aren't set: every call site
// checks for null and quietly disables the auth UI rather than crashing the
// whole app for someone who hasn't set up Supabase.
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const isAuthConfigured = supabase !== null;

if (!isAuthConfigured && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — login and saved history are disabled. " +
      "See .env.local.example."
  );
}
