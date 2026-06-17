/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

/**
 * MotionLibraryButton.tsx
 *
 * Icon button that opens the Motion Library panel.
 * Only rendered when the user is logged in with Drive scope (hasDriveAccess()).
 * Positioned in the top-right corner, to the left of AuthButton.
 */

import React from "react";
import IconButton from "./IconButton";

interface MotionLibraryButtonProps {
  onClick: () => void;
  motionCount?: number;
}

const MotionLibraryButton: React.FC<MotionLibraryButtonProps> = ({
  onClick,
  motionCount,
}) => {
  return (
    <div className="ml-btn-wrapper pos-rel">
      <IconButton
        icon="motionlibrary-icon"
        iconSize="icon-size-16"
        className="icon-size-32 reveal fade anim-delay-1"
        tooltip={true}
        tooltipText="motion library"
        tooltipPosition="pos-bottom"
        onClick={onClick}
      />
      {motionCount != null && motionCount > 0 && (
        <span className="ml-count-badge" aria-label={`${motionCount} motions`}>
          {motionCount > 99 ? "99+" : motionCount}
        </span>
      )}
    </div>
  );
};

export default MotionLibraryButton;
