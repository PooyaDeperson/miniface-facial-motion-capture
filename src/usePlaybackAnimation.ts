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
import { AnimationMixer, AnimationClip, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { useFrame } from "@react-three/fiber";

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

        // Strip spring-bone tracks so the mixer does not fight secondary motion
        if (excludeBoneNames && excludeBoneNames.size > 0) {
          const filtered = clip.tracks.filter((t) => {
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

      const t = mixer.time % (clip.duration || 1);
      _playbackState.currentTime = t;
      _notifyPlayback();

      // If loop=false and we've reached the end, pause at last frame
      if (!loopRef.current && mixer.time >= clip.duration) {
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
    action.time = t;
    mixer.setTime(t);
    // When the action is paused, Three.js skips mixer.update() entirely for
    // that action. Temporarily un-pause, advance by zero, then re-pause so the
    // bone/morph-target pose is applied and the frame is rendered immediately.
    const wasPaused = action.paused;
    if (wasPaused) action.paused = false;
    mixer.update(0);
    if (wasPaused) action.paused = true;
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
