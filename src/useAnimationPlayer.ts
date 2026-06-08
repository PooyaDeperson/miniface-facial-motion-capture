/*
 * Copyright (c) 2025 Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 *
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson"
 */

import { useEffect, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { AnimationMixer, AnimationClip, Object3D, Bone } from "three";
import { useFrame } from "@react-three/fiber";

const ANIMATION_PATH = "/animation/idle.glb";

/**
 * Collects all Bone objects from a scene by walking the hierarchy.
 */
function collectBones(root: Object3D): Map<string, Bone> {
  const map = new Map<string, Bone>();
  root.traverse((obj) => {
    if ((obj as Bone).isBone) {
      map.set(obj.name, obj as Bone);
    }
  });
  return map;
}

/**
 * Collects all bone names referenced in an AnimationClip's tracks.
 */
function collectAnimationBoneNames(clip: AnimationClip): Set<string> {
  const names = new Set<string>();
  for (const track of clip.tracks) {
    // Track names are like "BoneName.position" or "BoneName.quaternion"
    const dotIdx = track.name.lastIndexOf(".");
    const boneName = dotIdx !== -1 ? track.name.slice(0, dotIdx) : track.name;
    names.add(boneName);
  }
  return names;
}

interface UseAnimationPlayerOptions {
  /** The character scene (from useGLTF) whose bones will be driven. */
  characterScene: Object3D | null;
  /**
   * A getter function that returns the current MediaPipe active state.
   * Using a getter (instead of a prop value) means the hook always reads
   * the latest mutable module variable without needing React state reactivity.
   */
  getIsMediaPipeActive: () => boolean;
  /**
   * Optional set of bone names that should be excluded from the animation
   * mixer. Used to give spring-bone physics full ownership of hair/cloth
   * bones so the mixer doesn't overwrite their transforms each frame.
   */
  excludeBoneNames?: Set<string>;
}

export function useAnimationPlayer({ characterScene, getIsMediaPipeActive, excludeBoneNames }: UseAnimationPlayerOptions) {
  const { animations } = useGLTF(ANIMATION_PATH);

  const mixerRef = useRef<AnimationMixer | null>(null);
  const actionPausedRef = useRef(false);

  // Build mixer + action once we have both the character scene and the animation clip.
  useEffect(() => {
    if (!characterScene || !animations || animations.length === 0) return;

    let clip = animations[0];

    // Strip out tracks that target spring-bone-owned bones so the mixer never
    // overwrites the transforms that the Verlet integrator computed.
    if (excludeBoneNames && excludeBoneNames.size > 0) {
      const filteredTracks = clip.tracks.filter((track) => {
        const dotIdx = track.name.lastIndexOf(".");
        const boneName = dotIdx !== -1 ? track.name.slice(0, dotIdx) : track.name;
        return !excludeBoneNames.has(boneName);
      });
      console.log(`[v0] mixer: excluded ${clip.tracks.length - filteredTracks.length} tracks for spring bones out of ${clip.tracks.length} total. Excluded bone names:`, Array.from(excludeBoneNames));
      // Clone the clip so we don't mutate the cached asset.
      clip = new AnimationClip(clip.name, clip.duration, filteredTracks);
    }

    const mixer = new AnimationMixer(characterScene);
    mixerRef.current = mixer;

    // ---- Bone-matching log ----
    const characterBones = collectBones(characterScene);
    const animBoneNames = collectAnimationBoneNames(clip);

    const matched: string[] = [];
    const unmatchedAnim: string[] = [];
    const unmatchedChar: string[] = [];

    animBoneNames.forEach((name) => {
      if (characterBones.has(name)) matched.push(name);
      else unmatchedAnim.push(name);
    });

    characterBones.forEach((_, name) => {
      if (!animBoneNames.has(name)) unmatchedChar.push(name);
    });

    // ---------------------------

    const action = mixer.clipAction(clip);
    action.play();

    return () => {
      action.stop();
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [characterScene, animations]);

  // Each frame: read the live MediaPipe flag and pause/advance the mixer accordingly.
  useFrame((_, delta) => {
    const mixer = mixerRef.current;
    if (!mixer) return;

    const active = getIsMediaPipeActive();

    if (active) {
      // Pause at current frame — do not advance time.
      if (!actionPausedRef.current) {
        // Freeze all actions managed by this mixer.
        (mixer as any)._actions?.forEach((a: any) => { a.paused = true; });
        actionPausedRef.current = true;
      }
    } else {
      if (actionPausedRef.current) {
        // Resume all actions.
        (mixer as any)._actions?.forEach((a: any) => { a.paused = false; });
        actionPausedRef.current = false;
      }
      mixer.update(delta);
    }
  });
}

// Pre-load the animation asset so it is ready when Avatar mounts.
useGLTF.preload(ANIMATION_PATH);
