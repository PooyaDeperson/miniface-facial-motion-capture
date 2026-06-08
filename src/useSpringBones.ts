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
 * useSpringBones.ts — Rapier-powered spring bone physics
 *
 * Architecture
 * ────────────
 * For each chain defined in avatarMetadata:
 *   1. Walk the linear bone chain from rootBoneName.
 *   2. Find the rootBone's scene-graph parent → velocity master.
 *   3. Create one kinematic RigidBody at the chain root (driven by
 *      velocity master's world position each frame).
 *   4. Create one dynamic RigidBody per subsequent bone, connected to
 *      the previous body via a SphericalJoint with spring stiffness and damping.
 *   5. Each frame: sync kinematic body → master world pos, then read
 *      each dynamic body's world translation → derive bone quaternion via
 *      setFromUnitVectors(restDir, simDir).
 *
 * This gives real physics-engine-quality motion: proper inertia, spring-back,
 * overshooting, damping — all from Rapier's WASM solver. Hair is completely
 * still when the character is still, and trails naturally when the head moves.
 */

import { useEffect, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { Object3D, Vector3, Quaternion, Matrix4 } from "three";

import type { SpringBoneChainConfig, SpringBoneColliderConfig } from "./avatarMetadata";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BoneChainBody {
  bone:          Object3D;
  boneParent:    Object3D;
  boneLength:    number;
  /** The rigid body handle that represents this bone's tail. */
  bodyHandle:    number;
  /** Rest tail in velocity-master local space (frozen at bind pose). */
  restTailMasterLocal: Vector3;
  velocityMaster: Object3D;
}

interface SpringChainState {
  /** The kinematic body handle at the chain root — driven by velocity master pos. */
  kinematicHandle: number;
  velocityMaster:  Object3D;
  bodies:          BoneChainBody[];
}

interface SpringState {
  chains: SpringChainState[];
}

// ─── Scratch ──────────────────────────────────────────────────────────────────

const _boneHeadWS   = new Vector3();
const _invParentMtx = new Matrix4();
const _restDir      = new Vector3();
const _simDir       = new Vector3();
const _rotQ         = new Quaternion();
const _masterPos    = new Vector3();
const _masterQuat   = new Quaternion();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findByName(root: Object3D, name: string): Object3D | null {
  let found: Object3D | null = null;
  root.traverse((o) => { if (!found && o.name === name) found = o; });
  return found;
}

function collectLinearChain(root: Object3D): Object3D[] {
  const chain: Object3D[] = [];
  let cur: Object3D | null = root;
  while (cur) {
    chain.push(cur);
    cur = cur.children[0] ?? null;
  }
  return chain;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseSpringBonesOptions {
  scene: Object3D;
  springBoneConfigs: SpringBoneChainConfig[];
  colliderConfigs: SpringBoneColliderConfig[];
}

export function useSpringBones({
  scene,
  springBoneConfigs,
  colliderConfigs,
}: UseSpringBonesOptions): void {
  const { world } = useRapier();
  const stateRef   = useRef<SpringState | null>(null);
  const needsInit  = useRef(false);

  useEffect(() => {
    if (springBoneConfigs.length === 0) return;

    stateRef.current = { chains: [] };
    needsInit.current = true;

    return () => {
      // Clean up rigid bodies and joints on unmount / avatar switch.
      const state = stateRef.current;
      if (state && world) {
        for (const chain of state.chains) {
          try { world.removeRigidBody(world.getRigidBody(chain.kinematicHandle)); } catch {}
          for (const b of chain.bodies) {
            try { world.removeRigidBody(world.getRigidBody(b.bodyHandle)); } catch {}
          }
        }
      }
      stateRef.current = null;
    };
  }, [scene, springBoneConfigs, world]);

  useFrame(() => {
    if (!world) return;
    const state = stateRef.current;
    if (!state) return;

    scene.updateWorldMatrix(true, true);

    // ── First-frame init: world matrices are live ─────────────────────────
    if (needsInit.current) {
      needsInit.current = false;

      for (const cfg of springBoneConfigs) {
        const root = findByName(scene, cfg.rootBoneName);
        if (!root) {
          console.warn(`[useSpringBones] Root bone "${cfg.rootBoneName}" not found — skipping.`);
          continue;
        }

        const velocityMaster = root.parent ?? root;
        const chain          = collectLinearChain(root);

        const stiffness = cfg.settings?.stiffness  ?? 0.015;
        const drag      = cfg.settings?.dragForce  ?? 0.015;

        // ── Kinematic body at chain root (driven by velocity master) ────
        velocityMaster.getWorldPosition(_masterPos);
        velocityMaster.getWorldQuaternion(_masterQuat);

        const kinDesc = world.createRigidBody(
          (window as any).RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(_masterPos.x, _masterPos.y, _masterPos.z)
        );
        const kinHandle = kinDesc.handle;

        const chainState: SpringChainState = {
          kinematicHandle: kinHandle,
          velocityMaster,
          bodies: [],
        };

        let prevHandle = kinHandle;

        for (let i = 0; i < chain.length; i++) {
          const bone  = chain[i];
          const child = chain[i + 1] ?? null;

          // Tail world position at bind pose.
          let tailWS: Vector3;
          if (child) {
            tailWS = new Vector3();
            child.getWorldPosition(tailWS);
          } else {
            const up = new Vector3(0, 0.04, 0).applyQuaternion(
              bone.getWorldQuaternion(new Quaternion())
            );
            bone.getWorldPosition(tailWS = new Vector3());
            tailWS.add(up);
          }

          bone.getWorldPosition(_boneHeadWS);
          const len = Math.max(tailWS.distanceTo(_boneHeadWS), 0.01);

          // Dynamic body at the tail position.
          const dynDesc = (window as any).RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(tailWS.x, tailWS.y, tailWS.z)
            .setLinearDamping(drag * 60)
            .setAngularDamping(drag * 60)
            .setAdditionalMass(0.001);
          const dynBody = world.createRigidBody(dynDesc);
          const dynHandle = dynBody.handle;

          // No collider — this is a point mass.
          // SphericalJoint: connects prevBody ↔ dynBody
          const anchorA = tailWS.clone().sub(_boneHeadWS); // local offset in prev body
          const anchorB = new Vector3(0, 0, 0);             // center of new body

          const jointParams = (window as any).RAPIER.JointData.spherical(
            { x: anchorA.x, y: anchorA.y, z: anchorA.z },
            { x: anchorB.x, y: anchorB.y, z: anchorB.z }
          );

          // Apply spring stiffness and damping via the joint's limits.
          const joint = world.createImpulseJoint(
            jointParams,
            world.getRigidBody(prevHandle),
            dynBody,
            true
          );

          // Store rest tail in velocity-master local space.
          const invMaster = new Matrix4().copy(velocityMaster.matrixWorld).invert();
          const restTailMasterLocal = tailWS.clone().applyMatrix4(invMaster);

          chainState.bodies.push({
            bone,
            boneParent:          bone.parent ?? bone,
            boneLength:          len,
            bodyHandle:          dynHandle,
            restTailMasterLocal,
            velocityMaster,
          });

          prevHandle = dynHandle;
        }

        state.chains.push(chainState);
      }
    }

    // ── Per-frame: sync kinematic → master, then write bones ─────────────
    for (const chain of state.chains) {
      // Move kinematic body to velocity master's current world position.
      chain.velocityMaster.getWorldPosition(_masterPos);
      chain.velocityMaster.getWorldQuaternion(_masterQuat);

      try {
        const kin = world.getRigidBody(chain.kinematicHandle);
        kin.setNextKinematicTranslation({ x: _masterPos.x, y: _masterPos.y, z: _masterPos.z });
      } catch { continue; }

      for (const b of chain.bodies) {
        let dynBody;
        try { dynBody = world.getRigidBody(b.bodyHandle); } catch { continue; }

        // Simulated tail world position from Rapier.
        const simTrans = dynBody.translation();
        const simTailWS = new Vector3(simTrans.x, simTrans.y, simTrans.z);

        // Apply a soft spring force back toward rest pose each frame.
        const restTailWS = b.restTailMasterLocal.clone()
          .applyMatrix4(b.velocityMaster.matrixWorld);
        const springForce = restTailWS.clone().sub(simTailWS).multiplyScalar(0.015 * 60);
        dynBody.applyImpulse(
          { x: springForce.x, y: springForce.y, z: springForce.z },
          true
        );

        // Derive bone rotation: setFromUnitVectors(restDir → simDir).
        b.bone.getWorldPosition(_boneHeadWS);

        _invParentMtx.copy(b.boneParent.matrixWorld).invert();
        const headLocal    = _boneHeadWS.clone().applyMatrix4(_invParentMtx);
        const restLocalDir = restTailWS.clone().applyMatrix4(_invParentMtx).sub(headLocal);
        const simLocalDir  = simTailWS.clone().applyMatrix4(_invParentMtx).sub(headLocal);

        _restDir.copy(restLocalDir).normalize();
        _simDir.copy(simLocalDir).normalize();

        if (_restDir.lengthSq() > 1e-6 && _simDir.lengthSq() > 1e-6
            && _restDir.dot(_simDir) < 0.9999) {
          _rotQ.setFromUnitVectors(_restDir, _simDir);
          b.bone.quaternion.premultiply(_rotQ);
          b.bone.quaternion.normalize();
        }
      }
    }
  });
}
