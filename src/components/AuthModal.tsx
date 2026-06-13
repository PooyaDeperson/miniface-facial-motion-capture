/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import type { User } from "@supabase/supabase-js";

interface AuthModalProps {
  onClose: () => void;
}

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    <path fill="none" d="M0 0h48v48H0z" />
  </svg>
);

export default function AuthModal({ onClose }: AuthModalProps) {
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="pos-fixed top-0 left-0 w-full h-full z-9991"
        style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="popup-container auth-popup reveal fade scaleIn pos-fixed z-9992 p-1 br-20"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(360px, calc(100vw - 40px))",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={user ? "Account" : "Sign in"}
      >
        <div className="inner-container p-5 flex-col br-16" style={{ gap: "0" }}>
          {/* Close button */}
          {/* <div className="flex-row" style={{ justifyContent: "flex-end", marginBottom: "4px" }}>
            <button
              className="tab-button icon-holder size-30"
              onClick={onClose}
              aria-label="Close"
              style={{ borderRadius: "50%" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4l8 8" stroke="var(--gray-600)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div> */}

          {user ? (
            /* ── Signed-in state ── */
            <div className="flex-col items-center" style={{ gap: "16px", textAlign: "center", paddingBottom: "8px" }}>
              <div
              className="avatar-image-containter pos-abs"
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "var(--purple-200)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px",
                  margin: "0 auto",
                }}
                aria-hidden="true"
              >
                {user.user_metadata?.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt={user.user_metadata?.full_name ?? "avatar"}
                    style={{ width: "56px", height: "56px", borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  <span style={{ color: "var(--purple-900)", fontWeight: 600 }}>
                    {(user.user_metadata?.full_name ?? user.email ?? "?")[0].toUpperCase()}
                  </span>
                )}
              </div>

              <div style={{ gap: "4px" }} className="flex-col">
                <h1 className="title prompt-title" style={{ textAlign: "center" }}>
                  {user.user_metadata?.full_name ?? "welcome back"}
                </h1>
                <p className="subtitle prompt-subtitle" style={{ textAlign: "center" }}>
                  {user.email}
                </p>
              </div>

              <button
                className="button primary w-full"
                onClick={handleSignOut}
                disabled={loading}
                style={{ marginTop: "8px" }}
              >
                {loading ? "signing out…" : "sign out"}
              </button>
            </div>
          ) : (
            /* ── Signed-out state ── */
            <div className="flex-col">
              <div className="flex-col">
                <h1 className="title prompt-title">Connect to save your motion and stream foreverrrrrrrrrrrrrrrrr....</h1>
                <p className="subtitle prompt-subtitle">
                  just use your Google account, also by continuing you agree to <a className="" href="/cookies" target="_blank">cookies</a>
                </p>
              </div>

              {error && (
                <p
                  className="subtitle denied-subtitle"
                  style={{ background: "var(--bg-danger-soft)", padding: "10px 14px", borderRadius: "10px" }}
                  role="alert"
                >
                  {error}
                </p>
              )}

              <button
                className="flex  flex-row justify-center button primary prompt-button items-center gap-1 "
                onClick={handleGoogleLogin}
                disabled={loading}
        
              >
                {loading ? (
                  <>
                    <span className="spinner" style={{ width: "18px", height: "18px", borderWidth: "3px" }} />
                    connecting…
                  </>
                ) : (
                  <>
                    <span className="has-icon icon-size-16 google-icon"></span>
                    continue with google
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
