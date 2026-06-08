/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 *
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson"
 */

// faceWorker.js
// Module-mode Web Worker loaded via:
//   new Worker(new URL('./faceWorker.js', import.meta.url), { type: 'module' })
// Webpack 5 (react-scripts 5) supports module workers natively, which lets us
// use a regular ESM import from the locally-installed @mediapipe/tasks-vision
// package rather than relying on importScripts + a CDN UMD bundle.
/* eslint-disable no-restricted-globals */

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// ─── State ────────────────────────────────────────────────────────────────────
let faceLandmarker = null;
let isMobile = false;

// ─── OffscreenCanvas for detectForVideo ──────────────────────────────────────
// detectForVideo accepts HTMLVideoElement / HTMLCanvasElement / ImageData.
// In a worker we have no HTMLVideoElement, but we DO have OffscreenCanvas.
// We draw the transferred ImageBitmap onto an OffscreenCanvas and pass that.
let offscreen = null;
let offscreenCtx = null;

function getOffscreen(width, height) {
  if (!offscreen || offscreen.width !== width || offscreen.height !== height) {
    offscreen = new OffscreenCanvas(width, height);
    offscreenCtx = offscreen.getContext("2d");
  }
  return { canvas: offscreen, ctx: offscreenCtx };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute head rotation from raw landmarks when the transformation matrix is
 * unavailable or degenerate.
 * Returns { x, y, z } Euler angles (XYZ order, same as Three.js default).
 *
 * Coordinate conventions:
 *  - MediaPipe landmarks: X right, Y down (image space), Z into screen
 *  - Three.js world space: X right, Y up, Z out of screen
 */
function rotationFromLandmarks(landmarks) {
  const forehead = landmarks[10];
  const chin     = landmarks[152];
  const leftEar  = landmarks[234];
  const rightEar = landmarks[454];

  if (!forehead || !chin || !leftEar || !rightEar) return null;

  // up vector (forehead → chin, flipped to world-up)
  const upX = forehead.x - chin.x;
  const upY = -(forehead.y - chin.y);
  const upZ = -(forehead.z - chin.z);
  const upLen = Math.sqrt(upX * upX + upY * upY + upZ * upZ) || 1;
  const ux = upX / upLen, uy = upY / upLen, uz = upZ / upLen;

  // right vector (left → right ear, flipped)
  const rX = rightEar.x - leftEar.x;
  const rY = -(rightEar.y - leftEar.y);
  const rZ = -(rightEar.z - leftEar.z);
  const rLen = Math.sqrt(rX * rX + rY * rY + rZ * rZ) || 1;
  const rx = rX / rLen, ry = rY / rLen, rz = rZ / rLen;

  // forward = right × up
  const fwdX = ry * uz - rz * uy;
  const fwdY = rz * ux - rx * uz;
  const fwdZ = rx * uy - ry * ux;
  const fLen = Math.sqrt(fwdX * fwdX + fwdY * fwdY + fwdZ * fwdZ) || 1;
  const fx = fwdX / fLen, fy = fwdY / fLen, fz = fwdZ / fLen;

  // correctedRight = up × forward
  const crX = uy * fz - uz * fy;
  const crY = uz * fx - ux * fz;
  const crZ = ux * fy - uy * fx;
  const crLen = Math.sqrt(crX * crX + crY * crY + crZ * crZ) || 1;
  const cx = crX / crLen, cy = crY / crLen, cz = crZ / crLen;

  // Column-major flat Matrix4 (Three.js convention):
  // col0 = correctedRight, col1 = up, col2 = forward, col3 = translation(0)
  // Indices: [m00,m10,m20,m30, m01,m11,m21,m31, m02,m12,m22,m32, m03,m13,m23,m33]
  const m = [
    cx, cy, cz, 0,   // col 0
    ux, uy, uz, 0,   // col 1
    fx, fy, fz, 0,   // col 2
    0,  0,  0,  1    // col 3
  ];

  // Extract XYZ Euler from rotation matrix
  // Three.js Euler XYZ: pitch=asin(-m12), yaw=atan2(m02,m22) — wait, let's use
  // the standard Three.js formula for order XYZ:
  //   te[8] = m13 (index 8 in column-major = row1,col2 = m12 in math notation)
  // Column-major: index = col*4 + row
  //   m[8]  = col2,row0 = m02 → used for pitch
  //   m[9]  = col2,row1 = m12
  //   m[10] = col2,row2 = m22
  //   m[4]  = col1,row0 = m01
  //   m[0]  = col0,row0 = m00
  const te8  = m[8];   // m02
  const clampedTe8 = Math.max(-1, Math.min(1, te8));
  const y = Math.asin(clampedTe8);  // yaw (Y rotation in XYZ order)

  let x, z;
  if (Math.abs(clampedTe8) < 0.9999999) {
    x = Math.atan2(-m[9],  m[10]); // pitch
    z = Math.atan2(-m[4],  m[0]);  // roll
  } else {
    x = Math.atan2(m[6], m[5]);
    z = 0;
  }

  return { x, y, z };
}

/** Validate that a 4×4 matrix array is non-degenerate */
function isValidMatrix(data) {
  if (!data || data.length < 16) return false;
  let norm = 0;
  for (let i = 0; i < data.length; i++) norm += data[i] * data[i];
  return Math.sqrt(norm) > 1e-6;
}

// ─── Worker message handler ───────────────────────────────────────────────────

self.onmessage = async function (e) {
  const { type } = e.data;

  // ── INIT ──────────────────────────────────────────────────────────────────
  if (type === "INIT") {
    isMobile = !!e.data.isMobile;

    try {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        // Serve WASM locally from public/wasm/ — no outbound CDN request needed.
        // Files were copied from node_modules/@mediapipe/tasks-vision/wasm and
        // CRA serves everything in public/ as static assets at the root path.
        // Workers resolve absolute paths against the page origin, so /wasm works.
        "/wasm"
      );

      faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          // Model served locally from public/models/ — avoids browser-side
          // origin blocks on storage.googleapis.com in sandboxed preview envs.
          modelAssetPath: "/models/face_landmarker.task",
          delegate: isMobile ? "CPU" : "GPU",
        },
        numFaces: 1,
        runningMode: "VIDEO",
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: !isMobile,
      });

      self.postMessage({ type: "READY" });
    } catch (err) {
      self.postMessage({ type: "ERROR", message: String(err) });
    }
    return;
  }

  // ── DETECT ────────────────────────────────────────────────────────────────
  if (type === "DETECT") {
    const { bitmap, timestamp } = e.data;

    if (!faceLandmarker || !bitmap) {
      self.postMessage({ type: "DETECT_ERROR" });
      return;
    }

    try {
      // Draw the ImageBitmap onto an OffscreenCanvas so we can pass the canvas
      // to detectForVideo (which accepts CanvasImageSource incl. OffscreenCanvas).
      const { canvas, ctx } = getOffscreen(bitmap.width, bitmap.height);
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close(); // release GPU/CPU memory immediately

      const result = faceLandmarker.detectForVideo(canvas, timestamp);

      if (
        !result.faceBlendshapes?.length ||
        !result.faceBlendshapes[0].categories
      ) {
        self.postMessage({ type: "DETECT_ERROR" });
        return;
      }

      const blendshapes = result.faceBlendshapes[0].categories;

      let matrixData = null;
      let eulerData  = null;

      const rawMatrixData = result.facialTransformationMatrixes?.[0]?.data;
      if (rawMatrixData && isValidMatrix(rawMatrixData)) {
        matrixData = Array.from(rawMatrixData);
      } else if (result.faceLandmarks?.[0]) {
        const euler = rotationFromLandmarks(result.faceLandmarks[0]);
        if (euler) {
          eulerData = [euler.x, euler.y, euler.z];
        }
      }

      self.postMessage({
        type: "RESULT",
        payload: { blendshapes, matrixData, eulerData },
      });
    } catch (_err) {
      // Swallow per-frame errors (e.g. procrustes solver failures on mobile)
      self.postMessage({ type: "DETECT_ERROR" });
    }
    return;
  }
};
