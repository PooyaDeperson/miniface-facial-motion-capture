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
 * Central registry for per-avatar secondary motion configuration.
 *
 * SecondaryChainConfig (from SecondaryMotionSystem)
 * ─────────────────────────────────────────────────
 *   id        – unique identifier for this chain
 *   driver    – name of the bone whose movement drives the simulation
 *               (e.g. "Head" for hair chains, "Hips" for skirt chains)
 *   root      – name of the root bone of the chain; children are
 *               discovered automatically by walking the hierarchy
 *   stiffness – how strongly each bone springs back toward rest pose   (0–1, default 0.25)
 *   damping   – velocity damping each frame; higher = snappier         (0–1, default 0.88)
 *   gravity   – constant downward pull on the simulated tail           (default 0.08)
 *
 * AvatarMetadata
 * ───────────────
 *   avatarPath       – URL key used to look up metadata
 *   secondaryMotion  – array of chain configs; empty = no secondary motion
 */

import type { SecondaryChainConfig } from "./SecondaryMotionSystem";

export type { SecondaryChainConfig };

export interface AvatarMetadata {
  /** The avatar's public URL path, used as the lookup key. */
  avatarPath: string;
  /** Secondary motion chains to simulate. Empty array = no simulation. */
  secondaryMotion: SecondaryChainConfig[];
}

// ─── Registry ────────────────────────────────────────────────────────────────

const AVATAR_METADATA: AvatarMetadata[] = [
  // ── Avatar 1 ──────────────────────────────────────────────────────────────
  // Driver: hair_head (the parent bone driven by head movement)
  // Chain:  hair_1 … hair_7 (individual strands branching from hair_head)
  {
    avatarPath: "/avatar/avatar1.glb",
    secondaryMotion: [
      {
        id: "hair_head",
        driver: "hair_head",
        root: "hair_head",
        stiffness: 0.20,
        damping: 0.88,
        gravity: 0.06,
      },
      {
        id: "hair_1",
        driver: "hair_head",
        root: "hair_1",
        stiffness: 0.18,
        damping: 0.87,
        gravity: 0.07,
      },
      {
        id: "hair_2",
        driver: "hair_head",
        root: "hair_2",
        stiffness: 0.18,
        damping: 0.87,
        gravity: 0.07,
      },
      {
        id: "hair_3",
        driver: "hair_head",
        root: "hair_3",
        stiffness: 0.15,
        damping: 0.86,
        gravity: 0.08,
      },
      {
        id: "hair_4",
        driver: "hair_head",
        root: "hair_4",
        stiffness: 0.15,
        damping: 0.86,
        gravity: 0.08,
      },
      {
        id: "hair_5",
        driver: "hair_head",
        root: "hair_5",
        stiffness: 0.12,
        damping: 0.85,
        gravity: 0.09,
      },
      {
        id: "hair_6",
        driver: "hair_head",
        root: "hair_6",
        stiffness: 0.12,
        damping: 0.85,
        gravity: 0.09,
      },
      {
        id: "hair_7",
        driver: "hair_head",
        root: "hair_7",
        stiffness: 0.10,
        damping: 0.84,
        gravity: 0.10,
      },
    ],
  },

  // ── Avatar 2 ──────────────────────────────────────────────────────────────
  {
    avatarPath: "/avatar/avatar2.glb",
    secondaryMotion: [],
  },

  // ── Avatar 3 ──────────────────────────────────────────────────────────────
  {
    avatarPath: "/avatar/avatar3.glb",
    secondaryMotion: [],
  },

  // ── Avatar 4 ──────────────────────────────────────────────────────────────
  {
    avatarPath: "/avatar/avatar4.glb",
    secondaryMotion: [],
  },

  // ── Avatar 5 ──────────────────────────────────────────────────────────────
  {
    avatarPath: "/avatar/avatar5.glb",
    secondaryMotion: [],
  },
];

// ─── Lookup helpers ──────────────────────────────────────────────────────────

/**
 * Returns the metadata for the given avatar URL, or a safe default
 * (no secondary motion) if the avatar is not registered.
 */
export function getAvatarMetadata(avatarPath: string): AvatarMetadata {
  const found = AVATAR_METADATA.find((m) => m.avatarPath === avatarPath);
  if (!found) {
    return { avatarPath, secondaryMotion: [] };
  }
  return found;
}
