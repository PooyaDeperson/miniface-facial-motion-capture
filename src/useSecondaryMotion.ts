/*
 * Copyright (c) 2025 Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 *
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson"
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

interface UseSecondaryMotionOptions {
  scene: Object3D;
  chains: SecondaryChainConfig[];
}

export function useSecondaryMotion({ scene, chains }: UseSecondaryMotionOptions): void {
  const systemRef = useRef<SecondaryMotionSystem | null>(null);

  useEffect(() => {
    if (chains.length === 0) {
      systemRef.current = null;
      return;
    }

    systemRef.current = new SecondaryMotionSystem(scene, chains);

    return () => {
      systemRef.current = null;
    };
  }, [scene, chains]);

  useFrame((_, delta) => {
    systemRef.current?.update(delta);
  });
}
