
/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 * 
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson"
 */


import React, { useEffect } from "react";

interface AvatarSwitcherProps {
  onAvatarChange: (newUrl: string) => void;
  activeUrl: string | null;
  disabled?: boolean;
}

const AvatarSwitcher: React.FC<AvatarSwitcherProps> = ({ onAvatarChange, activeUrl, disabled = false }) => {
  const avatars = [
    { name: "Avatar 1", url: "/avatar/avatar-ponytail.glb" },
    { name: "Avatar 2", url: "/avatar/avatar-short.glb" },
    { name: "Avatar 3", url: "/avatar/avatar-curly.glb" },
    { name: "Avatar 4", url: "/avatar/avatar-braids.glb" },
    { name: "Avatar 5", url: "/avatar/avatar-wavy.glb" },
  ];

  // Load avatar from localStorage on mount
  useEffect(() => {
    const savedAvatar = localStorage.getItem("activeAvatar");
    if (savedAvatar) {
      onAvatarChange(savedAvatar);
    } else if (!activeUrl) {
      // Default to the first avatar if nothing is saved
      onAvatarChange(avatars[0].url);
      localStorage.setItem("activeAvatar", avatars[0].url);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save avatar to localStorage whenever it changes
  useEffect(() => {
    if (activeUrl) {
      localStorage.setItem("activeAvatar", activeUrl);
    }
  }, [activeUrl]);

  return (
    <div className={`avatar-switcher reveal slide-left bottom-0 m-6 tb:center-horizontal flex-col pos-fixed z-6${disabled ? " switcher-disabled" : ""}`}>
      {avatars.map((avatar, index) => {
        const isActive = activeUrl === avatar.url;
        return (
          <button
            key={avatar.name}
            onClick={() => !isActive && !disabled && onAvatarChange(avatar.url)}
            className={`avatar-btn avatar-selection avatar${index + 1} ${isActive ? "active" : ""}`}
            disabled={isActive || disabled}
            aria-disabled={disabled || undefined}
          >
            {/* {avatar.name} */}
          </button>
        );
      })}
    </div>
  );
};

export default AvatarSwitcher;
