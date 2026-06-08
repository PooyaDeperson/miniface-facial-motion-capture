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
 * Builds and drives a VRMSpringBoneManager for a loaded GLB scene using
 * the per-avatar metadata defined in avatarMetadata.ts.
 *
 * Setup (runs once per avatar load via useEffect):
 *   1. Walk the scene for each registered collider mesh name ("colonly", etc.).
 *      Compute the mesh's bounding sphere and create a VRMSpringBoneCollider
 *      wrapping a VRMSpringBoneColliderShapeSphere.  The collider Object3D is
 *      attached to the mesh's parent (or scene root) so it follows the mesh in
 *      world space.  The source mesh is hidden (visible = false) — it exists
 *      only to define the collision volume.
 *   2. Build a single shared VRMSpringBoneColliderGroup from all colliders.
 *   3. For each registered spring-bone chain, find the root bone by name.
 *      Walk the root's children to collect the chain as an ordered list of
 *      (bone, child) pairs.  For a leaf bone the child is null.
 *      Each pair becomes a VRMSpringBoneJoint registered with the manager.
 *   4. Call manager.setInitState() to snapshot the rest-pose matrices.
 *
 * Update (runs every frame via useFrame, after the animation mixer):
 *   manager.update(delta) advances the Verlet integration for all joints.
 *
 * Teardown (useEffect cleanup):
 *   manager.reset() clears physics state so the next avatar starts fresh.
 *
 * Edge cases handled:
 *   - Bone not found by name    → warn once, skip chain silently.
 *   - Mesh not found by name    → warn once, skip collider silently.
 *   - Null bounding sphere      → fall back to radius 0.1.
 *   - No spring bones / colliders registered → complete no-op.
 *   - Avatar switch             → cleanup tears down the previous manager.
 */

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Object3D,
  Mesh,
  Vector3,
  Matrix4,
} from "three";
import {
  VRMSpringBoneManager,
  VRMSpringBoneJoint,
  VRMSpringBoneCollider,
  VRMSpringBoneColliderShapeSphere,
} from "@pixiv/three-vrm-springbone";
import type {
  VRMSpringBoneColliderGroup,
} from "@pixiv/three-vrm-springbone";

import type { SpringBoneChainConfig, SpringBoneColliderConfig } from "./avatarMetadata";

// ─── Fallback values ─────────────────────────────────────────────────────────

const FALLBACK_SPHERE_RADIUS = 0.1;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * SkinnedMesh skeleton bones have `.position = (0,0,0)` in the scene graph —
 * their real offsets live only in `bone.matrix` / `bone.matrixWorld`.
 * VRMSpringBoneJoint uses `child.position` to compute the bone axis, so we
 * must copy the world-space offset back into `.position` before registering
 * any joint.  This function walks the chain and writes each bone's
 * world-to-local offset into `.position` so the spring library can read it.
 */
function fixSkinnedBonePositions(root: Object3D): void {
  const _invParent = new Matrix4();
  const _worldPos = new Vector3();
  const _localPos = new Vector3();

  // Apply to ALL nodes — GLB hair bones are often plain Object3D, not Bone.
  root.traverse((obj) => {
    if (!obj.parent) return;

    obj.getWorldPosition(_worldPos);

    // Convert world position to parent-local space.
    _invParent.copy(obj.parent.matrixWorld).invert();
    _localPos.copy(_worldPos).applyMatrix4(_invParent);

    console.log(`[v0] fixBonePos "${obj.name}": world=(${_worldPos.x.toFixed(4)},${_worldPos.y.toFixed(4)},${_worldPos.z.toFixed(4)}) local=(${_localPos.x.toFixed(4)},${_localPos.y.toFixed(4)},${_localPos.z.toFixed(4)})`);

    if (_localPos.length() > 0.0001) {
      obj.position.copy(_localPos);
    }
  });
}

/**
 * Collect all Object3D children of `root` in depth-first order.
 * Returns an array of [bone, child | null] pairs for each joint in the chain.
 * Only the first child of each bone is followed (hair chains are linear).
 * The leaf bone has child = null.
 */
function buildChainPairs(root: Object3D): Array<[Object3D, Object3D | null]> {
  const pairs: Array<[Object3D, Object3D | null]> = [];

  function walk(node: Object3D): void {
    const firstChild = node.children[0] ?? null;
    pairs.push([node, firstChild]);
    if (firstChild) walk(firstChild);
  }

  walk(root);
  return pairs;
}

/**
 * Find a named Object3D anywhere in the scene hierarchy.
 * Returns null if not found.
 */
function findByName(scene: Object3D, name: string): Object3D | null {
  let found: Object3D | null = null;
  scene.traverse((obj) => {
    if (!found && obj.name === name) found = obj;
  });
  return found;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseSpringBonesOptions {
  /** The root scene Object3D from useGLTF. */
  scene: Object3D;
  /** Chain configs from avatarMetadata; empty array = no-op. */
  springBoneConfigs: SpringBoneChainConfig[];
  /** Collider mesh configs from avatarMetadata; empty array = no colliders. */
  colliderConfigs: SpringBoneColliderConfig[];
}

export function useSpringBones({
  scene,
  springBoneConfigs,
  colliderConfigs,
}: UseSpringBonesOptions): void {
  const managerRef = useRef<VRMSpringBoneManager | null>(null);
  const needsInitRef = useRef(false);

  useEffect(() => {
    // Nothing to do if this avatar has no spring-bone configuration.
    if (springBoneConfigs.length === 0 && colliderConfigs.length === 0) return;

    const manager = new VRMSpringBoneManager();
    managerRef.current = manager;

    // ── 1. Build colliders ────────────────────────────────────────────────
    const builtColliders: VRMSpringBoneCollider[] = [];

    for (const cfg of colliderConfigs) {
      const meshObj = findByName(scene, cfg.meshName);

      if (!meshObj) {
        console.warn(`[useSpringBones] Collider mesh "${cfg.meshName}" not found in scene — skipping.`);
        continue;
      }

      const mesh = meshObj as Mesh;
      if (mesh.geometry) {
        mesh.geometry.computeBoundingSphere();
      }

      const boundingSphere = mesh.geometry?.boundingSphere;
      const radius = boundingSphere?.radius ?? FALLBACK_SPHERE_RADIUS;
      // Bounding sphere centre in the mesh's local space — offset from its origin.
      const localCenter = boundingSphere?.center?.clone() ?? new Vector3(0, 0, 0);

      const shape = new VRMSpringBoneColliderShapeSphere({ radius, offset: localCenter });
      const collider = new VRMSpringBoneCollider(shape);

      // Parent the collider to the SAME parent as the collision mesh so it
      // inherits the same world transform (e.g. a head bone). Copy the mesh's
      // local position/rotation/scale exactly so the sphere sits on the mesh.
      const parent = mesh.parent ?? scene;
      collider.position.copy(mesh.position);
      collider.quaternion.copy(mesh.quaternion);
      collider.scale.copy(mesh.scale);
      parent.add(collider);

      // Hide the source mesh — it is only a collision volume.
      mesh.visible = false;

      builtColliders.push(collider);
    }

    // ── 2. Collider group shared by all joints ────────────────────────────
    const colliderGroup: VRMSpringBoneColliderGroup | undefined =
      builtColliders.length > 0
        ? { colliders: builtColliders, name: "avatar_collision" }
        : undefined;

    const colliderGroups = colliderGroup ? [colliderGroup] : [];

    // ── 3. Build joints per chain ─────────────────────────────────────────
    // Force world matrix update so fixSkinnedBonePositions reads correct values.
    scene.updateWorldMatrix(true, true);

    for (const cfg of springBoneConfigs) {
      const rootBone = findByName(scene, cfg.rootBoneName);

      if (!rootBone) {
        console.warn(`[useSpringBones] Root bone "${cfg.rootBoneName}" not found in scene — skipping chain.`);
        continue;
      }

      // Fix skeleton bone .position fields from matrixWorld before the joint
      // reads child.position to compute its bone axis.
      fixSkinnedBonePositions(rootBone);

      const pairs = buildChainPairs(rootBone);
      console.log(`[v0] chain "${cfg.rootBoneName}":`, pairs.map(([b, c]) => `${b.name}(pos:${b.position.x.toFixed(3)},${b.position.y.toFixed(3)},${b.position.z.toFixed(3)})->${c?.name ?? "null"}`));

      for (const [bone, child] of pairs) {
        const joint = new VRMSpringBoneJoint(
          bone,
          child,
          {
            stiffness: cfg.settings?.stiffness ?? 1.0,
            dragForce: cfg.settings?.dragForce ?? 0.4,
            gravityPower: cfg.settings?.gravityPower ?? 0,
            gravityDir: cfg.settings?.gravityDir ?? new Vector3(0, -1, 0),
            hitRadius: cfg.settings?.hitRadius ?? 0.02,
          },
          colliderGroups
        );

        manager.joints.add(joint);
      }
    }

    // ── 4. Stage init — defer to first useFrame so the renderer has already
    //        posed the skeleton and world matrices are correct.
    needsInitRef.current = true;
    console.log("[v0] manager ready, joint count:", manager.joints.size, "— waiting for first frame to call setInitState()");

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      manager.reset();
      managerRef.current = null;

      for (const cfg of colliderConfigs) {
        const meshObj = findByName(scene, cfg.meshName);
        if (meshObj) meshObj.visible = true;
      }
    };
  }, [scene, springBoneConfigs, colliderConfigs]);

  // ── Per-frame update ──────────────────────────────────────────────────────
  const frameCountRef = useRef(0);
  useFrame((_, delta) => {
    const manager = managerRef.current;
    if (!manager) return;

    // Update world matrices so the integrator sees the current animated pose.
    scene.updateWorldMatrix(true, true);

    // Defer setInitState() to the first frame so the renderer has fully posed
    // the skeleton before we snapshot the rest-pose bone axes.
    if (needsInitRef.current) {
      manager.setInitState();
      needsInitRef.current = false;
      // Deep diagnostic: inspect the first joint's internal state after init
      const firstJoint = Array.from(manager.joints)[0] as any;
      if (firstJoint) {
        console.log("[v0] setInitState() done. First joint internals:", {
          boneName: firstJoint.bone?.name,
          _boneAxis: firstJoint._boneAxis ? `${firstJoint._boneAxis.x.toFixed(4)},${firstJoint._boneAxis.y.toFixed(4)},${firstJoint._boneAxis.z.toFixed(4)}` : "N/A",
          _initialLocalChildPos: firstJoint._initialLocalChildPosition ? `${firstJoint._initialLocalChildPosition.x.toFixed(4)},${firstJoint._initialLocalChildPosition.y.toFixed(4)},${firstJoint._initialLocalChildPosition.z.toFixed(4)}` : "N/A",
          _currentTail: firstJoint._currentTail ? `${firstJoint._currentTail.x.toFixed(4)},${firstJoint._currentTail.y.toFixed(4)},${firstJoint._currentTail.z.toFixed(4)}` : "N/A",
          _prevTail: firstJoint._prevTail ? `${firstJoint._prevTail.x.toFixed(4)},${firstJoint._prevTail.y.toFixed(4)},${firstJoint._prevTail.z.toFixed(4)}` : "N/A",
          childName: firstJoint.child?.name ?? "null",
          childPosition: firstJoint.child ? `${firstJoint.child.position.x.toFixed(4)},${firstJoint.child.position.y.toFixed(4)},${firstJoint.child.position.z.toFixed(4)}` : "N/A",
          gravityPower: firstJoint.settings?.gravityPower,
          stiffness: firstJoint.settings?.stiffness,
          boneParentName: firstJoint.bone?.parent?.name,
          ancestorsCount: (manager as any)._ancestors?.length,
        });
      }
    }

    manager.update(delta);

    frameCountRef.current++;
    if (frameCountRef.current <= 5) {
      const firstJoint = Array.from(manager.joints)[0] as any;
      if (firstJoint?.bone) {
        const q = firstJoint.bone.quaternion;
        const t = firstJoint._currentTail;
        console.log(`[v0] frame ${frameCountRef.current} bone "${firstJoint.bone.name}" quat: ${q.x.toFixed(4)} ${q.y.toFixed(4)} ${q.z.toFixed(4)} ${q.w.toFixed(4)} | tail: ${t?.x.toFixed(4)},${t?.y.toFixed(4)},${t?.z.toFixed(4)}`);
      }
    }
  });
}
