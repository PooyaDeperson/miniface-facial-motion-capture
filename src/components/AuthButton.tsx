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
        className="tab-button icon-holder br-12 reveal fade anim-delay-1"
        onClick={() => setShowModal(true)}
        aria-label={user ? "Account" : "Sign in"}
        title={user ? (user.user_metadata?.full_name ?? user.email ?? "Account") : "Sign in"}
        style={{ padding: "6px 10px", minWidth: "36px", minHeight: "36px" }}
      >
        {user?.user_metadata?.avatar_url ? (
          <img
            src={user.user_metadata.avatar_url}
            alt={user.user_metadata?.full_name ?? "avatar"}
            style={{ width: "24px", height: "24px", borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="8" r="4" stroke="var(--purple-900)" strokeWidth="2" />
            <path
              d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
              stroke="var(--purple-900)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>

      {showModal && <AuthModal onClose={() => setShowModal(false)} />}
    </>
  );
}
