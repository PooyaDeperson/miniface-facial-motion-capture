
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
import FaceTracking from "./FaceTracking";
import AvatarCanvas from "./AvatarCanvas";
import { discardRecording } from "./useMotionRecorder";

function App() {
  const [url, setUrl] = useState<string | null>(null);
  const [avatarKey, setAvatarKey] = useState(0);
  const [avatarReady, setAvatarReady] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [mediapipeReady, setMediapipeReady] = useState(false);
  const [recordingPhase, setRecordingPhase] = useState<"idle" | "recording" | "review" | "done">("idle");
  // Timeout fallback: if face detection never fires within 30s on mobile,
  // dismiss the overlay so the user isn't permanently stuck.
  const mediapipeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSwitcherDisabled = recordingPhase !== "idle";

  const handlePhaseChange = useCallback((phase: "idle" | "recording" | "review" | "done") => {
    setRecordingPhase(phase);
  }, []);

  const handleStreamReady = (stream: MediaStream) => {
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
  // On mobile the CPU delegate can be slow; this prevents an infinite overlay.
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

  return (
    <div className="App">
      <CameraPermissions onStreamReady={handleStreamReady} />

      {avatarReady && videoStream && !mediapipeReady && (
        <div className="reveal fade mediapipe-loader pos-fixed top-0 left-0 w-full h-full flex items-center justify-center bg-black bg-opacity-70 z-999">
          <p className="text-white text-2xl animate-pulse">Keep smiling...</p>
        </div>
      )}

      {avatarReady && videoStream && (
        <FaceTracking
          videoStream={videoStream}
          onMediapipeReady={handleMediapipeReady}
        />
      )}

      {/* 3D Avatar Canvas */}
      <AvatarCanvas url={url} avatarKey={avatarKey} setAvatarReady={setAvatarReady} />

      <ColorSwitcher disabled={isSwitcherDisabled} />
      <AvatarSwitcher activeUrl={url} onAvatarChange={handleAvatarChange} disabled={isSwitcherDisabled} />

      {/* Motion capture recording controls — visible once avatar + mediapipe are both live */}
      <RecordingControls
        mediapipeReady={mediapipeReady}
        avatarReady={avatarReady}
        onPhaseChange={handlePhaseChange}
      />
    </div>
  );
}

export default App;
