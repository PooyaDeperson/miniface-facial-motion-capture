/*
 * Copyright (c) 2025 Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 *
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative works:
 * "Created by Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson"
 */

/**
 * useSpringBones.ts — parent-driven Verlet hair physics
 *
 * Core idea
 * ─────────
 * Hair should only move when its parent bone moves. Instead of applying
 * gravity or external forces every frame (which causes constant oscillation
 * even on a still character), we:
 *
 *   1. Track the parent bone's world position each frame.
 *   2. Compute `parentDelta` = how far the parent moved since last frame.
 *   3. Inertia keeps the tail lagging behind: nextTail advances by the full
 *      parentDelta but the tail carries only `(1 - drag)` of its own velocity.
 *      This makes the hair "trail" behind fast head motion.
 *   4. A weak stiffness spring pulls the tail back toward the rest pose
 *      relative to the current parent position. When the parent is still,
 *      this spring slowly damps any remaining oscillation to zero.
 *   5. An optional `customVelocity` per-chain can inject wind / procedural
 *      forces; set to (0,0,0) to disable (the default).
 *
 * No gravity by default — gravity-like droop comes naturally from the
 * rest pose which was captured in bind pose (already includes bone offsets).
 *
 * Result: hair is perfectly still when the character is still, and reacts
 * with trailing inertia only when the head/parent bone actually moves.
 */

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Object3D, Mesh, Vector3, Quaternion, Matrix4 } from "three";

import type { SpringBoneChainConfig, SpringBoneColliderConfig } from "./avatarMetadata";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpringJoint {
  bone: Object3D;
  /** Immediate parent bone — the node whose movement drives this joint. */
  parentBone: Object3D;
  /** Bone-segment length in world units, fixed at init. */
  boneLength: number;
  /** Current simulated tail world position. */
  currentTail: Vector3;
  /** Previous tail world position (Verlet velocity source). */
  prevTail: Vector3;
  /**
   * Rest tail offset in parent-LOCAL space, captured at bind pose.
   * Stored as a local offset so it correctly follows the parent bone as
   * it rotates — the stiffness spring pulls toward this point in world space.
   */
  restTailLocal: Vector3;
  /** Previous parent world position — used to compute parentDelta each frame. */
  prevParentWPos: Vector3;
  stiffness: number;
  drag: number;
  customVelocity: Vector3;
}

interface SphereCollider {
  node: Object3D;
  radius: number;
}

interface SpringState {
  joints: SpringJoint[];
  colliders: SphereCollider[];
}

// ─── Physics constants ────────────────────────────────────────────────────────

/** Minimum parent movement (world units) before any impulse is applied.
 *  Filters out floating-point noise on a still character. */
const MOTION_THRESHOLD = 0.0005;

/** Maximum parent delta magnitude per frame — prevents spike on tab restore. */
const MAX_PARENT_DELTA = 0.08;

/** Scales the parent delta before adding to the tail.
 *  < 1 = tail lags more (subtler), 1 = tail follows exactly. */
const INERTIA_SCALE = 0.18;

const _boneHeadWS    = new Vector3();
const _parentWPos    = new Vector3();
const _invParentMtx  = new Matrix4();
const _restDir       = new Vector3();
const _simDir        = new Vector3();
const _rotDelta      = new Quaternion();
const _colCenter     = new Vector3();
const _pushDir       = new Vector3();

// ─── Scene helpers ────────────────────────────────────────────────────────────

function findByName(root: Object3D, name: string): Object3D | null {
  let found: Object3D | null = null;
  root.traverse((o) => { if (!found && o.name === name) found = o; });
  return found;
}

/** Walk the first-child chain from root, collecting every node. */
function collectLinearChain(root: Object3D): Object3D[] {
  const chain: Object3D[] = [];
  let cur: Object3D | null = root;
  while (cur) {
    chain.push(cur);
    cur = cur.children[0] ?? null;
  }
  return chain;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseSpringBonesOptions {
  scene: Object3D;
  springBoneConfigs: SpringBoneChainConfig[];
  colliderConfigs: SpringBoneColliderConfig[];
}

export function useSpringBones({
  scene,
  springBoneConfigs,
  colliderConfigs,
}: UseSpringBonesOptions): void {
  const stateRef  = useRef<SpringState | null>(null);
  const needsInit = useRef(false);

  useEffect(() => {
    if (springBoneConfigs.length === 0 && colliderConfigs.length === 0) return;

    // ── Colliders ──────────────────────────────────────────────────────────
    const colliders: SphereCollider[] = [];

    for (const cfg of colliderConfigs) {
      const meshObj = findByName(scene, cfg.meshName);
      if (!meshObj) {
        console.warn(`[useSpringBones] Collider mesh "${cfg.meshName}" not found.`);
        continue;
      }
      const mesh = meshObj as Mesh;
      if (mesh.geometry) mesh.geometry.computeBoundingSphere();
      const radius = mesh.geometry?.boundingSphere?.radius ?? 0.1;

      // Anchor parented to the same node as the mesh so it moves with the head.
      const anchor = new Object3D();
      anchor.name = `__springcol_${cfg.meshName}`;
      anchor.position.copy(mesh.position);
      anchor.quaternion.copy(mesh.quaternion);
      (mesh.parent ?? scene).add(anchor);
      mesh.visible = false;

      colliders.push({ node: anchor, radius });
    }

    // Joints are built on the first useFrame tick when world matrices are live.
    stateRef.current = { joints: [], colliders };
    (stateRef as any)._cfg = springBoneConfigs;
    needsInit.current = true;

    return () => {
      for (const cfg of colliderConfigs) {
        const m = findByName(scene, cfg.meshName);
        if (m) m.visible = true;
        const a = findByName(scene, `__springcol_${cfg.meshName}`);
        if (a?.parent) a.parent.remove(a);
      }
      stateRef.current = null;
    };
  }, [scene, springBoneConfigs, colliderConfigs]);

  // ── Per-frame Verlet update ──────────────────────────────────────────────
  const debugTimer = useRef(0);
  useFrame((_, delta) => {
    const state = stateRef.current;
    if (!state) return;

    // Refresh world matrices so getWorldPosition reads the live skeleton pose.
    scene.updateWorldMatrix(true, true);

    // ── First-frame init: world matrices are valid now ─────────────────────
    if (needsInit.current) {
      needsInit.current = false;

      const cfgs: SpringBoneChainConfig[] = (stateRef as any)._cfg ?? [];

      for (const cfg of cfgs) {
        const root = findByName(scene, cfg.rootBoneName);
        if (!root) {
          console.warn(`[useSpringBones] Root bone "${cfg.rootBoneName}" not found.`);
          continue;
        }

        const chain = collectLinearChain(root);

        for (let i = 0; i < chain.length; i++) {
          const bone   = chain[i];
          const child  = chain[i + 1] ?? null;

          // The parent bone is the direct scene-graph parent of this bone.
          // For the root bone of the chain this is the head/neck bone.
          const parentBone = bone.parent ?? bone;

          // Compute the tail world position in bind pose.
          let tailWS: Vector3;
          if (child) {
            tailWS = new Vector3();
            child.getWorldPosition(tailWS);
          } else {
            // Leaf bone: extend slightly along the bone's local Y axis.
            tailWS = new Vector3();
            bone.getWorldPosition(tailWS);
            const up = new Vector3(0, 0.04, 0)
              .applyQuaternion(bone.getWorldQuaternion(new Quaternion()));
            tailWS.add(up);
          }

          // Bone head world position.
          bone.getWorldPosition(_boneHeadWS);
          const len = tailWS.distanceTo(_boneHeadWS);

          // Store rest tail in parent-LOCAL space so that when the parent
          // rotates, restTailLocal rotates with it and always points "correctly"
          // relative to the bone head — giving the hair a natural resting
          // direction instead of always pulling toward a fixed world point.
          _invParentMtx.copy(parentBone.matrixWorld).invert();
          const restTailLocal = tailWS.clone().applyMatrix4(_invParentMtx);

          // Parent world position at init.
          const prevParentWPos = new Vector3();
          parentBone.getWorldPosition(prevParentWPos);

          state.joints.push({
            bone,
            parentBone,
            boneLength:    len > 0.0001 ? len : 0.04,
            currentTail:   tailWS.clone(),
            prevTail:      tailWS.clone(),
            restTailLocal,
            prevParentWPos,
            stiffness:     cfg.settings?.stiffness    ?? 0.08,
            drag:          cfg.settings?.dragForce    ?? 0.06,
            customVelocity: cfg.settings?.customVelocity?.clone() ?? new Vector3(0, 0, 0),
          });
        }
      }
    }

    if (state.joints.length === 0) return;

    // Clamp dt to prevent explosion on tab-focus restore.
    const dt = Math.min(delta, 1 / 30);

    // Debug: log first joint's parentDelta once per second.
    debugTimer.current += dt;
    const shouldLog = debugTimer.current >= 1.0;
    if (shouldLog) debugTimer.current = 0;

    for (const j of state.joints) {
      // ── 1. Parent delta — how far did the parent bone move this frame? ──
      j.parentBone.getWorldPosition(_parentWPos);
      const rawDelta = _parentWPos.clone().sub(j.prevParentWPos);
      j.prevParentWPos.copy(_parentWPos);

      // Filter floating-point noise: ignore sub-threshold movement.
      const rawMag = rawDelta.length();
      if (shouldLog && j === state.joints[0]) {
        console.log(`[v0] parentDelta raw=${rawMag.toFixed(6)} | vel=${j.currentTail.clone().sub(j.prevTail).length().toFixed(6)} | stiffness=${j.stiffness} | drag=${j.drag}`);
      }

      // Clamp and scale the delta so even large head moves produce subtle hair motion.
      const clampedMag = Math.min(rawMag, MAX_PARENT_DELTA);
      const effectiveMag = rawMag > MOTION_THRESHOLD ? clampedMag * INERTIA_SCALE : 0;
      const parentDelta = rawMag > MOTION_THRESHOLD
        ? rawDelta.clone().normalize().multiplyScalar(effectiveMag)
        : new Vector3(0, 0, 0);

      // ── 2. Verlet inertia — tail velocity from last frame, damped ────────
      //    The tail carries its previous velocity minus drag. When the parent
      //    moves, the tail "lags" behind because it only sees the parent delta
      //    applied later (step 4), not the velocity from stiffness alone.
      const vel = j.currentTail.clone()
        .sub(j.prevTail)
        .multiplyScalar(1 - j.drag);

      // ── 3. Stiffness: pull toward rest pose in world space ────────────────
      //    restTailLocal is in parent-local space — convert back to world so
      //    it correctly follows the parent bone's current orientation.
      const restTailWS = j.restTailLocal.clone().applyMatrix4(j.parentBone.matrixWorld);
      const stiff = restTailWS.clone()
        .sub(j.currentTail)
        .multiplyScalar(j.stiffness * dt);

      // ── 4. Integrate: tail moves with parent + carries its own velocity ───
      //    parentDelta brings the tail along with the head movement.
      //    vel is the lagging inertia — the "trailing" effect.
      //    stiff slowly damps the tail back to rest when parent is still.
      //    customVelocity injects external forces (wind, etc.).
      let next = j.currentTail.clone()
        .add(parentDelta)   // follow the parent bone exactly…
        .add(vel)           // …but tail velocity lags behind
        .add(stiff)         // spring back to rest orientation
        .add(j.customVelocity.clone().multiplyScalar(dt));

      // ── 5. Length constraint — keep tail at fixed bone-length from head ───
      j.bone.getWorldPosition(_boneHeadWS);
      const toTail = next.clone().sub(_boneHeadWS);
      if (toTail.lengthSq() < 1e-8) toTail.set(0, 1, 0);
      toTail.normalize();
      const constrained = _boneHeadWS.clone().addScaledVector(toTail, j.boneLength);

      // ── 6. Sphere collider push-out ───────────────────────────────────────
      for (const col of state.colliders) {
        col.node.getWorldPosition(_colCenter);
        _pushDir.copy(constrained).sub(_colCenter);
        const d = _pushDir.length();
        const minD = col.radius + 0.01;
        if (d < minD) {
          constrained.copy(_colCenter).addScaledVector(_pushDir.normalize(), minD);
          // Re-apply length constraint after push-out.
          j.bone.getWorldPosition(_boneHeadWS);
          constrained.copy(
            _boneHeadWS.clone().addScaledVector(
              constrained.clone().sub(_boneHeadWS).normalize(),
              j.boneLength
            )
          );
        }
      }

      // ── 7. Bone rotation: align bone from rest direction to simulated dir ─
      //    Compute everything in parent-local space so the delta composes
      //    cleanly on top of whatever the animation mixer already set.
      if (j.bone.parent) {
        _invParentMtx.copy(j.bone.parent.matrixWorld).invert();

        const headLocal     = _boneHeadWS.clone().applyMatrix4(_invParentMtx);
        const restLocalWS   = restTailWS.clone().applyMatrix4(_invParentMtx);
        const simLocal      = constrained.clone().applyMatrix4(_invParentMtx);

        _restDir.copy(restLocalWS).sub(headLocal).normalize();
        _simDir.copy(simLocal).sub(headLocal).normalize();

        if (_restDir.lengthSq() > 1e-6 && _simDir.lengthSq() > 1e-6) {
          _rotDelta.setFromUnitVectors(_restDir, _simDir);
          j.bone.quaternion.premultiply(_rotDelta);
        }
      }

      // ── 8. Advance Verlet state ───────────────────────────────────────────
      j.prevTail.copy(j.currentTail);
      j.currentTail.copy(constrained);
    }
  });
}
