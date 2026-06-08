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
 * useSpringBones.ts
 *
 * Custom world-space Verlet spring simulation for GLB skeleton bones.
 *
 * Why custom: @pixiv/three-vrm-springbone is designed for VRM files where it
 * owns the full matrix pipeline. Raw GLB skeleton bones have matrixAutoUpdate=false,
 * so bone.localToWorld() silently returns origin. This implementation reads
 * bone world positions via getWorldPosition() and writes rotation deltas via
 * quaternion math — fully bypassing the broken matrix path.
 *
 * Physics model (per joint, per frame):
 *   velocity  = (currentTail - prevTail) * (1 - drag)      -- Verlet inertia
 *   gravity   = gravityDir * gravityPower * dt
 *   stiffness = (bindRestTail - currentTail) * stiffness * dt  -- pulls back to bind pose
 *   nextTail  = currentTail + velocity + gravity + stiffness
 *   nextTail  = boneHead + normalize(nextTail - boneHead) * boneLength  -- length constraint
 *
 * Key design choices:
 *   - restTail is the BIND-POSE tail (frozen at init). Updating it every frame
 *     would eliminate inertia and make hair snap back instantly with no bounce.
 *   - stiffness ~0.05–0.15: low values give natural momentum and oscillation.
 *   - drag ~0.05–0.12: low values preserve velocity so hair swings naturally.
 *   - gravityPower ~0.1–0.25: enough to give visible droop without dominating.
 *   - dt is clamped to 1/30 s to prevent explosion on tab focus restore.
 */

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Object3D, Mesh, Vector3, Quaternion, Matrix4 } from "three";

import type { SpringBoneChainConfig, SpringBoneColliderConfig } from "./avatarMetadata";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpringJoint {
  bone: Object3D;
  /** Bone-segment length in world units, fixed at init. */
  boneLength: number;
  /** Current simulated tail world position. */
  currentTail: Vector3;
  /** Previous tail world position (Verlet velocity source). */
  prevTail: Vector3;
  /** Bind-pose tail world position — the spring target, never updated. */
  restTail: Vector3;
  stiffness: number;
  drag: number;
  gravityPower: number;
  gravityDir: Vector3;
}

interface SphereCollider {
  node: Object3D;
  radius: number;
}

interface SpringState {
  joints: SpringJoint[];
  colliders: SphereCollider[];
}

// ─── Shared scratch vectors (avoid per-frame allocations) ────────────────────

const _boneHead   = new Vector3();
const _parentWPos = new Vector3();
const _invParent  = new Matrix4();
const _restDir    = new Vector3();
const _simDir     = new Vector3();
const _rotDelta   = new Quaternion();
const _colCenter  = new Vector3();
const _push       = new Vector3();

// ─── Scene helpers ────────────────────────────────────────────────────────────

function findByName(root: Object3D, name: string): Object3D | null {
  let found: Object3D | null = null;
  root.traverse((o) => { if (!found && o.name === name) found = o; });
  return found;
}

/** Walk first-child chain from root, collecting every node. */
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
  const stateRef    = useRef<SpringState | null>(null);
  const needsInit   = useRef(false);

  useEffect(() => {
    if (springBoneConfigs.length === 0 && colliderConfigs.length === 0) return;

    // ── Colliders ──────────────────────────────────────────────────────────
    const colliders: SphereCollider[] = [];

    for (const cfg of colliderConfigs) {
      const meshObj = findByName(scene, cfg.meshName);
      if (!meshObj) {
        console.warn(`[useSpringBones] Collider "${cfg.meshName}" not found.`);
        continue;
      }
      const mesh = meshObj as Mesh;
      if (mesh.geometry) mesh.geometry.computeBoundingSphere();
      const radius = mesh.geometry?.boundingSphere?.radius ?? 0.1;

      // Invisible anchor parented to the same node as the mesh so it
      // inherits the head-bone transform automatically.
      const anchor = new Object3D();
      anchor.name = `__springcol_${cfg.meshName}`;
      anchor.position.copy(mesh.position);
      anchor.quaternion.copy(mesh.quaternion);
      (mesh.parent ?? scene).add(anchor);
      mesh.visible = false;

      colliders.push({ node: anchor, radius });
    }

    // Joints are built on the first useFrame tick once world matrices are live.
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

  useFrame((_, delta) => {
    const state = stateRef.current;
    if (!state) return;

    // ── First-frame init — world matrices are valid now ────────────────────
    if (needsInit.current) {
      needsInit.current = false;
      scene.updateWorldMatrix(true, true);

      const cfgs: SpringBoneChainConfig[] = (stateRef as any)._cfg ?? [];

      for (const cfg of cfgs) {
        const root = findByName(scene, cfg.rootBoneName);
        if (!root) continue;

        const chain = collectLinearChain(root);

        for (let i = 0; i < chain.length; i++) {
          const bone  = chain[i];
          const next  = chain[i + 1] ?? null;

          // Tail world position: child bone's origin, or a small forward offset
          // along the bone's up axis for leaf bones.
          let tailWS: Vector3;
          if (next) {
            tailWS = new Vector3();
            next.getWorldPosition(tailWS);
          } else {
            const up = new Vector3(0, 0.04, 0)
              .applyQuaternion(bone.getWorldQuaternion(new Quaternion()));
            tailWS = new Vector3();
            bone.getWorldPosition(tailWS);
            tailWS.add(up);
          }

          bone.getWorldPosition(_boneHead);
          const len = tailWS.distanceTo(_boneHead);

          state.joints.push({
            bone,
            boneLength:  len > 0.0001 ? len : 0.04,
            currentTail: tailWS.clone(),
            prevTail:    tailWS.clone(),
            // restTail is frozen here — never updated so spring has something
            // to pull toward, producing oscillation rather than instant snap.
            restTail:    tailWS.clone(),
            stiffness:   cfg.settings?.stiffness   ?? 0.08,
            drag:        cfg.settings?.dragForce   ?? 0.06,
            gravityPower: cfg.settings?.gravityPower ?? 0.15,
            gravityDir:  cfg.settings?.gravityDir?.clone() ?? new Vector3(0, -1, 0),
          });
        }
      }
    }

    if (state.joints.length === 0) return;

    // ── Verlet integration ─────────────────────────────────────────────────
    // Clamp dt: prevents explosion when the tab regains focus after being
    // hidden (delta can be several seconds).
    const dt = Math.min(delta, 1 / 30);

    // Refresh world matrices so we read the live animated skeleton pose.
    scene.updateWorldMatrix(true, true);

    for (const j of state.joints) {
      // 1. Inertia: carry velocity from last frame, damped by drag.
      //    Low drag (0.05–0.12) = hair swings freely and oscillates.
      const vel = j.currentTail.clone()
        .sub(j.prevTail)
        .multiplyScalar(1 - j.drag);

      // 2. Gravity: constant downward pull, moderate to give visible droop.
      const grav = j.gravityDir.clone().multiplyScalar(j.gravityPower * dt);

      // 3. Stiffness: weak spring back toward bind-pose rest tail.
      //    Low stiffness (0.05–0.15) = hair bends far and returns slowly.
      const stiff = j.restTail.clone()
        .sub(j.currentTail)
        .multiplyScalar(j.stiffness * dt);

      // 4. Integrate.
      let next = j.currentTail.clone().add(vel).add(grav).add(stiff);

      // 5. Length constraint — keep tail at fixed bone-length from head.
      j.bone.getWorldPosition(_boneHead);
      const dir = next.sub(_boneHead);
      if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0);
      dir.normalize();
      const constrained = _boneHead.clone().addScaledVector(dir, j.boneLength);

      // 6. Sphere collision push-out.
      for (const col of state.colliders) {
        col.node.getWorldPosition(_colCenter);
        _push.copy(constrained).sub(_colCenter);
        const d = _push.length();
        const minD = col.radius + 0.01;
        if (d < minD) {
          constrained.copy(_colCenter).addScaledVector(_push.normalize(), minD);
          // Re-apply length constraint after push.
          j.bone.getWorldPosition(_boneHead);
          const pushDir = constrained.clone().sub(_boneHead).normalize();
          constrained.copy(_boneHead).addScaledVector(pushDir, j.boneLength);
        }
      }

      // 7. Convert tail delta into bone quaternion rotation.
      //    We compute the rotation in the bone's parent-local space so the
      //    result composes naturally on top of the existing skeleton pose.
      if (j.bone.parent) {
        j.bone.parent.getWorldPosition(_parentWPos);
        _invParent.copy(j.bone.parent.matrixWorld).invert();

        const restLocal = j.restTail.clone().applyMatrix4(_invParent);
        const headLocal = _boneHead.clone().applyMatrix4(_invParent);
        const simLocal  = constrained.clone().applyMatrix4(_invParent);

        _restDir.copy(restLocal).sub(headLocal).normalize();
        _simDir.copy(simLocal).sub(headLocal).normalize();

        if (_restDir.lengthSq() > 1e-6 && _simDir.lengthSq() > 1e-6) {
          _rotDelta.setFromUnitVectors(_restDir, _simDir);
          // Premultiply so the delta is applied in parent-local space,
          // leaving the bone's existing animator-set quaternion intact.
          j.bone.quaternion.premultiply(_rotDelta);
        }
      }

      // 8. Advance Verlet state.
      j.prevTail.copy(j.currentTail);
      j.currentTail.copy(constrained);
    }
  });
}
