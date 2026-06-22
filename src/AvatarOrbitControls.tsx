
/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 * 
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson"
 */


// AvatarOrbitControls.tsx
import React, { useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { Vector3 } from "three";

interface AvatarOrbitControlsProps {
  target?: [number, number, number];
  enableZoom?: boolean;
  isFlipped?: boolean;
}

const AvatarOrbitControls: React.FC<AvatarOrbitControlsProps> = ({
  target = [0, 1.62, 0],
  enableZoom = true,
  isFlipped = false,
}) => {
  const controlsRef = useRef<any>(null);

  // Define min/max camera positions along Z
  const minZ = 0.5898841583773153;
  const maxZ = 1.2732469772283634;

  // Compute distance from target
  const targetVector = new Vector3(...target);
  const minDistance = new Vector3(0, 1.68, minZ).distanceTo(targetVector);
  const maxDistance = new Vector3(0, 1.68, maxZ).distanceTo(targetVector);

  // When the canvas is CSS-flipped (scaleX -1), mouse drag left/right is visually
  // inverted — a rightward drag moves the camera left on screen. Negating
  // rotateSpeed restores intuitive drag direction for the viewer.
  const rotateSpeed = isFlipped ? -1 : 1;

  return (
    <OrbitControls
      ref={controlsRef}
      target={target}
      enablePan={false}
      enableZoom={enableZoom}
      minPolarAngle={Math.PI / 2}
      maxPolarAngle={Math.PI / 2}
      minDistance={minDistance}
      maxDistance={maxDistance}
      rotateSpeed={rotateSpeed}
    />
  );
};

export default AvatarOrbitControls;
