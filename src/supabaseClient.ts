/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

import { createClient } from "@supabase/supabase-js";

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

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    `[supabase] Missing env vars for ${isProductionHost ? "production" : "stage"}. ` +
    `Expected ${isProductionHost
      ? "REACT_APP_SUPABASE_URL + REACT_APP_SUPABASE_ANON_KEY"
      : "REACT_APP_SUPABASE_STAGE_URL + REACT_APP_SUPABASE_STAGE_ANON_KEY"}.`
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
