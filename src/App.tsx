/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 *
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson"
 */

import "./App.css";
import { useState, useCallback, useEffect, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import CameraPermissions from "./camera-permission";
import ColorSwitcher from "./components/ColorSwitcher";
import AvatarSwitcher from "./components/AvatarSwitcher";
import RecordingControls from "./components/RecordingControls";
import PlaybackControls from "./components/PlaybackControls";
import MotionLibrary from "./components/MotionLibrary";
import MotionLibraryButton from "./components/MotionLibraryButton";
import FaceTracking from "./FaceTracking";
import AvatarCanvas from "./AvatarCanvas";
import { discardRecording, subscribePlaybackReady } from "./useMotionRecorder";
import AuthButton from "./components/AuthButton";
import AuthModal from "./components/AuthModal";
import { hasDriveAccess, listDriveMotions, uploadToDrive, subscribeMotionUploaded, subscribeQuotaExceeded, DriveQuotaError, BulkSyncProgress } from "./useDriveSync";
import type { DriveMotionFile } from "./useDriveSync";

function App() {
  const [url, setUrl] = useState<string | null>(null);
  const [avatarKey, setAvatarKey] = useState(0);
  const [avatarReady, setAvatarReady] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [mediapipeReady, setMediapipeReady] = useState(false);
  const [recordingPhase, setRecordingPhase] = useState<"idle" | "recording" | "review" | "done">("idle");
  const [isFlipped, setIsFlipped] = useState(true);

  // ── Playback state ────────────────────────────────────────────────────────
  const [playbackBlob, setPlaybackBlob] = useState<Blob | null>(null);
  const [activeMotionId, setActiveMotionId] = useState<string | null>(null);
  const [activeMotionName, setActiveMotionName] = useState<string | undefined>(undefined);

  // ── Motion Library state ──────────────────────────────────────────────────
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryMotionCount, setLibraryMotionCount] = useState(0);
  const [bulkProgress] = useState<BulkSyncProgress | null>(null);
  /** Incremented after a successful upload to trigger a background re-fetch */
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  /** Optimistic motion shown immediately after upload, before Drive re-fetch */
  const [pendingMotion, setPendingMotion] = useState<import("./useDriveSync").DriveMotionFile | null>(null);

  // ── Drive upload status — shown in RecordingControls review overlay ─────────
  const [driveUploadStatus, setDriveUploadStatus] = useState<
    "idle" | "uploading" | "done" | "error" | "quota"
  >("idle");

  // ── Auth modal trigger — can be fired from MotionLibrary when not logged in ──
  const [showAuthModal, setShowAuthModal] = useState(false);

  // ── Drive scope state (drive token can appear after sign-in redirect) ─────
  const [hasDrive, setHasDrive] = useState(() => hasDriveAccess());

  // Poll for Drive access after component mounts (handles OAuth redirect case)
  useEffect(() => {
    const check = () => setHasDrive(hasDriveAccess());
    // Check once on mount and again after a short delay (post-redirect token store)
    check();
    const t = setTimeout(check, 800);
    return () => clearTimeout(t);
  }, []);

  // When Drive access becomes available, fetch motion count for the badge
  useEffect(() => {
    if (!hasDrive) {
      setLibraryMotionCount(0);
      return;
    }
    listDriveMotions()
      .then((files) => setLibraryMotionCount(files.length))
      .catch(() => { /* graceful — badge stays 0 */ });
  }, [hasDrive]);

  // Ref always holds the latest playback blob + name — used by Drive-connect
  // effect so it can upload without a stale closure over playbackBlob state.
  const latestPlaybackRef = useRef<{ blob: Blob; name: string } | null>(null);

  // Timeout fallback: if face detection never fires within 30s on mobile,
  // dismiss the overlay so the user isn't permanently stuck.
  const mediapipeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSwitcherDisabled = recordingPhase !== "idle";

  const handlePhaseChange = useCallback((phase: "idle" | "recording" | "review" | "done") => {
    setRecordingPhase(phase);
  }, []);

  const handleStreamReady = (stream: MediaStream) => {
    setMediapipeReady(false);
    setVideoStream(stream);
  };

  const handleMediapipeReady = useCallback(() => {
    if (mediapipeTimeoutRef.current) {
      clearTimeout(mediapipeTimeoutRef.current);
      mediapipeTimeoutRef.current = null;
    }
    setMediapipeReady(true);
  }, []);

  // Start a 30-second timeout once avatar + stream are both ready.
  useEffect(() => {
    if (avatarReady && videoStream && !mediapipeReady) {
      mediapipeTimeoutRef.current = setTimeout(() => {
        setMediapipeReady(true);
      }, 30000);
    }
    return () => {
      if (mediapipeTimeoutRef.current) {
        clearTimeout(mediapipeTimeoutRef.current);
        mediapipeTimeoutRef.current = null;
      }
    };
  }, [avatarReady, videoStream, mediapipeReady]);

  const handleAvatarChange = (newUrl: string) => {
    discardRecording();

    useGLTF.clear(newUrl);

    if (url === newUrl) {
      setUrl(null);
      setTimeout(() => {
        setUrl(newUrl);
        setAvatarKey((k) => k + 1);
      }, 0);
    } else {
      setUrl(newUrl);
      setAvatarKey((k) => k + 1);
    }

    setAvatarReady(false);
    setMediapipeReady(false);
  };

  // ── Subscribe to playback-ready events from useMotionRecorder ────────────
  useEffect(() => {
    return subscribePlaybackReady(({ blob, motionId, name }) => {
      setPlaybackBlob(blob);
      setActiveMotionId(motionId);
      setActiveMotionName(name.replace(/\.glb$/i, ""));
      setDriveUploadStatus("idle"); // reset for this new take

      // Keep ref current so Drive-connect effect can upload if user signs in later
      latestPlaybackRef.current = { blob, name };

      // Always open the library when a motion is saved so the user sees it placed there
      setLibraryOpen(true);

      // For guest users (not logged in), create a local pending motion so they can
      // see and download the motion they just recorded
      if (!hasDriveAccess()) {
        const localMotion: DriveMotionFile = {
          driveFileId: motionId,
          name: name,
          size: blob.size,
          modifiedTime: new Date().toISOString(),
          duration: undefined,
        };
        setPendingMotion(localMotion);
      }

      // If already signed in, the Drive upload fires inside stopRecording().
      // Set uploading status immediately and wait for the upload to resolve
      // via the uploadToDrive promise in useMotionRecorder (we listen in a
      // separate effect below). Here we just show the spinner.
      if (hasDriveAccess()) {
        setDriveUploadStatus("uploading");
      }
    });
  }, []);

  // ── Subscribe to Drive quota exceeded events ──────────────────────────────
  // Fires from useDriveSync._notifyQuota() whenever any uploadToDrive() call
  // fails with DriveQuotaError — even the one inside useMotionRecorder.
  useEffect(() => {
    return subscribeQuotaExceeded(() => {
      setDriveUploadStatus("quota");
      setLibraryOpen(true); // open the library so the banner is visible
    });
  }, []);

  // ── Subscribe to Drive upload completions ─────────────────────────────────
  // When uploadToDrive() succeeds (from any call site — stopRecording, the
  // hasDrive-transition effect, etc.) we get the DriveMotionFile back and:
  //  1. Set it as pendingMotion → renders immediately at the top of the library
  //  2. Bump libraryRefreshKey → triggers a silent background re-fetch so the
  //     list eventually reflects the canonical Drive order
  //  3. Increment libraryMotionCount for the badge
  //  4. Mark driveUploadStatus as "done"
  useEffect(() => {
    return subscribeMotionUploaded((file) => {
      setPendingMotion(file);
      setLibraryRefreshKey((k) => k + 1);
      setLibraryMotionCount((c) => c + 1);
      setDriveUploadStatus("done");
    });
  }, []);

  // Clear the optimistic pending motion a short while after the refresh fires,
  // giving the library re-fetch time to complete and replace it with real data.
  useEffect(() => {
    if (libraryRefreshKey === 0) return;
    const t = setTimeout(() => setPendingMotion(null), 4000);
    return () => clearTimeout(t);
  }, [libraryRefreshKey]);

  // ── Playback controls (bridging out of R3F canvas) ────────────────────────
  const getPlaybackControls = useCallback(() =>
    (window as any).__playbackControls ?? null,
  []);

  const handleTogglePlay = useCallback(() => {
    getPlaybackControls()?.togglePlay();
  }, [getPlaybackControls]);

  const handleSeek = useCallback((t: number) => {
    getPlaybackControls()?.seek(t);
  }, [getPlaybackControls]);

  const handleSetLoop = useCallback((loop: boolean) => {
    getPlaybackControls()?.setLoop(loop);
  }, [getPlaybackControls]);

  // ── "Do another" → back to idle, clear playback ───────────────────────────
  // Called by BOTH PlaybackControls (scrubber bar) and RecordingControls
  // (review popup) — must clear everything in both cases.
  const handleDoAnother = useCallback(() => {
    setPlaybackBlob(null);
    setActiveMotionId(null);
    setActiveMotionName(undefined);
    discardRecording();
    handlePhaseChange("idle");
    // Library stays open so logged-in users can browse their history
  }, [handlePhaseChange]);

  // ── Start live capture from inside library panel ──────────────────────────
  const handleStartLive = useCallback(() => {
    // If currently recording, stop gracefully before switching
    if (recordingPhase === "recording") {
      discardRecording();
    }
    setPlaybackBlob(null);
    setActiveMotionId(null);
    setActiveMotionName(undefined);
    handlePhaseChange("idle");
    setLibraryOpen(false);
  }, [recordingPhase, handlePhaseChange]);

  // ── When library opens, stop recording gracefully ────────────────────────────
  const handleOpenLibrary = useCallback(() => {
    if (recordingPhase === "recording") {
      discardRecording();
      handlePhaseChange("idle");
    }
    setLibraryOpen(prev => !prev);
  }, [recordingPhase, handlePhaseChange]);

  // ── Select motion from library ────────────────────────────────────────────
  const handleSelectMotion = useCallback((blob: Blob, file: DriveMotionFile) => {
    setPlaybackBlob(blob);
    setActiveMotionId(file.driveFileId);
    setActiveMotionName(file.name.replace(/\.glb$/i, ""));
    // Don't close the library on mobile — user might want to switch again
  }, []);

  // ── When Drive first becomes available, upload any pending blob and refresh count ──
  // This covers two cases:
  //   1. User was already recording/reviewed before signing in (signs in during review).
  //   2. User signs in fresh and Drive tokens arrive via SIGNED_IN event.
  const prevHasDriveRef = useRef(false);
  useEffect(() => {
    if (hasDrive && !prevHasDriveRef.current) {
      prevHasDriveRef.current = true;

      const pending = latestPlaybackRef.current;
      if (pending) {
        // A recording was made before sign-in — upload it now.
        // subscribeMotionUploaded will handle status + optimistic insert.
        setDriveUploadStatus("uploading");
        uploadToDrive(pending.blob, pending.name)
          .then(() => {
            // subscribeMotionUploaded fires → sets "done" + pendingMotion + refreshKey
            setLibraryOpen(true);
          })
          .catch((err) => {
            console.warn("[app] Drive upload on sign-in failed:", err?.message);
            setDriveUploadStatus(err instanceof DriveQuotaError ? "quota" : "error");
          });
      } else {
        // No pending blob — just refresh the library count from Drive.
        listDriveMotions()
          .then((files) => setLibraryMotionCount(files.length))
          .catch(() => { });
      }
    }
    if (!hasDrive) {
      prevHasDriveRef.current = false;
      setDriveUploadStatus("idle");
    }
  }, [hasDrive]);

  const isInPlayback = playbackBlob !== null;
  const faceTrackingDisabled = isSwitcherDisabled || isInPlayback;

  return (
    <div className="App">
      <CameraPermissions
        onStreamReady={handleStreamReady}
        disabled={isSwitcherDisabled || isInPlayback}
        isFlipped={isFlipped}
        setIsFlipped={setIsFlipped}
      />

      {avatarReady && videoStream && !mediapipeReady && !isInPlayback && (
        <div className="reveal fade mediapipe-loader pos-fixed top-0 left-0 w-full h-full flex items-center justify-center bg-black bg-opacity-70 z-999">
          <p className="text-white text-2xl animate-pulse">Keep smiling...</p>
        </div>
      )}

      {avatarReady && videoStream && !isInPlayback && (
        <FaceTracking
          videoStream={videoStream}
          onMediapipeReady={handleMediapipeReady}
          disabled={faceTrackingDisabled}
          isFlipped={isFlipped}
        />
      )}

      {/* 3D Avatar Canvas */}
      <AvatarCanvas
        url={url}
        avatarKey={avatarKey}
        setAvatarReady={setAvatarReady}
        isFlipped={isFlipped}
        playbackBlob={playbackBlob}
      />

      {/* Top-right controls */}
      <div className="pos-fixed top-0 right-0 z-9992 m-3 flex flex-row items-center gap-2" style={{ pointerEvents: "auto" }}>
        <MotionLibraryButton
          onClick={handleOpenLibrary}
          motionCount={hasDrive ? libraryMotionCount : 0}
        />
        <AuthButton onDriveConnected={() => setHasDrive(hasDriveAccess())} />
      </div>

      <ColorSwitcher disabled={isSwitcherDisabled || isInPlayback} />
      <AvatarSwitcher activeUrl={url} onAvatarChange={handleAvatarChange} disabled={isSwitcherDisabled || isInPlayback} />

      {/* Recording controls — always rendered so the review overlay stays visible
          while playback is active. In idle phase, the "record" button is hidden
          when playback is already running (isInPlayback) so it doesn't overlap. */}
      <RecordingControls
        mediapipeReady={mediapipeReady}
        avatarReady={avatarReady}
        onPhaseChange={handlePhaseChange}
        onDoAnother={handleDoAnother}
        hideIdleWhenPlaying={isInPlayback}
      />

      {/* Playback scrubber bar — shown whenever playback blob is active */}
      {isInPlayback && (
        <PlaybackControls
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          onSetLoop={handleSetLoop}
          onDoAnother={handleDoAnother}
          motionName={activeMotionName}
          onDownload={playbackBlob ? () => {
            const url = URL.createObjectURL(playbackBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = activeMotionName ? `${activeMotionName}.glb` : "motion.glb";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } : undefined}
        />
      )}

      {/* Motion Library panel — always rendered when open, works for both logged-in and guest */}
      {libraryOpen && (
        <MotionLibrary
          onClose={() => setLibraryOpen(false)}
          activeMotionId={activeMotionId}
          onSelectMotion={handleSelectMotion}
          onStartLive={handleStartLive}
          bulkProgress={bulkProgress}
          refreshKey={libraryRefreshKey}
          pendingMotion={pendingMotion}
          quotaReached={driveUploadStatus === "quota"}
          isLoggedIn={hasDrive}
          onLoginRequest={() => setShowAuthModal(true)}
          isInPlayback={isInPlayback}
          playbackBlob={playbackBlob}
        />
      )}

      {/* Auth modal — triggered from library empty state or other call sites */}
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onDriveConnected={() => {
            setShowAuthModal(false);
            setHasDrive(hasDriveAccess());
          }}
        />
      )}
    </div>
  );
}

export default App;
