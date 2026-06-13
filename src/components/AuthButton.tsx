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
    
      >
        {user?.user_metadata?.avatar_url ? (
          <>
            <img
              src={user.user_metadata.avatar_url}
              alt={user.user_metadata?.full_name ?? "avatar"}
              style={{ width: "22px", height: "22px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
            />
            {/* <span className="text sm">
              {user.user_metadata?.given_name ?? user.user_metadata?.full_name ?? user.email ?? "Account"}
            </span> */}
          </>
        ) : (
          <>
            <span className="has-icon icon-size-16 login-icon"></span>
            <span className="text sm text-muted"></span>
          </>
        )}
      </button>

      {showModal && <AuthModal onClose={() => setShowModal(false)} />}
    </>
  );
}
