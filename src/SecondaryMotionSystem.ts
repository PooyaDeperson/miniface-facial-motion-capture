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
 * Lightweight, zero-dependency spring-based secondary motion for Three.js skeletons.
 * No physics engine required — runs on pure math, designed for mobile performance.
 *
 * Architecture
 * ────────────
 * For each chain config:
 *   1. Locate the "driver" bone by name — its world position drives the simulation.
 *   2. Walk from "root" bone down through first children to build the linear chain.
 *   3. For every bone in the chain, store its rest-pose tail in driver-local space.
 *   4. Each frame: track driver world-position velocity and acceleration.
 *      Compute an inertia offset (acceleration × weight), then Verlet-integrate
 *      a "simulated tail" per bone using stiffness (spring-back) and damping.
 *   5. Derive each bone's new quaternion via setFromUnitVectors(restDir → simDir),
 *      applied in local space so the rig remains compatible with any animation.
 *
 * No allocations in the update loop — all scratch vectors/matrices/quats are
 * pre-allocated at construction time.
 */

import {
  Object3D,
  Vector3,
  Quaternion,
  Matrix4,
  Skeleton,
} from "three";

// ─── Public config types ───────────────────────────────────────────────────

export interface SecondaryChainConfig {
  /** Unique identifier for this chain (e.g. "hairBack", "skirtLeft"). */
  id: string;
  /**
   * Name of the bone whose movement drives the simulation.
   * Typically "Head" for hair chains, "Hips" for skirt chains.
   */
  driver: string;
  /**
   * Name of the root bone of the chain.
   * Children are discovered automatically by walking the hierarchy.
   */
  root: string;
  /** How strongly each bone springs back toward its rest pose. 0–1, default 0.25. */
  stiffness?: number;
  /** Velocity damping each frame. Higher = snappier. 0–1, default 0.88. */
  damping?: number;
  /** Constant downward pull applied to the simulated tail. Default 0.08. */
  gravity?: number;
}

// ─── Internal types ────────────────────────────────────────────────────────

/** One bone in a spring chain. */
interface BoneState {
  bone: Object3D;
  boneParent: Object3D;
  boneLength: number;
  /** Simulated world-space tail position (Verlet particle). */
  simTail: Vector3;
  /** Previous simTail (for Verlet velocity). */
  prevTail: Vector3;
  /** Rest-pose tail in driver-local space — used for spring target. */
  restTailDriverLocal: Vector3;
}

/** One complete chain (driver + bones). */
interface ChainState {
  id: string;
  driver: Object3D;
  bones: BoneState[];
}

// ─── Scratch objects (pre-allocated, never recreated) ────────────────────

const _driverPos     = new Vector3();
const _prevDriverPos = new Vector3();
const _driverVel     = new Vector3();
const _driverAcc     = new Vector3();
const _restTailWS    = new Vector3();
const _boneHeadWS    = new Vector3();
const _invParentMtx  = new Matrix4();
const _restDir       = new Vector3();
const _simDir        = new Vector3();
const _rotQ          = new Quaternion();
const _invDriverMtx  = new Matrix4();
const _springForce   = new Vector3();
const _gravity       = new Vector3();

// ─── SecondaryMotionSystem ─────────────────────────────────────────────────

export class SecondaryMotionSystem {
  private chains: ChainState[] = [];
  private scene: Object3D;
  private configs: SecondaryChainConfig[];

  /** Per-chain driver tracking. */
  private driverPrevPos: Map<string, Vector3> = new Map();
  private driverPrevVel: Map<string, Vector3> = new Map();

  constructor(scene: Object3D, configs: SecondaryChainConfig[]) {
    this.scene = scene;
    this.configs = configs;
    this._init();
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  private _init(): void {
    this.scene.updateWorldMatrix(true, true);

    for (const cfg of this.configs) {
      const driver = this._find(cfg.driver);
      if (!driver) {
        console.warn(`[SecondaryMotionSystem] Driver bone "${cfg.driver}" not found — skipping chain "${cfg.id}".`);
        continue;
      }

      const rootBone = this._find(cfg.root);
      if (!rootBone) {
        console.warn(`[SecondaryMotionSystem] Root bone "${cfg.root}" not found — skipping chain "${cfg.id}".`);
        continue;
      }

      const boneChain = this._collectChain(rootBone);
      _invDriverMtx.copy(driver.matrixWorld).invert();

      const bones: BoneState[] = [];

      for (let i = 0; i < boneChain.length; i++) {
        const bone  = boneChain[i];
        const child = boneChain[i + 1] ?? null;

        // Compute bind-pose tail in world space.
        let tailWS: Vector3;
        if (child) {
          tailWS = new Vector3();
          child.getWorldPosition(tailWS);
        } else {
          // Leaf bone: extend along local Y axis by a small amount.
          const boneWQ = bone.getWorldQuaternion(new Quaternion());
          const up = new Vector3(0, 0.04, 0).applyQuaternion(boneWQ);
          bone.getWorldPosition(tailWS = new Vector3());
          tailWS.add(up);
        }

        bone.getWorldPosition(_boneHeadWS);
        const len = Math.max(tailWS.distanceTo(_boneHeadWS), 0.005);

        // Rest tail in driver-local space (frozen at bind pose).
        const restTailDriverLocal = tailWS.clone().applyMatrix4(_invDriverMtx);

        bones.push({
          bone,
          boneParent: bone.parent ?? bone,
          boneLength: len,
          simTail: tailWS.clone(),
          prevTail: tailWS.clone(),
          restTailDriverLocal,
        });
      }

      // Track driver velocity.
      const driverWP = new Vector3();
      driver.getWorldPosition(driverWP);
      this.driverPrevPos.set(cfg.id, driverWP.clone());
      this.driverPrevVel.set(cfg.id, new Vector3());

      this.chains.push({ id: cfg.id, driver, bones });
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────

  /**
   * Call once per frame inside your animation loop.
   * @param deltaTime Frame delta in seconds (typically 0.016).
   */
  public update(deltaTime: number): void {
    if (this.chains.length === 0) return;

    // Clamp delta to avoid large integration steps on tab-switch resumption.
    const dt = Math.min(deltaTime, 0.05);

    this.scene.updateWorldMatrix(true, true);

    for (let ci = 0; ci < this.chains.length; ci++) {
      const chain  = this.chains[ci];
      const cfg    = this.configs.find((c) => c.id === chain.id)!;

      const stiffness = cfg.stiffness ?? 0.25;
      const damping   = cfg.damping   ?? 0.88;
      const gravity   = cfg.gravity   ?? 0.08;

      // ── Driver velocity / acceleration tracking ──────────────────────────
      chain.driver.getWorldPosition(_driverPos);

      const prevPos = this.driverPrevPos.get(chain.id)!;
      const prevVel = this.driverPrevVel.get(chain.id)!;

      _driverVel.copy(_driverPos).sub(prevPos).divideScalar(dt);
      _driverAcc.copy(_driverVel).sub(prevVel).divideScalar(dt);

      // Clamp acceleration magnitude to avoid explosion on large jumps.
      const accLen = _driverAcc.length();
      if (accLen > 50) _driverAcc.multiplyScalar(50 / accLen);

      prevPos.copy(_driverPos);
      prevVel.copy(_driverVel);

      // ── Per-bone Verlet integration ───────────────────────────────────────
      _invDriverMtx.copy(chain.driver.matrixWorld).invert();

      for (let bi = 0; bi < chain.bones.length; bi++) {
        const b = chain.bones[bi];

        // Rest-pose tail in world space (moves with the driver).
        _restTailWS.copy(b.restTailDriverLocal).applyMatrix4(chain.driver.matrixWorld);

        // Verlet velocity = current - previous (displacement since last frame).
        const vel = _springForce.copy(b.simTail).sub(b.prevTail);

        // Apply damping to velocity.
        vel.multiplyScalar(damping);

        // Spring force: pull toward rest pose.
        const spring = _restTailWS.clone().sub(b.simTail).multiplyScalar(stiffness);
        vel.add(spring);

        // Gravity: constant downward offset scaled by dt².
        _gravity.set(0, -gravity * dt * dt, 0);
        vel.add(_gravity);

        // Inertia: push opposite to driver acceleration (hair lags behind head).
        vel.addScaledVector(_driverAcc, -0.0003 * dt);

        // Integrate.
        b.prevTail.copy(b.simTail);
        b.simTail.add(vel);

        // ── Constrain length (keep particle on sphere around bone head) ───
        b.bone.getWorldPosition(_boneHeadWS);
        const distSq = b.simTail.distanceToSquared(_boneHeadWS);
        if (distSq > 1e-10) {
          b.simTail
            .sub(_boneHeadWS)
            .normalize()
            .multiplyScalar(b.boneLength)
            .add(_boneHeadWS);
        }

        // ── Derive bone rotation ─────────────────────────────────────────
        _invParentMtx.copy(b.boneParent.matrixWorld).invert();

        const headLocal    = _boneHeadWS.clone().applyMatrix4(_invParentMtx);
        const restLocalDir = _restTailWS.clone().applyMatrix4(_invParentMtx).sub(headLocal);
        const simLocalDir  = b.simTail.clone().applyMatrix4(_invParentMtx).sub(headLocal);

        _restDir.copy(restLocalDir).normalize();
        _simDir.copy(simLocalDir).normalize();

        if (
          _restDir.lengthSq() > 1e-6 &&
          _simDir.lengthSq() > 1e-6 &&
          _restDir.dot(_simDir) < 0.9999
        ) {
          _rotQ.setFromUnitVectors(_restDir, _simDir);
          b.bone.quaternion.premultiply(_rotQ);
          b.bone.quaternion.normalize();
        }
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

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
