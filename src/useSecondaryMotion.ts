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
 * useSecondaryMotion.ts
 *
 * React Three Fiber hook that integrates SecondaryMotionSystem into the
 * render loop. Creates the system once per avatar load, then calls
 * system.update(delta) every frame. No Rapier / physics engine involved.
 */

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Object3D } from "three";
import { SecondaryMotionSystem, SecondaryChainConfig } from "./SecondaryMotionSystem";
import { setSecondaryMotionSystem } from "./useMotionRecorder";

interface UseSecondaryMotionOptions {
  scene: Object3D;
  chains: SecondaryChainConfig[];
  /**
   * When true, wireframe spheres are rendered over each collision primitive
   * every frame so you can see exactly where and how large the collision
   * volumes are in world space. Toggle without remounting — the system
   * picks up the value on the next frame.
   *
   * Suggested debug workflow:
   *  1. Set debugCollision={true} here and observe the cyan wireframe spheres.
   *  2. The sphere shows the bounding volume used for push-out. If it is too
   *     large, reduce collisionMargin (or the mesh itself is oversized).
   *  3. If the sphere does not track the body correctly, the mesh may not be
   *     a SkinnedMesh — check the GLB node type.
   *  4. Console logs on init confirm whether each node was detected as skinned.
   *  Default: false.
   */
  debugCollision?: boolean;
}

export function useSecondaryMotion({ scene, chains, debugCollision = false }: UseSecondaryMotionOptions): void {
  const systemRef = useRef<SecondaryMotionSystem | null>(null);

  useEffect(() => {
    if (chains.length === 0) {
      systemRef.current?.dispose();
      systemRef.current = null;
      setSecondaryMotionSystem(null);
      return;
    }

    systemRef.current?.dispose();
    const system = new SecondaryMotionSystem(scene, chains);
    system.debugCollision = debugCollision;
    systemRef.current = system;
    setSecondaryMotionSystem(system);

    return () => {
      systemRef.current?.dispose();
      systemRef.current = null;
      setSecondaryMotionSystem(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, chains]);

  // Allow toggling debug at runtime without remounting.
  useFrame((_, delta) => {
    if (systemRef.current) {
      systemRef.current.debugCollision = debugCollision;
      systemRef.current.update(delta);
    }
  });
}
