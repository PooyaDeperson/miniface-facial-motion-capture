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
    // ── [v0 DEBUG] Step 0: hook fired ─────────────────────────────────────
    console.log("[v0] useSpringBones: effect fired", {
      springBoneCount: springBoneConfigs.length,
      colliderCount: colliderConfigs.length,
      sceneUUID: scene.uuid,
    });

    // Nothing to do if this avatar has no spring-bone configuration.
    if (springBoneConfigs.length === 0 && colliderConfigs.length === 0) {
      console.log("[v0] useSpringBones: no configs — bailing out early (expected for avatar2-5)");
      return;
    }

    // ── [v0 DEBUG] Step 0b: dump all node names so we can verify bone names ──
    const allNames: string[] = [];
    scene.traverse((obj) => { if (obj.name) allNames.push(obj.name); });
    console.log("[v0] useSpringBones: all scene node names →", allNames);

    const manager = new VRMSpringBoneManager();
    managerRef.current = manager;

    // ── 1. Build colliders ────────────────────────────────────────────────
    const builtColliders: VRMSpringBoneCollider[] = [];

    for (const cfg of colliderConfigs) {
      const meshObj = findByName(scene, cfg.meshName);

      if (!meshObj) {
        console.warn(
          `[v0] useSpringBones: Collider mesh "${cfg.meshName}" NOT FOUND in scene — skipping.`
        );
        continue;
      }

      const mesh = meshObj as Mesh;
      console.log("[v0] useSpringBones: collider mesh found →", cfg.meshName, {
        type: mesh.type,
        hasGeometry: !!mesh.geometry,
        position: mesh.position.toArray(),
        parent: mesh.parent?.name ?? "(no parent)",
      });

      // Ensure the bounding sphere is computed.
      if (mesh.geometry) {
        mesh.geometry.computeBoundingSphere();
      }

      const boundingSphere = mesh.geometry?.boundingSphere;
      const radius = boundingSphere?.radius ?? FALLBACK_SPHERE_RADIUS;
      const localCenter = boundingSphere?.center ?? new Vector3(0, 0, 0);

      console.log("[v0] useSpringBones: collider sphere →", {
        radius,
        center: localCenter.toArray(),
        usedFallback: !boundingSphere,
      });

      const shape = new VRMSpringBoneColliderShapeSphere({ radius, offset: localCenter });
      const collider = new VRMSpringBoneCollider(shape);

      collider.position.copy(mesh.position);
      collider.quaternion.copy(mesh.quaternion);
      collider.scale.copy(mesh.scale);

      const parent = mesh.parent ?? scene;
      parent.add(collider);
      mesh.visible = false;

      builtColliders.push(collider);
      console.log("[v0] useSpringBones: collider built and attached to parent →", parent.name ?? "(scene root)");
    }

    // ── 2. Collider group ─────────────────────────────────────────────────
    const colliderGroup: VRMSpringBoneColliderGroup | undefined =
      builtColliders.length > 0
        ? { colliders: builtColliders, name: "avatar_collision" }
        : undefined;

    const colliderGroups = colliderGroup ? [colliderGroup] : [];
    console.log("[v0] useSpringBones: collider groups ready →", colliderGroups.length, "group(s) with", builtColliders.length, "collider(s)");

    // ── 3. Build joints per chain ─────────────────────────────────────────
    let totalJoints = 0;

    for (const cfg of springBoneConfigs) {
      const rootBone = findByName(scene, cfg.rootBoneName);

      if (!rootBone) {
        console.warn(
          `[v0] useSpringBones: Root bone "${cfg.rootBoneName}" NOT FOUND — skipping chain.`
        );
        continue;
      }

      const pairs = buildChainPairs(rootBone);
      console.log(`[v0] useSpringBones: chain "${cfg.rootBoneName}" → ${pairs.length} joint(s)`, pairs.map(([b, c]) => `${b.name} → ${c?.name ?? "null"}`));

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
        totalJoints++;
      }
    }

    console.log("[v0] useSpringBones: total joints registered →", totalJoints);

    // ── 4. Snapshot rest-pose matrices ────────────────────────────────────
    scene.updateWorldMatrix(true, true);
    manager.setInitState();
    console.log("[v0] useSpringBones: setInitState() called — manager ready");

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      console.log("[v0] useSpringBones: cleanup — resetting manager");
      manager.reset();
      managerRef.current = null;

      for (const cfg of colliderConfigs) {
        const meshObj = findByName(scene, cfg.meshName);
        if (meshObj) meshObj.visible = true;
      }
    };
  }, [scene, springBoneConfigs, colliderConfigs]);

  // ── Per-frame update — runs AFTER the animation mixer in Avatar.tsx ───────
  const hasLoggedFirstUpdate = useRef(false);
  useFrame((_, delta) => {
    const manager = managerRef.current;
    if (!manager) return;
    if (!hasLoggedFirstUpdate.current) {
      console.log("[v0] useSpringBones: first manager.update() call — spring bones are running", {
        jointCount: manager.joints.size,
      });
      hasLoggedFirstUpdate.current = true;
    }
    manager.update(delta);
  });
}
