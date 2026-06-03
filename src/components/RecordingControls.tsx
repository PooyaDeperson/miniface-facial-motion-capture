/*
 * Copyright (c) 2025 Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 *
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson"
 */

/**
 * RecordingControls.tsx
 *
 * Fixed bottom-center pill UI that drives the motion-capture recording flow.
 *
 * Three phases
 * ────────────
 * idle      → "Record" button (only shown when mediapipeReady && avatarReady)
 * recording → pulsing red dot + live MM:SS timer + frame counter + "Stop"
 * review    → frame/duration summary + "Save GLB" + "Discard"
 *
 * The component subscribes to the module-level recorder singleton so it stays
 * in sync with Avatar.tsx's useFrame captures without any prop drilling through
 * the R3F Canvas boundary.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  subscribeRecorder,
  getRecorderState,
  startRecording,
  stopRecording,
  discardRecording,
  buildAndExportGLB,
} from "../useMotionRecorder";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ─── props ────────────────────────────────────────────────────────────────────

interface RecordingControlsProps {
  mediapipeReady: boolean;
  avatarReady: boolean;
  onPhaseChange?: (phase: Phase) => void;
}

// ─── component ────────────────────────────────────────────────────────────────

type Phase = "idle" | "recording" | "review";

const RecordingControls: React.FC<RecordingControlsProps> = ({
  mediapipeReady,
  avatarReady,
  onPhaseChange,
}) => {
  const [phase, setPhase] = useState<Phase>("idle");

  // Notify parent whenever phase changes
  const setPhaseAndNotify = useCallback((newPhase: Phase) => {
    setPhase(newPhase);
    onPhaseChange?.(newPhase);
  }, [onPhaseChange]);
  const [frameCount, setFrameCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Live interval for sub-second timer updates while recording
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── sync with recorder singleton ────────────────────────────────────────────
  useEffect(() => {
    const syncState = () => {
      const state = getRecorderState();
      if (state.isRecording) {
        setPhaseAndNotify("recording");
        setFrameCount(state.frameCount);
      } else if (state.hasFrames) {
        setPhaseAndNotify("review");
        setFrameCount(state.frameCount);
        setElapsed(state.duration);
      } else {
        setPhaseAndNotify("idle");
        setFrameCount(0);
        setElapsed(0);
      }
    };

    const unsubscribe = subscribeRecorder(syncState);
    // Run once immediately to pick up any state already set
    syncState();
    return unsubscribe;
  }, []);

  // ── live timer while recording ───────────────────────────────────────────────
  useEffect(() => {
    if (phase === "recording") {
      timerRef.current = setInterval(() => {
        const state = getRecorderState();
        setElapsed(state.duration);
        setFrameCount(state.frameCount);
      }, 100); // 10 Hz is plenty for a display timer
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase]);

  // ── handlers ─────────────────────────────────────────────────────────────────
  const handleRecord = useCallback(() => {
    setExportError(null);
    startRecording();
    setPhaseAndNotify("recording");
    setElapsed(0);
    setFrameCount(0);
  }, [setPhaseAndNotify]);

  const handleStop = useCallback(() => {
    stopRecording();
    const state = getRecorderState();
    setPhaseAndNotify("review");
    setFrameCount(state.frameCount);
    setElapsed(state.duration);
  }, [setPhaseAndNotify]);

  const handleSave = useCallback(async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      await buildAndExportGLB();
      // After a successful export, go back to idle
      discardRecording();
      setPhaseAndNotify("idle");
      setFrameCount(0);
      setElapsed(0);
    } catch (err: any) {
      setExportError(err?.message ?? "Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, [setPhaseAndNotify]);

  const handleDiscard = useCallback(() => {
    discardRecording();
    setPhaseAndNotify("idle");
    setFrameCount(0);
    setElapsed(0);
    setExportError(null);
  }, [setPhaseAndNotify]);

  // ── visibility guard ─────────────────────────────────────────────────────────
  // Only render once both the avatar and MediaPipe are fully ready.
  // During recording or review we keep controls visible even if mediapipe
  // drops out (e.g. face leaves frame) so the user can still save their take.
  const shouldShow =
    avatarReady && mediapipeReady
      ? true
      : phase === "recording" || phase === "review";

  if (!shouldShow) return null;

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div
      className="recording-controls reveal bottom-36 tb:bottom-50 fade pos-fixed z-rec"
      role="region"
      aria-label="Motion capture recording"
    >
      {/* ── IDLE ── */}
      {phase === "idle" && (
        <button
          className="rec-btn pos-rel rec-btn-record pt-10 pb-10 pl-22 pr-22 outline-5 outline-soft gap-2"
          onClick={handleRecord}
          aria-label="Start recording motion"
        >
          <span className="rec-dot rec-dot-idle" aria-hidden="true" />
          <span>record</span>
        </button>
      )}

      {/* ── RECORDING ── */}
      {phase === "recording" && (
        <div
          className="rec-bar rec-bar-live outline-5 outline-softdanger"
          role="status"
          aria-live="polite"
        >
          {/* <span className="rec-dot rec-dot-pulse" aria-hidden="true" /> */}
          <button
            className="rec-btn rec-btn-stop bg-danger gap-8 pl-22 pr-22 pt-10 pb-10"
            onClick={handleStop}
            aria-label="Stop recording"
          >
            <span className="rec-stop-icon" aria-hidden="true" />
            stop
            <span
              className="rec-timer"
              aria-label={`Recording time: ${formatTime(elapsed)}`}
            >
              {formatTime(elapsed)}
            </span>
            <span
              className="rec-frames"
              aria-label={`${frameCount} frames captured`}
            >
              {frameCount}&thinsp;f
            </span>
            
          </button>
        </div>
      )}

      {/* ── REVIEW ── */}
      {phase === "review" && (
        <div className="rec-bar p-20 gap-12 rec-bar-review p-20 flex flex-col">
          {/* Stats row */}
          <div className="rec-stats" aria-label="Recording stats">
            <span className="rec-stat-label">recorded</span>
            <span className="rec-stat-item">{frameCount}&thinsp;frames</span>
            <span className="rec-stat-divider" aria-hidden="true">
              ·
            </span>
            <span className="rec-stat-item">{formatTime(elapsed)}</span>
          </div>

          {/* Error message */}
          {exportError && (
            <p className="rec-error" role="alert">
              {exportError}
            </p>
          )}

          {/* Actions */}
          <div className="rec-actions flex flex-col">
            <button
              className="rec-btn gap-8 justify-center w-full rec-btn-save"
              onClick={handleSave}
              disabled={isExporting}
              aria-label="Save recording as GLB file"
              aria-busy={isExporting}
            >
              {isExporting ? (
                <>
                  <span className="rec-spinner" aria-hidden="true" />
                  Exporting&hellip;
                </>
              ) : (
                <>
                  {/* <span className="rec-save-icon" aria-hidden="true" /> */}
                  save &nbsp;.glb
                </>
              )}
            </button>

            <button
              className="rec-btn rec-btn-discard w-full justify-center border-3 border-inverse"
              onClick={handleDiscard}
              disabled={isExporting}
              aria-label="Discard this recording"
            >
              another take
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecordingControls;
