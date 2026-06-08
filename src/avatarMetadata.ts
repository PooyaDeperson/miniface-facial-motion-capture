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
 * avatarMetadata.ts
 *
 * Central registry for per-avatar configuration.
 *
 * SpringBoneChainConfig
 * ─────────────────────
 * Each entry describes one spring-bone chain rooted at `rootBoneName`.
 * Bones are discovered by walking children in scene order, so the chain
 * is built automatically from the hierarchy — you only need to name the root.
 *
 * VRMSpringBoneJointSettings (all optional, sensible defaults shown):
 *   stiffness    – how quickly the bone tries to return to its rest pose   (default 1.0)
 *   dragForce    – velocity damping; higher = snappier / less oscillation  (default 0.4)
 *   gravityPower – strength of the gravity pull on the bone                (default 0)
 *   gravityDir   – normalised direction of gravity in world space          (default {x:0, y:-1, z:0})
 *   hitRadius    – collision probe radius in world-space metres            (default 0.02)
 *
 * SpringBoneColliderConfig
 * ─────────────────────────
 * Names a mesh in the scene whose geometry is used to derive a bounding-sphere
 * collider. The mesh is hidden at runtime (visible = false) after the collider
 * is created so it does not affect the render.
 *
 * AvatarMetadata
 * ───────────────
 * avatarPath    – the URL key used to look up metadata (matches the path
 *                 passed to useGLTF / the Avatar url prop).
 * springBones   – array of chain configs; empty array = no spring physics.
 * colliders     – array of collision mesh configs; empty = no colliders.
 */

import { Vector3 } from "three";

export interface SpringBoneJointSettings {
  stiffness?: number;
  dragForce?: number;
  gravityPower?: number;
  gravityDir?: Vector3;
  hitRadius?: number;
}

export interface SpringBoneChainConfig {
  /** Name of the root bone in the scene hierarchy. */
  rootBoneName: string;
  /** Physics settings applied to every joint in this chain. */
  settings?: SpringBoneJointSettings;
}

export interface SpringBoneColliderConfig {
  /**
   * Name of the mesh in the scene used to derive a bounding-sphere collider.
   * The mesh will be hidden after the collider is built.
   */
  meshName: string;
}

export interface AvatarMetadata {
  /** The avatar's public URL path, used as the lookup key. */
  avatarPath: string;
  /** Spring-bone chains to simulate. Empty array = no simulation. */
  springBones: SpringBoneChainConfig[];
  /** Collision meshes to register. Empty array = no colliders. */
  colliders: SpringBoneColliderConfig[];
}

// ─── Registry ────────────────────────────────────────────────────────────────

const AVATAR_METADATA: AvatarMetadata[] = [
  // ── Avatar 1 ──────────────────────────────────────────────────────────────
  // Has hair bones and a collision mesh named "colonly".
  // hair_head is the root of the overall hair system; hair_1…hair_7 are
  // individual strands that branch off from it.
  {
    avatarPath: "/avatar/avatar1.glb",
    springBones: [
      {
        rootBoneName: "hair_head",
        settings: { stiffness: 0.10, dragForce: 0.06, gravityPower: 0.12, gravityDir: new Vector3(0, -1, 0) },
      },
      {
        rootBoneName: "hair_1",
        settings: { stiffness: 0.08, dragForce: 0.06, gravityPower: 0.15, gravityDir: new Vector3(0, -1, 0) },
      },
      {
        rootBoneName: "hair_2",
        settings: { stiffness: 0.08, dragForce: 0.06, gravityPower: 0.15, gravityDir: new Vector3(0, -1, 0) },
      },
      {
        rootBoneName: "hair_3",
        settings: { stiffness: 0.07, dragForce: 0.05, gravityPower: 0.18, gravityDir: new Vector3(0, -1, 0) },
      },
      {
        rootBoneName: "hair_4",
        settings: { stiffness: 0.07, dragForce: 0.05, gravityPower: 0.18, gravityDir: new Vector3(0, -1, 0) },
      },
      {
        rootBoneName: "hair_5",
        settings: { stiffness: 0.06, dragForce: 0.05, gravityPower: 0.20, gravityDir: new Vector3(0, -1, 0) },
      },
      {
        rootBoneName: "hair_6",
        settings: { stiffness: 0.06, dragForce: 0.05, gravityPower: 0.20, gravityDir: new Vector3(0, -1, 0) },
      },
      {
        rootBoneName: "hair_7",
        settings: { stiffness: 0.05, dragForce: 0.04, gravityPower: 0.22, gravityDir: new Vector3(0, -1, 0) },
      },
    ],
    // Collision mesh disabled for now — add back once spring motion is tuned.
    // colliders: [{ meshName: "colonly" }],
    colliders: [],
  },

  // ── Avatar 2 ──────────────────────────────────────────────────────────────
  // No spring bones or colliders yet.
  {
    avatarPath: "/avatar/avatar2.glb",
    springBones: [],
    colliders: [],
  },

  // ── Avatar 3 ──────────────────────────────────────────────────────────────
  {
    avatarPath: "/avatar/avatar3.glb",
    springBones: [],
    colliders: [],
  },

  // ── Avatar 4 ──────────────────────────────────────────────────────────────
  {
    avatarPath: "/avatar/avatar4.glb",
    springBones: [],
    colliders: [],
  },

  // ── Avatar 5 ──────────────────────────────────────────────────────────────
  {
    avatarPath: "/avatar/avatar5.glb",
    springBones: [],
    colliders: [],
  },
];

// ─── Lookup helpers ──────────────────────────────────────────────────────────

/**
 * Returns the metadata for the given avatar URL, or a safe default
 * (no spring bones, no colliders) if the avatar is not registered.
 */
export function getAvatarMetadata(avatarPath: string): AvatarMetadata {
  const found = AVATAR_METADATA.find((m) => m.avatarPath === avatarPath);
  if (!found) {
    return { avatarPath, springBones: [], colliders: [] };
  }
  return found;
}
