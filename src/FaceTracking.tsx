
/*
 * Copyright (c) 2025 Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 * 
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson"
 */

// FaceTracking.tsx
import { useEffect, useRef } from "react";
import { FaceLandmarker, FaceLandmarkerOptions, FilesetResolver } from "@mediapipe/tasks-vision";
import { Euler, Matrix4, Vector3 } from "three";

export let blendshapes: any[] = [];
export let rotation: Euler;
export let headMesh: any[] = [];

/** True while MediaPipe face detection is running. Avatar reads this to switch modes. */
export let isMediaPipeActive = false;

let faceLandmarker: FaceLandmarker;
let lastVideoTime = -1;

/** Detect mobile/low-end devices to use CPU delegate and avoid GPU instability */
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|Samsung|Xiaomi|MIUI|HarmonyOS/i.test(
    navigator.userAgent
  );
}

/**
 * Compute head rotation from raw landmarks when the transformation matrix is
 * unavailable or degenerate. Uses the nose tip, forehead, chin, and ear
 * landmarks to derive yaw/pitch/roll via cross-product math — avoids the
 * procrustes solver that crashes on mobile.
 */
function rotationFromLandmarks(landmarks: { x: number; y: number; z: number }[]): Euler {
  // Key landmark indices (MediaPipe 478-point model)
  const noseTip   = landmarks[4];
  const forehead  = landmarks[10];
  const chin      = landmarks[152];
  const leftEar   = landmarks[234];
  const rightEar  = landmarks[454];

  if (!noseTip || !forehead || !chin || !leftEar || !rightEar) {
    return rotation ?? new Euler();
  }

  const up = new Vector3(
    forehead.x - chin.x,
    forehead.y - chin.y,
    forehead.z - chin.z
  ).normalize();

  const right = new Vector3(
    rightEar.x - leftEar.x,
    rightEar.y - leftEar.y,
    rightEar.z - leftEar.z
  ).normalize();

  const forward = new Vector3().crossVectors(right, up).normalize();
  const correctedRight = new Vector3().crossVectors(up, forward).normalize();

  const m = new Matrix4().makeBasis(correctedRight, up, forward);
  return new Euler().setFromRotationMatrix(m, "XYZ");
}

/** Check that a 4x4 matrix array is non-degenerate before using it */
function isValidMatrix(data: number[]): boolean {
  if (!data || data.length < 16) return false;
  // The matrix norm must be well above zero — same check MediaPipe does internally
  const norm = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0));
  return norm > 1e-6;
}

function FaceTracking({
  videoStream,
  onMediapipeReady,
}: {
  videoStream: MediaStream;
  onMediapipeReady?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const onMediapipeReadyFiredRef = useRef(false);

  const setupFaceLandmarker = async () => {
    const mobile = isMobileDevice();

    const options: FaceLandmarkerOptions = {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        // Use CPU on mobile — GPU delegate is unstable on Android (Samsung/Xiaomi/etc.)
        delegate: mobile ? "CPU" : "GPU",
      },
      numFaces: 1,
      runningMode: "VIDEO",
      outputFaceBlendshapes: true,
      // Completely disable facial transformation matrices on mobile — the
      // procrustes solver inside MediaPipe crashes on degenerate frames from
      // Samsung/Xiaomi GPU pipelines even with CPU delegate selected. We derive
      // rotation from raw landmarks instead (see rotationFromLandmarks below).
      outputFacialTransformationMatrixes: !mobile,
    };

    const filesetResolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, options);
    // Do NOT call onMediapipeReady here — fire it on the first successful
    // detection so the "Keep Smiling" overlay only clears when tracking is
    // actually live (not just when the model finishes loading).
  };

  const predictLoopRef = useRef<number | null>(null);
  // Throttle on mobile: skip frames to stay under 33ms budget
  const lastPredictTime = useRef<number>(0);
  const MOBILE_THROTTLE_MS = isMobileDevice() ? 40 : 0; // ~25 fps on mobile

  const predict = () => {
    const vid = videoRef.current;
    if (!vid || !faceLandmarker) return;

    const now = Date.now();

    // Throttle on mobile to avoid rAF 71ms violations
    if (MOBILE_THROTTLE_MS > 0 && now - lastPredictTime.current < MOBILE_THROTTLE_MS) {
      predictLoopRef.current = requestAnimationFrame(predict);
      return;
    }
    lastPredictTime.current = now;

    if (lastVideoTime !== vid.currentTime) {
      lastVideoTime = vid.currentTime;

      try {
        const result = faceLandmarker.detectForVideo(vid, now);

        if (result.faceBlendshapes?.length && result.faceBlendshapes[0].categories) {
          blendshapes = result.faceBlendshapes[0].categories;

          // Prefer the transformation matrix when valid; fall back to landmark math
          const matrixData = result.facialTransformationMatrixes?.[0]?.data;
          if (matrixData && isValidMatrix(Array.from(matrixData))) {
            const matrix = new Matrix4().fromArray(Array.from(matrixData));
            rotation = new Euler().setFromRotationMatrix(matrix);
          } else if (result.faceLandmarks?.[0]) {
            // Fallback: derive rotation from raw landmarks (avoids procrustes crash)
            rotation = rotationFromLandmarks(result.faceLandmarks[0]);
          }

          isMediaPipeActive = true;

          // Fire onMediapipeReady on the first successful detection — not on
          // model init — so the "Keep Smiling" overlay only clears when face
          // tracking is genuinely live (critical for slow mobile CPU delegate).
          if (!onMediapipeReadyFiredRef.current && onMediapipeReady) {
            onMediapipeReadyFiredRef.current = true;
            onMediapipeReady();
          }
        }
      } catch (_err) {
        // Swallow per-frame MediaPipe errors (procrustes solver failures on mobile)
        // so the loop keeps running instead of crashing
      }
    }

    predictLoopRef.current = requestAnimationFrame(predict);
  };

  useEffect(() => {
    if (!videoStream) return;

    const vid = videoRef.current;
    if (!vid) return;

    vid.srcObject = videoStream;
    vid.onloadeddata = () => {
      // On Android/mobile, autoplay may be silently blocked even with `muted`.
      // Explicitly calling play() ensures currentTime advances so detectForVideo
      // receives new frames on every rAF tick.
      vid.play().catch(() => {
        // play() rejection is non-fatal — the loop will still attempt detection
      });
      setupFaceLandmarker().then(predict);
    };

    return () => {
      if (predictLoopRef.current !== null) {
        cancelAnimationFrame(predictLoopRef.current);
        predictLoopRef.current = null;
      }
      isMediaPipeActive = false;
      blendshapes = [];
      onMediapipeReadyFiredRef.current = false;
    };
  }, [videoStream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      id="video"
      className="camera-feed w-1 tb:w-400 br-12 tb:br-24 m-4"
      style={{}}
    />
  );
}

export default FaceTracking;
