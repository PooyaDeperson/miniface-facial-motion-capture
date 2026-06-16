/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

import { useState, useEffect } from "react";
import { supabase, isSupabaseAvailable } from "../supabaseClient";
import { hasDriveAccess, DRIVE_SCOPE } from "../useDriveSync";
import type { User } from "@supabase/supabase-js";
import PermissionPopup from "./PermissionPopup";

interface AuthModalProps {
  onClose: () => void;
  /** Called after Drive scope is successfully obtained */
  onDriveConnected?: () => void;
}

export default function AuthModal({ onClose, onDriveConnected }: AuthModalProps) {
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [driveConnected, setDriveConnected] = useState(() => hasDriveAccess());

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setDriveConnected(hasDriveAccess());
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      // Small delay to allow supabaseClient.ts to store tokens first
      setTimeout(() => {
        const connected = hasDriveAccess();
        setDriveConnected(connected);
        if (connected) onDriveConnected?.();
      }, 100);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [onDriveConnected]);

  /** Sign in with Google + Drive appdata scope */
  const handleGoogleLoginWithDrive = async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: false,
        scopes: DRIVE_SCOPE,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
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
          {user.email}
        </p>

        {/* Drive connection status */}
        {driveConnected ? (
          <p className="subtitle prompt-subtitle mt-8" style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Google Drive is connected. Your motions are syncing to the cloud.
          </p>
        ) : (
          <>
            <p className="subtitle prompt-subtitle mt-8" style={{ fontSize: "13px" }}>
              Connect Google Drive to save and sync your motions across devices.
            </p>
            <button
              className="button primary w-full mt-8"
              onClick={handleGoogleLoginWithDrive}
              disabled={loading || !isSupabaseAvailable()}
            >
              {loading ? (
                <>
                  <span className="spinner spinner-sm" />
                  connecting&hellip;
                </>
              ) : (
                <>
                  <span className="has-icon icon-size-16 google-icon" />
                  connect Google Drive
                </>
              )}
            </button>
          </>
        )}

        {error && (
          <p className="subtitle denied-subtitle error-banner mt-8" role="alert">
            {error}
          </p>
        )}

        <button
          className="button primary w-full mt-8"
          onClick={handleSignOut}
          disabled={loading}
          style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}
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
      title="Connect to save your motion and sync forever"
      className="auth-popup"
    >
      <p className="subtitle prompt-subtitle">
        sign in with Google to save your motions to Drive and access them from any device.{" "}
        By continuing you agree to{" "}
        <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and{" "}
        <a href="/privacy" target="_blank" rel="noreferrer">Privacy</a>.
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

      {/* Google sign-in button (always requests Drive scope) */}
      <button
        className="button primary prompt-button flex flex-row justify-center items-center gap-1 w-full mt-8"
        onClick={handleGoogleLoginWithDrive}
        disabled={loading || !isSupabaseAvailable()}
      >
        {loading ? (
          <>
            <span className="spinner spinner-sm" />
            connecting&hellip;
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
