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
import { useFrame, useGraph } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Mesh, Object3D } from "three";
import { blendshapes, rotation, headMesh, isMediaPipeActive } from "./FaceTracking";
import { captureFrame, setSceneForExport } from "./useMotionRecorder";
import { useAnimationPlayer } from "./useAnimationPlayer";

interface AvatarProps {
  url: string;
  onLoaded?: () => void;
}

function Avatar({ url, onLoaded }: AvatarProps) {
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

    setSceneForExport(scene, nodes, headMesh as Mesh[]);

    if (onLoaded) onLoaded();
  }, [nodes, url, onLoaded, scene]);

  // Wire up the idle animation. Pass a stable getter so the hook always
  // reads the latest mutable module variable without needing React state reactivity.
  useAnimationPlayer({
    characterScene: scene,
    getIsMediaPipeActive: () => isMediaPipeActive,
  });

  useFrame(() => {
    // Only drive bones + blendshapes when MediaPipe has live data.
    if (!isMediaPipeActive || blendshapes.length === 0) return;

    // Apply face blendshapes.
    blendshapes.forEach((element) => {
      headMesh.forEach((mesh) => {
        const index = mesh.morphTargetDictionary?.[element.categoryName];
        if (index >= 0) {
          mesh.morphTargetInfluences[index] = element.score;
        }
      });
    });

    // Apply head/neck/spine rotation from MediaPipe.
    if (nodes.Head) nodes.Head.rotation.set(rotation.x, rotation.y, rotation.z);
    if (nodes.Neck) nodes.Neck.rotation.set(rotation.x / 5 + 0.3, rotation.y / 5, rotation.z / 5);
    if (nodes.Spine2) nodes.Spine2.rotation.set(rotation.x / 10, rotation.y / 10, rotation.z / 10);

    // Capture frame for the motion recorder (no-op when not recording).
    captureFrame(blendshapes, [rotation.x, rotation.y, rotation.z]);
  });

  return <primitive object={scene} position={[0, 0, 0]} />;
}

export default Avatar;
