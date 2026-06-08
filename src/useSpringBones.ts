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
 * Custom Verlet spring simulation for GLB skeleton bones.
 *
 * The @pixiv/three-vrm-springbone library is designed for VRM files where it
 * owns the entire matrix pipeline. For raw GLB skeleton bones (matrixAutoUpdate=false),
 * bone.localToWorld() returns garbage because matrixWorld is never updated by Three.js.
 * This implementation bypasses the library entirely and works directly in world space
 * using Object3D.getWorldPosition() and quaternion math.
 *
 * Algorithm (per joint, per frame):
 *   1. Get the bone's current world position (parent drives this via skeleton).
 *   2. Integrate Verlet: nextTail = currentTail + velocity + gravity + stiffness_force.
 *   3. Normalize to preserve bone length.
 *   4. Collide against registered sphere colliders.
 *   5. Derive the rotation quaternion from (restDir → simulatedDir) and apply
 *      it on top of the bone's existing rotation.
 */

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Object3D,
  Mesh,
  Vector3,
  Quaternion,
  Matrix4,
} from "three";

import type { SpringBoneChainConfig, SpringBoneColliderConfig } from "./avatarMetadata";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpringJoint {
  bone: Object3D;
  child: Object3D | null;
  /** Length of this bone segment in world units. */
  boneLength: number;
  /** Current tail position in world space (Verlet particle). */
  currentTail: Vector3;
  /** Previous tail position (for velocity). */
  prevTail: Vector3;
  /** Rest-pose tail position in world space (spring target). */
  restTail: Vector3;
  /** Physics settings. */
  stiffness: number;
  dragForce: number;
  gravityPower: number;
  gravityDir: Vector3;
}

interface SphereCollider {
  /** The Object3D the collider is attached to — its world position is the center. */
  node: Object3D;
  radius: number;
}

interface SpringState {
  joints: SpringJoint[];
  colliders: SphereCollider[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findByName(root: Object3D, name: string): Object3D | null {
  let found: Object3D | null = null;
  root.traverse((obj) => { if (!found && obj.name === name) found = obj; });
  return found;
}

/**
 * Walk the bone chain starting at root, following the first child at each level.
 * Returns every bone in order: [root, child, grandchild, ...].
 */
function collectChain(root: Object3D): Object3D[] {
  const chain: Object3D[] = [];
  let current: Object3D | null = root;
  while (current) {
    chain.push(current);
    current = current.children[0] ?? null;
  }
  return chain;
}

const _worldPos = new Vector3();
const _parentWorldPos = new Vector3();
const _invParentWorld = new Matrix4();
const _restDir = new Vector3();
const _simDir = new Vector3();
const _rotQuat = new Quaternion();
const _colliderCenter = new Vector3();
const _toTail = new Vector3();

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
  const stateRef = useRef<SpringState | null>(null);
  const needsInitRef = useRef(false);

  useEffect(() => {
    if (springBoneConfigs.length === 0 && colliderConfigs.length === 0) return;

    // ── 1. Build sphere colliders ──────────────────────────────────────────
    const colliders: SphereCollider[] = [];

    for (const cfg of colliderConfigs) {
      const meshObj = findByName(scene, cfg.meshName);
      if (!meshObj) {
        console.warn(`[useSpringBones] Collider mesh "${cfg.meshName}" not found — skipping.`);
        continue;
      }
      const mesh = meshObj as Mesh;
      if (mesh.geometry) mesh.geometry.computeBoundingSphere();
      const radius = mesh.geometry?.boundingSphere?.radius ?? 0.1;

      // Create an invisible anchor Object3D at the mesh's world position
      // that we can query each frame with getWorldPosition().
      const anchor = new Object3D();
      anchor.name = `__collider_${cfg.meshName}`;
      const parent = mesh.parent ?? scene;
      anchor.position.copy(mesh.position);
      anchor.quaternion.copy(mesh.quaternion);
      parent.add(anchor);

      mesh.visible = false;
      colliders.push({ node: anchor, radius });
      console.log(`[v0] collider "${cfg.meshName}" radius=${radius.toFixed(3)}`);
    }

    // ── 2. Build joints — deferred until first frame for world matrices ────
    const state: SpringState = { joints: [], colliders };
    stateRef.current = state;
    needsInitRef.current = true;

    // Store configs so the first-frame init can build joints after renderer runs.
    (stateRef as any)._pendingConfigs = springBoneConfigs;

    return () => {
      // Restore collider meshes.
      for (const cfg of colliderConfigs) {
        const meshObj = findByName(scene, cfg.meshName);
        if (meshObj) meshObj.visible = true;

        const anchor = findByName(scene, `__collider_${cfg.meshName}`);
        if (anchor?.parent) anchor.parent.remove(anchor);
      }
      stateRef.current = null;
    };
  }, [scene, springBoneConfigs, colliderConfigs]);

  const frameCountRef = useRef(0);

  useFrame((_, delta) => {
    const state = stateRef.current;
    if (!state) return;

    // ── First frame: build joints now that world matrices are valid ────────
    if (needsInitRef.current) {
      needsInitRef.current = false;
      scene.updateWorldMatrix(true, true);

      const pendingConfigs: SpringBoneChainConfig[] = (stateRef as any)._pendingConfigs ?? [];

      for (const cfg of pendingConfigs) {
        const rootBone = findByName(scene, cfg.rootBoneName);
        if (!rootBone) {
          console.warn(`[useSpringBones] Bone "${cfg.rootBoneName}" not found — skipping.`);
          continue;
        }

        const chain = collectChain(rootBone);

        for (let i = 0; i < chain.length; i++) {
          const bone = chain[i];
          const child = chain[i + 1] ?? null;

          // Compute tail world position: if there's a child bone, use its
          // world position. For leaf bones, extrapolate along the parent's
          // local Y axis by a small offset.
          let tailWorld: Vector3;
          if (child) {
            tailWorld = new Vector3();
            child.getWorldPosition(tailWorld);
          } else {
            // Leaf: extend 0.04 units along the bone's world-space up axis.
            const up = new Vector3(0, 0.04, 0).applyQuaternion(bone.getWorldQuaternion(new Quaternion()));
            tailWorld = new Vector3();
            bone.getWorldPosition(tailWorld);
            tailWorld.add(up);
          }

          bone.getWorldPosition(_worldPos);
          const boneLength = tailWorld.distanceTo(_worldPos);

          const joint: SpringJoint = {
            bone,
            child,
            boneLength: boneLength > 0.0001 ? boneLength : 0.04,
            currentTail: tailWorld.clone(),
            prevTail: tailWorld.clone(),
            restTail: tailWorld.clone(),
            stiffness: cfg.settings?.stiffness ?? 1.0,
            dragForce: cfg.settings?.dragForce ?? 0.4,
            gravityPower: cfg.settings?.gravityPower ?? 0.3,
            gravityDir: cfg.settings?.gravityDir?.clone() ?? new Vector3(0, -1, 0),
          };

          state.joints.push(joint);
        }
      }

      console.log(`[v0] spring joints initialised: ${state.joints.length}, colliders: ${state.colliders.length}`);
      // Log first joint to confirm non-zero values.
      if (state.joints[0]) {
        const j = state.joints[0];
        console.log(`[v0] first joint "${j.bone.name}" boneLength=${j.boneLength.toFixed(4)} tail=${j.currentTail.x.toFixed(4)},${j.currentTail.y.toFixed(4)},${j.currentTail.z.toFixed(4)}`);
      }
    }

    if (state.joints.length === 0) return;

    // ── Per-frame Verlet integration ───────────────────────────────────────
    const dt = Math.min(delta, 0.033); // clamp to 30 fps minimum

    scene.updateWorldMatrix(true, true);

    for (const joint of state.joints) {
      const { bone, boneLength, stiffness, dragForce, gravityPower, gravityDir } = joint;

      // Velocity from previous frame (Verlet).
      const velocity = joint.currentTail.clone().sub(joint.prevTail).multiplyScalar(1 - dragForce);

      // Gravity contribution.
      const gravity = gravityDir.clone().multiplyScalar(gravityPower * dt);

      // Stiffness: pull toward rest pose.
      const stiffForce = joint.restTail.clone().sub(joint.currentTail).multiplyScalar(stiffness * dt);

      // Integrate.
      const nextTail = joint.currentTail.clone().add(velocity).add(gravity).add(stiffForce);

      // Constrain: keep tail at fixed distance from bone head (preserve bone length).
      bone.getWorldPosition(_worldPos);
      const dir = nextTail.sub(_worldPos).normalize();
      const constrainedTail = _worldPos.clone().addScaledVector(dir, boneLength);

      // ── Sphere collision ─────────────────────────────────────────────────
      for (const col of state.colliders) {
        col.node.getWorldPosition(_colliderCenter);
        _toTail.copy(constrainedTail).sub(_colliderCenter);
        const dist = _toTail.length();
        const minDist = col.radius + 0.01;
        if (dist < minDist) {
          // Push tail outside the collider sphere.
          constrainedTail.copy(_colliderCenter).addScaledVector(_toTail.normalize(), minDist);
          // Re-constrain to bone length after push.
          bone.getWorldPosition(_worldPos);
          constrainedTail.copy(_worldPos).addScaledVector(
            constrainedTail.clone().sub(_worldPos).normalize(),
            boneLength
          );
        }
      }

      // ── Apply rotation to bone ─────────────────────────────────────────
      // restDir: direction from bone head → rest tail, in parent-local space.
      // simDir:  direction from bone head → simulated tail, in parent-local space.
      if (bone.parent) {
        bone.parent.getWorldPosition(_parentWorldPos);
        _invParentWorld.copy(bone.parent.matrixWorld).invert();

        // Transform tail positions into parent-local space.
        const restLocal = joint.restTail.clone().applyMatrix4(_invParentWorld);
        const headLocal = _worldPos.clone().applyMatrix4(_invParentWorld);
        const simLocal = constrainedTail.clone().applyMatrix4(_invParentWorld);

        _restDir.copy(restLocal).sub(headLocal).normalize();
        _simDir.copy(simLocal).sub(headLocal).normalize();

        if (_restDir.lengthSq() > 0.0001 && _simDir.lengthSq() > 0.0001) {
          _rotQuat.setFromUnitVectors(_restDir, _simDir);
          bone.quaternion.copy(bone.quaternion).premultiply(_rotQuat);
        }
      }

      // Store state for next frame.
      joint.prevTail.copy(joint.currentTail);
      joint.currentTail.copy(constrainedTail);

      // Update restTail each frame to follow the animated skeleton pose.
      if (joint.child) {
        joint.child.getWorldPosition(joint.restTail);
      }
    }

    // Debug: log first joint every 5 frames for first second.
    frameCountRef.current++;
    if (frameCountRef.current <= 60 && frameCountRef.current % 5 === 0) {
      const j = state.joints[0];
      if (j) {
        const q = j.bone.quaternion;
        console.log(`[v0] frame ${frameCountRef.current} "${j.bone.name}" quat: ${q.x.toFixed(4)} ${q.y.toFixed(4)} ${q.z.toFixed(4)} ${q.w.toFixed(4)} | tail: ${j.currentTail.x.toFixed(4)},${j.currentTail.y.toFixed(4)},${j.currentTail.z.toFixed(4)}`);
      }
    }
  });
}
