/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 *
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson"
 */

/**
 * HomePage.tsx
 *
 * Public-facing landing page at "/".
 * Renders the ponytail avatar scene with title + subtitle
 * centered at the bottom, a CTA button, and a small footer.
 * No camera permission, no login popup — fully crawlable by search engines.
 */

import { useState, useCallback, useEffect, Component } from "react";
import "../App.css";
import AvatarCanvas from "../AvatarCanvas";

const PONYTAIL_URL =
  "https://res.cloudinary.com/da1zca4wj/image/upload/v1782023142/miniface/avatar/avatar-ponytail.glb";

const HOMEPAGE_ANIM_URL = "/animation/homepage/homepage-anim.glb";

// ── Error boundary so a failed 3D canvas never crashes the whole page ────────
class AvatarErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export default function HomePage() {
  const [avatarReady, setAvatarReady] = useState(false);
  const [animBlob, setAnimBlob] = useState<Blob | null>(null);

  // Fetch the homepage animation GLB once and store as a Blob so AvatarCanvas
  // can play it back via its playbackBlob prop (same path as recorded sessions).
  useEffect(() => {
    let cancelled = false;
    fetch(HOMEPAGE_ANIM_URL)
      .then((res) => res.blob())
      .then((blob) => { if (!cancelled) setAnimBlob(blob); })
      .catch(() => { /* silently ignore — avatar will stay in idle pose */ });
    return () => { cancelled = true; };
  }, []);

  const handleAvatarReady = useCallback((ready: boolean) => {
    setAvatarReady(ready);
  }, []);

  return (
    <main
      className="App pos-rel overflow-hidden bg-secondary"
      aria-label="miniface — real-time facial motion capture"
    >
      {/* ── 3D Avatar background scene ────────────────────────────────── */}
      <AvatarErrorBoundary>
        <AvatarCanvas
          url={PONYTAIL_URL}
          avatarKey={0}
          setAvatarReady={handleAvatarReady}
          isFlipped={false}
          playbackBlob={animBlob}
          motionLoading={false}
        />
      </AvatarErrorBoundary>

      {/* ── Hero text + CTA — center-bottom overlay ───────────────────── */}
      <section
        className="pos-abs bottom-0 left-0 right-0 flex flex-col items-center text-center pb-86"
        style={{ zIndex: 10, paddingBottom: "clamp(64px, 10vh, 120px)" }}
        aria-labelledby="hero-heading"
      >
        <h1
          id="hero-heading"
          className="text-primary"
          style={{ fontSize: "clamp(22px, 4vw, 36px)", fontWeight: 400, lineHeight: "1.25", marginBottom: "10px", letterSpacing: "-0.01em" }}
        >
          miniface — animate your face in real time
        </h1>

        <p
          className="text-secondary"
          style={{ fontSize: "clamp(15px, 2vw, 18px)", lineHeight: "1.5", marginBottom: "28px", maxWidth: "520px", padding: "0 16px" }}
        >
          AI-powered facial motion capture that runs entirely in your browser.
          No download, no install — just your face and a 3D character.
        </p>

        {/* Primary CTA — uses the same .button.primary class from the app */}
        <a
          href="/app"
          className="button primary flex flex-row justify-center items-center gap-1"
          style={{ fontSize: "18px", padding: "14px 36px", textDecoration: "none", display: "inline-flex" }}
          aria-label="Open the miniface facial motion capture app"
        >
          animate now
        </a>

        {/* ── SEO supporting text ─────────────────────────────────────── */}
        <p
          className="text-tertiary"
          style={{ fontSize: "13px", marginTop: "20px", maxWidth: "480px", lineHeight: "1.6", padding: "0 16px" }}
        >
          miniface is a free, open-source, browser-based facial motion capture tool.
          Track your face live and record character animations using AI computer vision —
          on desktop, iOS, and Android.
        </p>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer
        className="pos-abs bottom-0 left-0 right-0 flex flex-row items-center justify-center flex-wrap gap-2 text-muted"
        style={{ zIndex: 10, padding: "12px 16px", fontSize: "12px" }}
        aria-label="Site footer"
      >
        <span style={{ fontWeight: 500 }}>miniface.org</span>
        <span aria-hidden="true">&middot;</span>
        <a
          href="https://github.com/PooyaDeperson/miniface-facial-motion-capture"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted"
          style={{ textDecoration: "underline" }}
          aria-label="miniface on GitHub (opens in new tab)"
        >
          github
        </a>
        <span aria-hidden="true">&middot;</span>
        <a href="/terms" className="text-muted" style={{ textDecoration: "underline" }}>
          terms
        </a>
        <span aria-hidden="true">&middot;</span>
        <a href="/privacy" className="text-muted" style={{ textDecoration: "underline" }}>
          privacy
        </a>
        <span aria-hidden="true">&middot;</span>
        <a href="/cookies" className="text-muted" style={{ textDecoration: "underline" }}>
          cookies
        </a>
      </footer>
    </main>
  );
}
