/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { storeDriveTokens, clearDriveTokens, notifyNoDriveScope } from "./useDriveSync";

// ── Environment detection ────────────────────────────────────────────────────
// On facemocap.radframes.com → use REACT_APP_SUPABASE_URL / ANON_KEY (prod vars).
// On every other host       → use REACT_APP_SUPABASE_STAGE_URL / STAGE_ANON_KEY.
// Set the matching pair in Vercel's Environment Variables for each deployment.

const isProductionHost =
  typeof window !== "undefined" &&
  window.location.hostname === "facemocap.radframes.com";

const supabaseUrl = isProductionHost
  ? process.env.REACT_APP_SUPABASE_URL
  : process.env.REACT_APP_SUPABASE_STAGE_URL;

const supabaseAnonKey = isProductionHost
  ? process.env.REACT_APP_SUPABASE_ANON_KEY
  : process.env.REACT_APP_SUPABASE_STAGE_ANON_KEY;

// ── Availability flag ────────────────────────────────────────────────────────
// When env vars are absent (local dev, CI, preview without secrets) we export
// null instead of throwing so the rest of the app keeps running.  Auth-dependent
// features should guard with `if (!supabase)` or `isSupabaseAvailable()`.

const missingVar = isProductionHost
  ? "REACT_APP_SUPABASE_URL + REACT_APP_SUPABASE_ANON_KEY"
  : "REACT_APP_SUPABASE_STAGE_URL + REACT_APP_SUPABASE_STAGE_ANON_KEY";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    `[supabase] env vars not set (${missingVar}). ` +
    `Auth features will be disabled. Add them to .env.local to enable.`
  );
}

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

/** Returns true when Supabase is properly configured and auth features are available. */
export const isSupabaseAvailable = (): boolean => supabase !== null;

// ── Capture Drive tokens on sign-in ──────────────────────────────────────────
// Supabase hands us provider_token / provider_refresh_token ONLY on the initial
// SIGNED_IN event after the OAuth redirect. We capture them here so every part
// of the app can call hasDriveAccess() / storeDriveTokens() without knowing
// about the auth flow.
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.provider_token) {
      storeDriveTokens(
        session.provider_token,
        session.provider_refresh_token ?? null,
        session.user?.email
      );
    }
    if (event === "SIGNED_IN" && !session?.provider_token) {
      // User signed in with Google but did not grant the Drive scope.
      // Notify subscribers so the app can prompt them to retry with Drive access.
      notifyNoDriveScope();
    }
    if (event === "SIGNED_OUT") {
      clearDriveTokens();
    }
  });
}
