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
 * useMotionRecorder.ts
 *
 * Module-level singleton that records per-frame blendshape scores and bone
 * rotations from MediaPipe, then builds a Three.js AnimationClip and exports
 * it embedded inside the avatar's original GLTF scene as a binary .glb file.
 *
 * Design notes
 * ─────────────
 * • Module-level mutable state (same pattern as FaceTracking's blendshapes /
 *   rotation / headMesh globals) lets Avatar.tsx read isRecording and write
 *   frames inside useFrame() without any React overhead on the hot path.
 * • React components subscribe via subscribeRecorder() and receive lightweight
 *   state snapshots via getRecorderState() to drive UI.
 * • The export function builds separate tracks for every morph target that had
 *   at least one non-zero score, plus QuaternionKeyframeTrack entries for the
 *   three driven bones (Head, Neck, Spine2).  All other bones / joints are
 *   included in the exported scene at their bind pose.
 */

import {
  Group,
  Euler,
  Quaternion,
  AnimationClip,
  NumberKeyframeTrack,
  QuaternionKeyframeTrack,
  Mesh,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter";

// ─── types ───────────────────────────────────────────────────────────────────

export interface MotionFrame {
  /** Seconds since recording started */
  t: number;
  /** Blendshape categoryName → score (0–1) */
  blendshapes: Record<string, number>;
  /** Raw head Euler (x, y, z) from MediaPipe transformation matrix */
  headEuler: [number, number, number];
}

export interface RecorderState {
  isRecording: boolean;
  /** True once at least 2 frames have been captured and recording is stopped */
  hasFrames: boolean;
  frameCount: number;
  /** Seconds: elapsed while recording, total duration when stopped */
  duration: number;
}

// ─── module-level state ───────────────────────────────────────────────────────

let _isRecording = false;
let _frames: MotionFrame[] = [];
let _startTime = 0;
let _finalDuration = 0; // stored when recording stops

/** The GLTF scene Group set by Avatar.tsx so the exporter can walk it */
let _scene: Group | null = null;
/** All named nodes from useGraph, keyed by node.name */
let _nodes: Record<string, any> | null = null;
/** Meshes that carry morphTargetDictionary (Wolf3D_Head, Wolf3D_Teeth, etc.) */
let _headMeshes: Mesh[] = [];

// ─── pub/sub ─────────────────────────────────────────────────────────────────

type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

/**
 * Subscribe a callback to recorder state changes.
 * Returns an unsubscribe function.
 */
export function subscribeRecorder(fn: Listener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// ─── scene reference (called from Avatar.tsx) ─────────────────────────────────

/**
 * Avatar.tsx calls this in useEffect whenever the GLTF scene loads / reloads.
 * We store references to the live scene objects so the exporter can use them
 * without needing to traverse the R3F tree from outside the Canvas.
 */
export function setSceneForExport(
  scene: Group,
  nodes: Record<string, any>,
  meshes: Mesh[]
): void {
  _scene = scene;
  _nodes = nodes;
  _headMeshes = [...meshes];
}

// ─── state read ───────────────────────────────────────────────────────────────

export function getRecorderState(): RecorderState {
  const now = _isRecording
    ? (performance.now() - _startTime) / 1000
    : _finalDuration;

  return {
    isRecording: _isRecording,
    hasFrames: !_isRecording && _frames.length >= 2,
    frameCount: _frames.length,
    duration: now,
  };
}

// ─── recording controls ───────────────────────────────────────────────────────

export function startRecording(): void {
  if (_isRecording) return;
  _frames = [];
  _finalDuration = 0;
  _startTime = performance.now();
  _isRecording = true;
  _notify();
}

export function stopRecording(): void {
  if (!_isRecording) return;
  _isRecording = false;
  _finalDuration = (performance.now() - _startTime) / 1000;
  _notify();
}

export function discardRecording(): void {
  _isRecording = false;
  _frames = [];
  _finalDuration = 0;
  _notify();
}

// ─── hot-path frame capture (called from Avatar.tsx useFrame) ────────────────

/**
 * Called every render frame while isRecording is true.
 * Keeps overhead minimal: one timestamp read and one array push per frame.
 * Notifies subscribers every 30 frames so the UI timer stays responsive.
 */
export function captureFrame(
  currentBlendshapes: Array<{ categoryName: string; score: number }>,
  headEuler: [number, number, number]
): void {
  if (!_isRecording) return;

  const t = (performance.now() - _startTime) / 1000;

  const bsMap: Record<string, number> = {};
  for (let i = 0; i < currentBlendshapes.length; i++) {
    const bs = currentBlendshapes[i];
    bsMap[bs.categoryName] = bs.score;
  }

  _frames.push({ t, blendshapes: bsMap, headEuler });

  // Notify UI listeners at ~1 Hz (assuming ~30 fps)
  if (_frames.length % 30 === 0) _notify();
}

// ─── export ───────────────────────────────────────────────────────────────────

/**
 * Builds an AnimationClip from the captured frames, attaches it to the live
 * GLTF scene, and exports everything as a binary .glb that is immediately
 * downloaded by the browser.
 *
 * Edge cases handled:
 * • Fewer than 2 frames → throws a descriptive error.
 * • Missing scene reference (avatar not loaded) → throws.
 * • Morph targets with all-zero scores → track omitted (saves file size).
 * • Missing bones (non-RPM rigs) → those bone tracks are simply skipped.
 * • Single-frame duration guard: if t[-1] === 0, clamps to a minimum 1/60 s.
 * • All TypedArray views passed to KeyframeTracks for efficient serialisation.
 */
export async function buildAndExportGLB(): Promise<void> {
  // ── guards ──────────────────────────────────────────────────────────────────
  if (!_scene) {
    throw new Error(
      "No avatar scene is available. Load an avatar before exporting."
    );
  }
  if (_frames.length < 2) {
    throw new Error(
      `Only ${_frames.length} frame(s) were recorded. Record at least a few frames before saving.`
    );
  }

  const scene = _scene;
  const nodes = _nodes!;
  const meshes = _headMeshes;
  const frames = _frames;

  // ── timeline ────────────────────────────────────────────────────────────────
  // Guarantee a non-zero clip duration in case of a very short burst
  let rawTimes = frames.map((f) => f.t);
  if (rawTimes[rawTimes.length - 1] <= 0) {
    rawTimes = rawTimes.map((_, i) => i / 60);
  }
  const times = new Float32Array(rawTimes);

  const tracks: (NumberKeyframeTrack | QuaternionKeyframeTrack)[] = [];

  // ── morph target tracks ─────────────────────────────────────────────────────
  meshes.forEach((mesh: any) => {
    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

    const dict: Record<string, number> = mesh.morphTargetDictionary;

    Object.entries(dict).forEach(([shapeName]) => {
      const values = new Float32Array(frames.length);
      let hasMotion = false;

      for (let i = 0; i < frames.length; i++) {
        const v = frames[i].blendshapes[shapeName] ?? 0;
        values[i] = v;
        if (v > 0.001) hasMotion = true;
      }

      // Skip shapes that never moved — keeps the clip lean
      if (!hasMotion) return;

      // GLTFExporter resolves morphTargetInfluences tracks by the shape NAME
      // string (not the numeric index). It internally does:
      //   mesh.morphTargetDictionary[trackName] → index
      // Passing the index as a number causes "Morph target name not found: N".
      tracks.push(
        new NumberKeyframeTrack(
          `${mesh.name}.morphTargetInfluences[${shapeName}]`,
          times,
          values
        )
      );
    });
  });

  // ── bone rotation tracks ────────────────────────────────────────────────────
  // Replicate exactly the same Euler-to-bone mapping used in Avatar.tsx
  // so the exported animation plays back identically to the live preview.
  const boneConfigs = [
    {
      key: "Head",
      toEuler: (f: MotionFrame) =>
        new Euler(f.headEuler[0], f.headEuler[1], f.headEuler[2]),
    },
    {
      key: "Neck",
      toEuler: (f: MotionFrame) =>
        new Euler(
          f.headEuler[0] / 5 + 0.3,
          f.headEuler[1] / 5,
          f.headEuler[2] / 5
        ),
    },
    {
      key: "Spine2",
      toEuler: (f: MotionFrame) =>
        new Euler(
          f.headEuler[0] / 10,
          f.headEuler[1] / 10,
          f.headEuler[2] / 10
        ),
    },
  ];

  const _q = new Quaternion();

  boneConfigs.forEach(({ key, toEuler }) => {
    const bone = nodes[key];
    if (!bone) return; // non-standard rig — skip gracefully

    const quatValues = new Float32Array(frames.length * 4);

    for (let i = 0; i < frames.length; i++) {
      _q.setFromEuler(toEuler(frames[i]));
      quatValues[i * 4 + 0] = _q.x;
      quatValues[i * 4 + 1] = _q.y;
      quatValues[i * 4 + 2] = _q.z;
      quatValues[i * 4 + 3] = _q.w;
    }

    // GLTFExporter resolves: scene.getObjectByName(bone.name) → quaternion
    tracks.push(
      new QuaternionKeyframeTrack(
        `${bone.name}.quaternion`,
        times,
        quatValues
      )
    );
  });

  if (tracks.length === 0) {
    throw new Error(
      "No animated tracks were detected. Make sure MediaPipe is tracking before recording."
    );
  }

  // ── build AnimationClip ─────────────────────────────────────────────────────
  const clip = new AnimationClip("FacialCapture", -1, tracks);

  // ── GLTFExporter ────────────────────────────────────────────────────────────
  const exporter = new GLTFExporter();

  const result = await exporter.parseAsync(scene, {
    binary: true,
    animations: [clip],
    // Export all nodes (including non-visible skeleton bones)
    onlyVisible: false,
    // Embed all textures so the .glb is fully self-contained
    embedImages: true,
  });

  // ── download ────────────────────────────────────────────────────────────────
  const buffer = result as ArrayBuffer;
  const blob = new Blob([buffer], { type: "model/gltf-binary" });
  const objectUrl = URL.createObjectURL(blob);

  const timestamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace("T", "_")
    .replace(/:/g, "-");

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `facial_capture_${timestamp}.glb`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Revoke after a tick so the browser has time to start the download
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
