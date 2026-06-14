/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 *
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson"
 */

/**
 * smoothing.ts
 *
 * Pure math utilities for real-time motion smoothing.
 * No React, no Three.js scene dependencies — all inputs/outputs are primitives
 * or Three.js value objects (Quaternion, Euler).
 *
 * Both smoothers are delta-time normalised so that the perceived smoothing
 * strength is identical at any frame rate (20fps mobile vs 60fps desktop).
 *
 * The per-frame alpha is derived from a time constant (tau, in seconds):
 *
 *   alpha = 1 - exp(-delta / tau)
 *
 * At 60 fps (delta ≈ 0.0167s) and tau = 0.05s → alpha ≈ 0.28  (snappy)
 * At 20 fps (delta ≈ 0.05s)   and tau = 0.05s → alpha ≈ 0.63  (same speed)
 *
 * Both cases reach the target at the same real-world rate — the avatar always
 * "catches up" in the same number of wall-clock seconds regardless of FPS.
 *
 *  BlendshapeSmoother  — delta-time EMA per named blendshape.
 *  QuaternionSmoother  — delta-time SLERP for head rotation, with a
 *                        convenience path that accepts an Euler (mobile).
 */

import { Euler, Quaternion } from "three";

// ─── tuneable constants ────────────────────────────────────────────────────────

/**
 * Blendshape smoothing time constant in seconds.
 * Smaller → more responsive. Larger → smoother / laggier.
 * 0.05s feels snappy on fast expressions (blinks) while still damping jitter.
 */
export const BLENDSHAPE_TAU = 0.05;

/**
 * Head rotation smoothing time constant in seconds.
 * 0.08s gives fluid head motion that closely follows the user
 * without visible lag on either desktop or mobile.
 */
export const HEAD_ROTATION_TAU = 0.08;

/**
 * Finger / wrist rotation smoothing time constant in seconds.
 * Kept a little higher than HEAD_ROTATION_TAU to damp the noisier hand
 * landmarks while still feeling responsive to deliberate gestures.
 * Tune independently of face/neck without touching their constants.
 */
export const FINGER_TAU = 0.05;

/**
 * In-frame bone smoothing time constant in seconds.
 * Controls how smoothly arm and finger bones follow the live tracked pose
 * while the hand is visible. Larger values = more damping / less jitter.
 * Tune this independently from FINGER_TAU (which smooths the raw quaternion
 * input) and from REST_POSE_TAU (which controls the snap-back to rest).
 */
export const IN_FRAME_TAU = 0.03;

/**
 * Out-of-frame / rest-pose snap-back smoothing time constant in seconds.
 * Controls how slowly the arm/finger bones drift back to A-pose after the
 * hand leaves the frame. Larger values = slower, more graceful return.
 * Kept separate from IN_FRAME_TAU so entering and leaving the frame can
 * each be tuned independently.
 */
export const REST_POSE_TAU = 0.15;

/**
 * Arm IK target smoothing time constant in seconds.
 * Applied to the wrist world-position Vector3 that drives the 2-bone IK
 * solver, so the shoulder/elbow/wrist chain follows the same smoothing
 * envelope as the fingers rather than snapping each frame to the raw
 * MediaPipe landmark position.
 * Matches FINGER_TAU so the whole arm moves with consistent lag.
 */
export const ARM_IK_TAU = 0.05;

// ─── internal helper ──────────────────────────────────────────────────────────

/**
 * Convert a time constant (tau) and a frame delta (seconds) to an EMA alpha.
 * Clamps delta to [0.001, 0.25] to guard against stalled frames or tab-switch
 * spikes that would otherwise cause a single-frame jump to the raw value.
 */
function deltaToAlpha(tau: number, delta: number): number {
  const dt = Math.min(Math.max(delta, 0.001), 0.25);
  return 1 - Math.exp(-dt / tau);
}

// ─── BlendshapeSmoother ────────────────────────────────────────────────────────

export class BlendshapeSmoother {
  private prev = new Map<string, number>();
  private tau: number;

  constructor(tau = BLENDSHAPE_TAU) {
    this.tau = tau;
  }

  /**
   * Apply delta-time EMA to a single blendshape score.
   * @param name      Blendshape category name (used as the state key).
   * @param rawScore  Raw MediaPipe score [0, 1].
   * @param delta     Frame delta in seconds from useFrame's RootState.
   * @returns         Smoothed score.
   */
  smooth(name: string, rawScore: number, delta: number): number {
    const alpha = deltaToAlpha(this.tau, delta);
    const previous = this.prev.get(name) ?? rawScore;
    const smoothed = previous * (1 - alpha) + rawScore * alpha;
    this.prev.set(name, smoothed);
    return smoothed;
  }

  /** Reset all accumulated state (e.g. when tracking restarts or avatar reloads). */
  reset(): void {
    this.prev.clear();
  }
}

// ─── QuaternionSmoother ────────────────────────────────────────────────────────

export class QuaternionSmoother {
  private current = new Quaternion();
  private tau: number;
  private initialized = false;

  constructor(tau = HEAD_ROTATION_TAU) {
    this.tau = tau;
  }

  /**
   * SLERP the current smoothed quaternion toward the target using a
   * delta-time normalised factor so the result is frame-rate independent.
   *
   * On the very first call the state is seeded from the target to avoid
   * a large initial snap from identity pose → first detected pose.
   *
   * @param target  Raw target Quaternion (from matrix decompose or Euler conversion).
   * @param delta   Frame delta in seconds from useFrame's RootState.
   * @returns       The smoothed Quaternion (same internal instance — copy if needed).
   */
  smooth(target: Quaternion, delta: number): Quaternion {
    if (!this.initialized) {
      this.current.copy(target);
      this.initialized = true;
      return this.current;
    }
    const factor = deltaToAlpha(this.tau, delta);
    this.current.slerp(target, factor);
    return this.current;
  }

  /**
   * Convenience overload: accept an Euler and convert to Quaternion internally.
   * Used on mobile where the tracking path produces an Euler (no matrix).
   */
  smoothEuler(euler: Euler, delta: number): Quaternion {
    const target = new Quaternion().setFromEuler(euler);
    return this.smooth(target, delta);
  }

  /** Reset accumulated state (e.g. when tracking restarts or avatar reloads). */
  reset(): void {
    this.current.identity();
    this.initialized = false;
  }

  /** Read the current smoothed quaternion without advancing state. */
  get(): Quaternion {
    return this.current;
  }
}

// ─── IKTargetSmoother ─────────────────────────────────────────────────────────

/**
 * Delta-time EMA smoother for a 3-D world-space position (Vector3-like).
 *
 * Used to smooth the wrist IK target before it is passed to solveArmIK, so
 * the entire arm chain (shoulder → elbow → wrist) follows the same smoothing
 * envelope as the fingers.  One instance per hand (left / right).
 *
 * Inputs and outputs are plain [x, y, z] tuples to avoid importing Three.js
 * here; Avatar.tsx copies the result into a reusable Vector3 scratch value.
 */
export class IKTargetSmoother {
  private x = 0;
  private y = 0;
  private z = 0;
  private initialized = false;
  private tau: number;

  constructor(tau = ARM_IK_TAU) {
    this.tau = tau;
  }

  /**
   * Advance the EMA toward the raw target position and return the smoothed value.
   * On the first call the state is seeded from the raw value to avoid an
   * initial large jump from origin → first detected pose.
   *
   * @param raw    Raw [x, y, z] wrist position from MediaPipe (world-mapped).
   * @param delta  Frame delta in seconds from useFrame's RootState.
   * @returns      Smoothed [x, y, z] tuple.
   */
  smooth(raw: [number, number, number], delta: number): [number, number, number] {
    if (!this.initialized) {
      this.x = raw[0];
      this.y = raw[1];
      this.z = raw[2];
      this.initialized = true;
      return [this.x, this.y, this.z];
    }
    const alpha = deltaToAlpha(this.tau, delta);
    this.x = this.x * (1 - alpha) + raw[0] * alpha;
    this.y = this.y * (1 - alpha) + raw[1] * alpha;
    this.z = this.z * (1 - alpha) + raw[2] * alpha;
    return [this.x, this.y, this.z];
  }

  /** Reset accumulated state (e.g. when the hand leaves the frame). */
  reset(): void {
    this.initialized = false;
  }
}

// ─── FingerSmoother ────────────────────────────────────────────────────────────

/**
 * Per-slot delta-time SLERP smoother for finger and wrist quaternions.
 *
 * Finger / wrist data arrives as plain [x, y, z, w] number arrays from the
 * worker. This class maintains one QuaternionSmoother per named slot (e.g.
 * "Wrist", "Thumb1", "Index2" …) so each bone is smoothed independently with
 * the same frame-rate-normalised SLERP used for head rotation.
 *
 * A dedicated FINGER_TAU constant lets you tune finger responsiveness
 * separately from blendshapes (BLENDSHAPE_TAU) and neck rotation
 * (HEAD_ROTATION_TAU) without touching those values.
 *
 * Usage (in Avatar.tsx useFrame):
 *   const smoothed = fingerSmoother.smooth(rawFingerQuats, delta);
 *   applyFingerBones(nodes, prefix, smoothed);
 */
export class FingerSmoother {
  private slots = new Map<string, QuaternionSmoother>();
  private tau: number;

  constructor(tau = FINGER_TAU) {
    this.tau = tau;
  }

  /**
   * Smooth a FingerQuats-shaped object (keys → [x,y,z,w] arrays or null).
   * Returns a new object with the same keys but smoothed quaternion arrays.
   * Slots present in the input but not yet seen are seeded from the raw value
   * (same zero-snap prevention as QuaternionSmoother.smooth).
   *
   * @param raw    Raw finger/wrist quaternion map from the worker.
   * @param delta  Frame delta in seconds from useFrame's RootState.
   * @returns      Smoothed copy — safe to pass directly to applyFingerBones.
   */
  smooth(raw: Record<string, number[] | null>, delta: number): Record<string, number[] | null> {
    const out: Record<string, number[] | null> = {};
    for (const key of Object.keys(raw)) {
      const arr = raw[key];
      if (!arr) {
        out[key] = null;
        continue;
      }
      let slot = this.slots.get(key);
      if (!slot) {
        slot = new QuaternionSmoother(this.tau);
        this.slots.set(key, slot);
      }
      const target = new Quaternion(arr[0], arr[1], arr[2], arr[3]);
      const s = slot.smooth(target, delta);
      out[key] = [s.x, s.y, s.z, s.w];
    }
    return out;
  }

  /** Reset all accumulated state (e.g. when tracking restarts or avatar reloads). */
  reset(): void {
    this.slots.forEach((slot) => slot.reset());
    this.slots.clear();
  }
}

// ─── RestPoseSmoother ─────────────────────────────────────────────────────────

/**
 * Per-bone stateful delta-time SLERP smoother.
 *
 * Maintains a smoothed quaternion for every named bone it has seen. Each frame
 * it advances the stored value toward a caller-supplied target (either the live
 * tracked pose or the A-pose rest quaternion) and writes the result back onto
 * the bone. Both transitions — hand-enters-frame and hand-leaves-frame — share
 * exactly the same SLERP alpha, so motion is symmetric and controlled by the
 * single REST_POSE_TAU constant.
 *
 * Usage in Avatar.tsx useFrame:
 *
 *   // Hand visible — SLERP from IK/finger-written bone.quaternion to smooth:
 *   restPoseSmoother.smoothFromBones(nodes, boneNames, delta);
 *   // Uses IN_FRAME_TAU. Call AFTER applyFingerBones / solveArmIK have
 *   // written the target onto bone.quaternion.
 *
 *   // Hand hidden — SLERP toward A-pose rest quaternions:
 *   restPoseSmoother.smoothToRest(nodes, boneNames, restQuats, delta);
 *   // Uses REST_POSE_TAU. Both taus can be set independently via the
 *   // constructor so entering and leaving the frame feel different.
 */
export class RestPoseSmoother {
  // Stores the last smoothed quaternion per bone name so each frame we advance
  // from a known smooth position rather than from the raw bone.quaternion.
  private smoothed = new Map<string, Quaternion>();
  private inFrameTau: number;
  private restPoseTau: number;

  constructor(inFrameTau = IN_FRAME_TAU, restPoseTau = REST_POSE_TAU) {
    this.inFrameTau = inFrameTau;
    this.restPoseTau = restPoseTau;
  }

  /**
   * Advance each bone's smoothed quaternion toward the value currently on
   * `bone.quaternion` (the IK solver / applyFingerBones target) and write the
   * smoothed result back. No extra allocations — reads and writes in-place.
   *
   * Call this AFTER solveArmIK and applyFingerBones have set the desired target
   * quaternion on each bone for this frame.
   *
   * @param nodes      Avatar node map.
   * @param boneNames  List of bone names to process.
   * @param delta      Frame delta in seconds.
   */
  smoothFromBones(
    nodes: Record<string, any>,
    boneNames: readonly string[],
    delta: number
  ): void {
    const alpha = deltaToAlpha(this.inFrameTau, delta);
    for (const name of boneNames) {
      const bone = nodes[name];
      if (!bone) continue;

      let current = this.smoothed.get(name);
      if (!current) {
        // First time seen — seed from the bone so there is no initial jump.
        current = bone.quaternion.clone() as Quaternion;
        this.smoothed.set(name, current);
        // bone.quaternion is already the target value, nothing to write back.
        continue;
      }
      // SLERP internal state toward the target the IK/finger system just set.
      current.slerp(bone.quaternion, alpha);
      bone.quaternion.copy(current);
    }
  }

  /**
   * SLERP every named bone from its smoothed state toward the A-pose rest
   * quaternion and write the result back onto `bone.quaternion`.
   *
   * @param nodes      Avatar node map.
   * @param boneNames  List of bone names to animate back to rest.
   * @param restQuats  Map of bone name → rest Quaternion (captured at load time).
   * @param delta      Frame delta in seconds.
   */
  smoothToRest(
    nodes: Record<string, any>,
    boneNames: readonly string[],
    restQuats: Record<string, Quaternion>,
    delta: number
  ): void {
    const alpha = deltaToAlpha(this.restPoseTau, delta);
    for (const name of boneNames) {
      const bone = nodes[name];
      const rest = restQuats[name];
      if (!bone || !rest) continue;

      let current = this.smoothed.get(name);
      if (!current) {
        current = bone.quaternion.clone() as Quaternion;
        this.smoothed.set(name, current);
      }
      current.slerp(rest, alpha);
      bone.quaternion.copy(current);
    }
  }

  /** Reset all per-bone smoothed state (e.g. when the avatar reloads). */
  reset(): void {
    this.smoothed.clear();
  }
}
