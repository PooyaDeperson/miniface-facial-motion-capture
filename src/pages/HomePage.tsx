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
 * Renders a vertical flow layout: title, subtitle, descriptive text,
 * 3D avatar canvas, and footer — all with relative positioning.
 * No camera permission, no login popup — fully crawlable by search engines.
 */

import { useState, useCallback, useEffect, Component } from "react";
import { useNavigate } from "react-router-dom";
import "../App.css";
import AvatarCanvas from "../AvatarCanvas";

const PONYTAIL_URL =
  "/avatar/avatar-ponytail.glb";

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
  const navigate = useNavigate();
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
      className="homepage pos-rel scroll-y"
      
      aria-label="miniface — real-time facial motion capture"
    >

      {/* ── Title ──────────────────────────────────────────────────────── */}
      <header className="pos-rel flex flex-col items-center text-center px-6 py-6">
        <h1
          id="hero-heading"
          className="text-primary"
          style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 400, lineHeight: "1.2", letterSpacing: "-0.02em" }}
        >
          miniface
        </h1>
        <p
          className="text-secondary"
          style={{ fontSize: "clamp(16px, 2.5vw, 24px)", fontWeight: 300, lineHeight: "1.4", marginTop: "8px" }}
        >
          Real-time facial motion capture for VTubers & Streamers
        </p>
      </header>

      {/* ── Descriptive Text ───────────────────────────────────────────── */}
      <section className="pos-rel flex flex-col items-center text-center px-6">
        <p
          className="text-secondary"
          style={{ fontSize: "clamp(16px, 2.5vw, 24px)", lineHeight: "1.7", maxWidth: "640px" }}
        >
          Animate your 3D avatar live with face tracking, upper body, and finger tracking — right in your browser.
          No software to install, no account required to start.
        </p>
        <p
          className="text-secondary"
          style={{ fontSize: "clamp(16px, 2.5vw, 24px)", lineHeight: "1.7", maxWidth: "640px", marginTop: "12px" }}
        >
          Record and export 3D motion data as GLB animation files.
          Built on AI-powered computer vision and WebGL — runs entirely on your device.
        </p>

        {/* Primary CTA */}
        <a
          onClick={() => navigate("/app")}
          className="button br-100 primary flex flex-row justify-center items-center gap-1"
          style={{ fontSize: "18px", padding: "8px 36px", textDecoration: "none", marginTop: "24px" }}
          aria-label="Open the miniface facial motion capture app"
        >
          animate Now
        </a>
      </section>

      {/* ── 3D Avatar Canvas ───────────────────────────────────────────── */}
      <section className="pos-rel w-full" style={{ height: "500px" }}>
        <AvatarErrorBoundary>
          <AvatarCanvas
            url={PONYTAIL_URL}
            avatarKey={0}
            setAvatarReady={handleAvatarReady}
            isFlipped={false}
            playbackBlob={animBlob}
            motionLoading={false}
            canvasWidth="100%"
            canvasHeight="100%"
          />
        </AvatarErrorBoundary>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer
        className="pos-abs w-full bottom-0 px-6 left-50percent z-2 flex flex-col items-center text-center"
        aria-label="Site footer"
      >
            <a
          onClick={() => navigate("/app")}
          className="button br-100 primary flex flex-row justify-center items-center gap-1"
          style={{ fontSize: "18px", padding: "8px 36px", textDecoration: "none", marginTop: "24px" }}
          aria-label="Open the miniface facial motion capture app"
        >
          let's go, it's free
        </a>
        <nav
          className="flex flex-row items-center justify-center flex-wrap gap-2 text-muted"
          aria-label="Footer navigation"
          style={{ fontSize: "13px", lineHeight: "2", marginTop: "12px" }}
        >
          <span style={{ fontWeight: 500 }}>miniface.org</span>
          <span aria-hidden="true">&middot;</span>
          <a
            href="https://github.com/PooyaDeperson/miniface-facial-motion-capture"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted"
            style={{ textDecoration: "underline" }}
            aria-label="miniface source code on GitHub (opens in new tab)"
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
        </nav>

        <p
          className="text-muted"
          style={{ fontSize: "11px", marginTop: "12px" }}
        >
          &copy; {new Date().getFullYear()} miniface. Created by Pooya Moradi M.
        </p>
      </footer>

    </main>
  );
}