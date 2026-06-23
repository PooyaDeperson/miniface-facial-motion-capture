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
import { AnimationMixer, AnimationClip, Object3D, Mesh } from "three";
import { useFrame } from "@react-three/fiber";

// ─── Mesh-name priority list (mirrors Avatar.tsx line 623) ───────────────────
// Used to find the morph-target mesh inside the character scene so that
// morphTargetInfluences track names can be remapped to the mesh that actually
// exists in the loaded avatar.
const HEAD_MESH_NAMES = [
  "Wolf3D_Head",
  "Wolf3D_Teeth",
  "Wolf3D_Beard",
  "Wolf3D_Avatar",
  "Wolf3D_Head_Custom",
  "avatar",
  "Avatar",
  "face",
];

/**
 * Walk the character scene and return the name of the first mesh that both
 * appears in HEAD_MESH_NAMES AND has a morphTargetDictionary. Returns null
 * when no such mesh exists (avatar has no blendshapes).
 */
function findMorphMeshName(characterScene: Object3D): string | null {
  for (const name of HEAD_MESH_NAMES) {
    const obj = characterScene.getObjectByName(name) as Mesh | undefined;
    if (obj && obj.morphTargetDictionary) return name;
  }
  return null;
}

/**
 * Remap every morphTargetInfluences track so its object-name prefix matches
 * the mesh that actually lives in the scene. Three.js resolves AnimationMixer
 * tracks by looking up the object name in the root scene — if the track says
 * "Wolf3D_Head.morphTargetInfluences[jawOpen]" but the avatar only has an
 * "Avatar" mesh, the track simply never binds and blendshapes stay silent.
 *
 * We strip whatever prefix the exported GLB used and replace it with the
 * real mesh name found in the character scene.
 */
function remapMorphTracks(clip: AnimationClip, meshName: string): AnimationClip {
  const remapped = clip.tracks.map((track) => {
    if (!track.name.includes("morphTargetInfluences")) return track;

    // Track names can be:
    //   "Wolf3D_Head.morphTargetInfluences[jawOpen]"
    //   "Armature|Wolf3D_Head.morphTargetInfluences[jawOpen]"
    //   ".morphTargetInfluences[jawOpen]"   (no mesh prefix)
    const morphIdx = track.name.indexOf(".morphTargetInfluences");
    if (morphIdx === -1) return track;

    const suffix = track.name.slice(morphIdx); // ".morphTargetInfluences[...]"
    const newName = `${meshName}${suffix}`;

    if (newName === track.name) return track; // already correct

    // Clone the track with the corrected name — the values array is shared
    // (read-only during playback) so this is allocation-cheap.
    const TrackCtor = track.constructor as any;
    return new TrackCtor(newName, track.times, track.values, track.interpolation);
  });

  return new AnimationClip(clip.name, clip.duration, remapped);
}

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

    // Remap morphTargetInfluences track names to match the mesh that actually
    // exists in this avatar's scene (uses same priority list as Avatar.tsx).
    const morphMeshName = findMorphMeshName(characterScene);
    if (morphMeshName) {
      clip = remapMorphTracks(clip, morphMeshName);
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
