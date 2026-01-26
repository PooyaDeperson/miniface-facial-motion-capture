import React, { useEffect, useRef } from "react";

interface AvatarSwitcherProps {
  onAvatarChange: (newUrl: string) => void;
  activeUrl: string | null;
}

const avatars = [
  { name: "Avatar 1", url: "avatar/avatar1.glb" },
  { name: "Avatar 2", url: "avatar/avatar2.glb" },
  { name: "Avatar 3", url: "avatar/avatar3.glb" },
  { name: "Avatar 4", url: "avatar/avatar4.glb" },
  { name: "Avatar 5", url: "avatar/avatar5.glb" },
];

const AvatarSwitcher: React.FC<AvatarSwitcherProps> = ({
  onAvatarChange,
  activeUrl,
}) => {
  // ✅ Guards the effect so it only runs once
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const savedAvatar = localStorage.getItem("activeAvatar");

    if (savedAvatar) {
      onAvatarChange(savedAvatar);
    } else {
      const defaultAvatar = avatars[0].url;
      onAvatarChange(defaultAvatar);
      localStorage.setItem("activeAvatar", defaultAvatar);
    }
  }, [onAvatarChange]);

  // Save avatar whenever it changes
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
            className={`avatar-btn avatar-selection avatar${index + 1} ${
              isActive ? "active" : ""
            }`}
            disabled={isActive}
          />
        );
      })}
    </div>
  );
};

export default AvatarSwitcher;
