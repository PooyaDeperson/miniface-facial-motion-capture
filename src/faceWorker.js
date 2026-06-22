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

import { FaceLandmarker, HandLandmarker, PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// ─── State ────────────────────────────────────────────────────────────────────
let faceLandmarker = null;
let handLandmarker = null;
let poseLandmarker = null;
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
  const chin = landmarks[152];
  const leftEar = landmarks[234];
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
    0, 0, 0, 1    // col 3
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
  const te8 = m[8];   // m02
  const clampedTe8 = Math.max(-1, Math.min(1, te8));
  const y = Math.asin(clampedTe8);  // yaw (Y rotation in XYZ order)

  let x, z;
  if (Math.abs(clampedTe8) < 0.9999999) {
    x = Math.atan2(-m[9], m[10]); // pitch
    z = Math.atan2(-m[4], m[0]);  // roll
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

// ─── Hand landmark indices (MediaPipe 21-point hand model) ───────────────────
// 0=WRIST, 1-4=THUMB(CMC→TIP), 5-8=INDEX(MCP→TIP),
// 9-12=MIDDLE, 13-16=RING, 17-20=PINKY
//
// Coordinate space conversion — MediaPipe hand landmarks → Three.js world:
//   MP  x: 0=left,  1=right  →  TJS x: same
//   MP  y: 0=top,   1=bottom →  TJS y: flip  (y_tjs = -y_mp)
//   MP  z: depth, neg=closer →  TJS z: flip  (z_tjs = -z_mp)
//
// Blender armature space → Three.js (standard GLTF Y-up export):
//   Blender X → TJS  X
//   Blender Y → TJS -Z   (Blender forward = TJS -Z)
//   Blender Z → TJS  Y   (Blender up      = TJS  Y)
//
// For each bone the "along-bone" direction is its Y-axis in Blender armature
// space (confirmed: Y-axis == tail→head direction for every finger bone).
// We convert those Blender Y-axes to Three.js world vectors here and use them
// as the rest-pose reference when computing rotations from MediaPipe data.

/**
 * Convert a Blender armature-space vector to Three.js world-space.
 *   bx → tx,  by → -tz,  bz → ty
 */
function blToTjs(bx, by, bz) {
  return { x: bx, y: bz, z: -by };
}

// ─── Rest-pose bone directions (Y-axis in Three.js world space) ───────────────
// Derived from the Blender matrix_local output for each bone.
// Each entry is the tail→head direction (normalised) of that bone at rest,
// expressed in Three.js world coordinates.
// Format: { boneKeySuffix: [tx, ty, tz] }
// The "Left" and "Right" sets differ only in the X sign of certain axes.

// Left hand — tail→head Y-axes (Blender) converted to Three.js
//   LeftHand Y (Bl): ( 0.488, -0.321, -0.812) → TJS: ( 0.488, -0.812,  0.321)
// etc.  Using blToTjs(bx, by, bz):
const LEFT_REST_DIRS = {
  // Wrist / Hand bone — points toward the fingers (wrist→middle-MCP direction)
  Wrist: blToTjs(0.488, -0.321, -0.812),
  // Thumb
  Thumb1: blToTjs(-0.143, -0.864, -0.483),
  Thumb2: blToTjs(-0.057, -0.522, -0.851),
  Thumb3: blToTjs(-0.027, -0.372, -0.928),
  // Index
  Index1: blToTjs(0.293, -0.436, -0.851),
  Index2: blToTjs(0.100, -0.460, -0.882),
  Index3: blToTjs(-0.061, -0.401, -0.914),
  // Middle
  Middle1: blToTjs(0.415, -0.346, -0.842),
  Middle2: blToTjs(0.160, -0.415, -0.896),
  Middle3: blToTjs(-0.228, -0.278, -0.933),
  // Ring
  Ring1: blToTjs(0.397, -0.200, -0.896),
  Ring2: blToTjs(0.026, -0.268, -0.963),
  Ring3: blToTjs(-0.052, -0.265, -0.963),
  // Pinky
  Pinky1: blToTjs(0.350, -0.003, -0.937),
  Pinky2: blToTjs(0.141, -0.171, -0.975),
  Pinky3: blToTjs(-0.076, -0.286, -0.955),
};

// Right hand — mirror of left.  From the Blender data, the right hand Y-axes
// differ only in the sign of the X component compared to the left.
//   RightHand Y (Bl): (-0.488, -0.321, -0.812) → TJS: (-0.488, -0.812, 0.321)
const RIGHT_REST_DIRS = {
  Wrist: blToTjs(-0.488, -0.321, -0.812),
  Thumb1: blToTjs(0.143, -0.864, -0.483),
  Thumb2: blToTjs(0.057, -0.522, -0.851),
  Thumb3: blToTjs(0.027, -0.372, -0.928),
  Index1: blToTjs(-0.293, -0.436, -0.851),
  Index2: blToTjs(-0.100, -0.460, -0.882),
  Index3: blToTjs(0.061, -0.401, -0.914),
  Middle1: blToTjs(-0.415, -0.346, -0.842),
  Middle2: blToTjs(-0.160, -0.415, -0.896),
  Middle3: blToTjs(0.228, -0.278, -0.933),
  Ring1: blToTjs(-0.397, -0.200, -0.896),
  Ring2: blToTjs(-0.026, -0.268, -0.963),
  Ring3: blToTjs(0.052, -0.265, -0.963),
  Pinky1: blToTjs(-0.350, -0.003, -0.937),
  Pinky2: blToTjs(-0.141, -0.171, -0.975),
  Pinky3: blToTjs(0.076, -0.286, -0.955),
};

/**
 * Quaternion that rotates unit vector `from` to unit vector `to`.
 * Returns [x, y, z, w].
 */
function quatFromTo(fx, fy, fz, tx, ty, tz) {
  const dot = fx * tx + fy * ty + fz * tz;

  if (dot >= 0.9999) return [0, 0, 0, 1];
  if (dot <= -0.9999) {
    // 180° rotation — find a perpendicular axis
    let ax = 0, ay = 1, az = 0; // try Y
    const absX = Math.abs(fx), absY = Math.abs(fy);
    if (absX < absY) {
      ax = 1; ay = 0; az = 0; // use X if from is more Y-aligned
    }
    // axis = from × ax
    let cx = fy * az - fz * ay;
    let cy = fz * ax - fx * az;
    let cz = fx * ay - fy * ax;
    const cl = Math.sqrt(cx * cx + cy * cy + cz * cz);
    cx /= cl; cy /= cl; cz /= cl;
    return [cx, cy, cz, 0];
  }

  // axis = from × to
  const ax = fy * tz - fz * ty;
  const ay = fz * tx - fx * tz;
  const az = fx * ty - fy * tx;
  const w = 1 + dot; // = 2*cos²(halfAngle)
  const len = Math.sqrt(ax * ax + ay * ay + az * az + w * w);
  return [ax / len, ay / len, az / len, w / len];
}

/**
 * Compute the bend angle (radians) between two consecutive bone segments.
 *
 * Given three landmarks A→B→C, the bend angle is the angle at B between
 * vector BA and vector BC.  This is the local curl amount at joint B.
 *
 * Returns a value in [0, PI]:
 *   0   = fully straight (finger extended)
 *   PI  = fully curled back (impossible anatomically but mathematical limit)
 *
 * @param lm   - 21 MediaPipe hand landmarks
 * @param a    - proximal landmark index  (e.g. MCP for a PIP joint)
 * @param b    - joint landmark index     (e.g. PIP)
 * @param c    - distal landmark index    (e.g. DIP)
 * @returns bend angle in radians, or 0 on degenerate input
 */
function bendAngle(lm, a, b, c) {
  const la = lm[a], lb = lm[b], lc = lm[c];
  if (!la || !lb || !lc) return 0;

  // Vectors in Three.js space (flip Y and Z from MediaPipe)
  let bax = la.x - lb.x, bay = -(la.y - lb.y), baz = -(la.z - lb.z);
  let bcx = lc.x - lb.x, bcy = -(lc.y - lb.y), bcz = -(lc.z - lb.z);

  const lenBA = Math.sqrt(bax * bax + bay * bay + baz * baz);
  const lenBC = Math.sqrt(bcx * bcx + bcy * bcy + bcz * bcz);
  if (lenBA < 1e-6 || lenBC < 1e-6) return 0;

  bax /= lenBA; bay /= lenBA; baz /= lenBA;
  bcx /= lenBC; bcy /= lenBC; bcz /= lenBC;

  const dot = Math.max(-1, Math.min(1, bax * bcx + bay * bcy + baz * bcz));
  // angle = 0 when straight (dot=1), PI when fully bent back (dot=-1)
  // We want bend = PI - angle so that 0 = straight, positive = curling
  return Math.PI - Math.acos(dot);
}

// ─── Finger joint angle limits ────────────────────────────────────────────────
// Maximum bend angle (degrees) for the joints listed below.
// Increase to allow more curl; decrease to prevent palm penetration on punches.
// Only the joints that can hyper-curl and clip the palm are clamped here.
// The variable names intentionally match the bone keys used in the return object
// of fingerRotationsFromLandmarks() so you can find them easily.
const FINGER_JOINT_MAX_BEND_DEG = {
  // ── Right hand ──────────────────────────────────────────────────────────────
  // Thumb:  lm 0(wrist)→1(CMC)→2(MCP)→3(IP)→4(TIP)
  RightHandThumb1: 60,  // wrist  → CMC  → MCP   (CMC opposition ~60°)
  RightHandThumb2: 70,  // CMC    → MCP  → IP    (thumb MCP flexion ~70°)
  RightHandThumb3: 90,  // MCP    → IP   → TIP   (thumb IP flexion ~90°)
  // Index:  lm 5(MCP)→6(PIP)→7(DIP)→8(TIP)
  RightHandIndex1: 90,  // wrist  → MCP  → PIP   (MCP flexion ~90°)
  RightHandIndex2: 120,  // MCP    → PIP  → DIP   (PIP flexion ~120°)
  RightHandIndex3: 90,  // PIP    → DIP  → TIP   (DIP flexion ~90°)
  // Middle: lm 9(MCP)→10(PIP)→11(DIP)→12(TIP)
  RightHandMiddle1: 90,  // wrist  → MCP  → PIP   (MCP flexion ~90°)
  RightHandMiddle2: 120,  // MCP    → PIP  → DIP   (PIP flexion ~120°)
  RightHandMiddle3: 90,  // PIP    → DIP  → TIP   (DIP flexion ~90°)
  // Ring:   lm 13(MCP)→14(PIP)→15(DIP)→16(TIP)
  RightHandRing1: 90,  // wrist  → MCP  → PIP   (MCP flexion ~90°)
  RightHandRing2: 120,  // MCP    → PIP  → DIP   (PIP flexion ~120°)
  RightHandRing3: 90,  // PIP    → DIP  → TIP   (DIP flexion ~90°)
  // Pinky:  lm 17(MCP)→18(PIP)→19(DIP)→20(TIP)
  RightHandPinky1: 90,  // wrist  → MCP  → PIP   (MCP flexion ~90°)
  RightHandPinky2: 70,  // MCP    → PIP  → DIP   (PIP flexion ~70°)
  RightHandPinky3: 80,  // PIP    → DIP  → TIP   (DIP flexion ~80°)

  // ── Left hand (mirrored) ─────────────────────────────────────────────────────
  LeftHandThumb1: 60,
  LeftHandThumb2: 70,
  LeftHandThumb3: 90,
  LeftHandIndex1: 90,
  LeftHandIndex2: 120,
  LeftHandIndex3: 90,
  LeftHandMiddle1: 90,
  LeftHandMiddle2: 120,
  LeftHandMiddle3: 90,
  LeftHandRing1: 90,
  LeftHandRing2: 120,
  LeftHandRing3: 90,
  LeftHandPinky1: 90,
  LeftHandPinky2: 70,
  LeftHandPinky3: 80,
};

/**
 * Build finger joint LOCAL bend quaternions from 21 hand landmarks.
 *
 * Each value is a [x, y, z, w] quaternion representing a LOCAL rotation
 * around the bone's local X axis by the measured bend angle.
 * This can be applied directly to bone.quaternion without any world→local
 * conversion, because it is already expressed in local joint space.
 *
 * Wrist remains a world-space quaternion (handled separately).
 */
function fingerRotationsFromLandmarks(landmarks, isRight) {
  // Wrist = full 3-axis world-space orientation (handled in Avatar.tsx with world→local)
  const wrist = wristQuatFromLandmarks(landmarks, isRight);

  // For finger joints: compute bend angle and return a local rotation quaternion.
  //   axis="x"  : rotation around local +X — used for index/middle/ring/pinky
  //   axis="-z" : rotation around local -Z — used for thumb bones.
  //               The thumb CMC/MCP/IP bones in this Blender rig are oriented so
  //               that "curl toward palm" maps to rotation around local -Z.
  //               (axis="z" opened the thumb outward; negating Z closes it correctly.)
  //
  // limitKey — optional key into FINGER_JOINT_MAX_BEND_DEG to clamp this joint.
  function localBend(a, b, c, axis = "x", limitKey = null) {
    let angle = bendAngle(landmarks, a, b, c);

    // Apply angle limit if one is registered for this joint
    if (limitKey !== null && FINGER_JOINT_MAX_BEND_DEG[limitKey] !== undefined) {
      const maxRad = FINGER_JOINT_MAX_BEND_DEG[limitKey] * (Math.PI / 180);
      if (angle > maxRad) angle = maxRad;
    }
    if (Math.abs(angle) < 1e-5) {
      return [0, 0, 0, 1];
    }
    const s = Math.sin(angle / 2);
    const w = Math.cos(angle / 2);
    let q;
    if (axis === "-z") {
      q = [0, 0, -s, w]; // rotation around local -Z
    } else if (axis === "z") {
      q = [0, 0, s, w];  // rotation around local +Z
    } else if (axis === "-x") {
      q = [-s, 0, 0, w]; // rotation around local -X
    } else {
      q = [s, 0, 0, w];  // rotation around local +X (default for fingers)
    }
    return q;
  }

  // Thumb curl axis differs per hand:
  //   Left  hand: curl toward palm = rotation around local -Z  (axis="-z")
  //   Right hand: curl toward palm = rotation around local +Z  (axis="z")
  // The two hands are anatomically mirrored so the curl direction flips.
  const thumbAxis = isRight ? "z" : "-z";

  const h = isRight ? "Right" : "Left";
  return {
    Wrist: wrist,
    // Thumb:  lm 1(CMC)→2(MCP)→3(IP)→4(TIP)
    Thumb1: localBend(0, 1, 2, thumbAxis, h + "HandThumb1"),  // wrist  → CMC → MCP
    Thumb2: localBend(1, 2, 3, thumbAxis, h + "HandThumb2"),  // CMC    → MCP → IP
    Thumb3: localBend(2, 3, 4, thumbAxis, h + "HandThumb3"),  // MCP    → IP  → TIP
    // Index:  lm 5(MCP)→6(PIP)→7(DIP)→8(TIP)
    Index1: localBend(0, 5, 6, "x", h + "HandIndex1"),
    Index2: localBend(5, 6, 7, "x", h + "HandIndex2"),
    Index3: localBend(6, 7, 8, "x", h + "HandIndex3"),
    // Middle: lm 9(MCP)→10(PIP)→11(DIP)→12(TIP)
    Middle1: localBend(0, 9, 10, "x", h + "HandMiddle1"),
    Middle2: localBend(9, 10, 11, "x", h + "HandMiddle2"),
    Middle3: localBend(10, 11, 12, "x", h + "HandMiddle3"),
    // Ring:   lm 13(MCP)→14(PIP)→15(DIP)→16(TIP)
    Ring1: localBend(0, 13, 14, "x", h + "HandRing1"),
    Ring2: localBend(13, 14, 15, "x", h + "HandRing2"),
    Ring3: localBend(14, 15, 16, "x", h + "HandRing3"),
    // Pinky:  lm 17(MCP)→18(PIP)→19(DIP)→20(TIP)
    Pinky1: localBend(0, 17, 18, "x", h + "HandPinky1"),
    Pinky2: localBend(17, 18, 19, "x", h + "HandPinky2"),
    Pinky3: localBend(18, 19, 20, "x", h + "HandPinky3"),
  };
}

/**
 * Build the full 3-axis world-space orientation for the wrist / Hand bone.
 *
 * Uses three stable palm landmarks to construct an orthonormal frame, then
 * returns the quaternion that rotates the bone's rest-pose frame (columns =
 * restX, restY, restZ axes) to the measured palm frame.
 *
 * restY = forward (wrist→fingers)
 * restZ = palm normal (toward dorsum of hand)
 * restX = lateral across knuckles
 *
 * @param lm      - 21 hand landmarks
 * @param isRight - true for avatar's right hand
 * @returns [x, y, z, w] world-space quaternion or null
 */
function wristQuatFromLandmarks(lm, isRight) {
  const wrist = lm[0];
  const midMCP = lm[9];
  const idxMCP = lm[5];
  const pkyMCP = lm[17];
  if (!wrist || !midMCP || !idxMCP || !pkyMCP) return null;

  // Helper: difference vector converted to Three.js space
  function diff(a, b) {
    return {
      x: b.x - a.x,
      y: -(b.y - a.y),
      z: -(b.z - a.z),
    };
  }
  function norm(v) {
    const l = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return l < 1e-6 ? null : { x: v.x / l, y: v.y / l, z: v.z / l };
  }
  function cross(a, b) {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  }

  // Measured Y' = wrist → middle MCP (finger direction)
  const measY = norm(diff(wrist, midMCP));
  if (!measY) return null;

  // Lateral vector: index MCP → pinky MCP (across knuckles)
  const lat = norm(diff(idxMCP, pkyMCP));
  if (!lat) return null;

  // Measured Z' = palm normal.
  // cross(measY, lat) where lat = idxMCP→pkyMCP (index→pinky direction):
  //   Left  hand: lat points  right (toward pinky), cross gives dorsum-out → need to flip for palm-forward
  //   Right hand: lat points  left  (toward pinky), cross gives palm-forward → no flip needed
  // Empirically from the console logs: when palm faces camera measZ.z should be
  // positive (pointing toward camera/+Z in Three.js).  The logs show -0.99 on right
  // hand palm-forward, so we need sign=+1 for right (flip) and sign=-1 for left (flip).
  // NOTE: previously had sign = isRight ? -1 : 1, which was backwards.
  const sign = isRight ? 1 : -1;
  const rawZ = cross(measY, lat);
  const measZ = norm({ x: sign * rawZ.x, y: sign * rawZ.y, z: sign * rawZ.z });
  if (!measZ) return null;

  // Re-orthogonalise X' = Y' × Z'  (ensures pure rotation)
  const rawX = cross(measY, measZ);
  const measX = norm(rawX);
  if (!measX) return null;

  // Rest-pose axes of this Hand bone (Three.js world space)
  const restDirs = isRight ? RIGHT_REST_DIRS : LEFT_REST_DIRS;
  const rY = restDirs.Wrist; // primary axis = finger direction

  // For the rest-pose we also need the rest X and Z axes.
  // From the Blender data:
  //   LeftHand  X-axis (Bl): (0.258, 0.941, -0.217) → TJS: (0.258, -0.217, -0.941)
  //   LeftHand  Z-axis (Bl): (-0.834, 0.103, -0.542) → TJS: (-0.834, -0.542, -0.103)
  //   RightHand X-axis (Bl): (0.258, -0.941, 0.217) → TJS: (0.258, 0.217,  0.941)
  //   RightHand Z-axis (Bl): (0.834, 0.103, -0.542) → TJS: (0.834, -0.542, -0.103)
  const rX = isRight ? blToTjs(0.258, -0.941, 0.217) : blToTjs(0.258, 0.941, -0.217);
  const rZ = isRight ? blToTjs(0.834, 0.103, -0.542) : blToTjs(-0.834, 0.103, -0.542);

  // NOTE: The rest-pose data from Blender doesn't match the actual bind-pose
  // of the hand in the avatar skeleton. Instead of trying to rotate FROM the
  // wrong rest frame, we just use the measured frame directly.
  // The measured X, Y, Z axes ARE the correct world-space orientation.

  // Build quaternion from measured frame (column-major)
  const mx = [measX.x, measX.y, measX.z, measY.x, measY.y, measY.z, measZ.x, measZ.y, measZ.z];

  // Matrix → Quaternion (Shepperd).
  // Column layout: col0=measX, col1=measY, col2=measZ
  //   R[row][col]:  R[i][0]=measX[i], R[i][1]=measY[i], R[i][2]=measZ[i]
  // Standard Shepperd: qx = (R[2][1]-R[1][2]) / (4*qw)
  //   R[2][1] = col1,row2 = measY.z
  //   R[1][2] = col2,row1 = measZ.y
  //   → qx = (measY.z - measZ.y) * s   [previously had these swapped → gave conjugate]
  const trace = measX.x + measY.y + measZ.z;
  let qx, qy, qz, qw;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    qw = 0.25 / s;
    qx = (measY.z - measZ.y) * s;   // R[2][1] - R[1][2]
    qy = (measZ.x - measX.z) * s;   // R[0][2] - R[2][0]
    qz = (measX.y - measY.x) * s;   // R[1][0] - R[0][1]
  } else if (measX.x > measY.y && measX.x > measZ.z) {
    const s = 2 * Math.sqrt(1 + measX.x - measY.y - measZ.z);
    qw = (measY.z - measZ.y) / s; qx = 0.25 * s;
    qy = (measX.y + measY.x) / s; qz = (measZ.x + measX.z) / s;
  } else if (measY.y > measZ.z) {
    const s = 2 * Math.sqrt(1 + measY.y - measX.x - measZ.z);
    qw = (measZ.x - measX.z) / s; qx = (measX.y + measY.x) / s;
    qy = 0.25 * s; qz = (measY.z + measZ.y) / s;
  } else {
    const s = 2 * Math.sqrt(1 + measZ.z - measX.x - measY.y);
    qw = (measX.y - measY.x) / s; qx = (measZ.x + measX.z) / s;
    qy = (measY.z + measZ.y) / s; qz = 0.25 * s;
  }
  const ql = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
  if (ql < 1e-9) return null;
  const finalQuat = [qx / ql, qy / ql, qz / ql, qw / ql];

  return finalQuat;
}

// ─── Handedness stabilisation ────────────────────────────────────────────────
//
// MediaPipe occasionally mis-classifies a hand as the wrong side for 1-2 frames,
// which causes the avatar's arm to flash/jump then snap back.  Three layers of
// defence are applied here — all purely within the worker so they are zero-cost
// to the rest of the pipeline and add no latency to normal, correct frames.
//
// Layer 1 – Confidence gate
//   Only LOW-confidence frames (below HANDEDNESS_LABEL_TRUST) should be treated
//   as unreliable for the *label* — the finger geometry itself is still valid.
//   We never skip the whole hand; we just don't let a low-confidence label
//   override the last committed assignment.
const HANDEDNESS_LABEL_TRUST = 0.5; // below this → label is distrusted, use last committed

// Layer 2 – Majority-vote latch (ring buffer)
//   Track the last N handedness labels for each detected hand slot (0 or 1).
//   Only high-confidence labels are fed into the vote so bad frames don't
//   corrupt the buffer, but the hand is NEVER dropped just because the label
//   is uncertain — we fall back to the last committed label instead.
const HANDEDNESS_VOTE_WINDOW = 5;  // frames kept per hand slot
const HANDEDNESS_VOTE_REQUIRED = 3; // minimum agreement to commit a label

// Per-slot ring buffers — reset only when hands go from visible to none.
const _handednessHistory = [[], []]; // index 0 and 1 → slot for up to 2 hands
const _handednessCommitted = [null, null]; // last successfully committed label per slot
let _prevHandCount = 0;              // tracks last hand count; used only for zero-reset

/**
 * Feed a label into the majority-vote latch and return the best label to use.
 * High-confidence labels update the vote buffer; low-confidence ones skip the
 * vote but still return the last committed label so the hand is never dropped.
 *
 * @param {number} slot        - hand index (0 or 1)
 * @param {string} rawLabel    - "Left" | "Right" from MediaPipe
 * @param {number} confidence  - MediaPipe handedness score (0-1)
 * @returns {string|null}      - label to use, or null if no committed label yet
 */
function committedHandedness(slot, rawLabel, confidence) {
  // Only feed trustworthy labels into the vote buffer
  if (confidence >= HANDEDNESS_LABEL_TRUST) {
    const buf = _handednessHistory[slot];
    buf.push(rawLabel);
    if (buf.length > HANDEDNESS_VOTE_WINDOW) buf.shift();

    let leftCount = 0, rightCount = 0;
    for (const l of buf) l === "Left" ? leftCount++ : rightCount++;

    if (leftCount >= HANDEDNESS_VOTE_REQUIRED) {
      _handednessCommitted[slot] = "Left";
    } else if (rightCount >= HANDEDNESS_VOTE_REQUIRED) {
      _handednessCommitted[slot] = "Right";
    }
  }

  // Return the committed label (may be null on the very first frames)
  return _handednessCommitted[slot];
}

// ─── Worker message handler ───────────────────────────────────────────────────

self.onmessage = async function (e) {
  const { type } = e.data;

  // ── INIT ─────────────────────────────────────────���────────────────────────
  if (type === "INIT") {
    isMobile = !!e.data.isMobile;

    try {
      const filesetResolver = await FilesetResolver.forVisionTasks("/wasm");

      // Initialise face and hand detectors in parallel for faster startup
      [faceLandmarker, handLandmarker] = await Promise.all([
        FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "/models/face_landmarker.task",
            delegate: isMobile ? "CPU" : "GPU",
          },
          numFaces: 1,
          runningMode: "VIDEO",
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: !isMobile,
        }),
        HandLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "/models/hand_landmarker.task",
            delegate: isMobile ? "CPU" : "GPU",
          },
          numHands: 2,
          runningMode: "VIDEO",
        }),
      ]);

      // Initialise PoseLandmarker separately — non-fatal if it fails so the
      // rest of tracking continues without live elbow data (falls back to the
      // hardcoded elbow hint in Avatar.tsx).
      try {
        poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "/models/pose_landmarker_lite.task",
            delegate: isMobile ? "CPU" : "GPU",
          },
          numPoses: 1,
          runningMode: "VIDEO",
          outputSegmentationMasks: false,
        });
      } catch (poseErr) {
        poseLandmarker = null;
      }

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

      // Run face, hand, and pose detection on the same canvas frame simultaneously
      const faceResult = faceLandmarker.detectForVideo(canvas, timestamp);
      const handResult = handLandmarker
        ? handLandmarker.detectForVideo(canvas, timestamp)
        : null;
      const poseResult = poseLandmarker
        ? poseLandmarker.detectForVideo(canvas, timestamp)
        : null;

      if (
        !faceResult.faceBlendshapes?.length ||
        !faceResult.faceBlendshapes[0].categories
      ) {
        self.postMessage({ type: "DETECT_ERROR" });
        return;
      }

      const blendshapes = faceResult.faceBlendshapes[0].categories;

      let matrixData = null;
      let eulerData = null;

      const rawMatrixData = faceResult.facialTransformationMatrixes?.[0]?.data;
      if (rawMatrixData && isValidMatrix(rawMatrixData)) {
        matrixData = Array.from(rawMatrixData);
      } else if (faceResult.faceLandmarks?.[0]) {
        const euler = rotationFromLandmarks(faceResult.faceLandmarks[0]);
        if (euler) {
          eulerData = [euler.x, euler.y, euler.z];
        }
      }

      // Process hand results: separate left/right hands and compute finger
      // bone quaternions for each.  MediaPipe reports handedness from the
      // camera's point of view (already accounting for the mirror flip), so
      // "Right" = the user's right hand = avatar's Right side.
      //
      // Three stabilisation layers guard against transient mis-classifications:
      //   1. Confidence gate    – skip detections below HANDEDNESS_MIN_CONFIDENCE
      //   2. Majority-vote latch – commit a label only after N/W frames agree
      //   3. Spatial sanity swap – if both hands visible, ensure left wrist is
      //                            truly to the LEFT of the right wrist in image
      //                            space; swap assignments if they are crossed.
      let leftFingers = null; // avatar's Left hand  (MediaPipe "Left")
      let rightFingers = null; // avatar's Right hand (MediaPipe "Right")
      let leftWristPos = null; // [x,y,z] normalized, avatar's Left hand
      let rightWristPos = null; // [x,y,z] normalized, avatar's Right hand

      // ── Pose: elbow direction offsets (world landmarks, hip-origin, metres) ──
      // We send the vector from shoulder→elbow in PoseLandmarker world space so
      // Avatar.tsx can compute the live elbow hint without absolute-position drift.
      //   User's left:  shoulder=11, elbow=13  →  avatar's Left arm
      //   User's right: shoulder=12, elbow=14  →  avatar's Right arm
      // Visibility gate: only trust elbow landmarks with high visibility. 0.65 filters
      // out the noisy mid-confidence detections that cause forearm / hand jitter while
      // still passing through clearly visible landmarks.
      const POSE_VIS_THRESHOLD = 0.65;
      let leftElbowOffset = null;   // [dx,dy,dz] shoulder→elbow, pose world space
      let rightElbowOffset = null;

      if (poseResult?.worldLandmarks?.length > 0) {
        const wl = poseResult.worldLandmarks[0];
        // Left arm: landmarks 11 (left shoulder) + 13 (left elbow)
        const lShoulder = wl[11];
        const lElbow    = wl[13];
        if (
          lShoulder && lElbow &&
          (lShoulder.visibility ?? 1) >= POSE_VIS_THRESHOLD &&
          (lElbow.visibility    ?? 1) >= POSE_VIS_THRESHOLD
        ) {
          leftElbowOffset = [
            lElbow.x - lShoulder.x,
            lElbow.y - lShoulder.y,
            lElbow.z - lShoulder.z,
          ];
        }
        // Right arm: landmarks 12 (right shoulder) + 14 (right elbow)
        const rShoulder = wl[12];
        const rElbow    = wl[14];
        if (
          rShoulder && rElbow &&
          (rShoulder.visibility ?? 1) >= POSE_VIS_THRESHOLD &&
          (rElbow.visibility    ?? 1) >= POSE_VIS_THRESHOLD
        ) {
          rightElbowOffset = [
            rElbow.x - rShoulder.x,
            rElbow.y - rShoulder.y,
            rElbow.z - rShoulder.z,
          ];
        }
      }

      if (handResult?.landmarks?.length) {
        _prevHandCount = handResult.landmarks.length;

        // Collect candidate assignments (may include nulls from failed vote)
        const candidates = []; // { label, landmarks, wristPos }

        for (let i = 0; i < handResult.landmarks.length; i++) {
          const handLandmarks = handResult.landmarks[i];
          const handednessEntry = handResult.handednesses?.[i]?.[0];

          const confidence = handednessEntry?.score ?? 0;
          const rawLabel = handednessEntry?.categoryName ?? "";

          // ── Layers 1+2: vote latch with confidence-aware label trust ─────────
          // Low-confidence frames don't update the vote buffer but still fall
          // back to the last committed label so the hand is never dropped mid-rotation.
          const label = committedHandedness(i, rawLabel, confidence);
          if (label === null) continue; // no committed label yet (very first frames only)

          // lm[0] is the wrist landmark — use it for IK positioning.
          const w = handLandmarks[0];
          const wristPos = w ? [w.x, w.y, w.z] : null;

          candidates.push({ label, landmarks: handLandmarks, wristPos });
        }

        // ── Layer 3: spatial sanity swap ─────────────────────────────────────
        // When both hands are committed, verify their wrist X positions match
        // the expected layout in image space (image-x: 0=left edge, 1=right edge).
        // In a mirrored/selfie view the user's right hand appears on the LEFT
        // side of the image (lower image-x), so:
        //   avatar Right wrist image-x  <  avatar Left wrist image-x
        // If the committed labels violate this, swap them.
        if (candidates.length === 2) {
          const c0 = candidates[0];
          const c1 = candidates[1];
          if (c0.wristPos && c1.wristPos) {
            // Find which candidate claims to be Right and which claims Left
            const idxRight = c0.label === "Right" ? 0 : 1;
            const idxLeft  = c0.label === "Left"  ? 0 : 1;
            const rightX = candidates[idxRight].wristPos[0];
            const leftX  = candidates[idxLeft].wristPos[0];
            // In a mirrored feed rightX should be less than leftX.
            // If it's significantly reversed, the labels are swapped.
            if (rightX - leftX > 0.15) {
              // Swap labels (don't alter ring buffers — let them self-correct)
              candidates[idxRight].label = "Left";
              candidates[idxLeft].label  = "Right";
            }
          }
        }

        // Commit candidates to left/right output
        for (const { label, landmarks, wristPos } of candidates) {
          const rotations = fingerRotationsFromLandmarks(landmarks, label === "Right");
          if (label === "Left") {
            leftFingers  = rotations;
            leftWristPos = wristPos;
          } else {
            rightFingers  = rotations;
            rightWristPos = wristPos;
          }
        }
      } else {
        // No hands detected this frame — reset hand count so next appearance
        // starts with clean ring buffers
        if (_prevHandCount !== 0) {
          _handednessHistory[0] = [];
          _handednessHistory[1] = [];
          _handednessCommitted[0] = null;
          _handednessCommitted[1] = null;
          _prevHandCount = 0;
        }
      }

      self.postMessage({
        type: "RESULT",
        payload: { blendshapes, matrixData, eulerData, leftFingers, rightFingers, leftWristPos, rightWristPos, leftElbowOffset, rightElbowOffset },
      });
    } catch (_err) {
      // Swallow per-frame errors (e.g. procrustes solver failures on mobile)
      self.postMessage({ type: "DETECT_ERROR" });
    }
    return;
  }
};
