
/*
 * Copyright (c) 2025 Pooya Deperson pooyadeperson@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 * 
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Deperson pooyadeperson@gmail.com https://github.com/PooyaDeperson"
 */


import React, { useEffect } from "react";

interface AvatarSwitcherProps {
  onAvatarChange: (newUrl: string) => void;
  activeUrl: string | null;
}

const AvatarSwitcher: React.FC<AvatarSwitcherProps> = ({ onAvatarChange, activeUrl }) => {
  const avatars = [
    { name: "Avatar 1", url: "https://models.readyplayer.me/68c19bef8ac0d37a66aa2930.glb?morphTargets=ARKit&textureAtlas=1024" },
    { name: "Avatar 2", url: "https://models.readyplayer.me/68c1b98163cdbdf2d3403aab.glb?morphTargets=ARKit&textureAtlas=1024" },
    { name: "Avatar 3", url: "https://models.readyplayer.me/68dcef4322326403eca002f5.glb?morphTargets=ARKit&textureAtlas=1024" },
    { name: "Avatar 4", url: "https://models.readyplayer.me/68dcf93c9603200be52d3e3d.glb?morphTargets=ARKit&textureAtlas=1024" },
    { name: "Avatar 5", url: "https://models.readyplayer.me/68dcf9d16c40ed329a4e4681.glb?morphTargets=ARKit&textureAtlas=1024" },
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
  }, []);

  // Save avatar to localStorage whenever it changes
  useEffect(() => {
    if (activeUrl) {
      localStorage.setItem("activeAvatar", activeUrl);
    }
  }, [activeUrl]);

  return (
    <div className="avatar-switcher reveal slide-left bottom-0 m-6 tb:center-horizontal flex-col pos-fixed z-6">
      {avatars.map((avatar, index) => {
        const isActive = activeUrl === avatar.url;
        return (
          <button
            key={avatar.name}
            onClick={() => !isActive && onAvatarChange(avatar.url)}
            className={`avatar-btn avatar-selection avatar${index + 1} ${isActive ? "active" : ""}`}
            disabled={isActive} // prevent re-selecting
          >
            {/* {avatar.name} */}
          </button>
        );
      })}
    </div>
  );
};

export default AvatarSwitcher;