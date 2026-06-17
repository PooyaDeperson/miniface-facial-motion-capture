/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

/**
 * PlaybackControls.tsx
 *
 * Fixed bottom-center UI shown while a recorded animation is replaying.
 * Replaces RecordingControls during playback mode.
 *
 * Controls exposed:
 * • Scrubber  (click + drag)
 * • Play / Pause toggle
 * • Loop toggle
 * • "do another" button  → calls onDoAnother() which returns to idle
 *
 * Subscribes to the module-level playback state via subscribePlaybackState()
 * so it stays in sync with the in-Canvas usePlaybackAnimation hook without
 * prop-drilling through the R3F Canvas boundary.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  subscribePlaybackState,
  getPlaybackState,
} from "../usePlaybackAnimation";
import IconButton from "./IconButton";
import "./playerui.css";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ─── props ────────────────────────────────────────────────────────────────────

interface PlaybackControlsProps {
  /** Callback to toggle play/pause — calls into the R3F hook via ref */
  onTogglePlay: () => void;
  /** Callback to seek — normalised 0–1 */
  onSeek: (t: number) => void;
  /** Callback when the user wants to go back to recording mode */
  onDoAnother: () => void;
  /** Optional: name of the motion being played (shown in the bar) */
  motionName?: string;
  /** Optional: download the current motion */
  onDownload?: () => void;
}

// ─── component ────────────────────────────────────────────────────────────────

const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  onTogglePlay,
  onSeek,
  onDoAnother,
  motionName,
  onDownload,
}) => {
  const [state, setState] = useState(getPlaybackState);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Subscribe to playback state changes from the Canvas hook
  useEffect(() => {
    return subscribePlaybackState((s) => setState({ ...s }));
  }, []);

  // ── scrubber mouse / touch handling ─────────────────────────────────────────
  const computeNormalised = useCallback((clientX: number): number => {
    const el = scrubberRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handleScrubStart = useCallback(
    (clientX: number) => {
      isDraggingRef.current = true;
      onSeek(computeNormalised(clientX));
    },
    [computeNormalised, onSeek]
  );

  const handleScrubMove = useCallback(
    (clientX: number) => {
      if (!isDraggingRef.current) return;
      onSeek(computeNormalised(clientX));
    },
    [computeNormalised, onSeek]
  );

  const handleScrubEnd = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Global mouse/touch move + up listeners while dragging
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleScrubMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => handleScrubMove(e.touches[0].clientX);
    const onUp = () => handleScrubEnd();

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, [handleScrubMove, handleScrubEnd]);

  const progress =
    state.duration > 0 ? state.currentTime / state.duration : 0;

  return (
    <div
      className="playback-controls reveal bottom-36 tb:bottom-50 fade pos-fixed z-rec"
      role="region"
      aria-label="Animation playback"
    >
      {/* pill: flex-row items-center gap-2 p-2 br-8 — all utility classes */}
      <div className="player-controls-wrapper flex-row items-center gap-2 p-2 br-100">

        {/* ── Play / Pause ── */}
        <IconButton
          icon={state.isPlaying ? "pause-icon" : "play-icon"}
          onClick={onTogglePlay}
          title={state.isPlaying ? "Pause" : "Play"}
          className="icon-size-32"
          iconSize="icon-size-24"
          aria-label={state.isPlaying ? "Pause playback" : "Play animation"}
        />

        {/* ── Timeline ── flex-1 pos-rel overflow-hidden br-8 from utilities */}
        <div
          className="player-timeline-container flex-1 pos-rel overflow-hidden br-100"
          ref={scrubberRef}
          onMouseDown={(e) => handleScrubStart(e.clientX)}
          onTouchStart={(e) => handleScrubStart(e.touches[0].clientX)}
        >
          {/* Native <progress> — browser-painted fill, zero JS lag */}
          <progress
            className="player-progress"
            value={progress}
            max={1}
            aria-label="Playback position"
            aria-valuenow={Math.round(progress * 100)}
          />

          {/* Playhead — pos-abs from utility */}
          <div
            className="player-timeline-playhead pos-abs"
            style={{ left: `${progress * 100}%` }}
          />

          {/* Start time */}
          <span className="player-timeline-label pos-abs start-time" aria-live="off">
            {formatTime(state.currentTime)}
          </span>

          {/* End time */}
          <span className="player-timeline-label pos-abs end-time">
            {formatTime(state.duration)}
          </span>

          {/* File name */}
          {motionName && (
            <span className="player-timeline-label pos-abs file-name" title={motionName}>
              {motionName}
            </span>
          )}
        </div>

        {/* ── Download ── */}
        {onDownload && (
          <IconButton
            icon="download-icon"
            onClick={onDownload}
            title="Download .glb"
            className="icon-size-32"
            iconSize="icon-size-24"
            aria-label="Download motion as .glb"
          />
        )}

        {/* ── Live / Do Another ── */}
        <IconButton
          icon="live-icon"
          onClick={onDoAnother}
          title="Record new motion"
          className="icon-size-32"
          iconSize="icon-size-24"
          aria-label="Record new motion"
        />
      </div>
    </div>
  );
};

export default PlaybackControls;
