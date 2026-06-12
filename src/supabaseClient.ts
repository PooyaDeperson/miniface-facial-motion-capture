/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.REACT_APP_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://zblmtezhaqcknkleswts.supabase.co";

const supabaseAnonKey =
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_PUBLIC ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpibG10ZXpoYXFja25rbGVzd3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNzkwODQsImV4cCI6MjA5Njg1NTA4NH0.W6qIQ-tZASWN_VK3ovIHRZODFrPKMxyctH2EEn_MQEs";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
