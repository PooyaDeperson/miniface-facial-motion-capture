/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import type { User } from "@supabase/supabase-js";
import AuthModal from "./AuthModal";
import IconButton from "./IconButton";

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [showModal, setShowModal] = useState(false);

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

  return (
    <>
      {user?.user_metadata?.avatar_url ? (
        <button
          className="tab-button br-12 reveal fade anim-delay-1"
          onClick={() => setShowModal(true)}
          aria-label="Account"
        >
          <img
            src={user.user_metadata.avatar_url}
            alt={user.user_metadata?.full_name ?? "avatar"}
            style={{ width: "22px", height: "22px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
          />
        </button>
      ) : (
        <IconButton
          icon="login-icon"
          iconSize="icon-size-16"
          className="icon-size-32 reveal fade anim-delay-1"
          tooltip={true}
          tooltipText="Sign in"
          tooltipPosition="pos-bottom"
          onClick={() => setShowModal(true)}
        />
      )}

      {showModal && <AuthModal onClose={() => setShowModal(false)} />}
    </>
  );
}
