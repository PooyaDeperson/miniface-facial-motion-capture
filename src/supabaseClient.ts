/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

import { createClient } from "@supabase/supabase-js";

// ── Project configs ──────────────────────────────────────────────────────────
const PROD = {
  url: "https://zblmtezhaqcknkleswts.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpibG10ZXpoYXFja25rbGVzd3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNzkwODQsImV4cCI6MjA5Njg1NTA4NH0.W6qIQ-tZASWN_VK3ovIHRZODFrPKMxyctH2EEn_MQEs",
};

const STAGE = {
  url: "https://zdzlbxxnajouvqhovnfs.supabase.co",
  anonKey:
    "sb_publishable_39kb1ww30HcIie3KkN5IBg_z5sjo-YG",
};

// ── Environment detection ────────────────────────────────────────────────────
// Env vars take priority (set in Vercel project settings per deployment).
// Fallback: detect by hostname so localhost / stage preview use STAGE config.
const isProduction =
  typeof window !== "undefined" &&
  window.location.hostname === "facemocap.radframes.com";

const envUrl =
  process.env.REACT_APP_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const envKey =
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_PUBLIC;

const supabaseUrl = envUrl || (isProduction ? PROD.url : STAGE.url);
const supabaseAnonKey = envKey || (isProduction ? PROD.anonKey : STAGE.anonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
