/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

import { useState, useEffect } from "react";
import { supabase, isSupabaseAvailable } from "../supabaseClient";
import type { User } from "@supabase/supabase-js";
import PermissionPopup from "./PermissionPopup";

interface AuthModalProps {
  onClose: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleGoogleLogin = async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: false,
      },
    });
    if (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
  };

  if (user) {
    /* ── Signed-in state ── */
    return (
      <PermissionPopup
        variant="prompt"
        centered
        backdrop
        onBackdropClick={onClose}
        aria-label="Account"
        avatar={{
          src: user.user_metadata?.avatar_url,
          alt: user.user_metadata?.full_name ?? "avatar",
          fallback: user.user_metadata?.full_name ?? user.email ?? "?",
        }}
        title={`hey, ${user.user_metadata?.full_name ?? "welcome back"}`}
        className="auth-popup"
      >
        <p className="subtitle prompt-subtitle">
          you are connected as,<br />
          {user.email},<br />
          you can disconnect from here. Sad to see you go.
        </p>
        <button
          className="button primary w-full mt-8"
          onClick={handleSignOut}
          disabled={loading}
        >
          {loading ? "disconnecting..." : "disconnect"}
        </button>
      </PermissionPopup>
    );
  }

  /* ── Signed-out state ── */
  return (
    <PermissionPopup
      variant="prompt"
      centered
      backdrop
      onBackdropClick={onClose}
      aria-label="Sign in"
      title="Connect to save your motion and stream forever"
      className="auth-popup"
    >
      <p className="subtitle prompt-subtitle">
        just use your Google account, also by continuing you agree to{" "}
        <a href="/cookies" target="_blank" rel="noreferrer">cookies</a> and
        <a href="/pivacy" target="_blank" rel="noreferrer">privacy</a>

      </p>

      {/* Supabase not configured */}
      {!isSupabaseAvailable() && (
        <p className="subtitle denied-subtitle error-banner" role="status">
          auth not configured — set Supabase env vars to enable sign in
        </p>
      )}

      {/* Error banner */}
      {error && (
        <p className="subtitle denied-subtitle error-banner" role="alert">
          {error}
        </p>
      )}

      {/* Google sign-in button */}
      <button
        className="button primary prompt-button flex flex-row justify-center items-center gap-1 w-full mt-8"
        onClick={handleGoogleLogin}
        disabled={loading || !isSupabaseAvailable()}
      >
        {loading ? (
          <>
            <span className="spinner spinner-sm" />
            connecting…
          </>
        ) : (
          <>
            <span className="has-icon icon-size-16 google-icon" />
            continue with google
          </>
        )}
      </button>
    </PermissionPopup>
  );
}
