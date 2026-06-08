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

    // [v0] log all track names to see the exact format
    console.log("[v0] all track names:", clip.tracks.map(t => t.name));
    console.log("[v0] excludeBoneNames:", Array.from(excludeBoneNames ?? []));

    // Strip out tracks that target spring-bone-owned bones so the mixer never
    // overwrites the transforms that the Verlet integrator computed.
    if (excludeBoneNames && excludeBoneNames.size > 0) {
      const filteredTracks = clip.tracks.filter((track) => {
        // Track names can be:
        //   "BoneName.quaternion"                (plain)
        //   "Armature|BoneName.quaternion"       (object path | bone.property)
        //   ".bones[BoneName].quaternion"        (dot notation)
        const dotIdx = track.name.lastIndexOf(".");
        const withoutProp = dotIdx !== -1 ? track.name.slice(0, dotIdx) : track.name;
        // Strip object path prefix (e.g. "Armature|")
        const pipeIdx = withoutProp.lastIndexOf("|");
        const boneName = pipeIdx !== -1 ? withoutProp.slice(pipeIdx + 1) : withoutProp;
        // Strip .bones[...] notation
        const bracketMatch = boneName.match(/\.bones\[(.+)\]/);
        const finalName = bracketMatch ? bracketMatch[1] : boneName;
        const excluded = excludeBoneNames.has(finalName);
        return !excluded;
      });
      console.log(`[v0] mixer: excluded ${clip.tracks.length - filteredTracks.length} of ${clip.tracks.length} tracks. ExcludedNames:`, Array.from(excludeBoneNames));
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
  }, [characterScene, animations, excludeBoneNames]);

  // Each frame: read the live MediaPipe flag and pause/advance the mixer accordingly.
  const frameLogRef = useRef(0);
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

    // [v0] log hair_head bone quat after mixer runs, first 3 frames
    frameLogRef.current++;
    if (frameLogRef.current <= 3 && mixerRef.current) {
      const root = (mixer as any)._root as Object3D | undefined;
      let hairBone: Object3D | null = null;
      root?.traverse?.((o: Object3D) => { if (o.name === "hair_head" && !hairBone) hairBone = o; });
      if (hairBone) {
        const q = (hairBone as any).quaternion;
        console.log(`[v0] mixer frame ${frameLogRef.current} hair_head quat after mixer:`, q.x.toFixed(4), q.y.toFixed(4), q.z.toFixed(4), q.w.toFixed(4), "mediaPipeActive:", active);
      }
    }
  });
}

// Pre-load the animation asset so it is ready when Avatar mounts.
useGLTF.preload(ANIMATION_PATH);
