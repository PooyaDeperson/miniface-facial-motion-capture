
/*
 * Copyright (c) 2025 Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 * 
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson"
 */

import { useEffect } from "react";
import { useFrame, useGraph } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Mesh } from "three";
import { blendshapes, rotation, headMesh } from "./FaceTracking";
import { captureFrame, setSceneForExport } from "./useMotionRecorder";

interface AvatarProps {
  url: string;
  onLoaded?: () => void;
}

function Avatar({ url, onLoaded }: AvatarProps) {
  const { scene } = useGLTF(url);
  const { nodes } = useGraph(scene);

  useEffect(() => {
    headMesh.length = 0;
    if (nodes.Wolf3D_Head) headMesh.push(nodes.Wolf3D_Head);
    if (nodes.Wolf3D_Teeth) headMesh.push(nodes.Wolf3D_Teeth);
    if (nodes.Wolf3D_Beard) headMesh.push(nodes.Wolf3D_Beard);
    if (nodes.Wolf3D_Avatar) headMesh.push(nodes.Wolf3D_Avatar);
    if (nodes.Wolf3D_Head_Custom) headMesh.push(nodes.Wolf3D_Head_Custom);

    // Provide the recorder with the live scene + nodes so it can build the
    // AnimationClip and export when the user hits "Save GLB".
    setSceneForExport(scene, nodes, headMesh as Mesh[]);

    if (onLoaded) onLoaded();
  }, [nodes, url, onLoaded, scene]);

  useFrame(() => {
    if (blendshapes.length > 0) {
      blendshapes.forEach((element) => {
        headMesh.forEach((mesh) => {
          let index = mesh.morphTargetDictionary[element.categoryName];
          if (index >= 0) {
            mesh.morphTargetInfluences[index] = element.score;
          }
        });
      });
      nodes.Head.rotation.set(rotation.x, rotation.y, rotation.z);
      nodes.Neck.rotation.set(rotation.x / 5 + 0.3, rotation.y / 5, rotation.z / 5);
      nodes.Spine2.rotation.set(rotation.x / 10, rotation.y / 10, rotation.z / 10);

      // Capture this frame into the recorder (no-op when not recording).
      // Called after all bone/morph updates so captured values match what
      // is currently displayed on screen.
      captureFrame(blendshapes, [rotation.x, rotation.y, rotation.z]);
    }
  });

  return <primitive object={scene} position={[0, 0, 0]} />;
}

export default Avatar;
