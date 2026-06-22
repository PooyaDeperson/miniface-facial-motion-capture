// DebugJoints.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Drop-in debug overlay for the R3F Canvas.
// Enable / disable from the browser console without reloading:
//
//   window.__DEBUG_JOINTS = true    → shows spheres, bone lines, bone shades
//   window.__DEBUG_JOINTS = false   → removes the overlay
//
// Three layers rendered per bone:
//   1. Cyan wireframe sphere at the joint position
//   2. Cyan line from the bone back to its parent bone
//   3. Semi-transparent capsule ("shade") filling the bone segment
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Bone,
  Object3D,
  Vector3,
  Mesh,
  CylinderGeometry,
  MeshBasicMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  LineSegments,
  LineBasicMaterial,
  Quaternion,
} from "three";
import { Html } from "@react-three/drei";

declare global {
  interface Window {
    __DEBUG_JOINTS?: boolean;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function collectBones(root: Object3D, out: Bone[] = []): Bone[] {
  root.traverse((obj) => {
    if (obj instanceof Bone) out.push(obj);
  });
  return out;
}

// Scratch vectors — reused every frame.
const _wA = new Vector3();
const _wB = new Vector3();
const _mid = new Vector3();
const _dir = new Vector3();
const _up = new Vector3(0, 1, 0);
const _q = new Quaternion();

// ── Joint sphere + label ──────────────────────────────────────────────────────

const JointMarker: React.FC<{ bone: Bone }> = ({ bone }) => {
  const [pos, setPos] = useState<[number, number, number]>([0, 0, 0]);

  useFrame(() => {
    bone.getWorldPosition(_wA);
    setPos([_wA.x, _wA.y, _wA.z]);
  });

  return (
    <group position={pos}>
      <mesh>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshBasicMaterial color="#000000" wireframe />
      </mesh>
      <Html
        center
        style={{
          pointerEvents: "none",
          userSelect: "none",
          fontSize: "0.2px",
          fontFamily: "monospace",
          color: "#000000",
          // background: "rgba(0,0,0,0.55)",
          // padding: "1px 3px",
          // borderRadius: "2px",
          // whiteSpace: "nowrap",
          lineHeight: 1,

        }}
        distanceFactor={6}
      >
        {bone.name}
      </Html>
    </group>
  );
};

// ── Bone line (child → parent) ────────────────────────────────────────────────

const BoneLine: React.FC<{ bone: Bone; parent: Bone }> = ({ bone, parent }) => {
  const ref = useRef<LineSegments>(null);

  useFrame(() => {
    if (!ref.current) return;
    bone.getWorldPosition(_wA);
    parent.getWorldPosition(_wB);

    const positions = ref.current.geometry.attributes.position
      .array as Float32Array;
    positions[0] = _wA.x;
    positions[1] = _wA.y;
    positions[2] = _wA.z;
    positions[3] = _wB.x;
    positions[4] = _wB.y;
    positions[5] = _wB.z;
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(new Float32Array(6), 3));

  return (
    <lineSegments ref={ref} geometry={geo} renderOrder={999}>
      <lineBasicMaterial color="#00ffff" opacity={0.7} transparent depthTest={false} />
    </lineSegments>
  );
};

// ── Bone shade (semi-transparent capsule between child and parent) ─────────────

const BoneShade: React.FC<{ bone: Bone; parent: Bone }> = ({ bone, parent }) => {
  const ref = useRef<Mesh>(null);

  useFrame(() => {
    if (!ref.current) return;

    bone.getWorldPosition(_wA);
    parent.getWorldPosition(_wB);

    // Midpoint
    _mid.addVectors(_wA, _wB).multiplyScalar(0.5);
    ref.current.position.copy(_mid);

    // Length
    const len = _wA.distanceTo(_wB);
    ref.current.scale.set(1, len, 1);

    // Orientation: align Y-axis of cylinder with bone direction
    _dir.subVectors(_wB, _wA).normalize();
    _q.setFromUnitVectors(_up, _dir);
    ref.current.quaternion.copy(_q);
  });

  return (
    <mesh ref={ref} renderOrder={998}>
      {/* radius, height=1 (scaled per-frame), radialSegments */}
      <cylinderGeometry args={[0.008, 0.008, 1, 6]} />
      <meshBasicMaterial
        color="#00aaff"
        opacity={0.25}
        transparent
        depthTest={false}
        wireframe={false}
      />
    </mesh>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const DebugJoints: React.FC = () => {
  const [active, setActive] = useState(false);
  const [bones, setBones] = useState<Bone[]>([]);
  const { scene } = useThree();

  useEffect(() => {
    const interval = setInterval(() => {
      const flag = !!window.__DEBUG_JOINTS;
      setActive((prev) => {
        if (flag === prev) return prev;
        if (flag) {
          const found = collectBones(scene);
          setBones(found);
          console.log(
            `[DebugJoints] activated — found ${found.length} bones:`,
            found.map((b) => b.name)
          );
        } else {
          setBones([]);
          console.log("[DebugJoints] deactivated");
        }
        return flag;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [scene]);

  if (!active || bones.length === 0) return null;

  return (
    <>
      {/* Spheres + labels at every joint */}
      {bones.map((bone) => (
        <JointMarker key={`jm-${bone.uuid}`} bone={bone} />
      ))}

      {/* Lines and shades for every bone that has a Bone parent */}
      {bones
        .filter((bone) => bone.parent instanceof Bone)
        .map((bone) => {
          const parentBone = bone.parent as Bone;
          return (
            <group key={`bs-${bone.uuid}`}>
              <BoneLine bone={bone} parent={parentBone} />
              <BoneShade bone={bone} parent={parentBone} />
            </group>
          );
        })}
    </>
  );
};

export default DebugJoints;
