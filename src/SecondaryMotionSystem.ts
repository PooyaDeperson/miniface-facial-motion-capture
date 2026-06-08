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
 * SecondaryMotionSystem.ts
 *
 * Lightweight spring secondary motion for Three.js skeletons — no physics engine.
 *
 * Design goals
 * ────────────
 *  • Bones always spring BACK to their rest pose — they never drift permanently.
 *  • Driver movement causes a smooth inertia lag on the chain.
 *  • Gravity applies a gentle constant downward bias, also springs back to rest.
 *  • The bone quaternion is SET (not accumulated) each frame to prevent drift.
 *
 * Per-bone algorithm each frame
 * ─────────────────────────────
 *  1. Compute rest-pose tail in world space (follows driver rigidly each frame).
 *  2. Apply gravity sag: shift rest target slightly downward by `gravity` amount.
 *  3. Apply inertia offset: opposite to smoothed driver velocity, capped tightly.
 *  4. Spring target = sagged rest + inertia offset.
 *  5. Verlet: vel = (simTail - prevTail) * damping + (target - simTail) * stiffness
 *  6. Constrain particle to bone length sphere around bone world head.
 *  7. Compute delta rotation in parent-local space: restDir → simDir.
 *  8. SET bone quaternion = restLocalQuat * delta  (never premultiply/accumulate).
 */

import { Object3D, Vector3, Quaternion, Matrix4 } from "three";

// ─── Public config ────────────────────────────────────────────────────────────

export interface SecondaryChainConfig {
  /** Unique identifier for this chain (e.g. "ponytail", "skirtLeft"). */
  id: string;
  /** Bone whose world-position drives inertia (e.g. "hair_head"). */
  driver: string;
  /** First bone in the spring chain (inclusive). */
  chainStart: string;
  /** Last bone in the spring chain (inclusive). */
  chainEnd: string;
  /** How strongly bones spring back toward rest. Range 0–1, default 0.28. */
  stiffness?: number;
  /** Velocity damping per frame. Range 0–1, default 0.80. */
  damping?: number;
  /** Constant downward sag bias. 0 = no droop, default 0.07. */
  gravity?: number;
  /** How much driver velocity lags the chain. Default 0.08. */
  inertiaScale?: number;
  /** Smoothing factor for driver velocity (exponential smoothing α). Range 0–1, default 0.12. Higher = smoother but more lag, lower = more responsive but jittery. */
  smoothing?: number;
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface BoneState {
  bone: Object3D;
  boneParent: Object3D;
  boneLength: number;
  /** Simulated world-space tail particle. */
  simTail: Vector3;
  /** Previous simTail for Verlet velocity. */
  prevTail: Vector3;
  /**
   * Rest-pose tail stored in driver-local space so it follows the driver
   * rigidly every frame without any extra matrix baking.
   */
  restTailDriverLocal: Vector3;
  /** Rest-pose local quaternion — the bone's unmodified bind-pose rotation. */
  restLocalQuat: Quaternion;
}

interface ChainState {
  id: string;
  driver: Object3D;
  bones: BoneState[];
  smoothDriverVel: Vector3;
  prevDriverPos: Vector3;
}

// ─── Pre-allocated scratch (reused every frame, never heap-allocated in hot path) ─

const _s_driverPos = new Vector3();
const _s_rawVel = new Vector3();
const _s_restTailWS = new Vector3();
const _s_boneHeadWS = new Vector3();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _s_restHeadWS = new Vector3()
const _s_restDir = new Vector3();
const _s_simDir = new Vector3();
const _s_springTarget = new Vector3();
const _s_vel = new Vector3();
const _s_spring = new Vector3();
const _s_inertia = new Vector3();
const _s_deltaQ = new Quaternion();
const _s_invDriver = new Matrix4();
const _s_invParent = new Matrix4();
const _s_down = new Vector3(0, -1, 0);
const _s_headLocal = new Vector3();
const _s_restLocal = new Vector3();
const _s_simLocal = new Vector3();
const _s_diff = new Vector3();


// ─── SecondaryMotionSystem ────────────────────────────────────────────────────

export class SecondaryMotionSystem {
  private chains: ChainState[] = [];
  private configs: SecondaryChainConfig[];
  private configMap = new Map<string, SecondaryChainConfig>();
  private scene: Object3D;

  constructor(scene: Object3D, configs: SecondaryChainConfig[]) {
    this.scene = scene;
    this.configs = configs;
    this._init();
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  private _init(): void {
    this.scene.updateWorldMatrix(true, true);

for (const cfg of this.configs) {
  
  this.configMap.set(cfg.id, cfg);

  const driver = this._find(cfg.driver);
      if (!driver) {
        console.warn(
          `[SecondaryMotion] driver "${cfg.driver}" not found — skipping "${cfg.id}".`,
        );
        continue;
      }

      const startBone = this._find(cfg.chainStart);
      if (!startBone) {
        console.warn(
          `[SecondaryMotion] chainStart "${cfg.chainStart}" not found — skipping "${cfg.id}".`,
        );
        continue;
      }

      const boneChain = this._collectChain(startBone, cfg.chainEnd);
      if (boneChain.length === 0) continue;

      // Capture driver-inverse at bind pose for rest-tail storage.
      _s_invDriver.copy(driver.matrixWorld).invert();

      const bones: BoneState[] = [];

      for (let i = 0; i < boneChain.length; i++) {
        const bone = boneChain[i];
        const child = boneChain[i + 1] ?? null;

        // Bind-pose tail world position.
        let tailWS: Vector3;
        if (child) {
          tailWS = new Vector3();
          child.getWorldPosition(tailWS);
        } else {
          // Leaf: extend 4 cm along bind-pose bone Y axis in world space.
          const boneWQ = new Quaternion();
          bone.getWorldQuaternion(boneWQ);
          tailWS = new Vector3();
          bone.getWorldPosition(tailWS);
          tailWS.addScaledVector(
            new Vector3(0, 1, 0).applyQuaternion(boneWQ),
            0.04,
          );
        }

        const headWS = new Vector3();
        bone.getWorldPosition(headWS);
        const len = Math.max(tailWS.distanceTo(headWS), 0.005);

        bones.push({
          bone,
          boneParent: bone.parent ?? bone,
          boneLength: len,
          simTail: tailWS.clone(),
          prevTail: tailWS.clone(),
          restTailDriverLocal: tailWS.clone().applyMatrix4(_s_invDriver),
          // Snapshot the bind-pose local quaternion — this is the zero-rotation reference.
          restLocalQuat: bone.quaternion.clone(),
        });
      }

      const prevDriverPos = new Vector3();
      driver.getWorldPosition(prevDriverPos);

      this.chains.push({
        id: cfg.id,
        driver,
        bones,
        smoothDriverVel: new Vector3(),
        prevDriverPos,
      });
    }
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  public update(deltaTime: number): void {
    if (this.chains.length === 0) return;

    // Clamp dt so a tab-switch / pause doesn't explode velocities.
    const dt = Math.min(deltaTime, 0.05);

    this.scene.updateWorldMatrix(true, true);

    for (let ci = 0; ci < this.chains.length; ci++) {
      const chain = this.chains[ci];
      const cfg = this.configMap.get(chain.id);
        if (!cfg) continue;
      
      const stiffness = cfg.stiffness ?? 0.28;
      const damping = cfg.damping ?? 0.8;
      const gravity = cfg.gravity ?? 0.07;
      const inertiaScale = cfg.inertiaScale ?? 0.08;
      const smoothing = cfg.smoothing ?? 0.12;

      // ── Driver velocity (exponentially smoothed) ──────────────────────
      chain.driver.getWorldPosition(_s_driverPos);

      _s_rawVel
        .copy(_s_driverPos)
        .sub(chain.prevDriverPos)
        .divideScalar(Math.max(dt, 1e-4));

      // Hard cap before smoothing so sudden jumps stay bounded.
      const rawSpeed = _s_rawVel.length();
      if (rawSpeed > 3.0) _s_rawVel.multiplyScalar(3.0 / rawSpeed);

      // α = smoothing → slow follower = smooth lag without overshoot.
      const alpha = 1 - smoothing;
        chain.smoothDriverVel.lerp(_s_rawVel, alpha);

      // Dead zone: eliminate micro-movements that cause jitter on small motions.
      if (chain.smoothDriverVel.length() < 0.01) {
        chain.smoothDriverVel.set(0, 0, 0);
      }

      chain.prevDriverPos.copy(_s_driverPos);

      // Rebuild driver inverse this frame (driver moves with the skeleton).
      _s_invDriver.copy(chain.driver.matrixWorld).invert();

      // ── Per-bone spring ───────────────────────────────────────────────
      const chainLength = chain.bones.length;

      for (let bi = 0; bi < chain.bones.length; bi++) {
        const b = chain.bones[bi];
        const chainFactor = chainLength <= 1 ? 1 : bi / (chainLength - 1);

        // Root ≈ 0.3
        // Tip  ≈ 1.0
        const tipWeight = 0.3 + chainFactor * 0.7;

        // 1. Rest-pose tail in world space this frame.
_s_restTailWS
  .copy(b.restTailDriverLocal)
  .applyMatrix4(chain.driver.matrixWorld);



        // 2. Bone head world position.
        b.bone.getWorldPosition(_s_boneHeadWS);

        // 3. Gravity sag: nudge the spring target downward.
        //    target = restTailWS + down * gravity * boneLength
        //    This is additive, not a force — it always resolves back to rest.
        _s_springTarget
          .copy(_s_restTailWS)
          .addScaledVector(_s_down, gravity * b.boneLength);

        const speedSq = chain.smoothDriverVel.lengthSq();
const speed = Math.sqrt(speedSq);
const deadZone = 0.08;

if (speed > deadZone) {

  const normalizedSpeed = Math.min((speed - deadZone) / 2.0, 1.0);
  const motionWeight = Math.pow(normalizedSpeed, 3.0);



    const baseInertia = speed * inertiaScale;
    const weightedInertia = baseInertia * tipWeight * motionWeight;
      const maxInertia = b.boneLength * 0.7;

  _s_inertia
    .copy(chain.smoothDriverVel)
    .normalize()
    .negate()
    .multiplyScalar(Math.min(weightedInertia, maxInertia));

  _s_springTarget.add(_s_inertia);
}

        // 5. Verlet integrate.
        _s_vel.copy(b.simTail).sub(b.prevTail).multiplyScalar(damping);
        _s_spring
          .copy(_s_springTarget)
          .sub(b.simTail)
          .multiplyScalar(stiffness);
        _s_vel.add(_s_spring);

        b.prevTail.copy(b.simTail);
        b.simTail.add(_s_vel);

        // 6. Re-read head (parent may have been updated earlier this loop)
        //    then constrain tail to bone-length sphere.
        b.bone.getWorldPosition(_s_boneHeadWS);
      _s_diff.copy(b.simTail).sub(_s_boneHeadWS);
const dist = _s_diff.length();
        if (dist > 1e-6) {
       b.simTail
  .copy(_s_diff)
            .normalize()
            .multiplyScalar(b.boneLength)
            .add(_s_boneHeadWS);
        }

        // 7. Compute delta rotation in parent-local space: restDir → simDir.
        _s_invParent.copy(b.boneParent.matrixWorld).invert();

        // Re-read head world pos after constraint (simTail may have changed).
        b.bone.getWorldPosition(_s_boneHeadWS);

        // Transform both tail endpoints into parent-local space.
_s_headLocal.copy(_s_boneHeadWS).applyMatrix4(_s_invParent);

_s_restLocal
  .copy(_s_restTailWS)
  .applyMatrix4(_s_invParent)
  .sub(_s_headLocal);

_s_simLocal
  .copy(b.simTail)
  .applyMatrix4(_s_invParent)
  .sub(_s_headLocal);

     _s_restDir.copy(_s_restLocal).normalize();
_s_simDir.copy(_s_simLocal).normalize();

// 8. SET bone quat = restLocalQuat * delta — stable version
if (
  _s_restDir.lengthSq() > 1e-6 &&
  _s_simDir.lengthSq() > 1e-6
) {
  _s_deltaQ.setFromUnitVectors(_s_restDir, _s_simDir);

  b.bone.quaternion
    .copy(b.restLocalQuat)
    .multiply(_s_deltaQ)   // FIX: multiply (not premultiply)
    .normalize();
} else {
  b.bone.quaternion.slerp(b.restLocalQuat, 0.08);
}
      }
    }
  }

  // ── Snapshot (for recording) ──────────────────────────────────────────────

  /**
   * Returns the current live bone quaternions for every chain, keyed by bone
   * name. Called once per frame by the recorder immediately after update().
   * Allocates a plain object but re-uses the existing Quaternion values stored
   * on each bone — no extra heap pressure on the hot path.
   */
  public snapshotBoneQuaternions(): Record<string, [number, number, number, number]> {
    const snap: Record<string, [number, number, number, number]> = {};
    for (const chain of this.chains) {
      for (const b of chain.bones) {
        const q = b.bone.quaternion;
        snap[b.bone.name] = [q.x, q.y, q.z, q.w];
      }
    }
    return snap;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _find(name: string): Object3D | null {
    let found: Object3D | null = null;
    this.scene.traverse((o) => {
      if (!found && o.name === name) found = o;
    });
    return found;
  }

  private _collectChain(start: Object3D, endName: string): Object3D[] {
    const chain: Object3D[] = [];
    let cur: Object3D | null = start;
    while (cur) {
      chain.push(cur);
      if (cur.name === endName) break;
      cur = cur.children[0] ?? null;
    }
    return chain;
  }
}
