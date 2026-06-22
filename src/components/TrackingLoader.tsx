/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 *
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson"
 */

// TrackingLoader.tsx
// Cycling status messages shown while MediaPipe initialises.
// Mirrors the same timed-message pattern used by AvatarLoader.

import React, { useEffect, useState } from "react";

interface TrackingLoaderProps {
  visible: boolean;
}

const MESSAGES = [
  "show your face...",
  "detecting your face",
  "fingers ready too",
];

// How long each message is shown before moving to the next (ms)
const INTERVAL = 5000;

const TrackingLoader: React.FC<TrackingLoaderProps> = ({ visible }) => {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!visible) return;

    setMessageIndex(0); // reset each time it becomes visible

    const timer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % MESSAGES.length);
    }, INTERVAL);

    return () => clearInterval(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="reveal fade mediapipe-loader pos-fixed top-0 left-0 w-full h-full flex items-center justify-center bg-black bg-opacity-70 z-999">
      <p className="text-white text-2xl animate-pulse">{MESSAGES[messageIndex]}</p>
    </div>
  );
};

export default TrackingLoader;
