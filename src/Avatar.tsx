/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 *
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson"
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useGraph } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Euler, Mesh, Object3D, Quaternion } from "three";
import { blendshapes, rotation, headMesh, headMatrix, isMobileTracking, isMediaPipeActive } from "./FaceTracking";
import { captureFrame, setSceneForExport } from "./useMotionRecorder";
import { useAnimationPlayer } from "./useAnimationPlayer";
import { usePlaybackAnimation } from "./usePlaybackAnimation";
import { BlendshapeSmoother, QuaternionSmoother } from "./smoothing";
import { getAvatarMetadata } from "./avatarMetadata";
import { useSecondaryMotion } from "./useSecondaryMotion";

// ─── Dev flags ───────────────────────────────────────────────────────────────
// Set DEBUG_COLLISION_SPHERES to true to render cyan wireframe spheres over
// every collision volume. The sphere is scaled to (bounding-sphere radius +
// collisionMargin), which is the exact push-out distance used each frame.
// Skinned mesh volumes follow the live skeleton pose — if a sphere drifts away
// from the body, the mesh is not skinned or its bone hierarchy is broken.
const DEBUG_COLLISION_SPHERES = false;

interface AvatarProps {
  url: string;
  onLoaded?: () => void;
  /** When set, replays this GLB blob instead of running live face tracking. */
  playbackBlob?: Blob | null;
}

// ─── module-level smoother singletons ────────────────────────────────────────
// Created once outside the component so they accumulate state across renders
// without being recreated. Same pattern as FaceTracking's blendshapes / rotation
// module globals — zero React overhead on the useFrame hot path.

const blendshapeSmoother = new BlendshapeSmoother();
const quaternionSmoother = new QuaternionSmoother();

// Reusable Quaternion and Euler instances — allocated once, mutated each frame
// to avoid per-frame garbage collection pressure.
const _targetQuat = new Quaternion();
const _smoothedEuler = new Euler();

function Avatar({ url, onLoaded, playbackBlob }: AvatarProps) {
  const { scene } = useGLTF(url);
  const { nodes } = useGraph(scene);

  // Keep a stable ref to the scene so useAnimationPlayer can use it
  // without re-creating the mixer on every render.
  const sceneRef = useRef<Object3D>(scene);
  sceneRef.current = scene;

  useEffect(() => {
    headMesh.length = 0;
    if (nodes.Wolf3D_Head) headMesh.push(nodes.Wolf3D_Head);
    if (nodes.Wolf3D_Teeth) headMesh.push(nodes.Wolf3D_Teeth);
    if (nodes.Wolf3D_Beard) headMesh.push(nodes.Wolf3D_Beard);
    if (nodes.Wolf3D_Avatar) headMesh.push(nodes.Wolf3D_Avatar);
    if (nodes.Wolf3D_Head_Custom) headMesh.push(nodes.Wolf3D_Head_Custom);
    if (nodes.avatar) headMesh.push(nodes.avatar);
    if (nodes.Avatar) headMesh.push(nodes.Avatar);
    if (nodes.face) headMesh.push(nodes.face);

    setSceneForExport(scene, nodes, headMesh as Mesh[], url);

    // Reset smoothers whenever the avatar reloads so we don't carry stale
    // state from a previous session into the new pose.
    blendshapeSmoother.reset();
    quaternionSmoother.reset();

    if (onLoaded) onLoaded();
  }, [nodes, url, onLoaded, scene]);

  // ── Secondary motion ────────────────────────────────────────────────────
  // Look up per-avatar metadata and initialise the spring secondary motion.
  // For avatars with no registered chains this is a complete no-op.
  const { secondaryMotion } = getAvatarMetadata(url);

  // Build the set of all root bone names owned by secondary motion so the
  // animation mixer can strip those tracks out — preventing it from
  // overwriting the spring-integrated transforms every frame.
  const springBoneNameSet = useMemo(
    () => new Set(secondaryMotion.map((c) => c.chainStart)),
    [secondaryMotion]
  );

  // Wire up the idle animation. Pass a stable getter so the hook always
  // reads the latest mutable module variable without needing React state reactivity.
  // Also pass the excluded bone names so the mixer does not touch hair bones.
  // Idle animation is disabled during playback so the two mixers don't conflict.
  useAnimationPlayer({
    characterScene: playbackBlob ? null : scene,
    getIsMediaPipeActive: () => isMediaPipeActive,
    excludeBoneNames: springBoneNameSet,
  });

  // Playback animation — only active when a blob is provided
  const playbackControls = usePlaybackAnimation({
    characterScene: playbackBlob ? scene : null,
    playbackBlob: playbackBlob ?? null,
    excludeBoneNames: springBoneNameSet,
  });

  useSecondaryMotion({
    scene,
    chains: secondaryMotion,
    debugCollision: DEBUG_COLLISION_SPHERES,
  });

  useFrame((_, delta) => {
    // In playback mode the usePlaybackAnimation hook drives the mixer each frame.
    // Live face tracking must not touch bones at the same time.
    if (playbackBlob) return;

    // Only drive bones + blendshapes when MediaPipe has live data.
    if (!isMediaPipeActive || blendshapes.length === 0) return;

    // ── blendshape smoothing (delta-time EMA) ──────────────────────────────
    // Smooth all scores once using the frame delta so the EMA behaves
    // identically at any frame rate. Results are stored in smoothedBlendshapes
    // and reused for both the mesh update and captureFrame — the EMA state
    // only advances once per frame and the recording matches the live preview.
    const smoothedBlendshapes = blendshapes.map((element) => ({
      categoryName: element.categoryName,
      score: blendshapeSmoother.smooth(element.categoryName, element.score, delta),
    }));

    smoothedBlendshapes.forEach(({ categoryName, score }) => {
      headMesh.forEach((mesh) => {
        const index = mesh.morphTargetDictionary?.[categoryName];
        if (index >= 0) {
          mesh.morphTargetInfluences[index] = score;
        }
      });
    });

    // ── head rotation quaternion smoothing (delta-time SLERP) ──────────────
    // Desktop: decompose Matrix4 → Quaternion → slerp with delta.
    // Mobile:  Euler → Quaternion → slerp with delta.
    // Both paths use the same smoother instance so behaviour is identical
    // on all platforms at any frame rate.
    let smoothedQuat: Quaternion;

    if (headMatrix && !isMobileTracking) {
      headMatrix.decompose(
        { set: () => { } } as any,
        _targetQuat,
        { set: () => { } } as any
      );
      smoothedQuat = quaternionSmoother.smooth(_targetQuat, delta);
    } else {
      smoothedQuat = quaternionSmoother.smoothEuler(rotation, delta);
    }

    // Convert the smoothed quaternion back to an Euler so we can apply the
    // fractional neck/spine scaling that the rig requires.
    _smoothedEuler.setFromQuaternion(smoothedQuat, "XYZ");

    // Apply to bones
    if (nodes.Head) nodes.Head.quaternion.copy(smoothedQuat);
    if (nodes.Neck) nodes.Neck.rotation.set(
      _smoothedEuler.x / 5 + 0.3,
      _smoothedEuler.y / 5,
      _smoothedEuler.z / 5
    );
    if (nodes.Spine2) nodes.Spine2.rotation.set(
      _smoothedEuler.x / 10,
      _smoothedEuler.y / 10,
      _smoothedEuler.z / 10
    );

    // ── capture frame (WYSIWYG) ────────────────────────────────────────────
    // Pass the already-smoothed blendshapes and smoothed Euler so the recorded
    // GLB matches exactly what is visible in the live preview — on both desktop
    // and mobile. No second smoothing pass — smoothedBlendshapes is reused.
    captureFrame(
      smoothedBlendshapes,
      [_smoothedEuler.x, _smoothedEuler.y, _smoothedEuler.z]
    );
  });

  // Expose playback controls via window so App.tsx can call togglePlay/seek/setLoop
  // without needing React context across the Canvas boundary.
  useEffect(() => {
    (window as any).__playbackControls = playbackControls;
    return () => { delete (window as any).__playbackControls; };
  }, [playbackControls]);

  return <primitive object={scene} position={[0, 0, 0]} />;
}

export default Avatar;
