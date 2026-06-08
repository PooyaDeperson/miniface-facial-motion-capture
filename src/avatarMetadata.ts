/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 *
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson"
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
    driver: "hair_head",
    chainStart: "hair_1",
    chainEnd: "hair_7",
    stiffness: 0.05,    // Spring strength: lower = softer return (0.02-0.05 for smooth decay, 0.2+ for snappy)
    damping: 0.15,      // safe ranges : damping: 0.70 – 0.90 damping too low = unstable energy loss Velocity retention: lower = less jitter (0.2 good for jitter-free, 0.7+ for bouncy)
    gravity: 0.08,      // Natural droop amount: increase for more sag (0.05-0.15 typical)
    inertiaScale: 0.5, // Lag intensity: how much tail lags behind driver (0.3-0.5 for natural feel)
    smoothing: 0.99,    // Velocity filter: higher = smoother movement, less micro-jitter (0.1-0.2 responsive, 0.8+ smooth)
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
