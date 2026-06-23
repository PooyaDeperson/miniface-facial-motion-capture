/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 *
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson"
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useGraph } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Euler, Mesh, Object3D, Quaternion, Vector3 } from "three";
import { blendshapes, rotation, headMesh, headMatrix, isMobileTracking, isMediaPipeActive, leftFingerBones, rightFingerBones, leftWristPos, rightWristPos, leftElbowOffset, rightElbowOffset, type FingerQuats } from "./FaceTracking";
import { captureFrame, setSceneForExport, subscribeRecordingStart } from "./useMotionRecorder";
import { useAnimationPlayer } from "./useAnimationPlayer";
import { BlendshapeSmoother, FingerSmoother, IKTargetSmoother, QuaternionSmoother, RestPoseSmoother, IN_FRAME_TAU, REST_POSE_TAU, ARM_ELBOW_TAU } from "./smoothing";
import { usePlaybackAnimation } from "./usePlaybackAnimation";
import { getAvatarMetadata } from "./avatarMetadata";
import { useSecondaryMotion } from "./useSecondaryMotion";

// ─── Dev flags ───────────────────────────────────────────────────────────────
// Set DEBUG_COLLISION_SPHERES to true to render cyan wireframe spheres over
// every collision volume. The sphere is scaled to (bounding-sphere radius +
// collisionMargin), which is the exact push-out distance used each frame.
// Skinned mesh volumes follow the live skeleton pose — if a sphere drifts away
// from the body, the mesh is not skinned or its bone hierarchy is broken.
const DEBUG_COLLISION_SPHERES = false;

interface AvatarProps {
  url: string;
  onLoaded?: () => void;
  /** When set, replays this GLB blob instead of running live face tracking. */
  playbackBlob?: Blob | null;
}

// ─── module-level smoother singletons ────────────────────────────────────────
// Created once outside the component so they accumulate state across renders
// without being recreated. Same pattern as FaceTracking's blendshapes / rotation
// module globals — zero React overhead on the useFrame hot path.

const blendshapeSmoother = new BlendshapeSmoother();
const quaternionSmoother = new QuaternionSmoother();

// Finger smoothers — one per hand, tuned independently via FINGER_TAU.
// Kept separate from the face/neck smoothers so you can tweak finger
// responsiveness without affecting blendshape or head-rotation behaviour.
const leftFingerSmoother = new FingerSmoother();
const rightFingerSmoother = new FingerSmoother();

// IK target smoothers — one per hand, tuned via ARM_IK_TAU (= FINGER_TAU).
// Smooth the raw MediaPipe wrist world-position before passing it to
// solveArmIK so the entire arm chain damps jitter with the same envelope
// as the finger rotations.
const leftIKSmoother = new IKTargetSmoother();
const rightIKSmoother = new IKTargetSmoother();

// Elbow hint smoothers — one per arm, tuned via ARM_ELBOW_TAU.
// Smooth the raw shoulder→elbow offset from PoseLandmarker before converting
// it to the IK elbow hint, damping the noisier pose landmarks independently
// from the hand wrist smoothers.
const leftElbowSmoother = new IKTargetSmoother(ARM_ELBOW_TAU);
const rightElbowSmoother = new IKTargetSmoother(ARM_ELBOW_TAU);

// ─── Sticky last-good elbow hints ────────────────────────────────────────────
// When the PoseLandmarker confidence drops and leftElbowOffset / rightElbowOffset
// becomes null for a frame (or a few), we hold the last successfully computed hint
// world-position instead of snapping to the hardcoded static fallback. This prevents
// the IK bend axis from suddenly jumping, which was the main source of the hand
// bobbing up-and-down after elbow detection was introduced.
// Set to null until the first valid hint is computed so the hardcoded fallback
// still fires on initial startup (before any pose data has arrived).
const _lastGoodLeftElbowHint = new Vector3();
const _lastGoodRightElbowHint = new Vector3();
let _hasLeftElbowHint = false;
let _hasRightElbowHint = false;

// Rest-pose / in-frame bone smoothers — one per hand.
// smoothFromBones() uses IN_FRAME_TAU (hand visible).
// smoothToRest()   uses REST_POSE_TAU (hand out of frame).
// Both taus are set via the constructor defaults; tune them in smoothing.ts.
const leftRestPoseSmoother = new RestPoseSmoother(IN_FRAME_TAU, REST_POSE_TAU);
const rightRestPoseSmoother = new RestPoseSmoother(IN_FRAME_TAU, REST_POSE_TAU);

// Reusable Quaternion and Euler instances — allocated once, mutated each frame
// to avoid per-frame garbage collection pressure.
const _targetQuat = new Quaternion();
const _smoothedEuler = new Euler();

// ─── Finger bone name map ─────────────────────────────────────────────────────
// Worker sends 3 joints per digit (no tip bone — it has no child landmark).
const FINGER_BONE_KEYS = [
  "Thumb1", "Thumb2", "Thumb3",
  "Index1", "Index2", "Index3",
  "Middle1", "Middle2", "Middle3",
  "Ring1", "Ring2", "Ring3",
  "Pinky1", "Pinky2", "Pinky3",
] as const;

// Reusable quaternions for the world→local conversion — one per scratch step.
const _worldQuat = new Quaternion();
const _parentInv = new Quaternion();
const _fingerQuat = new Quaternion();

// Thumb bones have a non-identity REST local quaternion (the thumb splays out
// from the palm). Copying a bend quaternion directly onto the bone would DISCARD
// that rest orientation — which is exactly what collapsed the left thumb to a
// completely wrong position. We capture each thumb bone's rest local quaternion
// once at load time and compose the bend ON TOP of it: q = restLocal * bend.
// Keyed by full bone name, e.g. "LeftHandThumb1".
const _thumbRestLocal: Record<string, Quaternion> = {};
const _thumbComposed = new Quaternion();

// Extra outward splay (abduction) for the thumb base (CMC / Thumb1). The tracked
// thumb sits too close to the pinky, so we add a fixed rotation around the thumb's
// own local Z axis (the curl axis) in the SAME direction as the rest-pose splay,
// pushing the thumb away from the pinky. Increase to splay further out.
// Kept equal so the right thumb base mirrors the left exactly (rest poses are
// already perfect mirrors, so the same magnitude yields symmetric splay).
const THUMB_ABDUCTION_RAD_LEFT = 0.80; // ~46°
const THUMB_ABDUCTION_RAD_RIGHT = 0.80; // ~46° (matches left)
const _thumbAbduction = new Quaternion();

// Scratch quaternions for forearm twist distribution
const _wristLocalQuat = new Quaternion();
const _twistQuat = new Quaternion();
const _swingQuat = new Quaternion();
const _foreArmWorldQuat = new Quaternion();
const _foreArmParentInv = new Quaternion();
const _foreArmTwistLocal = new Quaternion();
const _twistAxis = new Vector3();

// ─── Per-hand rest-pose quaternion snapshots ───────���─────────────────────────
// Captured once at avatar load time. Keyed by bone name.
// When a hand leaves the frame we restore every arm + finger bone to this
// snapshot so the avatar returns to its A-pose instead of freezing mid-gesture.
const _handRestQuats: Record<string, Quaternion> = {};

// ─── Bones that belong to each hand (arm chain + fingers) ────────────────────
const LEFT_HAND_BONES = [
  "LeftArm", "LeftForeArm", "LeftHand",
  "LeftHandThumb1", "LeftHandThumb2", "LeftHandThumb3",
  "LeftHandIndex1", "LeftHandIndex2", "LeftHandIndex3",
  "LeftHandMiddle1", "LeftHandMiddle2", "LeftHandMiddle3",
  "LeftHandRing1", "LeftHandRing2", "LeftHandRing3",
  "LeftHandPinky1", "LeftHandPinky2", "LeftHandPinky3",
] as const;

const RIGHT_HAND_BONES = [
  "RightArm", "RightForeArm", "RightHand",
  "RightHandThumb1", "RightHandThumb2", "RightHandThumb3",
  "RightHandIndex1", "RightHandIndex2", "RightHandIndex3",
  "RightHandMiddle1", "RightHandMiddle2", "RightHandMiddle3",
  "RightHandRing1", "RightHandRing2", "RightHandRing3",
  "RightHandPinky1", "RightHandPinky2", "RightHandPinky3",
] as const;

/**
 * Restore every bone in the given list back to its captured A-pose local
 * quaternion. Call this whenever a hand disappears from the frame.
 */
function restoreHandRestPose(nodes: Record<string, any>, boneNames: readonly string[]): void {
  for (const name of boneNames) {
    const bone = nodes[name];
    const rest = _handRestQuats[name];
    if (bone && rest) {
      bone.quaternion.copy(rest);
    }
  }
}

// Persisted (unwrapped) HALF-twist angle per arm, in radians. Used to keep the
// forearm twist temporally continuous across two discontinuities:
//   1. The quaternion double-cover flip when the measured twist passes ±180°
//      (w crosses 0 and goes negative). Slerp-from-identity used to "snap" the
//      forearm here because it re-canonicalizes to the w≥0 hemisphere.
//   2. The worker's Shepperd matrix→quaternion conversion occasionally emits the
//      negated (q vs −q) quaternion between frames, which is the same rotation
//      but would otherwise jump the extracted angle by 2π.
// We unwrap each frame so consecutive half-twist angles never jump by more than
// π, then build the half-twist quaternion directly from that continuous angle
// instead of slerping from identity.
const _prevHalfTwistAngle: Record<"Left" | "Right", number> = { Left: 0, Right: 0 };
const _hasPrevHalfTwist: Record<"Left" | "Right", boolean> = { Left: false, Right: false };

/**
 * Decompose `q` into swing * twist, where twist is the rotation around `axis`.
 *
 * The twist component is the part of `q` that rotates around `axis`.
 * The swing component is q * twist⁻¹.
 *
 * @param q      - input quaternion (will not be mutated)
 * @param axis   - unit vector (the twist axis in the same space as q)
 * @param twist  - output: the twist component around axis
 * @param swing  - output: the swing component (everything else)
 */
function decomposeSwingTwist(q: Quaternion, axis: Vector3, twist: Quaternion, swing: Quaternion): void {
  // Project q's (x,y,z) vector part onto the axis
  const dot = q.x * axis.x + q.y * axis.y + q.z * axis.z;
  // Twist = the part of q that rotates around axis
  twist.set(axis.x * dot, axis.y * dot, axis.z * dot, q.w).normalize();
  // Swing = q * twist⁻¹  (twist is unit → conjugate = inverse)
  swing.multiplyQuaternions(q, twist.clone().conjugate());
}

/**
 * Apply wrist + finger quaternions to the skeleton.
 *
 * Wrist (Hand bone): world-space quaternion from the worker → converted to
 * local parent space via parentWorldQuat⁻¹ × worldQuat.
 *
 * Finger joints: LOCAL bend quaternions (rotation around local X axis by the
 * measured joint angle). Applied directly to bone.quaternion — no world→local
 * conversion needed because they are already in local joint space.
 */
function applyFingerBones(
  nodes: Record<string, any>,
  prefix: "Left" | "Right",
  fingerData: FingerQuats
) {
  if (!fingerData) return;

  // ── Wrist → LeftHand / RightHand bone (world→local) ───────────────────
  const wristQ = (fingerData as any)["Wrist"];
  if (wristQ) {
    const handBone = nodes[`${prefix}Hand`];
    const foreArmBone = nodes[`${prefix}ForeArm`];
    if (handBone?.parent) {
      _worldQuat.set(wristQ[0], wristQ[1], wristQ[2], wristQ[3]);
      handBone.parent.getWorldQuaternion(_parentInv).invert();
      _fingerQuat.multiplyQuaternions(_parentInv, _worldQuat);
      handBone.quaternion.copy(_fingerQuat);

      // ── Forearm twist distribution ─────────────────────────────────────
      // _fingerQuat is the hand orientation in forearm-local space.
      // We decompose it into swing + twist around the forearm's along-bone
      // axis, which is local Y (0,1,0) in that same forearm-local space.
      //
      // IMPORTANT: we postmultiply (multiply on the right) onto the forearm
      // bone's quaternion, NOT premultiply. Postmultiply applies the rotation
      // in the forearm's OWN local space — i.e. around the bone's own length
      // axis — which is exactly what we want. Premultiply applies it in the
      // parent (upper-arm) space, which caused the hand to swing downward.
      if (foreArmBone) {
        _wristLocalQuat.copy(_fingerQuat); // already forearm-local

        // Twist axis = forearm's own local Y (along-bone direction).
        _twistAxis.set(0, 1, 0);

        decomposeSwingTwist(_wristLocalQuat, _twistAxis, _twistQuat, _swingQuat);

        // ── Continuous 50% twist (no slerp-from-identity) ──────────────────
        // _twistQuat is a pure rotation about local Y: (0, sin(θ/2), 0, cos(θ/2)).
        // The FULL twist angle is θ = 2·atan2(twist.y, twist.w). We want HALF of
        // that, so halfAngle = atan2(twist.y, twist.w).
        //
        // We deliberately do NOT use identity.slerp(twist, 0.5): Three.js slerp
        // re-canonicalizes the target to the w≥0 hemisphere, so the moment the
        // measured twist passes ±180° (w goes negative) the 50% result flips
        // sign and the forearm snaps by ~180°. atan2 stays continuous through
        // that boundary, so the forearm keeps twisting smoothly instead.
        let halfAngle = Math.atan2(_twistQuat.y, _twistQuat.w);

        // Temporal unwrap: keep the per-frame change below π. This absorbs both
        // the genuine 180° crossing AND the worker's occasional q→−q sign flip
        // (which would otherwise show up as a 2π jump in the angle).
        if (_hasPrevHalfTwist[prefix]) {
          const prev = _prevHalfTwistAngle[prefix];
          let delta = halfAngle - prev;
          while (delta > Math.PI) { halfAngle -= 2 * Math.PI; delta -= 2 * Math.PI; }
          while (delta < -Math.PI) { halfAngle += 2 * Math.PI; delta += 2 * Math.PI; }
        }
        _prevHalfTwistAngle[prefix] = halfAngle;
        _hasPrevHalfTwist[prefix] = true;

        // Build the half-twist quaternion directly from the continuous angle.
        const _s = Math.sin(halfAngle);
        const _c = Math.cos(halfAngle);
        _foreArmTwistLocal.set(0, _s, 0, _c);

        // Postmultiply: applies _foreArmTwistLocal in the forearm's own local
        // space (around its own length axis), preserving IK positioning.
        foreArmBone.quaternion.multiply(_foreArmTwistLocal);

        // CRITICAL — counter-rotate the hand bone by the same 50% twist so it
        // does NOT get double-twisted. The forearm now carries 50% of the
        // rotation; the hand quaternion (forearm-local) must shed that same 50%
        // so the hand's net world orientation stays correct.
        // We premultiply the hand's local quat by the conjugate (inverse) of
        // _foreArmTwistLocal, which cancels out what the forearm just added.
        handBone.quaternion.premultiply(_foreArmTwistLocal.clone().conjugate());
      }
    }
  }

  // ── Finger joints: LOCAL bend quaternions — apply directly ─────────────
  for (const key of FINGER_BONE_KEYS) {
    const qArr = (fingerData as any)[key];
    if (!qArr) continue;
    const boneName = `${prefix}Hand${key}`;
    const bone = nodes[boneName];
    if (!bone) continue;

    // qArr is the LOCAL bend rotation around the bone's own axis.
    _fingerQuat.set(qArr[0], qArr[1], qArr[2], qArr[3]);

    const restLocal = _thumbRestLocal[boneName];
    if (restLocal) {
      // Thumb bones: preserve the rest splay orientation and apply the bend on
      // top of it in the bone's own local space — restLocal * bend.
      // Copying the bend directly would wipe out the rest pose (which is what
      // mislocated the left thumb entirely).
      _thumbComposed.copy(restLocal);
      if (key === "Thumb1") {
        // Add a fixed outward splay at the thumb base, around local Z. The rest
        // pose splays via +Z on the left hand and −Z on the right, so we push
        // further in that same per-hand direction (away from the pinky).
        const splaySign = prefix === "Left" ? 1 : -1;
        const splayRad = prefix === "Left" ? THUMB_ABDUCTION_RAD_LEFT : THUMB_ABDUCTION_RAD_RIGHT;
        _thumbAbduction.set(0, 0, Math.sin((splaySign * splayRad) / 2), Math.cos(splayRad / 2));
        _thumbComposed.multiply(_thumbAbduction);
      }
      _thumbComposed.multiply(_fingerQuat);
      bone.quaternion.copy(_thumbComposed);
    } else {
      // Fingers: rest local is effectively identity, copy directly.
      bone.quaternion.copy(_fingerQuat);
    }
  }
}

// ─── Arm IK ─────────────────────�����─────────────────────────────────────────────
// We map the MediaPipe wrist landmark (normalized image coords) to a 3-D world
// target, then solve a standard 2-bone IK chain:
//   Shoulder (LeftArm / RightArm)  →  Elbow (LeftForeArm / RightForeArm)  →  Wrist (LeftHand / RightHand)
//
// Coordinate mapping from MediaPipe image space → Three.js world:
//   MP x: 0 (left) → 1 (right)  →  world X: +/-  (avatar's left is +X, right is -X — mirrored)
//   MP y: 0 (top)  → 1 (bottom) →  world Y: shrinks downward from ~shoulder level
//   MP z: ~0 at arm's length, negative = closer  →  world Z: forward/back offset
//
// The elbow hint is a point directly below the shoulder, forcing natural
// downward-elbow pose typical of a seated user.

// Reusable vectors — allocated once to avoid GC pressure
const _ikTarget = new Vector3();
const _shoulderPos = new Vector3();
const _elbowPos = new Vector3();
const _toTarget = new Vector3();
const _elbowHint = new Vector3();
const _axis = new Vector3();
const _boneDir = new Vector3();
const _ikQuat = new Quaternion();

// Stores the rest-pose (A-pose) world direction AND world quaternion for each
// arm/forearm bone, captured once at load time.
//
// Why both?
//   - restDir  : used as the "from" vector in setFromUnitVectors so we know the
//                bone's pointing axis in world space at rest.
//   - restWorldQuat: used so that desiredWorldQuat = delta * restWorldQuat
//                preserves the bone's natural roll/twist (shortest-arc delta
//                only rotates the pointing axis; the roll component of
//                restWorldQuat carries through unchanged).
//
// Without restWorldQuat the shortest-arc rotation picks an arbitrary roll every
// frame, which produces the forearm twist artifact.
// Without the parent→local conversion the local quaternion receives a raw
// world-space value, so the effective world rotation = parent * worldValue,
// causing the arm to swing backward through the head.
const _leftArmRestDir = new Vector3(0, -1, 0);
const _rightArmRestDir = new Vector3(0, -1, 0);
const _leftForeArmRestDir = new Vector3(0, -1, 0);
const _rightForeArmRestDir = new Vector3(0, -1, 0);

const _leftArmRestWorldQuat = new Quaternion();
const _rightArmRestWorldQuat = new Quaternion();
const _leftForeArmRestWorldQuat = new Quaternion();
const _rightForeArmRestWorldQuat = new Quaternion();

// Guard: true once captureRestPose has been called for all four arm bones.
// Prevents IK from running on the very first useFrame tick before the scene
// useEffect fires and captures the actual rest-pose world quaternions.
let _armRestCaptured = false;

// Scratch for rest-dir / rest-quat capture
const _restHeadScratch = new Vector3();
const _restTailScratch = new Vector3();

/**
 * Capture the world-space bone direction (head→tail) and world quaternion from
 * the bone's current rest pose. Called once per arm/forearm at avatar load time.
 */
function captureRestPose(bone: any, outDir: Vector3, outQuat: Quaternion): void {
  if (!bone) return;
  bone.getWorldPosition(_restHeadScratch);
  if (bone.children.length > 0) {
    bone.children[0].getWorldPosition(_restTailScratch);
    outDir.subVectors(_restTailScratch, _restHeadScratch).normalize();
  }
  bone.getWorldQuaternion(outQuat);
}

// Keep captureRestDir as an alias so existing call-sites still compile.
function captureRestDir(bone: any, outDir: Vector3): void {
  if (!bone) return;
  bone.getWorldPosition(_restHeadScratch);
  if (bone.children.length > 0) {
    bone.children[0].getWorldPosition(_restTailScratch);
    outDir.subVectors(_restTailScratch, _restHeadScratch).normalize();
  }
}

// How far (in Three.js world units ≈ metres) the hand can reach from the body.
// Typical RPM avatar: arm ~0.65 m, forearm ~0.55 m → total ~1.2 m
const ARM_BONE_LEN = 0.60; // upper arm (Shoulder → Elbow)
const FOREARM_BONE_LEN = 0.55; // forearm   (Elbow    → Wrist)

// Mapping ranges for MediaPipe normalized x (0-1) → world X
// Centre of webcam (0.5) should map to the avatar's shoulder-width midline.
// We span ±0.55 m so a hand at the edge of frame reaches ≈ shoulder-width out.
const WORLD_X_SCALE = 1.1;   // total world-X span across the full image width
const WORLD_X_OFFSET = -0.55; // shift so 0.5 maps to ~0 (image centre = body centre)

// Mapping ranges for MediaPipe y (0-1, 0=top of frame) → world Y.
//
// Calibration from logs:
//   User holds hands at eye level → MP y ≈ 0.746 (hands appear 74% down the
//   frame because the face fills the upper portion of the webcam view).
//   Avatar eye level in world space ≈ 1.65 m (shoulder ≈ 1.50 m).
//
// Previous values (TOP=1.9, BOTTOM=0.8) mapped MP y=0.746 → world Y=1.08 m,
// which is below the shoulder — arm pointing down to chest/belly level.
//
// New calibration (solve TOP + 0.746*(BOTTOM-TOP) = 1.65 with TOP = 2.1):
//   MP y = 0.0  → 2.10 m  (hands fully raised, above head)
//   MP y = 0.746→ 1.65 m  (eye level — calibrated match point)
//   MP y = 1.0  → 1.50 m  (bottom of frame, just above shoulder)
const WORLD_Y_TOP = 2.1;
const WORLD_Y_BOTTOM = 1.5;

// Depth: MediaPipe wrist landmark z is defined relative to the hand-root so it
// is always near 0 for landmark 0 (wrist). It carries no useful absolute depth.
// Instead we use a fixed forward bias: a seated user's hands rest well IN FRONT
// of the body — roughly 0.4-0.6 m forward of the spine in world space.
// In Three.js +Z points toward the camera (forward from avatar's perspective),
// so a positive WORLD_Z_BASE pushes the wrist target in front of the avatar.
// The small z-scale is kept for any residual depth signal but has minimal effect.
const WORLD_Z_BASE = 0.45; // forward offset from avatar spine (was 0.25 — hands ended up behind/at body)
const WORLD_Z_SCALE = 0.3;  // kept small: MP wrist z is near 0 and not reliable for depth

/**
 * Convert a MediaPipe normalized wrist position [x, y, z] to a Three.js
 * world-space Vector3 target for the IK solver.
 * x=0 is the LEFT edge of the camera image (user's RIGHT side when mirrored),
 * but MediaPipe already de-mirrors, so x=0 is user's actual left side.
 * Avatar's left side is +X in Three.js.
 */
function wristPosToWorld(pos: [number, number, number], out: Vector3): void {
  // x: MP 0→1, user's left→right. Avatar left is +X (same as user left because
  // we are looking at the avatar from the front, same as camera looks at user).
  out.x = pos[0] * WORLD_X_SCALE + WORLD_X_OFFSET;
  out.y = WORLD_Y_TOP + pos[1] * (WORLD_Y_BOTTOM - WORLD_Y_TOP);
  // MediaPipe wrist z ≈ 0 always (it's the hand-root origin), so result is
  // dominated by WORLD_Z_BASE which places the hands in front of the avatar.
  out.z = WORLD_Z_BASE - pos[2] * WORLD_Z_SCALE;
}

// Scale applied to the PoseLandmarker shoulder→elbow offset when mapping it to
// Three.js world space.  Pose world landmarks are in metres with the human body
// proportions; the avatar skeleton is also roughly metre-scale, but the avatar's
// shoulder bone origin can differ from the pose shoulder landmark origin.
// 1.0 gives a 1:1 scale that faithfully follows the tracked elbow direction;
// increase above 1 to exaggerate the hint distance from the shoulder.
const POSE_TO_AVATAR_SCALE = 1.0;

// Maximum height (in world units) the elbow hint is allowed to rise above the
// shoulder position. ARM_BONE_LEN ≈ 0.28 m, so 0 = shoulder level (T-pose cap),
// negative values push the cap below shoulder. Tune this to set how high the
// user can raise their elbow before the animation stops following further.
// e.g. 0.0 = T-pose ceiling, -0.05 = 10 deg below shoulder, 0.05 = 10 deg above
const ELBOW_HINT_MAX_RISE = -0.05; // world units; applied to both arms

/**
 * Convert a PoseLandmarker shoulder→elbow offset vector (metres, hip-origin
 * coordinate system) to a Three.js world-space elbow hint position.
 *
 * PoseLandmarker world landmark axes (confirmed by observation):
 *   +X = user's right (mirrored webcam → same as avatar +X)
 *   +Y = DOWN  (same convention as normalized image landmarks, NOT world-up)
 *   +Z = toward camera
 *
 * Three.js world coordinate axes (avatar facing camera):
 *   +X = avatar's left (= user's right in mirrored webcam feed)  → same, no flip
 *   +Y = UP                                                        → negate Y
 *   +Z = toward camera                                             → same
 *
 * @param shoulderWorldPos  Avatar's shoulder bone world position (from bone).
 * @param offset            [dx,dy,dz] shoulder→elbow in pose world space.
 * @param out               Output Vector3 (written in-place).
 */
function poseElbowToHint(
  shoulderWorldPos: Vector3,
  offset: [number, number, number],
  out: Vector3
): void {
  out.copy(shoulderWorldPos);
  out.x += offset[0] * POSE_TO_AVATAR_SCALE;       // no flip: mirrored webcam aligns +X
  // pose +Y is DOWN, so offset[1] > 0 means elbow is below shoulder.
  // Apply a larger scale when pulling the hint DOWN (offset[1] > 0) to
  // counteract the T-pose artefact, but use 1.0 when pushing UP (offset[1] < 0)
  // so raising the elbow to shoulder level is not over-amplified.
  const yScale = offset[1] > 0 ? 4.6 : 1.0; // tune 4.6 to push elbow lower at rest; 1.0 keeps upward motion 1:1 for both arms
  out.y += -offset[1] * POSE_TO_AVATAR_SCALE * yScale;
  out.z += offset[2] * POSE_TO_AVATAR_SCALE;
}

/**
 * 2-bone IK solver using the law of cosines.
 *
 * Key design decisions that avoid the two bugs from the previous version:
 *
 * 1. World → local conversion for BOTH bones.
 *    setFromUnitVectors() produces a world-space delta quaternion.  Assigning
 *    it directly to bone.quaternion (local space) leaves the parent transform
 *    applied on top, rotating the arm far off target (the "hand behind head"
 *    bug).  Fix: desiredWorldQuat → localQuat = parent.worldQuat⁻¹ * desired.
 *
 * 2. Roll preservation via restWorldQuat.
 *    The shortest-arc delta from setFromUnitVectors picks an arbitrary roll
 *    each frame, producing the forearm twist artifact.  Fix: compose the delta
 *    on top of the bone's rest world quaternion:
 *        desiredWorldQuat = delta * restWorldQuat
 *    The delta only changes the pointing axis; the roll component inherited
 *    from restWorldQuat stays natural every frame.
 *
 * 3. Geometric elbow position.
 *    Instead of a two-step (align→target then premultiply bend), we compute
 *    elbowDir = rotate(toTarget, +angle, axis) directly.  This gives the
 *    exact upper-arm direction in a single setFromUnitVectors call.
 */
function solveArmIK(
  upperArm: any,
  foreArm: any,
  target: Vector3,
  elbowHintWS: Vector3,
  armLen: number,
  foreArmLen: number,
  armRestDir: Vector3,
  foreArmRestDir: Vector3,
  armRestWorldQuat: Quaternion,
  foreArmRestWorldQuat: Quaternion
): void {
  if (!upperArm || !foreArm) return;

  // ── Shoulder world position ────────────────────────────────────────────
  upperArm.getWorldPosition(_shoulderPos);

  // ── Direction from shoulder to IK target (clamped to reach) ───────────
  _toTarget.subVectors(target, _shoulderPos);
  const dist = Math.min(_toTarget.length(), (armLen + foreArmLen) * 0.999);
  _toTarget.normalize();

  // ─�� Law of cosines: angle at shoulder ─────────────────────────────────
  // cos A = (a²+c²-b²) / (2ac)  where a=armLen, b=foreArmLen, c=dist
  const cosA = (armLen * armLen + dist * dist - foreArmLen * foreArmLen) / (2 * armLen * dist);
  const angleA = Math.acos(Math.max(-1, Math.min(1, cosA)));

  // ── Bend axis from elbow hint ──────────────────────────────────────────
  // Remove the component along _toTarget so the axis is perpendicular.
  _elbowHint.subVectors(elbowHintWS, _shoulderPos).normalize();
  _elbowHint.addScaledVector(_toTarget, -_elbowHint.dot(_toTarget));
  if (_elbowHint.lengthSq() < 1e-8) {
    _elbowHint.set(0, -1, 0).addScaledVector(_toTarget, -_toTarget.y);
  }
  _elbowHint.normalize();
  _axis.crossVectors(_toTarget, _elbowHint).normalize();

  // ── Compute exact elbow direction (upper-arm pointing direction) ───────
  // Rotate _toTarget by +angleA around _axis toward the hint.
  // This is a single geometric step that replaces the old align+bend two-step.
  const elbowDir = _toTarget.clone().applyQuaternion(
    new Quaternion().setFromAxisAngle(_axis, angleA)
  );

  // ── Elbow world position (needed for forearm direction) ────────────────
  _elbowPos.copy(_shoulderPos).addScaledVector(elbowDir, armLen);

  // ── Upper arm: desired world quaternion ───────────────────────────────
  // delta rotates the arm's rest pointing direction → elbowDir.
  // Composing with restWorldQuat preserves the natural roll.
  _ikQuat.setFromUnitVectors(armRestDir, elbowDir);
  const upperArmDesiredWorld = _ikQuat.clone().multiply(armRestWorldQuat);

  // Convert world quaternion → local (divide out parent's world quat).
  const parentWorldQuat = new Quaternion();
  upperArm.parent.getWorldQuaternion(parentWorldQuat);
  upperArm.quaternion.copy(upperArmDesiredWorld).premultiply(parentWorldQuat.clone().invert());
  upperArm.updateWorldMatrix(true, false);

  // ── Forearm: desired world quaternion ─────────────────────────────────
  // Direction from the computed elbow to the wrist target.
  _boneDir.subVectors(target, _elbowPos).normalize();
  _ikQuat.setFromUnitVectors(foreArmRestDir, _boneDir);
  const foreArmDesiredWorld = _ikQuat.clone().multiply(foreArmRestWorldQuat);

  // Convert world quaternion → local (divide out upper arm's new world quat).
  const upperArmWorldQuat = new Quaternion();
  upperArm.getWorldQuaternion(upperArmWorldQuat);
  foreArm.quaternion.copy(foreArmDesiredWorld).premultiply(upperArmWorldQuat.clone().invert());
}

function Avatar({ url, onLoaded, playbackBlob }: AvatarProps) {
  const { scene } = useGLTF(url);
  const { nodes } = useGraph(scene);

  // Keep a stable ref to the scene so useAnimationPlayer can use it
  // without re-creating the mixer on every render.
  const sceneRef = useRef<Object3D>(scene);
  sceneRef.current = scene;

  useEffect(() => {
    headMesh.length = 0;
    if (nodes.Wolf3D_Head) headMesh.push(nodes.Wolf3D_Head);
    if (nodes.Wolf3D_Teeth) headMesh.push(nodes.Wolf3D_Teeth);
    if (nodes.Wolf3D_Beard) headMesh.push(nodes.Wolf3D_Beard);
    if (nodes.Wolf3D_Avatar) headMesh.push(nodes.Wolf3D_Avatar);
    if (nodes.Wolf3D_Head_Custom) headMesh.push(nodes.Wolf3D_Head_Custom);
    if (nodes.avatar) headMesh.push(nodes.avatar);
    if (nodes.Avatar) headMesh.push(nodes.Avatar);
    if (nodes.face) headMesh.push(nodes.face);

    setSceneForExport(scene, nodes, headMesh as Mesh[], url);

    // Reset smoothers whenever the avatar reloads so we don't carry stale
    // state from a previous session into the new pose.
    blendshapeSmoother.reset();
    quaternionSmoother.reset();
    leftFingerSmoother.reset();
    rightFingerSmoother.reset();
    leftIKSmoother.reset();
    rightIKSmoother.reset();
    leftElbowSmoother.reset();
    rightElbowSmoother.reset();

    // Reset forearm twist continuity so the unwrapped half-twist angle starts
    // fresh and doesn't carry a stale value from a previous avatar/session.
    _hasPrevHalfTwist.Left = false;
    _hasPrevHalfTwist.Right = false;
    _prevHalfTwistAngle.Left = 0;
    _prevHalfTwistAngle.Right = 0;

    // Clear the IK rest-capture guard while we recapture so no useFrame tick
    // between here and the captureRestPose calls sees stale quaternions.
    _armRestCaptured = false;

    // ── Capture A-pose rest pose for IK solver ────────────────────────────
    // Must be done after the scene is fully loaded and world matrices are up
    // to date. updateWorldMatrix(true,true) ensures the full hierarchy is
    // propagated before we read world positions / quaternions.
    scene.updateWorldMatrix(true, true);
    captureRestPose(nodes.LeftArm, _leftArmRestDir, _leftArmRestWorldQuat);
    captureRestPose(nodes.RightArm, _rightArmRestDir, _rightArmRestWorldQuat);
    captureRestPose(nodes.LeftForeArm, _leftForeArmRestDir, _leftForeArmRestWorldQuat);
    captureRestPose(nodes.RightForeArm, _rightForeArmRestDir, _rightForeArmRestWorldQuat);

    // All four arm bones have been captured — allow IK to run from this point.
    _armRestCaptured = true;

    // ── Capture thumb REST local quaternions ──────────────────────────────
    // The thumb chain has a non-identity rest local orientation that must be
    // preserved when applying bend rotations (see _thumbRestLocal definition).
    for (const side of ["Left", "Right"] as const) {
      for (const n of [1, 2, 3]) {
        const boneName = `${side}HandThumb${n}`;
        const bone = (nodes as any)[boneName];
        if (!bone) continue;
        _thumbRestLocal[boneName] = bone.quaternion.clone();
      }
    }

    // ── Capture A-pose local quaternions for every arm/finger bone ────────
    // Stored in _handRestQuats so we can restore them when a hand leaves frame.
    for (const name of [...LEFT_HAND_BONES, ...RIGHT_HAND_BONES]) {
      const bone = (nodes as any)[name];
      if (bone) {
        _handRestQuats[name] = bone.quaternion.clone();
      }
    }

    if (onLoaded) onLoaded();
  }, [nodes, url, onLoaded, scene]);

  // ── Reset arm/finger state when a new recording starts ───────────────────
  // When startRecording() fires, any mid-gesture smoother values from the live
  // preview would otherwise seed the first recorded frame with a stale pose.
  // We reset every arm/finger-related smoother and all elbow hint state here so
  // recording always starts from a clean slate matching what MediaPipe delivers
  // on its very next frame.  The subscription is stable for the lifetime of
  // the Avatar component and does not depend on any props/state.
  useEffect(() => {
    const unsub = subscribeRecordingStart(() => {
      // Reset all arm/finger smoothers so stale pre-recording state doesn't
      // bleed into the first recorded frame.
      leftFingerSmoother.reset();
      rightFingerSmoother.reset();
      leftIKSmoother.reset();
      rightIKSmoother.reset();
      leftElbowSmoother.reset();
      rightElbowSmoother.reset();
      leftRestPoseSmoother.reset();
      rightRestPoseSmoother.reset();
      _hasPrevHalfTwist.Left = false;
      _hasPrevHalfTwist.Right = false;
      _prevHalfTwistAngle.Left = 0;
      _prevHalfTwistAngle.Right = 0;
      _hasLeftElbowHint = false;
      _hasRightElbowHint = false;

      // Immediately snap all arm/hand/finger bones back to A-pose so the first
      // recorded frame starts from rest rather than from whatever mid-gesture
      // pose the skeleton was in before recording began.
      // clearHandTracking() (called by startRecording) nulled out the globals,
      // so the useFrame else-branches will smoothToRest on the next tick — but
      // doing it here synchronously prevents a one-frame snapshot of the stale pose.
      restoreHandRestPose(nodes, LEFT_HAND_BONES);
      restoreHandRestPose(nodes, RIGHT_HAND_BONES);
    });
    return unsub;
  }, [nodes]); // nodes is stable for the life of a loaded avatar

  // ── Reset arm/finger state when playback ends (returning to live mode) ───
  // When the user finishes playback and goes back to live mode, Three.js's
  // AnimationMixer leaves every bone frozen in the last frame of the recorded
  // clip (mixer.stopAllAction() does NOT restore bind-pose). The module-level
  // smoothers also still hold state from the pre-playback live session, so
  // their internal Quaternion map no longer matches the bones' actual poses.
  //
  // Consequences if we don't reset here:
  //   • smoothToRest() seeds its SLERP from the stale map values (not from the
  //     mixer-frozen bone), so the bone visually jumps to a wrong position.
  //   • smoothFromBones() SLERPs from the old map toward the new IK target,
  //     causing the arm to drift from an incorrect origin for several frames.
  //   • On the next startRecording() the _notifyStart handler does snap bones
  //     to rest — but only AFTER clearHandTracking() already nulled the wrist
  //     globals, leaving a one-frame window where the recorder captures the
  //     mixer-frozen pose.
  //
  // The fix: as soon as playbackBlob transitions non-null → null, snap all
  // arm/hand/finger bones back to A-pose and reset every smoother so the live
  // session always starts from a clean, known state.
  const prevPlaybackBlobRef = useRef<Blob | null | undefined>(playbackBlob);
  useEffect(() => {
    const wasPlaying = prevPlaybackBlobRef.current != null;
    const isNowLive   = playbackBlob == null;
    prevPlaybackBlobRef.current = playbackBlob;

    if (!wasPlaying || !isNowLive) return; // only fire on the non-null → null edge

    // Reset all smoothers — their internal state reflects the pre-playback live
    // session and no longer matches the mixer-frozen bone quaternions.
    leftFingerSmoother.reset();
    rightFingerSmoother.reset();
    leftIKSmoother.reset();
    rightIKSmoother.reset();
    leftElbowSmoother.reset();
    rightElbowSmoother.reset();
    leftRestPoseSmoother.reset();
    rightRestPoseSmoother.reset();
    _hasPrevHalfTwist.Left = false;
    _hasPrevHalfTwist.Right = false;
    _prevHalfTwistAngle.Left = 0;
    _prevHalfTwistAngle.Right = 0;
    _hasLeftElbowHint = false;
    _hasRightElbowHint = false;

    // Snap all arm/hand/finger bones back to A-pose so the live session (and
    // the next startRecording snapshot) starts from the correct rest pose.
    restoreHandRestPose(nodes, LEFT_HAND_BONES);
    restoreHandRestPose(nodes, RIGHT_HAND_BONES);
  }, [playbackBlob, nodes]);

  // ── Secondary motion ────────────────────────────────────────────────────
  // Look up per-avatar metadata and initialise the spring secondary motion.
  // For avatars with no registered chains this is a complete no-op.
  const { secondaryMotion } = getAvatarMetadata(url);

  // Build the set of all root bone names owned by secondary motion so the
  // animation mixer can strip those tracks out — preventing it from
  // overwriting the spring-integrated transforms every frame.
  const springBoneNameSet = useMemo(
    () => new Set(secondaryMotion.map((c) => c.chainStart)),
    [secondaryMotion]
  );

  // Wire up the idle animation. Pass a stable getter so the hook always
  // reads the latest mutable module variable without needing React state reactivity.
  // Also pass the excluded bone names so the mixer does not touch hair bones.
  // Idle animation is disabled during playback so the two mixers don't conflict.
  useAnimationPlayer({
    characterScene: playbackBlob ? null : scene,
    getIsMediaPipeActive: () => isMediaPipeActive,
    excludeBoneNames: springBoneNameSet,
  });

  // Playback animation — only active when a blob is provided
  const playbackControls = usePlaybackAnimation({
    characterScene: playbackBlob ? scene : null,
    playbackBlob: playbackBlob ?? null,
    excludeBoneNames: springBoneNameSet,
  });

  useSecondaryMotion({
    scene,
    chains: secondaryMotion,
    debugCollision: DEBUG_COLLISION_SPHERES,
  });

  useFrame((_, delta) => {
    // In playback mode the usePlaybackAnimation hook drives the mixer each frame.
    // Live face tracking must not touch bones at the same time.
    if (playbackBlob) return;

    // Only drive bones + blendshapes when MediaPipe has live data.
    if (!isMediaPipeActive || blendshapes.length === 0) return;

    // ── blendshape smoothing (delta-time EMA) ──────────────────────────────
    // Smooth all scores once using the frame delta so the EMA behaves
    // identically at any frame rate. Results are stored in smoothedBlendshapes
    // and reused for both the mesh update and captureFrame — the EMA state
    // only advances once per frame and the recording matches the live preview.
    const smoothedBlendshapes = blendshapes.map((element) => ({
      categoryName: element.categoryName,
      score: blendshapeSmoother.smooth(element.categoryName, element.score, delta),
    }));

    smoothedBlendshapes.forEach(({ categoryName, score }) => {
      headMesh.forEach((mesh) => {
        const index = mesh.morphTargetDictionary?.[categoryName];
        if (index >= 0) {
          mesh.morphTargetInfluences[index] = score;
        }
      });
    });

    // ── head rotation quaternion smoothing (delta-time SLERP) ──────────────
    // Desktop: decompose Matrix4 → Quaternion → slerp with delta.
    // Mobile:  Euler → Quaternion → slerp with delta.
    // Both paths use the same smoother instance so behaviour is identical
    // on all platforms at any frame rate.
    let smoothedQuat: Quaternion;

    if (headMatrix && !isMobileTracking) {
      headMatrix.decompose(
        { set: () => { } } as any,
        _targetQuat,
        { set: () => { } } as any
      );
      smoothedQuat = quaternionSmoother.smooth(_targetQuat, delta);
    } else {
      smoothedQuat = quaternionSmoother.smoothEuler(rotation, delta);
    }

    // Convert the smoothed quaternion back to an Euler so we can apply the
    // fractional neck/spine scaling that the rig requires.
    _smoothedEuler.setFromQuaternion(smoothedQuat, "XYZ");

    // Apply to bones
    if (nodes.Head) nodes.Head.quaternion.copy(smoothedQuat);
    if (nodes.Neck) nodes.Neck.rotation.set(
      _smoothedEuler.x / 5 + 0.3,
      _smoothedEuler.y / 5,
      _smoothedEuler.z / 5
    );
    if (nodes.Spine2) nodes.Spine2.rotation.set(
      _smoothedEuler.x / 10,
      _smoothedEuler.y / 10,
      _smoothedEuler.z / 10
    );

    // ── arm IK (position wrist to match webcam hand position) ─────────────
    // Skip until the rest-pose capture in useEffect has completed; running IK
    // with identity rest quaternions produces inverted arm rotations.
    if (leftWristPos && _armRestCaptured) {
      const smoothedLeftPos = leftIKSmoother.smooth(leftWristPos, delta);
      wristPosToWorld(smoothedLeftPos, _ikTarget);
      // Elbow hint: use live-tracked elbow position from PoseLandmarker when
      // available; fall back to the hardcoded offset when pose data is absent
      // (model unavailable, arm occluded, or low-confidence landmark).
      nodes.LeftArm?.getWorldPosition(_shoulderPos);
      if (leftElbowOffset) {
        const smoothedOffset = leftElbowSmoother.smooth(leftElbowOffset, delta);
        poseElbowToHint(_shoulderPos, smoothedOffset, _elbowHint);
        // Cap: never let the hint rise more than ELBOW_MAX_RISE_DEG above shoulder level.
        _elbowHint.y = Math.min(_elbowHint.y, _shoulderPos.y + ELBOW_HINT_MAX_RISE);
        // Commit this valid hint so we can re-use it if confidence drops next frame.
        _lastGoodLeftElbowHint.copy(_elbowHint);
        _hasLeftElbowHint = true;
      } else if (_hasLeftElbowHint) {
        // Pose confidence dropped — hold the last valid hint to avoid a snap.
        // The shoulder position drifts slightly with spine animation, so offset
        // the stored hint by the new shoulder position delta would be ideal, but
        // for a seated user the shoulder is essentially static, so a simple copy
        // is sufficient and avoids any position-tracking complexity.
        _elbowHint.copy(_lastGoodLeftElbowHint);
      } else {
        // No valid hint has ever been received — use hardcoded fallback.
        _elbowHint.copy(_shoulderPos);
        _elbowHint.x += 0.65;
        _elbowHint.y -= 0.2;
        _elbowHint.z += 0.2;
      }
      solveArmIK(
        nodes.LeftArm, nodes.LeftForeArm,
        _ikTarget, _elbowHint,
        ARM_BONE_LEN, FOREARM_BONE_LEN,
        _leftArmRestDir, _leftForeArmRestDir,
        _leftArmRestWorldQuat, _leftForeArmRestWorldQuat
      );
    } else if (!leftWristPos) {
      // No left hand detected — smoothly return arm + fingers to A-pose.
      leftRestPoseSmoother.smoothToRest(nodes, LEFT_HAND_BONES, _handRestQuats, delta);
      _hasPrevHalfTwist.Left = false;
      // Reset smoothers so re-entry seeds from the first new frame, not stale state.
      leftFingerSmoother.reset();
      leftIKSmoother.reset();
      leftElbowSmoother.reset();
      // Clear the sticky elbow hint so the next appearance doesn't start from
      // a stale position that could be far from the new arm position.
      _hasLeftElbowHint = false;
    }
    if (rightWristPos && _armRestCaptured) {
      const smoothedRightPos = rightIKSmoother.smooth(rightWristPos, delta);
      wristPosToWorld(smoothedRightPos, _ikTarget);
      // Elbow hint: use live-tracked elbow position from PoseLandmarker when
      // available; fall back to the hardcoded offset when pose data is absent.
      nodes.RightArm?.getWorldPosition(_shoulderPos);
      if (rightElbowOffset) {
        const smoothedOffset = rightElbowSmoother.smooth(rightElbowOffset, delta);
        poseElbowToHint(_shoulderPos, smoothedOffset, _elbowHint);
        // Cap: never let the hint rise more than ELBOW_HINT_MAX_RISE above shoulder level.
        // This prevents the IK bend axis from flipping sign on the right arm (which would
        // shoot the elbow upward) while still allowing natural upward elbow motion.
        _elbowHint.y = Math.min(_elbowHint.y, _shoulderPos.y + ELBOW_HINT_MAX_RISE);
        // Commit this valid hint so we can re-use it if confidence drops next frame.
        _lastGoodRightElbowHint.copy(_elbowHint);
        _hasRightElbowHint = true;
      } else if (_hasRightElbowHint) {
        // Pose confidence dropped — hold the last valid hint to avoid a snap.
        _elbowHint.copy(_lastGoodRightElbowHint);
      } else {
        // No valid hint has ever been received — use hardcoded fallback.
        _elbowHint.copy(_shoulderPos);
        _elbowHint.x -= 0.65;
        _elbowHint.y -= 0.2;
        _elbowHint.z += 0.2;
      }
      solveArmIK(
        nodes.RightArm, nodes.RightForeArm,
        _ikTarget, _elbowHint,
        ARM_BONE_LEN, FOREARM_BONE_LEN,
        _rightArmRestDir, _rightForeArmRestDir,
        _rightArmRestWorldQuat, _rightForeArmRestWorldQuat
      );
    } else if (!rightWristPos) {
      // No right hand detected — smoothly return arm + fingers to A-pose.
      rightRestPoseSmoother.smoothToRest(nodes, RIGHT_HAND_BONES, _handRestQuats, delta);
      _hasPrevHalfTwist.Right = false;
      // Reset smoothers so re-entry seeds from the first new frame, not stale state.
      rightFingerSmoother.reset();
      rightIKSmoother.reset();
      rightElbowSmoother.reset();
      // Clear the sticky elbow hint so the next appearance doesn't start from
      // a stale position that could be far from the new arm position.
      _hasRightElbowHint = false;
    }

    // ── finger bone animation ─────────────────────────────────────────���────
    // Smooth raw finger/wrist quaternions through their own FingerSmoother
    // instances (FINGER_TAU) before driving the skeleton, so hand jitter is
    // damped independently from blendshapes and head/neck rotation.
    const smoothedLeft = leftFingerBones ? leftFingerSmoother.smooth(leftFingerBones as unknown as Record<string, number[] | null>, delta) : null;
    const smoothedRight = rightFingerBones ? rightFingerSmoother.smooth(rightFingerBones as unknown as Record<string, number[] | null>, delta) : null;
    applyFingerBones(nodes, "Left", smoothedLeft as any);
    applyFingerBones(nodes, "Right", smoothedRight as any);

    // ── REST_POSE_TAU smoothing for in-frame hand bones ──────────────��─────
    // After the IK solver (arm bones) and applyFingerBones (hand + finger bones)
    // have written the tracked target onto every bone for this frame, SLERP each
    // bone from its smoothed state toward that target using the same REST_POSE_TAU
    // constant as the snap-back. This means entering and leaving the frame both
    // feel equally gradual — one constant controls both directions.
    if (leftWristPos) leftRestPoseSmoother.smoothFromBones(nodes, LEFT_HAND_BONES, delta);
    if (rightWristPos) rightRestPoseSmoother.smoothFromBones(nodes, RIGHT_HAND_BONES, delta);

    // ── capture frame (WYSIWYG) ────────────────────────────────────────────
    // Snapshot bone local quaternions AFTER all animation (IK, forearm twist,
    // finger bending, thumb rest+splay+bend composition, RestPoseSmoother) has
    // been applied. Reading directly from bone.quaternion is the only correct
    // approach for any bone whose recorded value is NOT a simple copy of the
    // input data:
    //
    //   • Arm bones (LeftArm, LeftForeArm, RightArm, RightForeArm): driven by
    //     solveArmIK + forearm twist distribution — no closed-form formula to
    //     reconstruct from raw MediaPipe data in the exporter.
    //
    //   • Thumb bones (LeftHandThumb1-3, RightHandThumb1-3): final value is
    //     restLocal × (optional abduction) × bend — neither restLocal nor the
    //     abduction offset are accessible inside useMotionRecorder. Replaying the
    //     raw bend quaternion alone gives the wrong orientation (no splay, wrong
    //     abduction). Snapshot the post-composition value so the recording is
    //     identical to what the user sees.
    //
    // All other finger bones (Index, Middle, Ring, Pinky) have an identity rest
    // local quaternion so their raw FingerQuats entry IS the correct final value;
    // they continue to be recorded via the existing smoothedLeft / smoothedRight
    // FingerQuats path.
    const boneSnapshot: Record<string, [number, number, number, number]> = {};

    // Always snapshot arm/wrist/thumb bones regardless of whether the hand is
    // currently detected. When the hand is not visible, smoothToRest() is
    // actively animating these bones back toward A-pose — that transition IS
    // part of the motion the user sees, and must be baked into every frame so
    // playback is WYSIWYG. Using a static fallback in the exporter (the old
    // approach) caused a jump: frames without hand data snapped to the bind
    // pose instead of showing the smooth return animation.
    const ARM_AND_THUMB_BONES = [
      "LeftArm", "LeftForeArm", "LeftHand",
      "LeftHandThumb1", "LeftHandThumb2", "LeftHandThumb3",
      "RightArm", "RightForeArm", "RightHand",
      "RightHandThumb1", "RightHandThumb2", "RightHandThumb3",
    ] as const;

    for (const name of ARM_AND_THUMB_BONES) {
      const bone = (nodes as any)[name];
      if (bone) {
        const q = bone.quaternion;
        boneSnapshot[name] = [q.x, q.y, q.z, q.w];
      }
    }

    captureFrame(
      smoothedBlendshapes,
      [_smoothedEuler.x, _smoothedEuler.y, _smoothedEuler.z],
      smoothedLeft as FingerQuats ?? undefined,
      smoothedRight as FingerQuats ?? undefined,
      Object.keys(boneSnapshot).length > 0 ? boneSnapshot : undefined
    );
  });

  // Expose playback controls via window so App.tsx can call togglePlay/seek/setLoop
  // without needing React context across the Canvas boundary.
  useEffect(() => {
    (window as any).__playbackControls = playbackControls;
    return () => { delete (window as any).__playbackControls; };
  }, [playbackControls]);

  return <primitive object={scene} position={[0, 0, 0]} />;
}

export default Avatar;
