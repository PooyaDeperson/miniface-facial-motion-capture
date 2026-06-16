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
  /** Callback to toggle loop */
  onSetLoop: (loop: boolean) => void;
  /** Callback when the user wants to go back to recording mode */
  onDoAnother: () => void;
  /** Optional: name of the motion being played (shown in the bar) */
  motionName?: string;
}

// ─── component ────────────────────────────────────────────────────────────────

const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  onTogglePlay,
  onSeek,
  onSetLoop,
  onDoAnother,
  motionName,
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
      className="recording-controls playback-controls reveal bottom-36 tb:bottom-50 fade pos-fixed z-rec"
      role="region"
      aria-label="Animation playback"
    >
      <div className="rec-bar rec-bar-review playback-bar p-3 flex flex-col">

        {/* ── name row ── */}
        {motionName && (
          <div className="playback-name" title={motionName}>
            {motionName}
          </div>
        )}

        {/* ── scrubber ── */}
        <div
          ref={scrubberRef}
          className="playback-scrubber"
          role="slider"
          aria-label="Playback position"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          onMouseDown={(e) => handleScrubStart(e.clientX)}
          onTouchStart={(e) => handleScrubStart(e.touches[0].clientX)}
        >
          <div className="playback-scrubber-fill" style={{ width: `${progress * 100}%` }} />
          <div
            className="playback-scrubber-thumb"
            style={{ left: `${progress * 100}%` }}
          />
        </div>

        {/* ── time row ── */}
        <div className="playback-time-row">
          <span className="playback-time" aria-live="off">
            {formatTime(state.currentTime)}
          </span>
          <span className="playback-time playback-time-total">
            {formatTime(state.duration)}
          </span>
        </div>

        {/* ── controls row ── */}
        <div className="playback-controls-row">
          {/* Loop toggle */}
          <button
            className={`playback-icon-btn ${state.loop ? "playback-icon-btn-active" : ""}`}
            onClick={() => onSetLoop(!state.loop)}
            aria-label={state.loop ? "Loop on" : "Loop off"}
            aria-pressed={state.loop}
            title={state.loop ? "Loop on" : "Loop off"}
          >
            <span className="has-icon icon-size-16 loop-icon" aria-hidden="true" />
          </button>

          {/* Play / Pause */}
          <button
            className="playback-play-btn"
            onClick={onTogglePlay}
            aria-label={state.isPlaying ? "Pause" : "Play"}
          >
            {state.isPlaying ? (
              <span className="playback-pause-icon" aria-hidden="true" />
            ) : (
              <span className="playback-play-icon" aria-hidden="true" />
            )}
          </button>

          {/* Do another */}
          <button
            className="playback-icon-btn"
            onClick={onDoAnother}
            aria-label="Record new motion"
            title="Record new motion"
          >
            <span className="has-icon icon-size-16 record-icon" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlaybackControls;
