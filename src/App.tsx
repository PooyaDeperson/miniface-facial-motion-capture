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
import PostRecordAuthPopup from "./components/PostRecordAuthPopup";
import LibraryAuthPopup from "./components/LibraryAuthPopup";
import PermissionPopup from "./components/PermissionPopup";
import { supabase } from "./supabaseClient";
import { hasDriveAccess, clearDriveTokens, listDriveMotions, uploadToDrive, subscribeMotionUploaded, subscribeQuotaExceeded, subscribeNoDriveScope, DriveQuotaError, BulkSyncProgress, DRIVE_SCOPE } from "./useDriveSync";
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

  // ── Post-record auth popup — shown to guests after a recording stops ──────
  const [showPostRecordAuthPopup, setShowPostRecordAuthPopup] = useState(false);

  // ── Library auth popup — shown to guests when they click the library button ──
  const [showLibraryAuthPopup, setShowLibraryAuthPopup] = useState(false);

  // ── No Drive access — signed in but Drive scope missing ──────────────────
  // Lifted from MotionLibrary so the popup is always visible, even when the
  // library panel is closed.
  const [noDriveAccessDetected, setNoDriveAccessDetected] = useState(false);

  /** Directly triggers Google OAuth with Drive scope — skips the AuthModal. */
  const handleGoogleReAuth = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: false,
        scopes: DRIVE_SCOPE,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
  }, []);

  // ── Drive scope state (drive token can appear after sign-in redirect) ─────
  const [hasDrive, setHasDrive] = useState(() => hasDriveAccess());

  // Poll for Drive access after component mounts (handles OAuth redirect case)
  useEffect(() => {
    const check = () => setHasDrive(hasDriveAccess());
    // Check once on mount and again after short delays (post-redirect token store)
    check();
    const t1 = setTimeout(check, 500);
    const t2 = setTimeout(check, 1500);
    const t3 = setTimeout(check, 3000);
    // Also re-check whenever the tab regains focus (user completes OAuth in another tab)
    window.addEventListener("focus", check);
    // Re-check on sessionStorage changes (storeDriveTokens writes here)
    window.addEventListener("storage", check);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", check);
    };
  }, []);

  // ── Immediately detect missing Drive scope after login ───────────────────
  // We run a single definitive check after mount: if Supabase has an active
  // session but no Drive token is in sessionStorage, the user skipped the
  // Drive scope and should see the persistent popup immediately.
  // We deliberately do NOT subscribe to onAuthStateChange here — supabaseClient
  // already fires notifyNoDriveScope for fresh sign-ins (handled below). This
  // effect only handles users who reload the page while already logged-in but
  // without Drive access.
  useEffect(() => {
    if (!supabase) return;

    // Small delay so Supabase can finish restoring the session and
    // storeDriveTokens (triggered by supabaseClient.ts) can write to
    // sessionStorage before we read it.
    const t = setTimeout(async () => {
      const { data } = await supabase!.auth.getSession();
      const loggedIn = !!data.session?.user;
      const hasToken = hasDriveAccess();
      if (loggedIn && !hasToken) {
        setNoDriveAccessDetected(true);
      }
    }, 800);

    return () => clearTimeout(t);
  }, []); // runs once on mount only

  // When Drive access is confirmed, clear the no-drive popup
  useEffect(() => {
    if (hasDrive) setNoDriveAccessDetected(false);
  }, [hasDrive]);

  // When Drive access becomes available, fetch motion count for the badge
  useEffect(() => {
    if (!hasDrive) {
      setLibraryMotionCount(0);
      return;
    }
    listDriveMotions()
      .then((files) => setLibraryMotionCount(files.length))
      .catch((err: any) => {
        const msg: string = err?.message ?? "";
        const is403 =
          msg.includes("403") ||
          msg.toLowerCase().includes("insufficient") ||
          msg.toLowerCase().includes("permission_denied");
        if (is403) {
          // Stale token — clear it and surface the no-drive popup
          clearDriveTokens();
          setHasDrive(false);
          setNoDriveAccessDetected(true);
        }
        // badge stays 0 for all other errors
      });
  }, [hasDrive]);

  // ── Pending playback — used when avatar swap is required before playing ─────
  // When the user selects a library motion recorded on a different avatar, we
  // first swap the avatar (which triggers a load + skeleton loader), and once
  // avatarReady fires we pick this up and start playback.
  const pendingPlaybackRef = useRef<{ blob: Blob; file: DriveMotionFile } | null>(null);
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

  const handleAvatarChange = (newUrl: string, keepPending = false) => {
    discardRecording();
    // Clear any pending playback unless this swap is itself triggered by a
    // library selection (keepPending = true), in which case the ref was just
    // set by handleSelectMotion and must survive into the avatarReady effect.
    if (!keepPending) {
      pendingPlaybackRef.current = null;
    }

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
    return subscribePlaybackReady(({ blob, motionId, name, durationSeconds, avatarUrl }) => {
      setPlaybackBlob(blob);
      setActiveMotionId(motionId);
      setActiveMotionName(name.replace(/\.glb$/i, ""));
      setDriveUploadStatus("idle"); // reset for this new take

      // Keep ref current so Drive-connect effect can upload if user signs in later
      latestPlaybackRef.current = { blob, name };

      // For logged-in users open the library so they see the motion placed there.
      // For guests, show the post-record auth popup instead (they can open the
      // library manually later via the library button).
      if (hasDriveAccess()) {
        setLibraryOpen(true);
      } else {
        setShowPostRecordAuthPopup(true);
      }

      // Immediately create an optimistic pending motion for ALL users (guest and
      // logged-in) so the row appears in the library without any delay.
      // For logged-in users this row shows a "saving…" spinner until Drive
      // confirms the upload; subscribeMotionUploaded will replace it.
      const optimisticMotion: DriveMotionFile = {
        driveFileId: motionId,
        name: name,
        size: blob.size,
        modifiedTime: new Date().toISOString(),
        duration: durationSeconds,
        avatarUrl: avatarUrl,
      };
      setPendingMotion(optimisticMotion);

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

  // ── Subscribe to sign-in without Drive scope ──────────────────────────────
  // When the user signs in with Google but does NOT grant Drive appdata access,
  // supabaseClient fires notifyNoDriveScope(). We auto-open the AuthModal so
  // they immediately see the friendly "grant Drive access" prompt. Their
  // pending recording blob is still in latestPlaybackRef and will upload once
  // they successfully grant access and hasDrive becomes true.
  useEffect(() => {
    return subscribeNoDriveScope(() => {
      // Fresh OAuth redirect without Drive scope — show the persistent popup
      // instead of the AuthModal so the user sees the clear Drive-specific message.
      setNoDriveAccessDetected(true);
    });
  }, []);

  // ── Subscribe to Drive upload completions ─────────────────────────────────
  // When uploadToDrive() succeeds (from any call site — stopRecording, the
  // hasDrive-transition effect, etc.) we get the DriveMotionFile back and:
  //  1. Replace pendingMotion with the confirmed Drive file (real driveFileId)
  //  2. If the user is still on this motion (activeMotionId matches the optimistic
  //     id), update activeMotionId to the real Drive file ID so selection stays correct
  //  3. Bump libraryRefreshKey → triggers a silent background re-fetch so the
  //     list eventually reflects the canonical Drive order
  //  4. Increment libraryMotionCount for the badge
  //  5. Mark driveUploadStatus as "done"
  useEffect(() => {
    return subscribeMotionUploaded((file) => {
      setPendingMotion(file);
      setActiveMotionId((currentId) => {
        // If the user is still viewing the optimistic motion, point to the real one
        // We can't compare directly since we don't have the optimistic ID here,
        // but if the current ID starts with "motion_" it's the local optimistic one
        if (currentId && currentId.startsWith("motion_")) {
          setActiveMotionName(file.name.replace(/\.glb$/i, ""));
          return file.driveFileId;
        }
        return currentId;
      });
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

  // ── Apply pending playback once the avatar finishes loading ──────────────
  // When a library motion needs a different avatar, handleSelectMotion stores
  // the blob in pendingPlaybackRef and triggers an avatar swap. This effect
  // watches avatarReady and fires as soon as the new mesh is mounted.
  useEffect(() => {
    if (!avatarReady) return;
    const pending = pendingPlaybackRef.current;
    if (!pending) return;
    pendingPlaybackRef.current = null;
    setPlaybackBlob(pending.blob);
    setActiveMotionId(pending.file.driveFileId);
    setActiveMotionName(pending.file.name.replace(/\.glb$/i, ""));
  }, [avatarReady]);

  // ── "Do another" → back to idle, clear playback ───────────────────────────
  // Called by BOTH PlaybackControls (scrubber bar) and RecordingControls.
  const handleDoAnother = useCallback(() => {
    setPlaybackBlob(null);
    setActiveMotionId(null);
    setActiveMotionName(undefined);
    pendingPlaybackRef.current = null;
    discardRecording();
    handlePhaseChange("idle");
    // Reset mediapipe so "keep smiling" loader shows while it re-initialises
    setMediapipeReady(false);
    // Library stays open so logged-in users can browse their history
  }, [handlePhaseChange]);

  // ── Start live capture from inside library panel or player ───────────────
  const handleStartLive = useCallback(() => {
    // If currently recording, stop gracefully before switching
    if (recordingPhase === "recording") {
      discardRecording();
    }
    setPlaybackBlob(null);
    setActiveMotionId(null);
    setActiveMotionName(undefined);
    pendingPlaybackRef.current = null;
    handlePhaseChange("idle");
    setLibraryOpen(false);
    // Reset mediapipe so the "keep smiling" loader shows while it re-initialises
    setMediapipeReady(false);
  }, [recordingPhase, handlePhaseChange]);

  // ── When library opens, stop recording gracefully and re-check auth ─────────
  const handleOpenLibrary = useCallback(() => {
    if (recordingPhase === "recording") {
      discardRecording();
      handlePhaseChange("idle");
    }
    // Re-check Drive access every time the panel opens so the logged-in state
    // is never stale (covers OAuth redirect and tab-focus edge cases)
    const currentlyHasDrive = hasDriveAccess();
    setHasDrive(currentlyHasDrive);

    // Guests see the auth popup instead of the library panel
    if (!currentlyHasDrive) {
      setShowLibraryAuthPopup(true);
      return;
    }

    setLibraryOpen(prev => !prev);
  }, [recordingPhase, handlePhaseChange]);

  // ── Select motion from library ────────────────────────────────────────────
  const handleSelectMotion = useCallback((blob: Blob, file: DriveMotionFile) => {
    const targetAvatarUrl = file.avatarUrl ?? null;

    // If the motion was recorded on a different avatar (or we know its avatar
    // URL and it differs from current), swap the avatar first. The skeleton
    // loader will show while the new mesh loads; once avatarReady fires the
    // pendingPlaybackRef effect below will start playback automatically.
    if (targetAvatarUrl && targetAvatarUrl !== url) {
      pendingPlaybackRef.current = { blob, file };
      // Clear current playback so the canvas shows the loader cleanly
      setPlaybackBlob(null);
      // Pass keepPending=true so handleAvatarChange does NOT wipe the ref we just set
      handleAvatarChange(targetAvatarUrl, true);
      setActiveMotionId(file.driveFileId);
      setActiveMotionName(file.name.replace(/\.glb$/i, ""));
      return;
    }

    // Same avatar (or unknown avatar) — play immediately
    setPlaybackBlob(blob);
    setActiveMotionId(file.driveFileId);
    setActiveMotionName(file.name.replace(/\.glb$/i, ""));
    // Don't close the library on mobile — user might want to switch again
  }, [url, handleAvatarChange]);

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
        uploadToDrive(pending.blob, pending.name, undefined, url ?? undefined)
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
        {isInPlayback && (
          <button
            className="rec-btn rec-btn-record outline-5 outline-soft gap-2 live-capture-button live-capture-topbar-btn reveal fade"
            onClick={handleStartLive}
            aria-label="Start live motion capture"
          >
            <span className="rec-dot rec-dot-idle" aria-hidden="true" />
            live
          </button>
        )}
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
          onNoDriveAccessRetry={handleGoogleReAuth}
          onNoDriveAccess={setNoDriveAccessDetected}
          onDrivePermissionError={() => {
            // Stale token in sessionStorage caused a 403 — clear it so
            // hasDriveAccess() returns false, then surface the persistent popup.
            clearDriveTokens();
            setHasDrive(false);
            setNoDriveAccessDetected(true);
          }}
          isInPlayback={isInPlayback}
          playbackBlob={playbackBlob}
          isPendingUploading={driveUploadStatus === "uploading"}
        />
      )}

      {/* No Drive access popup — shown persistently when signed in but Drive scope missing.
          Rendered at App root so it is always visible regardless of library open state. */}
      {!hasDrive && noDriveAccessDetected && (
        <PermissionPopup
          variant="prompt"
          aria-label="Google Drive access required"
          title="Google Drive permission is missing"
          className="no-drive-access-popup"
          backdrop={true}
          overlayClosesPopup={false}
        >
          <p className="subtitle prompt-subtitle" style={{ marginTop: "8px" }}>
            It looks like Drive access was not granted when you signed in. Sign in again and make sure to allow Drive — your motion will upload automatically once access is granted.
          </p>
          <button
            className="button primary w-full mt-8"
            onClick={handleGoogleReAuth}
            aria-label="Sign in again to grant Google Drive access"
          >
            <span className="has-icon icon-size-14 google-icon" aria-hidden="true" />
            continue with Google
          </button>
        </PermissionPopup>
      )}

      {/* Library auth popup — shown to guests when they click the library button */}
      {showLibraryAuthPopup && !hasDrive && (
        <LibraryAuthPopup
          onClose={() => setShowLibraryAuthPopup(false)}
          onDriveConnected={() => {
            setShowLibraryAuthPopup(false);
            setHasDrive(hasDriveAccess());
          }}
          /* Replace with your image URL when ready — e.g. imgSrc="/images/library-preview.png" */
          imgSrc={undefined}
        />
      )}

      {/* Post-record auth popup — shown to guests after recording stops */}
      {showPostRecordAuthPopup && !hasDrive && (
        <PostRecordAuthPopup
          onClose={() => setShowPostRecordAuthPopup(false)}
          onDriveConnected={() => {
            setShowPostRecordAuthPopup(false);
            setHasDrive(hasDriveAccess());
          }}
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
          hasPendingMotion={latestPlaybackRef.current !== null}
        />
      )}
    </div>
  );
}

export default App;
