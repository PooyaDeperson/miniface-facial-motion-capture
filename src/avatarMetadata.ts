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
 *   id           – unique identifier for this chain
 *   driver       – bone whose world movement drives the simulation
 *   chainStart   – first bone in the spring chain (inclusive)
 *   chainEnd     – last bone in the spring chain (inclusive)
 *   stiffness    – how strongly each bone springs back toward rest     (0–1, default 0.3)
 *   damping      – velocity damping each frame; higher = less wobble   (0–1, default 0.85)
 *   gravity      – constant downward sag on the rest target            (default 0.08)
 *   inertiaScale – how much driver velocity lags the chain             (default 0.08)
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
    // Ponytail: hair_head is the driver; chain runs hair_1 → hair_7.
    secondaryMotion: [
      {
        id: "ponytail",
        driver: "Head",
        chainStart: "hair_head",
        chainEnd: "hair_7",
        stiffness: 0.01,
        damping: 0.80,
        gravity: 0.07,
        inertiaScale: 0.08,
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
