/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

/**
 * RecordingControls.tsx
 *
 * Fixed bottom-center pill UI that drives the motion-capture recording flow.
 *
 * Phases
 * ──────
 * idle      → "Record" button (only when mediapipeReady && avatarReady)
 * recording → pulsing red dot + live MM:SS timer + frame counter + "Stop"
 * review    → floating popup shown ON TOP of playback (avatar already playing)
 *             • "export .glb"  — downloads the blob
 *             • "do another"   — clears playback, back to idle
 *             • "save to cloud" (non-logged-in only) — opens AuthModal
 * done      → (absorbed into review; review stays visible until "do another")
 *
 * The review popup is intentionally a floating overlay so the user can see
 * the animation playing behind it. On click "do another" it disappears.
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
import AuthModal from "./AuthModal";

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
  /** Whether the user is logged in with Drive access — controls "save to cloud" CTA */
  isLoggedInWithDrive?: boolean;
  /** Called after Drive scope is successfully obtained (for auth modal) */
  onDriveConnected?: () => void;
}

type Phase = "idle" | "recording" | "review" | "done";

// ─── component ────────────────────────────────────────────────────────────────

const RecordingControls: React.FC<RecordingControlsProps> = ({
  mediapipeReady,
  avatarReady,
  onPhaseChange,
  isLoggedInWithDrive = false,
  onDriveConnected,
}) => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [frameCount, setFrameCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const setPhaseAndNotify = useCallback((newPhase: Phase) => {
    setPhase(newPhase);
    onPhaseChange?.(newPhase);
  }, [onPhaseChange]);

  // Live interval ref for timer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── sync with recorder singleton ────────────────────────────────────────────
  useEffect(() => {
    const syncState = () => {
      const state = getRecorderState();
      if (state.isRecording) {
        setPhaseAndNotify("recording");
        setFrameCount(state.frameCount);
      } else if (state.hasFrames) {
        // Stay in review; don't reset if already in review/done
        setPhase((prev) => {
          const next = prev === "idle" ? "review" : prev;
          onPhaseChange?.(next);
          return next;
        });
        setFrameCount(state.frameCount);
        setElapsed(state.duration);
      } else {
        setPhaseAndNotify("idle");
        setFrameCount(0);
        setElapsed(0);
      }
    };
    const unsub = subscribeRecorder(syncState);
    syncState();
    return unsub;
  }, [setPhaseAndNotify, onPhaseChange]);

  // ── live timer while recording ───────────────────────────────────────────────
  useEffect(() => {
    if (phase === "recording") {
      timerRef.current = setInterval(() => {
        const state = getRecorderState();
        setElapsed(state.duration);
        setFrameCount(state.frameCount);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
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
    // stopRecording() now also builds the GLB blob in memory and notifies
    // subscribePlaybackReady — so playback starts automatically in App.tsx.
    stopRecording();
    const state = getRecorderState();
    setPhaseAndNotify("review");
    setFrameCount(state.frameCount);
    setElapsed(state.duration);
  }, [setPhaseAndNotify]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      // buildAndExportGLB re-uses the cached blob from stopRecording — fast.
      await buildAndExportGLB();
      // Stay in review so user can still "do another" or see the stats.
    } catch (err: any) {
      setExportError(err?.message ?? "Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleDoAnother = useCallback(() => {
    discardRecording();
    setPhaseAndNotify("idle");
    setFrameCount(0);
    setElapsed(0);
    setExportError(null);
    onPhaseChange?.("idle");
  }, [setPhaseAndNotify, onPhaseChange]);

  // ── visibility guard ─────────────────────────────────────────────────────────
  const shouldShow =
    avatarReady && mediapipeReady
      ? true
      : phase === "recording" || phase === "review" || phase === "done";

  if (!shouldShow) return null;

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── IDLE: Record button ── */}
      {phase === "idle" && (
        <div
          className="recording-controls reveal bottom-36 tb:bottom-50 fade pos-fixed z-rec"
          role="region"
          aria-label="Motion capture recording"
        >
          <button
            className="rec-btn pos-rel rec-btn-record pt-10 pb-10 pl-22 pr-22 outline-5 outline-soft gap-2"
            onClick={handleRecord}
            aria-label="Start recording motion"
          >
            <span className="rec-dot rec-dot-idle" aria-hidden="true" />
            <span>record</span>
          </button>
        </div>
      )}

      {/* ── RECORDING: Stop button ── */}
      {phase === "recording" && (
        <div
          className="recording-controls reveal bottom-36 tb:bottom-50 fade pos-fixed z-rec"
          role="region"
          aria-label="Motion capture recording"
        >
          <div
            className="rec-bar rec-bar-live outline-5 outline-softdanger"
            role="status"
            aria-live="polite"
          >
            <button
              className="rec-btn rec-btn-stop bg-danger gap-3 pl-22 pr-22 pt-10 pb-3"
              onClick={handleStop}
              aria-label="Stop recording"
            >
              <span className="rec-stop-icon" aria-hidden="true" />
              stop
              <span className="rec-timer" aria-label={`Recording time: ${formatTime(elapsed)}`}>
                {formatTime(elapsed)}
              </span>
              <span className="rec-frames" aria-label={`${frameCount} frames captured`}>
                {frameCount}&thinsp;f
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── REVIEW / DONE: Floating overlay on top of playback ── */}
      {(phase === "review" || phase === "done") && (
        <div
          className="rec-review-overlay pos-fixed z-9991"
          role="region"
          aria-label="Save recording"
        >
          <div className="rec-bar rec-bar-review p-20 flex flex-col">
            {/* Stats */}
            <div className="rec-stats" aria-label="Recording stats">
              <span className="rec-stat-label">recorded</span>
              <span className="rec-stat-item">{frameCount}&thinsp;frames</span>
              <span className="rec-stat-divider" aria-hidden="true">·</span>
              <span className="rec-stat-item">{formatTime(elapsed)}</span>
            </div>

            {exportError && (
              <p className="rec-error" role="alert">{exportError}</p>
            )}

            <div className="rec-actions flex flex-col">
              {/* Export .glb */}
              <button
                className="rec-btn gap-3 justify-center w-full rec-btn-save"
                onClick={handleExport}
                disabled={isExporting}
                aria-label="Download as .glb file"
                aria-busy={isExporting}
              >
                {isExporting ? (
                  <><span className="rec-spinner" aria-hidden="true" />exporting&hellip;</>
                ) : (
                  <>export &nbsp;.glb</>
                )}
              </button>

              {/* Save to Cloud (non-logged-in users only) */}
              {!isLoggedInWithDrive && (
                <button
                  className="rec-btn rec-btn-cloud w-full justify-center gap-2"
                  onClick={() => setShowAuthModal(true)}
                  aria-label="Save to Google Drive"
                >
                  <span className="has-icon icon-size-16 cloud-check-icon" aria-hidden="true" />
                  save to cloud
                </button>
              )}

              {/* Do another */}
              <button
                className="rec-btn rec-btn-discard w-full justify-center border-3 border-inverse"
                onClick={handleDoAnother}
                disabled={isExporting}
                aria-label="Start a new recording"
              >
                do another
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth modal triggered by "save to cloud" */}
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onDriveConnected={() => {
            setShowAuthModal(false);
            onDriveConnected?.();
          }}
        />
      )}
    </>
  );
};

export default RecordingControls;
