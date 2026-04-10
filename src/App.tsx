
/*
 * Copyright (c) 2025 Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 * 
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson"
 */

import "./App.css";
import { useState } from "react";
import { useGLTF } from "@react-three/drei";
import CameraPermissions from "./camera-permission";
import ColorSwitcher from "./components/ColorSwitcher";
import AvatarSwitcher from "./components/AvatarSwitcher";
import FaceTracking from "./FaceTracking";
import AvatarCanvas from "./AvatarCanvas";

function App() {
  const [url, setUrl] = useState<string | null>(null);
  const [avatarKey, setAvatarKey] = useState(0);
  const [avatarReady, setAvatarReady] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [mediapipeReady, setMediapipeReady] = useState(false);

  const handleStreamReady = (stream: MediaStream) => {
    setVideoStream(stream);
  };

  const handleAvatarChange = (newUrl: string) => {
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
        <div className="reveal fade mediapipe-loader pos-fixed top-0 left-0 w-full h-full flex items-center justify-center bg-black bg-opacity-70 z-50">
          <p className="text-white text-2xl animate-pulse">Keep smiling...</p>
        </div>
      )}

      {avatarReady && videoStream && (
        <FaceTracking
          videoStream={videoStream}
          onMediapipeReady={() => setMediapipeReady(true)}
        />
      )}

      {/* 3D Avatar Canvas */}
      <AvatarCanvas url={url} avatarKey={avatarKey} setAvatarReady={setAvatarReady} />

      <ColorSwitcher />
      <AvatarSwitcher activeUrl={url} onAvatarChange={handleAvatarChange} />
    </div>
  );
}

export default App;
