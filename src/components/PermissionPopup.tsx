import { type ReactNode, useEffect, useState } from "react";
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
  /** Whether clicking the overlay backdrop closes the popup. @default true */
  overlayClosesPopup?: boolean;
  /**
   * Controls visibility of the popup. When false the component renders nothing.
   * Mirrors the `show` prop on PromptTooltip so PermissionPopup can be used
   * as a direct child of FloatingOnboarding.
   * @default true
   */
  show?: boolean;
  /**
   * Called when the popup is dismissed (close button or backdrop).
   * Use this instead of — or alongside — closeButton/onBackdropClick when you
   * need a single unified dismiss callback.
   */
  onClose?: () => void;
  /**
   * Injected automatically by FloatingOnboarding via cloneElement.
   * Signals the portal wrapper to unmount itself after the popup closes.
   * Do NOT set this manually — FloatingOnboarding handles it.
   */
  __floatingOnboardingUnmount?: () => void;
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
  overlayClosesPopup = true,
  show = true,
  onClose,
  __floatingOnboardingUnmount,
}: PermissionPopupProps) {
  // ── FloatingOnboarding compatibility ─────────────────────────────────────
  // Mirror the `show` prop into local state so the component can self-dismiss
  // and signal FloatingOnboarding to tear down its portal, exactly like
  // PromptTooltip does.
  const [isVisible, setIsVisible] = useState(show);

  useEffect(() => {
    setIsVisible(show);
  }, [show]);

  // Unified dismiss handler used by the close button and backdrop click.
  // Keeps the existing closeButton / onBackdropClick callbacks intact and
  // additionally fires onClose + the FloatingOnboarding unmount signal.
  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
    __floatingOnboardingUnmount?.();
  };

  if (!isVisible) return null;
  // ─────────────────────────────────────────────────────────────────────────

  const positionClass = centered
    ? "popup-centered popup-width-auth"
    : "w-100 tb:w-392 pos-abs top-0 m-5";

  return (
    <>
      {backdrop && (
        <div
          className="backdrop-overlay reveal fade"
          onClick={
            overlayClosesPopup
              ? () => {
                  onBackdropClick?.();
                  handleClose();
                }
              : undefined
          }
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
              onClick={() => {
                closeButton();
                handleClose();
              }}
              title="Close"
              tooltipText="Close"
              className="icon-size-25 pos-abs top-2 right-2"
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
            <div className={`media-container media ${variant}-media-container br-12 overflow-hidden mb-3`}>
              {image && (
                <img src={image} alt={imagAlt ?? ""} className={`media ${variant}-media`} />
              )}
              {video && (
                <video src={video} autoPlay loop muted playsInline className={`media ${variant}-media`} />
              )}
            </div>
          )}

          {/* Text */}
          <div className="text-container flex-col gap-3">
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
