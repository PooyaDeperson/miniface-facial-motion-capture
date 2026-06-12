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
// Priority order:
//   1. Explicit REACT_APP_SUPABASE_URL / ANON_KEY  → always wins (Vercel prod deployment)
//   2. Explicit REACT_APP_SUPABASE_STAGE_URL / ANON_KEY → stage deployment
//   3. Hostname check: facemocap.radframes.com → PROD inline values
//   4. Everything else (localhost, preview, stage host) → STAGE inline values

const isProductionHost =
  typeof window !== "undefined" &&
  window.location.hostname === "facemocap.radframes.com";

const explicitProdUrl = process.env.REACT_APP_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const explicitProdKey =
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_PUBLIC;

const explicitStageUrl = process.env.REACT_APP_SUPABASE_STAGE_URL;
const explicitStageKey = process.env.REACT_APP_SUPABASE_STAGE_ANON_KEY;

const supabaseUrl =
  explicitProdUrl ||
  explicitStageUrl ||
  (isProductionHost ? PROD.url : STAGE.url);

const supabaseAnonKey =
  explicitProdKey ||
  explicitStageKey ||
  (isProductionHost ? PROD.anonKey : STAGE.anonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
