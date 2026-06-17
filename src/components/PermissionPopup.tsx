import type { ReactNode } from "react";
import IconButton from "./IconButton";

type PermissionPopupMedia =
  | { image: string; imagAlt?: string; video?: never }
  | { video: string; image?: never; imagAlt?: never }
  | { image?: never; imagAlt?: never; video?: never };

export type PermissionPopupAvatar = {
  /** URL of the avatar image */
  src?: string;
  /** Alt text for the image */
  alt?: string;
  /** Fallback initial/character shown when src is absent */
  fallback?: string;
};

export type PermissionPopupProps = PermissionPopupMedia & {
  title: string;
  subtitle?: string;
  buttonText?: string;
  onClick?: () => void;
  showButton?: boolean;
  /** @default "prompt" */
  variant?: "prompt" | "denied";
  /** Render a dimmed backdrop behind the popup */
  backdrop?: boolean;
  onBackdropClick?: () => void;
  /** Center the popup fixed on screen (auth-modal style) */
  centered?: boolean;
  /** Optional avatar shown above the title */
  avatar?: PermissionPopupAvatar;
  /** Extra content rendered below the text block and above the button */
  children?: ReactNode;
  /** Extra classes for the outer popup-container wrapper */
  className?: string;
  /**
   * When provided, a close IconButton is rendered in the top-right corner of
   * the card. If omitted no close button is shown (backdrop click still works).
   */
  closeButton?: () => void;
  /** ARIA role — defaults to "dialog" when centered, otherwise none */
  role?: string;
  "aria-label"?: string;
};

export default function PermissionPopup({
  title,
  subtitle,
  buttonText,
  onClick,
  showButton,
  variant = "prompt",
  backdrop,
  onBackdropClick,
  centered,
  avatar,
  children,
  className = "",
  closeButton,
  image,
  imagAlt,
  video,
  role,
  "aria-label": ariaLabel,
}: PermissionPopupProps) {
  const positionClass = centered
    ? "popup-centered popup-width-auth"
    : "w-100 tb:w-392 pos-abs top-0 m-5";

  return (
    <>
      {backdrop && (
        <div
          className="backdrop-overlay"
          onClick={onBackdropClick}
          aria-hidden="true"
        />
      )}

      <div
        className={`popup-container ${variant}-popup reveal fade scaleIn ${positionClass} z-9992 p-1 br-20 ${className}`}
        role={role ?? (centered ? "dialog" : undefined)}
        aria-modal={centered ? true : undefined}
        aria-label={ariaLabel}
      >
        <div className="inner-container p-5 flex-col br-16 pos-rel">

          {/* Optional close button */}
          {closeButton && (
            <IconButton
              icon="close-icon"
              onClick={closeButton}
              title="Close"
              tooltipText="Close"
              className="icon-size-25 pos-abs top-0 right-0"
              iconSize="icon-size-16"
            />
          )}

          {/* Avatar */}
          {avatar && (
            <div className="avatar-image-containter pos-abs" aria-hidden="true">
              {avatar.src ? (
                <img
                  src={avatar.src}
                  alt={avatar.alt ?? ""}
                  className="avatar-circle-img"
                />
              ) : (
                <span className="avatar-circle-fallback">
                  {(avatar.fallback ?? "?")[0].toUpperCase()}
                </span>
              )}
            </div>
          )}

          {/* Media */}
          {(image || video) && (
            <div className={`media-container media ${variant}-media-container br-2 overflow-hidden mb-3`}>
              {image && (
                <img src={image} alt={imagAlt ?? ""} className={`media ${variant}-media`} />
              )}
              {video && (
                <video src={video} autoPlay loop muted playsInline className={`media ${variant}-media`} />
              )}
            </div>
          )}

          {/* Text */}
          <div className="text-container flex-col gap-2">
            <h1 className={`title ${variant}-title`}>{title}</h1>
            {subtitle && (
              <p className={`subtitle ${variant}-subtitle`}>{subtitle}</p>
            )}
          </div>

          {/* Custom slot */}
          {children}

          {/* Primary action */}
          {showButton && (
            <button onClick={onClick} className={`button primary ${variant}-button`}>
              {buttonText}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
