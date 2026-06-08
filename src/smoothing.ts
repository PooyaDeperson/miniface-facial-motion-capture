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
