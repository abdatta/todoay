"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null | undefined;

export const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const getSupabaseClient = () => {
  if (supabaseClient !== undefined) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    supabaseClient = null;
    return supabaseClient;
  }

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      storageKey: "todoay-supabase-auth",
    },
  });

  return supabaseClient;
};

export const getOAuthRedirectUrl = () => {
  if (typeof window === "undefined") {
    return undefined;
  }

  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
};
