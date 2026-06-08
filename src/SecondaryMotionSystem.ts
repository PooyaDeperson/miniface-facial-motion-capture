/*
 * Copyright (c) 2025 Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 *
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson"
 */

/**
 * SecondaryMotionSystem.ts
 *
 * Lightweight spring secondary motion for Three.js skeletons — no physics engine.
 *
 * Design goals
 * ────────────
 *  • Bones always spring BACK to their rest pose — they never drift away permanently.
 *  • Driver movement (head nodding, turning) causes a smooth inertia lag on the chain.
 *  • Gravity applies a gentle constant downward bias on the rest target — not an
 *    accumulating force — so gravity also resolves back toward rest.
 *  • All scratch objects are pre-allocated; zero heap allocations in the hot path.
 *
 * Per-bone algorithm each frame
 * ─────────────────────────────
 *  1. Compute rest-pose tail in world space (moves rigidly with the driver bone).
 *  2. Apply a gravity sag: bend the rest direction slightly downward proportional
 *     to `gravity`, giving the natural droop of hair/clothing.
 *  3. Track driver velocity with exponential smoothing.
 *  4. Inertia offset = smoothed driver velocity × inertiaScale, reversed and capped.
 *     This makes the tip lag behind when the head moves, then snaps back.
 *  5. Spring target = gravityRest + inertiaOffset.
 *  6. Verlet integrate: vel = (simTail - prevTail) × damping
 *                           + (springTarget - simTail) × stiffness
 *     No extra forces; stiffness guarantees return-to-rest.
 *  7. Constrain particle to bone length sphere.
 *  8. Derive new bone quaternion via setFromUnitVectors(restDir → simDir).
 */

import { Object3D, Vector3, Quaternion, Matrix4 } from "three";

// ─── Public config ─────────────────────────────────────────────────────────

export interface SecondaryChainConfig {
  /** Unique identifier for this chain (e.g. "hair_head", "skirtLeft"). */
  id: string;
  /**
   * Name of the bone whose world-position drives inertia.
   * Typically "hair_head" for hair, "Hips" for skirts.
   */
  driver: string;
  /**
   * Name of the root bone of the spring chain.
   * Child bones are auto-discovered by walking the hierarchy.
   */
  root: string;
  /**
   * How strongly each bone springs back toward rest pose.
   * Higher = snappier return. Range 0–1, default 0.3.
   */
  stiffness?: number;
  /**
   * Velocity damping applied each frame.
   * Higher = less oscillation. Range 0–1, default 0.85.
   */
  damping?: number;
  /**
   * Constant downward sag applied to the rest-pose target.
   * 0 = no droop, 0.1 = subtle ponytail/hair droop. Default 0.08.
   */
  gravity?: number;
  /**
   * How strongly driver velocity pushes the particle away from rest.
   * Lower = more subtle lag. Default 0.08.
   */
  inertiaScale?: number;
}

// ─── Internal types ────────────────────────────────────────────────────────

interface BoneState {
  bone: Object3D;
  boneParent: Object3D;
  boneLength: number;
  /** Simulated world-space tail (Verlet particle). */
  simTail: Vector3;
  /** Previous simTail for Verlet velocity. */
  prevTail: Vector3;
  /** Rest-pose tail in driver-local space — never changes after init. */
  restTailDriverLocal: Vector3;
}

interface ChainState {
  id: string;
  driver: Object3D;
  bones: BoneState[];
  /** Smoothed driver velocity (exponential moving average). */
  smoothDriverVel: Vector3;
  /** Driver world position last frame. */
  prevDriverPos: Vector3;
}

// ─── Pre-allocated scratch ─────────────────────────────────────────────────

const _driverPos      = new Vector3();
const _rawVel         = new Vector3();
const _restTailWS     = new Vector3();
const _boneHeadWS     = new Vector3();
const _restDir        = new Vector3();
const _gravRestDir    = new Vector3();
const _springTarget   = new Vector3();
const _simDir         = new Vector3();
const _rotQ           = new Quaternion();
const _invDriverMtx   = new Matrix4();
const _invParentMtx   = new Matrix4();
const _vel            = new Vector3();
const _spring         = new Vector3();
const _inertiaOffset  = new Vector3();

// ─── SecondaryMotionSystem ──────────────────────────────────────────────────

export class SecondaryMotionSystem {
  private chains: ChainState[] = [];
  private configs: SecondaryChainConfig[];
  private scene: Object3D;

  constructor(scene: Object3D, configs: SecondaryChainConfig[]) {
    this.scene   = scene;
    this.configs = configs;
    this._init();
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  private _init(): void {
    this.scene.updateWorldMatrix(true, true);

    for (const cfg of this.configs) {
      const driver = this._find(cfg.driver);
      if (!driver) {
        console.warn(`[SecondaryMotion] Driver "${cfg.driver}" not found — skipping "${cfg.id}".`);
        continue;
      }
      const rootBone = this._find(cfg.root);
      if (!rootBone) {
        console.warn(`[SecondaryMotion] Root bone "${cfg.root}" not found — skipping "${cfg.id}".`);
        continue;
      }

      const boneChain = this._collectChain(rootBone);

      // Freeze driver inverse matrix at bind pose.
      _invDriverMtx.copy(driver.matrixWorld).invert();

      const bones: BoneState[] = [];

      for (let i = 0; i < boneChain.length; i++) {
        const bone  = boneChain[i];
        const child = boneChain[i + 1] ?? null;

        // Bind-pose tail in world space.
        let tailWS: Vector3;
        if (child) {
          tailWS = new Vector3();
          child.getWorldPosition(tailWS);
        } else {
          // Leaf: extend along bone's local +Y axis.
          const boneWQ = bone.getWorldQuaternion(new Quaternion());
          bone.getWorldPosition(tailWS = new Vector3());
          tailWS.addScaledVector(new Vector3(0, 1, 0).applyQuaternion(boneWQ), 0.04);
        }

        bone.getWorldPosition(_boneHeadWS);
        const len = Math.max(tailWS.distanceTo(_boneHeadWS), 0.005);

        bones.push({
          bone,
          boneParent: bone.parent ?? bone,
          boneLength: len,
          simTail:  tailWS.clone(),
          prevTail: tailWS.clone(),
          // Store rest tail in driver-local space so it follows the driver rigidly.
          restTailDriverLocal: tailWS.clone().applyMatrix4(_invDriverMtx),
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

  // ── Update ──────────────────────────────────────────────────────────────────

  public update(deltaTime: number): void {
    if (this.chains.length === 0) return;

    // Clamp dt so a tab-switch doesn't cause an explosion.
    const dt = Math.min(deltaTime, 0.05);

    this.scene.updateWorldMatrix(true, true);

    for (let ci = 0; ci < this.chains.length; ci++) {
      const chain = this.chains[ci];
      const cfg   = this.configs.find((c) => c.id === chain.id)!;

      const stiffness    = cfg.stiffness    ?? 0.3;
      const damping      = cfg.damping      ?? 0.85;
      const gravity      = cfg.gravity      ?? 0.08;
      const inertiaScale = cfg.inertiaScale ?? 0.08;

      // ── Driver velocity (exponentially smoothed) ────────────────────────
      chain.driver.getWorldPosition(_driverPos);

      // Raw per-frame displacement → velocity.
      _rawVel.copy(_driverPos).sub(chain.prevDriverPos).divideScalar(dt);

      // Soft cap: clamp to 3 m/s before smoothing so large jumps don't explode.
      const rawSpeed = _rawVel.length();
      if (rawSpeed > 3) _rawVel.multiplyScalar(3 / rawSpeed);

      // Exponential moving average  (α ≈ 0.15: slow follower = smoother lag).
      chain.smoothDriverVel.lerp(_rawVel, 0.15);

      chain.prevDriverPos.copy(_driverPos);

      // ── Per-bone spring ─────────────────────────────────────────────────
      _invDriverMtx.copy(chain.driver.matrixWorld).invert();

      for (let bi = 0; bi < chain.bones.length; bi++) {
        const b = chain.bones[bi];

        // 1. Rest-pose tail in world space (follows driver rigidly).
        _restTailWS.copy(b.restTailDriverLocal).applyMatrix4(chain.driver.matrixWorld);

        // 2. Gravity sag: bend the rest direction downward.
        //    We compute the unit vector from bone head → restTail, tilt it
        //    by gravity amount downward, then scale back to bone length.
        b.bone.getWorldPosition(_boneHeadWS);
        _restDir.copy(_restTailWS).sub(_boneHeadWS);          // rest direction (world)
        _gravRestDir.set(0, -gravity, 0);                      // downward bias
        _gravRestDir.addScaledVector(_restDir.clone().normalize(), 1.0);
        _gravRestDir.normalize().multiplyScalar(b.boneLength).add(_boneHeadWS);
        // _gravRestDir is now the gravity-sagged rest target in world space.

        // 3. Inertia offset: opposite to driver motion, capped to bone length × 0.5.
        const inertiaLen = Math.min(
          chain.smoothDriverVel.length() * inertiaScale * dt,
          b.boneLength * 0.5
        );
        _inertiaOffset.copy(chain.smoothDriverVel).normalize().negate().multiplyScalar(inertiaLen);

        // 4. Spring target = gravity-sagged rest + inertia offset.
        _springTarget.copy(_gravRestDir).add(_inertiaOffset);

        // 5. Verlet integrate.
        //    vel = (simTail - prevTail) × damping  +  (target - simTail) × stiffness
        _vel.copy(b.simTail).sub(b.prevTail).multiplyScalar(damping);
        _spring.copy(_springTarget).sub(b.simTail).multiplyScalar(stiffness);
        _vel.add(_spring);

        b.prevTail.copy(b.simTail);
        b.simTail.add(_vel);

        // 6. Constrain particle to bone length sphere around bone head.
        b.bone.getWorldPosition(_boneHeadWS);
        const toTail = b.simTail.clone().sub(_boneHeadWS);
        const dist   = toTail.length();
        if (dist > 1e-6) {
          b.simTail
            .copy(toTail)
            .normalize()
            .multiplyScalar(b.boneLength)
            .add(_boneHeadWS);
        }

        // 7. Derive bone rotation: setFromUnitVectors(restDir → simDir) in parent-local space.
        _invParentMtx.copy(b.boneParent.matrixWorld).invert();

        b.bone.getWorldPosition(_boneHeadWS); // re-read after constraint
        const headLocal    = _boneHeadWS.clone().applyMatrix4(_invParentMtx);
        const restLocalDir = _restTailWS.clone().applyMatrix4(_invParentMtx).sub(headLocal);
        const simLocalDir  = b.simTail.clone().applyMatrix4(_invParentMtx).sub(headLocal);

        _restDir.copy(restLocalDir).normalize();
        _simDir.copy(simLocalDir).normalize();

        if (
          _restDir.lengthSq()  > 1e-6 &&
          _simDir.lengthSq()   > 1e-6 &&
          _restDir.dot(_simDir) < 0.9999
        ) {
          _rotQ.setFromUnitVectors(_restDir, _simDir);
          b.bone.quaternion.premultiply(_rotQ);
          b.bone.quaternion.normalize();
        }
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _find(name: string): Object3D | null {
    let found: Object3D | null = null;
    this.scene.traverse((o) => {
      if (!found && o.name === name) found = o;
    });
    return found;
  }

  private _collectChain(root: Object3D): Object3D[] {
    const chain: Object3D[] = [];
    let cur: Object3D | null = root;
    while (cur) {
      chain.push(cur);
      cur = cur.children[0] ?? null;
    }
    return chain;
  }
}
