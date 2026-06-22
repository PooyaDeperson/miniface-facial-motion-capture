/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

import type { User } from "@supabase/supabase-js";
import IconButton from "./IconButton";

interface AuthButtonProps {
  user: User | null;
  onDriveConnected?: () => void;
  onLoginRequest?: () => void;
}

export default function AuthButton({ user, onDriveConnected: _onDriveConnected, onLoginRequest }: AuthButtonProps) {

  const handleLoginClick = () => {
    if (onLoginRequest) {
      onLoginRequest();
    }
  };

  return (
    <>
      {user?.user_metadata?.avatar_url ? (
        <button
          className="tab-button br-12 reveal fade anim-delay-1"
          onClick={handleLoginClick}
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
          tooltipText="Connect"
          tooltipPosition="pos-bottom-right"
          onClick={handleLoginClick}
        />
      )}
    </>
  );
}
