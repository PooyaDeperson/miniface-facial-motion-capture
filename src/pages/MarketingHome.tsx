import "./marketing.css";

const VIDEO_SRC =
  "https://res.cloudinary.com/da1zca4wj/video/upload/v1783679909/blendshapes/in-app/login-mocap-auth-video.mp4";
const VIDEO_POSTER =
  "https://res.cloudinary.com/da1zca4wj/image/upload/v1783679900/blendshapes/in-app/login-mocap-auth-poster.webp";

const features = [
  {
    number: "01",
    eyebrow: "Face tracker",
    title: "Your expressions. Live.",
    copy: "Capture facial movement in real time and bring every expression directly onto your character.",
    cta: "Try face tracking",
    className: "feature--violet",
  },
  {
    number: "02",
    eyebrow: "Finger tracker",
    title: "Every gesture comes through.",
    copy: "Track your fingers and hands in real time so your character can react to more than just your face.",
    cta: "Track your hands",
    className: "feature--blue",
  },
  {
    number: "03",
    eyebrow: "Motion library",
    title: "Capture it. Replay it.",
    copy: "Record your motion and turn live performances into reusable character animation.",
    cta: "Record a Take",
    className: "feature--pink",
  },
  {
    number: "04",
    eyebrow: "Character selector",
    title: "Pick your character. Own the scene.",
    copy: "Choose the character you want to perform with and jump straight into motion capture.",
    cta: "Choose a character",
    className: "feature--gold",
  },
  {
    number: "05",
    eyebrow: "Mobile ready",
    title: "Your phone is enough.",
    copy: "Capture motion wherever you are. No studio setup. No complicated hardware.",
    cta: "Try it on mobile",
    className: "feature--mint",
  },
];

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

      <section className="feature-intro" id="features">
        <p className="eyebrow"><span className="eyebrow-line" />Everything you need to perform</p>
        <h2>More range.<br /><span>More character.</span></h2>
      </section>

      <section className="feature-selector" aria-label="Motion capture features">
        <div className="feature-selector-grid">
          {features.map((feature) => (
            <article className={`feature-card ${feature.className}`} key={feature.number}>
              <div className="feature-card-top">
                <span className="feature-number">{feature.number} <span>/ 05</span></span>
                <span className="feature-card-mark" aria-hidden="true">↗</span>
              </div>
              <p className="eyebrow">{feature.eyebrow}</p>
              <h3>{feature.title}</h3>
              <p className="feature-copy">{feature.copy}</p>
              <a className="text-link" href="/animate">{feature.cta} <Arrow /></a>
            </article>
          ))}
        </div>
        <a className="button selector-cta" href="/animate">Animate now <Arrow /></a>
      </section>

      <footer className="marketing-footer">
        <a className="brand-mark" href="/" aria-label="Miniface home"><span className="brand-orbit" aria-hidden="true" /><span>miniface</span></a>
        <span>Motion capture for the next character generation.</span>
        <div><a href="/privacy">Privacy</a><a href="/terms">Terms</a><span>© 2025 Miniface</span></div>
      </footer>
    </main>
  );
}
