/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import type { User } from "@supabase/supabase-js";
import AuthModal from "./AuthModal";

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [showModal, setShowModal] = useState(false);

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

  return (
    <>
      <button
        className="tab-button br-12 reveal fade anim-delay-1"
        onClick={() => setShowModal(true)}
        aria-label={user ? "Account" : "Sign in"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 14px",
          minHeight: "36px",
        }}
      >
        {user?.user_metadata?.avatar_url ? (
          <>
            <img
              src={user.user_metadata.avatar_url}
              alt={user.user_metadata?.full_name ?? "avatar"}
              style={{ width: "22px", height: "22px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
            />
            <span style={{ fontSize: "13px", fontWeight: 500, maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.user_metadata?.given_name ?? user.user_metadata?.full_name ?? user.email ?? "Account"}
            </span>
          </>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
              <path
                d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span style={{ fontSize: "13px", fontWeight: 500 }}>Log in</span>
          </>
        )}
      </button>

      {showModal && <AuthModal onClose={() => setShowModal(false)} />}
    </>
  );
}
