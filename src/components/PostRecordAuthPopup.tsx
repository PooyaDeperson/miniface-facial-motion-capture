/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

/**
 * PostRecordAuthPopup.tsx
 *
 * Shown to a non-logged-in user immediately after they stop a recording and
 * enter playback mode. Encourages them to sign in to save the motion forever.
 *
 * Uses PermissionPopup with a custom top-center position so it doesn't
 * block the avatar or the playback controls.
 */

import { useState, useEffect } from "react";
import { supabase, isSupabaseAvailable } from "../supabaseClient";
import { DRIVE_SCOPE } from "../useDriveSync";
import PermissionPopup from "./PermissionPopup";

interface PostRecordAuthPopupProps {
  onClose: () => void;
  onDriveConnected?: () => void;
}

export default function PostRecordAuthPopup({
  onClose,
  onDriveConnected,
}: PostRecordAuthPopupProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close automatically after drive connects
  useEffect(() => {
    if (!supabase) return;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setTimeout(() => {
          onDriveConnected?.();
          onClose();
        }, 300);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [onDriveConnected, onClose]);

  const handleGoogleLogin = async () => {
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

  return (
    <PermissionPopup
      variant="prompt"
      // backdrop
      // onBackdropClick={onClose}
      aria-label="Save your recording"
      title="nice. Keep your motions forever, in the motion library"
      className="auth-popup post-record-auth-popup"
    >
      <p className="subtitle prompt-subtitle">
        just use your Google account, by continuing you agree to{" "}
        <a href="/terms" target="_blank" rel="noreferrer">Terms</a>{" "}
        and{" "}
        <a href="/privacy" target="_blank" rel="noreferrer">privacy</a>.
      </p>

      {!isSupabaseAvailable() && (
        <p className="subtitle denied-subtitle error-banner" role="status">
          auth not configured — set Supabase env vars to enable sign in
        </p>
      )}

      {error && (
        <p className="subtitle denied-subtitle error-banner" role="alert">
          {error}
        </p>
      )}

      <button
        className="button primary prompt-button flex flex-row justify-center items-center gap-1 w-full mt-8"
        onClick={handleGoogleLogin}
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
