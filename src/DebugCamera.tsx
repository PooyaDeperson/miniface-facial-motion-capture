// DebugCamera.tsx
// ─────────────────────────────────────────────────────────────────────────────
// A drop-in debug overlay for the R3F Canvas.
// Disabled by default. Enable from the browser console:
//
//   window.__DEBUG_CAM = true   → activates free-fly OrbitControls
//   window.__DEBUG_CAM = false  → restores the locked production camera
//
// The component polls every 500 ms so you never need to reload the page.
// It touches zero existing code — just add <DebugCamera /> inside <Canvas>.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";

declare global {
  interface Window {
    __DEBUG_CAM?: boolean;
  }
}

const DEBUG_CAMERA_START = { x: 0, y: 1.6, z: 4 } as const;

const DebugCamera: React.FC = () => {
  const [active, setActive] = useState(false);
  const { camera } = useThree();

  // Remember the production camera state so we can restore it when debug is
  // turned off while the page is still open.
  const savedPos = useRef({ x: camera.position.x, y: camera.position.y, z: camera.position.z });
  const savedRot = useRef({ x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z });

  // Poll window.__DEBUG_CAM every 500 ms — cheap, no bundler magic needed.
  useEffect(() => {
    const interval = setInterval(() => {
      const flag = !!window.__DEBUG_CAM;
      setActive((prev) => {
        if (flag === prev) return prev;

        if (flag) {
          // Save current production camera state before taking over.
          savedPos.current = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
          savedRot.current = { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z };

          // Move camera to a useful starting position so the full avatar is visible.
          camera.position.set(DEBUG_CAMERA_START.x, DEBUG_CAMERA_START.y, DEBUG_CAMERA_START.z);
          camera.lookAt(0, 1.6, 0);

          console.log("[DebugCamera] activated — WASD/mouse drag to fly, scroll to zoom");
        } else {
          // Restore production position.
          camera.position.set(savedPos.current.x, savedPos.current.y, savedPos.current.z);
          camera.rotation.set(savedRot.current.x, savedRot.current.y, savedRot.current.z);
          console.log("[DebugCamera] deactivated — production camera restored");
        }

        return flag;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [camera]);

  if (!active) return null;

  return (
    <OrbitControls
      makeDefault
      enablePan
      enableZoom
      enableRotate
      // No angle/distance clamping — full freedom
      minDistance={0.1}
      maxDistance={50}
    />
  );
};

export default DebugCamera;
