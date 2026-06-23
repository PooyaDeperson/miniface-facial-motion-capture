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
      .then((blob) => {
        console.log("[v0] HomePage: anim blob fetched, size=", blob.size);
        if (!cancelled) setAnimBlob(blob);
      })
      .catch((err) => { console.log("[v0] HomePage: anim fetch failed:", err); });
    return () => { cancelled = true; };
  }, []);

  const handleAvatarReady = useCallback((ready: boolean) => {
    setAvatarReady(ready);
  }, []);

  return (
    <main
      className="App pos-rel bg-secondary"
      style={{ overflowY: "auto" }}
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
        className="pos-abs bottom-0 left-0 right-0 flex flex-col items-center text-center"
        style={{ zIndex: 10, paddingBottom: "clamp(64px, 10vh, 120px)" }}
        aria-labelledby="hero-heading"
      >
        <h1
          id="hero-heading"
          className="text-primary"
          style={{ fontSize: "clamp(22px, 4vw, 36px)", fontWeight: 400, lineHeight: "1.25", marginBottom: "10px", letterSpacing: "-0.01em" }}
        >
          miniface — real-time facial motion capture for vtubers &amp; streamers
        </h1>

        <p
          className="text-secondary"
          style={{ fontSize: "clamp(15px, 2vw, 18px)", lineHeight: "1.5", marginBottom: "28px", maxWidth: "560px", padding: "0 16px" }}
        >
          Animate your 3D avatar live with face tracking, upper body, and finger tracking — right in your browser.
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
      </section>

      {/* ── Footer — links + SEO descriptive content ────────────────────── */}
      <footer
        className="pos-abs bottom-0 left-0 right-0 text-center"
        style={{ zIndex: 10, padding: "10px 16px 14px", fontSize: "12px" }}
        aria-label="Site footer"
      >
        {/* ── SEO descriptive paragraphs ─────────────────────────────── */}
        <p
          className="text-tertiary"
          style={{ maxWidth: "640px", margin: "0 auto 8px", lineHeight: "1.6" }}
        >
          miniface is a free, open-source browser app for vtubers, streamers, and animators.
          Use your webcam to drive a 3D avatar in real time — no software to install, no account required to start.
          Supports realtime face animation, upper body tracking, and finger tracking.
        </p>
        <p
          className="text-tertiary"
          style={{ maxWidth: "640px", margin: "0 auto 10px", lineHeight: "1.6" }}
        >
          Record and export 3D motion data as GLB animation files.
          Compatible with desktop browsers, iOS, and Android.
          Built on AI-powered computer vision and WebGL — runs entirely on your device.
        </p>

        {/* ── Nav links ──────────────────────────────────────────────── */}
        <nav
          className="flex flex-row items-center justify-center flex-wrap gap-2 text-muted"
          aria-label="Footer navigation"
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
      </footer>
    </main>
  );
}
