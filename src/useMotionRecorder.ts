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
import type { SecondaryMotionSystem } from "./SecondaryMotionSystem";

// ─── playback notification (module-level) ─────────────────────────────────────
// After a successful export App.tsx needs the GLB blob + a generated ID so it
// can enter playback mode and open the motion library. We use a pub/sub pattern
// identical to subscribeRecorder so nothing crosses the Canvas boundary.

export interface PlaybackReadyPayload {
  blob: Blob;
  motionId: string;
  name: string;
  durationSeconds: number;
  /** The avatar URL that was active when this motion was recorded */
  avatarUrl?: string;
}

type PlaybackListener = (payload: PlaybackReadyPayload) => void;
const _playbackListeners = new Set<PlaybackListener>();

export function subscribePlaybackReady(fn: PlaybackListener): () => void {
  _playbackListeners.add(fn);
  return () => _playbackListeners.delete(fn);
}

function _notifyPlaybackReady(payload: PlaybackReadyPayload) {
  _playbackListeners.forEach((fn) => fn(payload));
}

/** Generate a short unique ID for a motion. */
function _makeMotionId(): string {
  return `motion_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── types ───────────────────────────────────────────────────────────────────

export interface MotionFrame {
  /** Seconds since recording started */
  t: number;
  /** Blendshape categoryName → score (0–1) */
  blendshapes: Record<string, number>;
  /** Raw head Euler (x, y, z) from MediaPipe transformation matrix */
  headEuler: [number, number, number];
  /**
   * Secondary motion bone quaternions snapshotted after spring update.
   * boneName → [x, y, z, w]. Only present when a SecondaryMotionSystem is
   * registered; omitted entirely when no secondary chains are active.
   */
  secondaryBones?: Record<string, [number, number, number, number]>;
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

/** Cached blob from the last stopRecording() build — reused by buildAndExportGLB */
// eslint-disable-next-line prefer-const
let _cachedBlob: { blob: Blob; name: string } | null = null;

/** The GLTF scene Group set by Avatar.tsx so the exporter can walk it */
let _scene: Group | null = null;
/** All named nodes from useGraph, keyed by node.name */
let _nodes: Record<string, any> | null = null;
/** Meshes that carry morphTargetDictionary (Wolf3D_Head, Wolf3D_Teeth, etc.) */
let _headMeshes: Mesh[] = [];
/** The avatar URL that was active when setSceneForExport was last called */
let _avatarUrl: string | null = null;
/**
 * Optional secondary motion system. When set, its bone quaternions are
 * snapshotted every frame and baked into the exported AnimationClip.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let _secondarySystem: SecondaryMotionSystem | null = null;

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
 * avatarUrl is stored so it can be embedded in the exported GLB extras.
 */
export function setSceneForExport(
  scene: Group,
  nodes: Record<string, any>,
  meshes: Mesh[],
  avatarUrl?: string
): void {
  _scene = scene;
  _nodes = nodes;
  _headMeshes = [...meshes];
  if (avatarUrl) _avatarUrl = avatarUrl;
}

/**
 * Register (or clear) the active SecondaryMotionSystem.
 * Call with the system instance after useSecondaryMotion creates it, and with
 * null when the avatar unmounts or chains become empty.
 */
export function setSecondaryMotionSystem(
  system: SecondaryMotionSystem | null
): void {
  _secondarySystem = system;
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

// ─── recording controls ───────────────────────────────────────────────────���───

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

  // Immediately build the GLB blob in memory so playback can start right away,
  // before the user clicks "save .glb". This is non-blocking — errors are
  // swallowed silently here; the Save button will surface them if needed.
  if (_frames.length >= 2) {
    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace("T", "_")
      .replace(/:/g, "-");
    const fileName = `facial_capture_${timestamp}.glb`;
    const snapshotAvatarUrl = _avatarUrl ?? undefined;
    buildGLBBlob()
      .then(({ blob, durationSeconds }) => {
        const motionId = _makeMotionId();
        _cachedBlob = { blob, name: fileName };
        _notifyPlaybackReady({ blob, motionId, name: fileName, durationSeconds, avatarUrl: snapshotAvatarUrl });

        // Attempt Drive upload immediately if tokens are already present.
        // Import lazily to avoid circular deps at module load time.
        import("./useDriveSync").then(({ hasDriveAccess, uploadToDrive }) => {
          if (hasDriveAccess()) {
            uploadToDrive(blob, fileName, durationSeconds, snapshotAvatarUrl).catch((err) => {
              console.warn("[recorder] Auto Drive upload failed:", err?.message);
            });
          }
        }).catch(() => { /* useDriveSync unavailable */ });
      })
      .catch((err) => {
        console.warn("[recorder] Playback blob build failed:", err?.message);
      });
  }
}

export function discardRecording(): void {
  _isRecording = false;
  _frames = [];
  _finalDuration = 0;
  _cachedBlob = null;
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

  // Snapshot secondary bone quaternions from the spring system this frame.
  // snapshotBoneQuaternions() is cheap — it just reads .quaternion off each bone.
  const secondaryBones = _secondarySystem
    ? _secondarySystem.snapshotBoneQuaternions()
    : undefined;

  _frames.push({ t, blendshapes: bsMap, headEuler, secondaryBones });

  // Notify UI listeners at ~1 Hz (assuming ~30 fps)
  if (_frames.length % 30 === 0) _notify();
}

// ─── export ───────────────────────────────────────────────────────────────────

/**
 * Builds a GLB ArrayBuffer from the captured frames and returns it as a Blob.
 * Does NOT download the file or notify listeners — useful for programmatic use.
 */
export async function buildGLBBlob(): Promise<{ blob: Blob; durationSeconds: number }> {
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

  // ── secondary motion bone tracks ───────────────────────────────────────────
  // If secondary bone data was captured, build one QuaternionKeyframeTrack per
  // unique bone name. Bones are matched by name in the exported GLTF scene so
  // the playback is identical to what the user saw during recording.
  if (frames.some((f) => f.secondaryBones && Object.keys(f.secondaryBones).length > 0)) {
    // Collect all unique bone names across all frames.
    const boneNames = new Set<string>();
    for (const f of frames) {
      if (f.secondaryBones) {
        for (const name of Object.keys(f.secondaryBones)) {
          boneNames.add(name);
        }
      }
    }

    for (const boneName of Array.from(boneNames)) {
      const quatValues = new Float32Array(frames.length * 4);
      // Use the identity quaternion [0,0,0,1] as fallback for any frame where
      // the bone data is missing (e.g. the first frame before spring init).
      for (let i = 0; i < frames.length; i++) {
        const q = frames[i].secondaryBones?.[boneName];
        quatValues[i * 4 + 0] = q ? q[0] : 0;
        quatValues[i * 4 + 1] = q ? q[1] : 0;
        quatValues[i * 4 + 2] = q ? q[2] : 0;
        quatValues[i * 4 + 3] = q ? q[3] : 1;
      }
      tracks.push(
        new QuaternionKeyframeTrack(
          `${boneName}.quaternion`,
          times,
          quatValues
        )
      );
    }
  }

  if (tracks.length === 0) {
    throw new Error(
      "No animated tracks were detected. Make sure MediaPipe is tracking before recording."
    );
  }

  // ── build AnimationClip ──────────────────────────────────────────────────��──
  const clip = new AnimationClip("FacialCapture", -1, tracks);
  const durationSeconds = clip.duration;

  // ── GLTFExporter ────────────────────────────────────────────────────────────
  const exporter = new GLTFExporter();

  // Embed avatarUrl into scene.userData so GLTFExporter writes it into
  // asset.extras in the output GLB (userData is the supported mechanism —
  // the 'extras' option key does not exist on GLTFExporterOptions).
  const prevUserData = scene.userData ? { ...scene.userData } : {};
  if (_avatarUrl) {
    scene.userData = { ...prevUserData, avatarUrl: _avatarUrl };
  }

  const result = await exporter.parseAsync(scene, {
    binary: true,
    animations: [clip],
    onlyVisible: false,
    embedImages: true,
  });

  // Restore scene.userData so we don't pollute the live scene
  scene.userData = prevUserData;

  const buffer = result as ArrayBuffer;
  const blob = new Blob([buffer], { type: "model/gltf-binary" });
  return { blob, durationSeconds };
}

/**
 * Builds a GLB, triggers a browser download, notifies playback subscribers,
 * and (if Drive tokens are present) uploads to Google Drive in the background.
 *
 * This is the function called by RecordingControls on "save .glb".
 */
export async function buildAndExportGLB(): Promise<void> {
  const timestamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace("T", "_")
    .replace(/:/g, "-");
  const fileName = `facial_capture_${timestamp}.glb`;

  // Re-use the blob already built by stopRecording() if available — avoids a
  // second heavy GLTFExporter pass for the same take.
  let blob: Blob;
  let durationSeconds: number;
  if (_cachedBlob) {
    blob = _cachedBlob.blob;
    durationSeconds = 0; // duration already notified; this path is download-only
  } else {
    const result = await buildGLBBlob();
    blob = result.blob;
    durationSeconds = result.durationSeconds;

    // Notify playback if it hasn't been notified yet (edge case: user skips stop
    // and goes straight to export without the stopRecording async completing)
    const motionId = _makeMotionId();
    _cachedBlob = { blob, name: fileName };
    _notifyPlaybackReady({ blob, motionId, name: fileName, durationSeconds });
  }

  // ── browser download ───────────────────────────────────────────────────────
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

  // ── notify playback listeners ──────────────────────────────────────────────
  const motionId = _makeMotionId();
  _notifyPlaybackReady({ blob, motionId, name: fileName, durationSeconds });

  // ── Drive upload (background, non-blocking) ─────────────────────────────────
  // Import lazily to avoid circular deps; graceful fallback if Drive not ready.
  try {
    const { hasDriveAccess, uploadToDrive } = await import("./useDriveSync");
    if (hasDriveAccess()) {
      uploadToDrive(blob, fileName, durationSeconds).catch((err) => {
        console.warn("[recorder] Background Drive upload failed:", err?.message);
      });
    }
  } catch { /* useDriveSync not available */ }
}
