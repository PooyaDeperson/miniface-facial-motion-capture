/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

/**
 * usePlaybackAnimation.ts
 *
 * Drives an avatar's bones and morph-targets by replaying a GLB blob that was
 * previously exported by buildAndExportGLB(). Loaded entirely in-memory via
 * THREE's GLTFLoader — no network request needed.
 *
 * Features
 * ────────
 * • Play / pause
 * • Always-loop (loop is permanently on)
 * • Scrubber (seek to any normalised position 0–1, works while paused)
 * • Auto-play on blob change
 * • Exposes current time and duration for UI
 * • Cleans up mixer on unmount or blob change
 */

import { useEffect, useRef, useCallback } from "react";
import { AnimationMixer, AnimationClip, Object3D, Mesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { useFrame } from "@react-three/fiber";

// ─── Persistent debug log buffer (readable from DevTools / agent-browser eval) ─
declare global { interface Window { __v0logs: string[] } }
if (typeof window !== "undefined") {
  if (!window.__v0logs) window.__v0logs = [];
}
function v0log(...args: unknown[]) {
  const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  console.log("[v0]", msg);
  if (typeof window !== "undefined") window.__v0logs.push(msg);
}

// ─── Mesh-name priority list (mirrors Avatar.tsx line 623) ───────────────────
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

function findMorphMeshName(characterScene: Object3D): string | null {
  for (const name of HEAD_MESH_NAMES) {
    const obj = characterScene.getObjectByName(name) as Mesh | undefined;
    if (obj && obj.morphTargetDictionary) return name;
  }
  return null;
}

function remapMorphTracks(clip: AnimationClip, meshName: string): AnimationClip {
  const remapped = clip.tracks.map((track) => {
    if (!track.name.includes("morphTargetInfluences")) return track;
    const morphIdx = track.name.indexOf(".morphTargetInfluences");
    if (morphIdx === -1) return track;
    const suffix = track.name.slice(morphIdx);
    const newName = `${meshName}${suffix}`;
    if (newName === track.name) return track;
    const cloned = track.clone();
    cloned.name = newName;
    return cloned;
  });
  return new AnimationClip(clip.name, clip.duration, remapped);
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  loop: boolean;
}

export interface PlaybackControls {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (normalised: number) => void;
  setLoop: (loop: boolean) => void;
}

// ─── pub/sub for React UI outside the Canvas ─────────────────────────────────

type PlaybackListener = (state: PlaybackState) => void;

// Module-level so RecordingControls / PlaybackControls components can subscribe
// without needing React context through the Canvas boundary.
const _playbackListeners = new Set<PlaybackListener>();
let _playbackState: PlaybackState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  loop: true,
};

function _notifyPlayback() {
  _playbackListeners.forEach((fn) => fn({ ..._playbackState }));
}

export function subscribePlaybackState(fn: PlaybackListener): () => void {
  _playbackListeners.add(fn);
  fn({ ..._playbackState }); // immediate snapshot
  return () => _playbackListeners.delete(fn);
}

export function getPlaybackState(): PlaybackState {
  return { ..._playbackState };
}

// ─── hook ─────────────────────────────────────────────────────────────────────

interface UsePlaybackAnimationOptions {
  /** The character scene whose bones will be driven. */
  characterScene: Object3D | null;
  /** The GLB blob to replay. Pass null to stop playback entirely. */
  playbackBlob: Blob | null;
  /** Bone names owned by secondary motion that the mixer must not touch. */
  excludeBoneNames?: Set<string>;
}

export function usePlaybackAnimation({
  characterScene,
  playbackBlob,
  excludeBoneNames,
}: UsePlaybackAnimationOptions): PlaybackControls {
  const mixerRef    = useRef<AnimationMixer | null>(null);
  const actionRef   = useRef<ReturnType<AnimationMixer["clipAction"]> | null>(null);
  const clipRef     = useRef<AnimationClip | null>(null);
  const loopRef     = useRef(true);

  // Tear down the current mixer and action
  const destroyMixer = useCallback(() => {
    if (actionRef.current) {
      actionRef.current.stop();
      actionRef.current = null;
    }
    if (mixerRef.current) {
      mixerRef.current.stopAllAction();
      mixerRef.current = null;
    }
    clipRef.current = null;
    _playbackState = { isPlaying: false, currentTime: 0, duration: 0, loop: loopRef.current };
    _notifyPlayback();
  }, []);

  // Load the blob and create the mixer
  useEffect(() => {
    v0log("playback useEffect: characterScene=", !!characterScene, "playbackBlob=", !!playbackBlob, "blobSize=", playbackBlob?.size ?? 0);
    if (!characterScene || !playbackBlob) {
      destroyMixer();
      return;
    }

    let cancelled = false;

    const loader = new GLTFLoader();
    const objectUrl = URL.createObjectURL(playbackBlob);

    loader.load(
      objectUrl,
      (gltf) => {
        URL.revokeObjectURL(objectUrl);
        if (cancelled) return;

        destroyMixer();

        let clip = gltf.animations[0];
        if (!clip) return;

        // ── Debug: log all morph-target tracks from the GLB ──────────────────
        const morphTracks = clip.tracks.filter((t) => t.name.includes("morphTargetInfluences"));
        v0log("playback: morph track count in GLB:", morphTracks.length);
        if (morphTracks.length > 0) {
          v0log("playback: first 3 morph track names:", morphTracks.slice(0, 3).map((t) => t.name));
        }

        // ── Debug: log what mesh names exist in the character scene ──────────
        const morphMeshName = findMorphMeshName(characterScene);
        v0log("playback: resolved morphMeshName:", morphMeshName);
        if (!morphMeshName) {
          v0log("playback: walking scene for morph meshes...");
          characterScene.traverse((child) => {
            const mesh = child as Mesh;
            if (mesh.morphTargetDictionary) {
              v0log("  mesh found:", mesh.name, "keys:", Object.keys(mesh.morphTargetDictionary).slice(0, 5));
            }
          });
        }

        // Strip spring-bone tracks so the mixer does not fight secondary motion.
        // Morph-target tracks (morphTargetInfluences) must always be kept so
        // blendshapes play alongside bones — they are never in excludeBoneNames.
        if (excludeBoneNames && excludeBoneNames.size > 0) {
          const filtered = clip.tracks.filter((t) => {
            // Always keep morph-target tracks — they drive blendshapes, not bones.
            if (t.name.includes("morphTargetInfluences")) return true;
            // For bone tracks: extract the bare bone name and check exclusion list.
            const dotIdx = t.name.lastIndexOf(".");
            const withoutProp = dotIdx !== -1 ? t.name.slice(0, dotIdx) : t.name;
            const pipeIdx = withoutProp.lastIndexOf("|");
            const afterPipe = pipeIdx !== -1 ? withoutProp.slice(pipeIdx + 1) : withoutProp;
            const bracketMatch = afterPipe.match(/\.bones\[(.+)\]/);
            const finalName = bracketMatch ? bracketMatch[1] : afterPipe;
            return !excludeBoneNames.has(finalName);
          });
          clip = new AnimationClip(clip.name, clip.duration, filtered);
        }

        // Remap morphTargetInfluences track names to match the mesh that
        // actually exists in this avatar's scene (same priority list as Avatar.tsx).
        if (morphMeshName) {
          const before = clip.tracks.filter((t) => t.name.includes("morphTargetInfluences")).map((t) => t.name);
          clip = remapMorphTracks(clip, morphMeshName);
          const after = clip.tracks.filter((t) => t.name.includes("morphTargetInfluences")).map((t) => t.name);
          v0log("playback: morph tracks before remap:", before.slice(0, 3));
          v0log("playback: morph tracks after remap:", after.slice(0, 3));
        }

        clipRef.current = clip;

        const mixer = new AnimationMixer(characterScene);
        mixerRef.current = mixer;

        const action = mixer.clipAction(clip);
        action.setLoop(
          loopRef.current
            ? (2201 as any) /* THREE.LoopRepeat */
            : (2200 as any) /* THREE.LoopOnce */,
          loopRef.current ? Infinity : 1
        );
        action.play();
        actionRef.current = action;

        _playbackState = {
          isPlaying: true,
          currentTime: 0,
          duration: clip.duration,
          loop: loopRef.current,
        };
        _notifyPlayback();
      },
      undefined,
      (err) => {
        URL.revokeObjectURL(objectUrl);
        console.error("[playback] GLTFLoader error:", err);
      }
    );

    return () => {
      cancelled = true;
      URL.revokeObjectURL(objectUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterScene, playbackBlob]);

  // Clean up on unmount
  useEffect(() => () => destroyMixer(), [destroyMixer]);

  // Per-frame update
  useFrame((_, delta) => {
    const mixer = mixerRef.current;
    const action = actionRef.current;
    const clip = clipRef.current;
    if (!mixer || !action || !clip) return;

    if (_playbackState.isPlaying) {
      mixer.update(delta);

      // Read time from action.time (mod clip.duration for looping) — this
      // stays correct after a seek because we set action.time directly.
      const t = action.time % (clip.duration || 1);
      _playbackState.currentTime = t;
      _notifyPlayback();

      // If loop=false and we've reached the end, pause at last frame
      if (!loopRef.current && action.time >= clip.duration) {
        action.paused = true;
        _playbackState.isPlaying = false;
        _playbackState.currentTime = clip.duration;
        _notifyPlayback();
      }
    }
  });

  // ── controls ────────────────────────────────────────────────────────────────

  const play = useCallback(() => {
    const action = actionRef.current;
    if (!action) return;
    action.paused = false;
    if (!action.isRunning()) action.play();
    _playbackState = { ..._playbackState, isPlaying: true };
    _notifyPlayback();
  }, []);

  const pause = useCallback(() => {
    const action = actionRef.current;
    if (!action) return;
    action.paused = true;
    _playbackState = { ..._playbackState, isPlaying: false };
    _notifyPlayback();
  }, []);

  const togglePlay = useCallback(() => {
    if (_playbackState.isPlaying) pause();
    else play();
  }, [play, pause]);

  const seek = useCallback((normalised: number) => {
    const mixer = mixerRef.current;
    const action = actionRef.current;
    const clip = clipRef.current;
    if (!mixer || !action || !clip) return;

    const t = Math.max(0, Math.min(1, normalised)) * clip.duration;

    // Temporarily un-pause so mixer.update(0) actually evaluates this action
    // (Three.js skips paused actions during update). We do NOT call
    // mixer.setTime() because it internally calls update(0) while the action
    // may still be paused, producing no pose change and corrupting mixer.time.
    const wasPaused = action.paused;
    action.paused = false;

    // Reset the action to the target time and flush — update(0) with a clean
    // action time correctly repositions bones / morph-targets.
    action.time = t;
    mixer.update(0);

    // Re-apply paused state without moving time further.
    action.paused = wasPaused;

    _playbackState = { ..._playbackState, currentTime: t };
    _notifyPlayback();
  }, []);

  const setLoop = useCallback((loop: boolean) => {
    loopRef.current = loop;
    const action = actionRef.current;
    if (action) {
      action.setLoop(
        loop ? (2201 as any) : (2200 as any),
        loop ? Infinity : 1
      );
      action.clampWhenFinished = !loop;
    }
    _playbackState = { ..._playbackState, loop };
    _notifyPlayback();
  }, []);

  return { play, pause, togglePlay, seek, setLoop };
}
