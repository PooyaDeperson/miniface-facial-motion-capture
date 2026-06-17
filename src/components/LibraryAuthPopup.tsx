/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

/**
 * LibraryAuthPopup.tsx
 *
 * Shown to a non-logged-in user when they click the Motion Library button.
 * Encourages them to connect with Google to save and stream their motions.
 *
 * Supports an optional image on top (set imgSrc to enable it).
 */

import { useState, useEffect } from "react";
import { supabase, isSupabaseAvailable } from "../supabaseClient";
import { DRIVE_SCOPE } from "../useDriveSync";
import PermissionPopup from "./PermissionPopup";

interface LibraryAuthPopupProps {
  onClose: () => void;
  onDriveConnected?: () => void;
  /**
   * Optional image URL shown at the top of the popup.
   * Leave empty / undefined to hide the image area.
   * Replace with your actual image URL when ready.
   */
  imgSrc?: string;
}

export default function LibraryAuthPopup({
  onClose,
  onDriveConnected,
  imgSrc,
}: LibraryAuthPopupProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close automatically once drive connects
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

  const mediaProps = imgSrc
    ? { image: imgSrc, imagAlt: "Motion library preview" }
    : {};

  return (
    <PermissionPopup
      variant="prompt"
      closeButton={onClose}
      centered
      backdrop
      onBackdropClick={onClose}
      aria-label="Connect to save your motions"
      title="connect to save your motions online and stream foreverrrrrr...."
      {...mediaProps}
      className="auth-popup library-auth-popup"
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
