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
 * Collect all Object3D children of `root` in depth-first order.
 * Returns an array of [bone, child | null] pairs for each joint in the chain.
 * The leaf bone of a chain has no relevant children so its child is null.
 */
function buildChainPairs(root: Object3D): Array<[Object3D, Object3D | null]> {
  const pairs: Array<[Object3D, Object3D | null]> = [];

  function walk(node: Object3D): void {
    const firstChild = node.children[0] ?? null;
    pairs.push([node, firstChild]);
    // Continue deeper into the first child branch (hair chains are linear)
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
        console.warn(
          `[useSpringBones] Collider mesh "${cfg.meshName}" not found in scene — skipping.`
        );
        continue;
      }

      const mesh = meshObj as Mesh;

      // Ensure the bounding sphere is computed.
      if (mesh.geometry) {
        mesh.geometry.computeBoundingSphere();
      }

      const boundingSphere = mesh.geometry?.boundingSphere;
      const radius = boundingSphere?.radius ?? FALLBACK_SPHERE_RADIUS;

      // The sphere centre in local space — usually near origin for head meshes.
      const localCenter = boundingSphere?.center ?? new Vector3(0, 0, 0);

      // Create the shape and the collider Object3D.
      const shape = new VRMSpringBoneColliderShapeSphere({ radius, offset: localCenter });
      const collider = new VRMSpringBoneCollider(shape);

      // Attach the collider Object3D to the mesh so it moves with it in world space.
      // Copy the mesh's local transform so the collider sphere sits correctly.
      collider.position.copy(mesh.position);
      collider.quaternion.copy(mesh.quaternion);
      collider.scale.copy(mesh.scale);

      const parent = mesh.parent ?? scene;
      parent.add(collider);

      // Hide the source mesh — it is only a collision volume.
      mesh.visible = false;

      builtColliders.push(collider);
    }

    // ── 2. Collider group shared by all joints ─────────────────────────────
    const colliderGroup: VRMSpringBoneColliderGroup | undefined =
      builtColliders.length > 0
        ? { colliders: builtColliders, name: "avatar_collision" }
        : undefined;

    const colliderGroups = colliderGroup ? [colliderGroup] : [];

    // ── 3. Build joints per chain ─────────────────────────────────────────
    for (const cfg of springBoneConfigs) {
      const rootBone = findByName(scene, cfg.rootBoneName);

      if (!rootBone) {
        console.warn(
          `[useSpringBones] Root bone "${cfg.rootBoneName}" not found in scene — skipping chain.`
        );
        continue;
      }

      const pairs = buildChainPairs(rootBone);

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

    // ── 4. Snapshot rest-pose matrices ────────────────────────────────────
    // Update world matrices first so setInitState captures correct values.
    scene.updateWorldMatrix(true, true);
    manager.setInitState();

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      manager.reset();
      managerRef.current = null;

      // Restore visibility of any hidden collision meshes so they can be
      // re-processed if the same avatar is reloaded.
      for (const cfg of colliderConfigs) {
        const meshObj = findByName(scene, cfg.meshName);
        if (meshObj) meshObj.visible = true;
      }
    };
  }, [scene, springBoneConfigs, colliderConfigs]);

  // ── Per-frame update — runs AFTER the animation mixer in Avatar.tsx ───────
  useFrame((_, delta) => {
    const manager = managerRef.current;
    if (!manager) return;
    manager.update(delta);
  });
}
