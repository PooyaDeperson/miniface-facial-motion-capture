type PermissionPopupMedia =
  | { image: string; imagAlt?: string; video?: never }
  | { video: string; image?: never; imagAlt?: never }
  | { image?: never; imagAlt?: never; video?: never };

type PermissionPopupProps = PermissionPopupMedia & {
  title: string;
  subtitle?: string;
  buttonText?: string;
  onClick?: () => void;
  showButton?: boolean;
  variant: "prompt" | "denied";
};

export default function PermissionPopup({
  title,
  subtitle,
  buttonText,
  onClick,
  showButton,
  variant,
  image,
  imagAlt,
  video,
}: PermissionPopupProps) {
  return (
    <div className={`popup-container ${variant}-popup reveal fade scaleIn w-100 tb:w-392 pos-abs z-9992 m-5 p-1 br-20 top-0`}>
      <div className="inner-container p-5 flex-col br-16">
        <div className={`media-container media ${variant}-media-container br-2 overflow-hidden mb-3`}>
          {image && (
            <img src={image} alt={imagAlt ?? ""} className={`media ${variant}-media`} />
          )}
          {video && (
            <video src={video} autoPlay loop muted playsInline className={`media ${variant}-media`} />
          )}
        </div>
        <div className="text-container flex-col gap-2">
          <h1 className={`title ${variant}-title`}>{title}</h1>
          {subtitle && <p className={`subtitle ${variant}-subtitle`}>{subtitle}</p>}
        </div>
        {showButton && (
          <button onClick={onClick} className={`button primary ${variant}-button`}>
            {buttonText}
          </button>
        )}
      </div>
    </div>
  );
}
