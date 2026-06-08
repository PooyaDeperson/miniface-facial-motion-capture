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
 * useSpringBones.ts — parent-driven Verlet physics
 *
 * Design
 * ──────
 * Each chain entry in avatarMetadata defines a rootBoneName (e.g. "hair_head").
 * The engine:
 *   1. Auto-walks the first-child chain from rootBoneName to the end.
 *   2. Auto-finds the rootBone's scene-graph parent — this is the "velocity
 *      master". Its world-position delta each frame drives the impulse.
 *   3. When the velocity-master is still, parentDelta = 0, so the spring
 *      only damps any remaining oscillation to zero. Hair is perfectly still.
 *   4. When the velocity-master moves (head rotation / translation), the
 *      tail lags behind via Verlet inertia, then the stiffness spring pulls
 *      it back — producing a natural trailing bounce.
 *   5. customVelocity (default zero) injects wind / procedural forces.
 *
 * The rest target (restTailWS) is stored once at bind-pose in world space
 * and then rotated each frame by the parent bone's rotation delta — so it
 * always points in the "correct" resting direction relative to the head,
 * regardless of how the head has turned since bind pose.
 */

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Object3D, Mesh, Vector3, Quaternion, Matrix4 } from "three";

import type { SpringBoneChainConfig, SpringBoneColliderConfig } from "./avatarMetadata";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpringJoint {
  bone: Object3D;
  /** Direct scene-graph parent of this bone — used for world-space conversion. */
  boneParent: Object3D;
  /**
   * The velocity master: the scene-graph parent of the ROOT bone of the whole
   * chain. Same for every joint in a chain. When this node moves, all joints
   * in the chain receive an impulse.
   */
  velocityMaster: Object3D;
  boneLength: number;
  currentTail: Vector3;
  prevTail: Vector3;
  /**
   * Rest tail stored in the velocity-master's LOCAL space at bind pose.
   * Each frame we transform it back to world space via the master's current
   * matrixWorld — so it rotates correctly with the head/neck.
   */
  restTailMasterLocal: Vector3;
  prevMasterWPos: Vector3;
  /** Previous velocity-master world quaternion — to compute rotation delta. */
  prevMasterQuat: Quaternion;
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

// ─── Tuning constants ─────────────────────────────────────────────────────────

/** Minimum parent translation (world units/frame) before any impulse fires.
 *  Kills oscillation from floating-point jitter on a still character. */
const MOTION_THRESHOLD = 0.0004;

/** Max parent-delta magnitude per frame — prevents spikes on tab-restore. */
const MAX_PARENT_DELTA = 0.06;

/** How much of the parent's translation is transferred to the tail as impulse.
 *  0 = hair never follows, 1 = hair follows exactly with no lag. */
const INERTIA_SCALE = 0.14;

// ─── Scratch allocations ──────────────────────────────────────────────────────

const _boneHeadWS   = new Vector3();
const _masterWPos   = new Vector3();
const _masterQuat   = new Quaternion();
const _rotDelta     = new Quaternion();
const _invParentMtx = new Matrix4();
const _restDir      = new Vector3();
const _simDir       = new Vector3();
const _rotQ         = new Quaternion();
const _colCenter    = new Vector3();
const _pushDir      = new Vector3();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findByName(root: Object3D, name: string): Object3D | null {
  let found: Object3D | null = null;
  root.traverse((o) => { if (!found && o.name === name) found = o; });
  return found;
}

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

      const anchor = new Object3D();
      anchor.name = `__springcol_${cfg.meshName}`;
      anchor.position.copy(mesh.position);
      anchor.quaternion.copy(mesh.quaternion);
      (mesh.parent ?? scene).add(anchor);
      mesh.visible = false;

      colliders.push({ node: anchor, radius });
    }

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

  // ── Per-frame update ───────────────────────────────────────────────────────
  useFrame((_, delta) => {
    const state = stateRef.current;
    if (!state) return;

    scene.updateWorldMatrix(true, true);

    // ── First-frame init (world matrices are live here) ────────────────────
    if (needsInit.current) {
      needsInit.current = false;

      const cfgs: SpringBoneChainConfig[] = (stateRef as any)._cfg ?? [];

      for (const cfg of cfgs) {
        const root = findByName(scene, cfg.rootBoneName);
        if (!root) {
          console.warn(`[useSpringBones] Root bone "${cfg.rootBoneName}" not found.`);
          continue;
        }

        // Auto-find velocity master: the direct parent of the root bone.
        // This is e.g. the head/neck bone that drives the hair chain.
        const velocityMaster = root.parent ?? root;

        const chain = collectLinearChain(root);

        for (let i = 0; i < chain.length; i++) {
          const bone  = chain[i];
          const child = chain[i + 1] ?? null;

          // Tail world position at bind pose.
          let tailWS: Vector3;
          if (child) {
            tailWS = new Vector3();
            child.getWorldPosition(tailWS);
          } else {
            // Leaf: extend slightly along bone's world-space Y axis.
            const up = new Vector3(0, 0.04, 0)
              .applyQuaternion(bone.getWorldQuaternion(new Quaternion()));
            bone.getWorldPosition(tailWS = new Vector3());
            tailWS.add(up);
          }

          bone.getWorldPosition(_boneHeadWS);
          const len = tailWS.distanceTo(_boneHeadWS);

          // Store rest tail in velocity-master LOCAL space so it rotates
          // correctly when the head turns.
          const invMaster = new Matrix4().copy(velocityMaster.matrixWorld).invert();
          const restTailMasterLocal = tailWS.clone().applyMatrix4(invMaster);

          const prevMasterWPos = new Vector3();
          velocityMaster.getWorldPosition(prevMasterWPos);

          const prevMasterQuat = new Quaternion();
          velocityMaster.getWorldQuaternion(prevMasterQuat);

          state.joints.push({
            bone,
            boneParent:          bone.parent ?? bone,
            velocityMaster,
            boneLength:          len > 0.0001 ? len : 0.04,
            currentTail:         tailWS.clone(),
            prevTail:            tailWS.clone(),
            restTailMasterLocal,
            prevMasterWPos,
            prevMasterQuat,
            stiffness:  cfg.settings?.stiffness    ?? 0.08,
            drag:       cfg.settings?.dragForce    ?? 0.06,
            customVelocity: cfg.settings?.customVelocity?.clone() ?? new Vector3(),
          });
        }
      }
    }

    if (state.joints.length === 0) return;

    const dt = Math.min(delta, 1 / 30);

    for (const j of state.joints) {

      // ── 1. Velocity master: translation delta ──────────────────────────
      j.velocityMaster.getWorldPosition(_masterWPos);
      const rawDelta = _masterWPos.clone().sub(j.prevMasterWPos);
      j.prevMasterWPos.copy(_masterWPos);

      const rawMag = rawDelta.length();
      const clampedMag = Math.min(rawMag, MAX_PARENT_DELTA);
      const effectiveMag = rawMag > MOTION_THRESHOLD
        ? clampedMag * INERTIA_SCALE
        : 0;
      const translationImpulse = rawMag > MOTION_THRESHOLD
        ? rawDelta.clone().normalize().multiplyScalar(effectiveMag)
        : new Vector3();

      // ── 2. Velocity master: rotation delta ────────────────────────────
      //    Rotate the rest target and the current tail by the master's
      //    rotation delta — this way the rest pose "turns with the head".
      j.velocityMaster.getWorldQuaternion(_masterQuat);
      _rotDelta.copy(j.prevMasterQuat).invert().premultiply(_masterQuat);
      j.prevMasterQuat.copy(_masterQuat);

      // Apply rotation delta to both the rest local store and the current tail
      // so the whole chain pivots with the head without generating fake velocity.
      // We rotate around the velocity master's world position.
      const masterPos = _masterWPos.clone();

      // Rotate currentTail around masterPos by rotDelta.
      j.currentTail.sub(masterPos).applyQuaternion(_rotDelta).add(masterPos);
      j.prevTail.sub(masterPos).applyQuaternion(_rotDelta).add(masterPos);

      // ── 3. Rest tail in world space (master-local → world) ────────────
      const restTailWS = j.restTailMasterLocal.clone()
        .applyMatrix4(j.velocityMaster.matrixWorld);

      // ── 4. Verlet: preserve velocity with drag ────────────────────────
      const vel = j.currentTail.clone()
        .sub(j.prevTail)
        .multiplyScalar(1 - j.drag);

      // ── 5. Stiffness spring toward rest ───────────────────────────────
      const stiff = restTailWS.clone()
        .sub(j.currentTail)
        .multiplyScalar(j.stiffness * dt * 60); // dt-normalised

      // ── 6. Integrate ──────────────────────────────────────────────────
      const next = j.currentTail.clone()
        .add(translationImpulse)
        .add(vel)
        .add(stiff)
        .add(j.customVelocity.clone().multiplyScalar(dt));

      // ── 7. Length constraint ──────────────────────────────────────────
      j.bone.getWorldPosition(_boneHeadWS);
      const toTail = next.clone().sub(_boneHeadWS);
      if (toTail.lengthSq() < 1e-8) toTail.set(0, 1, 0);
      const constrained = _boneHeadWS.clone()
        .addScaledVector(toTail.normalize(), j.boneLength);

      // ── 8. Sphere collider push-out ───────────────────────────────────
      for (const col of state.colliders) {
        col.node.getWorldPosition(_colCenter);
        _pushDir.copy(constrained).sub(_colCenter);
        const d = _pushDir.length();
        const minD = col.radius + 0.01;
        if (d < minD) {
          constrained.copy(_colCenter)
            .addScaledVector(_pushDir.normalize(), minD);
          j.bone.getWorldPosition(_boneHeadWS);
          constrained.copy(
            _boneHeadWS.clone().addScaledVector(
              constrained.clone().sub(_boneHeadWS).normalize(),
              j.boneLength
            )
          );
        }
      }

      // ── 9. Bone rotation ──────────────────────────────────────────────
      if (j.boneParent) {
        _invParentMtx.copy(j.boneParent.matrixWorld).invert();

        const headLocal    = _boneHeadWS.clone().applyMatrix4(_invParentMtx);
        const restLocalDir = restTailWS.clone().applyMatrix4(_invParentMtx).sub(headLocal);
        const simLocalDir  = constrained.clone().applyMatrix4(_invParentMtx).sub(headLocal);

        _restDir.copy(restLocalDir).normalize();
        _simDir.copy(simLocalDir).normalize();

        if (_restDir.lengthSq() > 1e-6 && _simDir.lengthSq() > 1e-6) {
          _rotQ.setFromUnitVectors(_restDir, _simDir);
          j.bone.quaternion.premultiply(_rotQ);
        }
      }

      // ── 10. Advance Verlet state ──────────────────────────────────────
      j.prevTail.copy(j.currentTail);
      j.currentTail.copy(constrained);
    }
  });
}
