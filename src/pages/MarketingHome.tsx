import "./marketing.css";

const VIDEO_SRC =
  "https://res.cloudinary.com/da1zca4wj/video/upload/v1783679909/blendshapes/in-app/login-mocap-auth-video.mp4";
const VIDEO_POSTER =
  "https://res.cloudinary.com/da1zca4wj/image/upload/v1783679900/blendshapes/in-app/login-mocap-auth-poster.webp";

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

function ProductVideo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`marketing-video ${compact ? "marketing-video--compact" : ""}`}>
      <video
        autoPlay
        muted
        loop
        playsInline
        poster={VIDEO_POSTER}
        src={VIDEO_SRC}
        aria-label="Miniface motion capture product demonstration"
      />
      <div className="video-caption"><span className="status-dot" />Live capture / Miniface</div>
    </div>
  );
}

export default function MarketingHome() {
  return (
    <main className="marketing-page">
      <nav className="marketing-nav" aria-label="Main navigation">
        <a className="brand-mark" href="/" aria-label="Miniface home">
          <span className="brand-orbit" aria-hidden="true" />
          <span>miniface</span>
        </a>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
        </div>
        <a className="button button--small" href="/animate">Start creating <Arrow /></a>
      </nav>

      <section className="marketing-hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-line" />Browser-based motion capture</p>
          <h1 id="hero-title">Realtime facial and finger motion capture <em>for streamers.</em></h1>
          <p className="hero-description">Bring your digital character to life from the camera you already have. Capture expressions, gestures, and reactions in real time.</p>
          <a className="button" href="/animate">Start creating <Arrow /></a>
        </div>
        <div className="hero-meta" aria-label="Product highlights">
          <span>01 / 05</span><span>Face + hands + character</span>
        </div>
      </section>

      <section className="showcase" aria-label="Product demonstration" id="how-it-works">
        <ProductVideo />
        <div className="showcase-note"><span>Motion, without the hardware.</span><span>Scroll to explore ↓</span></div>
      </section>

      <section className="feature-intro feature-intro--compact" id="features" aria-labelledby="features-title">
        <p className="eyebrow"><span className="eyebrow-line" />Everything you need to perform</p>
        <h2 id="features-title">More range.<br /><span>More character.</span></h2>
        <p className="feature-summary">Capture facial expressions, finger gestures, and full-body reactions in real time. Choose your character, record performances for the motion library, and create from the camera you already have — even on mobile.</p>
        <a className="button" href="/animate">Animate now <Arrow /></a>
      </section>

      <footer className="marketing-footer">
        <a className="brand-mark" href="/" aria-label="Miniface home"><span className="brand-orbit" aria-hidden="true" /><span>miniface</span></a>
        <span>Motion capture for the next character generation.</span>
        <div><a href="/privacy">Privacy</a><a href="/terms">Terms</a><span>© 2025 Miniface</span></div>
      </footer>
    </main>
  );
}
