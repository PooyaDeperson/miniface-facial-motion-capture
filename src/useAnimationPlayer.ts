/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 *
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson"
 */

import { useEffect, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { AnimationMixer, AnimationClip, Object3D } from "three";
import { useFrame } from "@react-three/fiber";

const ANIMATION_PATH = "/animation/idle.glb";

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

    // Strip out tracks targeting spring-bone-owned bones so the mixer never
    // overwrites Verlet-integrated transforms. Track names can be plain
    // "BoneName.quaternion", "Armature|BoneName.quaternion", or
    // ".bones[BoneName].quaternion" — handle all three formats.
    // Morph-target tracks (morphTargetInfluences) are always kept so
    // blendshapes play alongside bones when the GLB includes them.
    if (excludeBoneNames && excludeBoneNames.size > 0) {
      const before = clip.tracks.length;
      const filteredTracks = clip.tracks.filter((track) => {
        // Always keep morph-target tracks — they drive blendshapes, not bones.
        if (track.name.includes("morphTargetInfluences")) return true;
        // For bone tracks: extract the bare bone name and check exclusion list.
        const dotIdx = track.name.lastIndexOf(".");
        const withoutProp = dotIdx !== -1 ? track.name.slice(0, dotIdx) : track.name;
        const pipeIdx = withoutProp.lastIndexOf("|");
        const afterPipe = pipeIdx !== -1 ? withoutProp.slice(pipeIdx + 1) : withoutProp;
        const bracketMatch = afterPipe.match(/\.bones\[(.+)\]/);
        const finalName = bracketMatch ? bracketMatch[1] : afterPipe;
        return !excludeBoneNames.has(finalName);
      });
      if (before !== filteredTracks.length) {
        clip = new AnimationClip(clip.name, clip.duration, filteredTracks);
      }
    }

    const mixer = new AnimationMixer(characterScene);
    mixerRef.current = mixer;

    const action = mixer.clipAction(clip);
    action.play();

    return () => {
      action.stop();
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [characterScene, animations, excludeBoneNames]);

  // Each frame: read the live MediaPipe flag and pause/advance the mixer accordingly.
  useFrame((_, delta) => {
    const mixer = mixerRef.current;
    if (!mixer) return;

    const active = getIsMediaPipeActive();

    if (active) {
      if (!actionPausedRef.current) {
        (mixer as any)._actions?.forEach((a: any) => { a.paused = true; });
        actionPausedRef.current = true;
      }
    } else {
      if (actionPausedRef.current) {
        (mixer as any)._actions?.forEach((a: any) => { a.paused = false; });
        actionPausedRef.current = false;
      }
      mixer.update(delta);
    }
  });
}

// Pre-load the animation asset so it is ready when Avatar mounts.
useGLTF.preload(ANIMATION_PATH);
