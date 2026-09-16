import "./marketing.css";

const VIDEO_SRC =
  "https://res.cloudinary.com/da1zca4wj/video/upload/v1789469805/vtuber.miniface.demo_nbfiwm.mp4";
const VIDEO_POSTER =
  "/images/seo/vtuber.miniface.demo.poster.webp";

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

function ProductVideo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`marketing-video br-2 ${compact ? "marketing-video--compact" : ""}`}>
      <video
        autoPlay
        muted
        loop
        playsInline
        poster={VIDEO_POSTER}
        src={VIDEO_SRC}
        aria-label="Miniface motion capture product demonstration"
        className=""
      />
      {/* <div className="video-caption"><span className="status-dot" />Live capture / Miniface</div> */}
    </div>
  );
}

export default function MarketingHome() {
  const currentYear = new Date().getFullYear();

  return (
    <main className="marketing-page">
      <nav className="marketing-nav" aria-label="Main navigation">
        <a className="brand-mark" href="/" aria-label="Miniface home">
          <img className="brand-logo" src="/images/seo/favicon180.jpg" alt="" />
          <span>miniface for vtubers</span>
        </a>
        {/* <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
        </div>
        <a className="button" href="/animate">Start creating</a> */}
      </nav>

      <section className="marketing-hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          {/* <p className="eyebrow"><span className="eyebrow-line" />Browser-based motion capture</p> */}
          <h1 id="hero-title">realtime facial and finger motion capture <em>for streamers.</em></h1>
          <p className="hero-description">bring your digital character to life from the camera you already have. Capture expressions, gestures, and reactions in real time.</p>
          <a className="button" href="/animate">start creating</a>
        </div>
        {/* <div className="hero-meta" aria-label="Product highlights">
          <span>01 / 05</span><span>Face + hands + character</span>
        </div> */}
      </section>

      <section className="showcase" aria-label="Product demonstration" id="how-it-works">
        <ProductVideo />
        {/* <div className="showcase-note"><span>Motion, without the hardware.</span><span>Scroll to explore ↓</span></div> */}
      </section>

      <section className="feature-intro feature-intro--compact" id="features" aria-labelledby="features-title">
        {/* <p className="eyebrow"><span className="eyebrow-line" />Everything you need to perform</p> */}
        <h2 id="features-title">more ways.<span> to perform.</span></h2>
        <p className="feature-summary">capture facial expressions, finger gestures, and full-body reactions in real time. Choose your character, record performances for the motion library, and create from the camera you already have, even on mobile.</p>
        <a className="button" href="/animate">animate now</a>
      </section>

      <footer className="marketing-footer">
        <a className="brand-mark" href="/" aria-label="Miniface for vtubers home"><img className="brand-logo" src="/images/seo/favicon180.jpg" alt="" /><span>miniface for vtubers</span></a>
        <span>realtime open source and free facial motion capture</span>
        <div><a href="/privacy">Privacy</a><a href="/terms">Terms</a><span>© 2024 - {currentYear} miniface</span></div>
      </footer>
    </main>
  );
}
