/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey =
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_PUBLIC ||
  "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
