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
 * SecondaryMotionSystem.ts
 *
 * Lightweight spring secondary motion for Three.js skeletons — no physics engine.
 *
 * Design goals
 * ────────────
 *  • Bones always spring BACK to their rest pose — they never drift permanently.
 *  • Driver movement causes a smooth inertia lag on the chain.
 *  • Gravity applies a gentle constant downward bias, also springs back to rest.
 *  • The bone quaternion is SET (not accumulated) each frame to prevent drift.
 *
 * Per-bone algorithm each frame
 * ─────────────────────────────
 *  1. Compute rest-pose tail in world space (follows driver rigidly each frame).
 *  2. Apply gravity sag: shift rest target slightly downward by `gravity` amount.
 *  3. Apply inertia offset: opposite to smoothed driver velocity, capped tightly.
 *  4. Spring target = sagged rest + inertia offset.
 *  5. Verlet: vel = (simTail - prevTail) * damping + (target - simTail) * stiffness
 *  6. Constrain particle to bone length sphere around bone world head.
 *  7. Compute delta rotation in parent-local space: restDir → simDir.
 *  8. SET bone quaternion = restLocalQuat * delta  (never premultiply/accumulate).
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Object3D, Vector3, Quaternion, Matrix4,
  Mesh, SkinnedMesh, Box3, BufferGeometry,
  SphereGeometry, MeshBasicMaterial, LineSegments, EdgesGeometry,
} from "three";
/* eslint-enable @typescript-eslint/no-unused-vars */

// ─── Public config ────────────────────────────────────────────────────────────

export interface SecondaryChainConfig {
  /** Unique identifier for this chain (e.g. "ponytail", "skirtLeft"). */
  id: string;
  /** Bone whose world-position drives inertia (e.g. "hair_head"). */
  driver: string;
  /** First bone in the spring chain (inclusive). */
  chainStart: string;
  /** Last bone in the spring chain (inclusive). */
  chainEnd: string;
  /** How strongly bones spring back toward rest. Range 0–1, default 0.28. */
  stiffness?: number;
  /** Velocity damping per frame. Range 0–1, default 0.80. */
  damping?: number;
  /** Constant downward sag bias. 0 = no droop, default 0.07. */
  gravity?: number;
  /** How much driver velocity lags the chain. Default 0.08. */
  inertiaScale?: number;
  /** Smoothing factor for driver velocity (exponential smoothing α). Range 0–1, default 0.12. Higher = smoother but more lag, lower = more responsive but jittery. */
  smoothing?: number;
  /**
   * Optional collision mesh name(s) found in the scene.
   * The chain's simulated particles will be pushed out of these meshes each frame.
   * The meshes are located by name at init time — they do not need to be visible.
   * Examples: "colonly"  |  ["col_body", "col_shoulder"]
   */
  collisionMeshes?: string | string[];
  /**
   * Extra stand-off distance added on top of the collision radius so particles
   * stop before visually touching the surface. In scene units (metres for GLB):
   *   0.005 =  5 mm  |  0.02 = 2 cm (default)  |  0.05 = 5 cm
   * Set to 0 to sit exactly on the sphere surface.
   */
  collisionMargin?: number;
  /**
   * Per-chain array of explicit collision sphere definitions.
   * USE THIS instead of (or alongside) collisionMeshes when you want:
   *   - exact radius control without relying on bounding-sphere computation
   *   - multiple spheres from a single mesh parented to different bones
   *   - zero per-frame vertex skinning cost (tracks a bone, not the full mesh)
   *
   * Each entry names a scene node (any Object3D — sphere mesh, bone, empty).
   * Radius options:
   *   - Positive number: used as-is in world units.
   *   - 0 or omitted:    auto-computed from the node's geometry bounding sphere
   *                      × world scale at init time (ideal for UV-sphere meshes).
   *
   * Example (avatar1 ponytail):
   *   collisionSpheresDef: [
   *     { node: "col_neck" },          // radius auto-read from geometry
   *     { node: "col_head" },          // radius auto-read from geometry
   *     { node: "col_spine", radius: 0.13 }, // explicit override
   *   ]
   *
   * Recommended Blender workflow:
   *   1. Add UV-sphere meshes, scale them to match the body part.
   *   2. Name them (e.g. "col_neck", "col_head").
   *   3. Parent/skin each sphere to ONE bone.
   *   4. Mark them invisible / hidden layer (or set visible=false in GLB).
   *   5. Export to GLB — they travel with the skeleton.
   *   6. List them here; leave radius unset to auto-read from geometry.
   */
  collisionSpheresDef?: Array<{ node: string; radius?: number }>;
}

// ─── Internal types ───────────────────────────────────────────────────────────

/**
 * A single resolved collision sphere primitive.
 *
 * Two resolution strategies — chosen at init:
 *
 * EXPLICIT (collisionSpheresDef):
 *   `trackNode` is the dominant skeleton bone found from skin weights (for
 *   SkinnedMesh nodes) or the node itself (for rigid/plain nodes).
 *   World position is just `trackNode.getWorldPosition()` each frame — O(1).
 *   For SkinnedMesh nodes, `localOffset` holds the geometry center in the
 *   dominant bone's local space so the sphere stays locked to the mesh center.
 *
 * BOUNDING-BOX (collisionMeshes fallback):
 *   Box3.setFromObject() each frame — correct but O(vertex count) for skinned meshes.
 */
interface CollisionSphere {
  /** Bone (for explicit skinned) or the original mesh node (for fallback). */
  trackNode: Object3D;
  /**
   * True when using the explicit definition path (collisionSpheresDef).
   * trackNode is the dominant bone; worldCenter = bone worldPos + localOffset.
   */
  isExplicit: boolean;
  /** True when trackNode is a SkinnedMesh (bounding-box fallback path). */
  isSkinned: boolean;
  /**
   * For explicit skinned spheres: offset from the dominant bone world pos to
   * the mesh geometry center, in world-space at bind time. Reapplied each frame.
   * For non-skinned rigid meshes: local-space center relative to trackNode.
   */
  localCenter: Vector3;
  /** Effective collision radius. Fixed for explicit, updated per-frame for bounding-box. */
  radius: number;
  /** Live world-space center — updated once per frame before the bone loop. */
  worldCenter: Vector3;
  /** Wireframe sphere helper visible when debugCollision = true. */
  debugMesh?: LineSegments;
}

interface BoneState {
  bone: Object3D;
  boneParent: Object3D;
  boneLength: number;
  /** Simulated world-space tail particle. */
  simTail: Vector3;
  /** Previous simTail for Verlet velocity. */
  prevTail: Vector3;
  /**
   * Rest-pose tail stored in driver-local space so it follows the driver
   * rigidly every frame without any extra matrix baking.
   */
  restTailDriverLocal: Vector3;
  /** Rest-pose local quaternion — the bone's unmodified bind-pose rotation. */
  restLocalQuat: Quaternion;
}

interface ChainState {
  id: string;
  driver: Object3D;
  bones: BoneState[];
  smoothDriverVel: Vector3;
  prevDriverPos: Vector3;
  /** Zero or more collision spheres resolved at init time for this chain. */
  collisionSpheres: CollisionSphere[];
  /**
   * Phase 1 — sleep tracking.
   * Consecutive frames where the driver velocity is below threshold AND the
   * spring simulation has converged to rest. Once this exceeds SLEEP_FRAMES
   * the chain enters sleep and the entire per-bone Verlet loop is skipped.
   */
  sleepFrames: number;
  /** True when the chain is fully at rest — Verlet is skipped each frame. */
  isSleeping: boolean;
}

// ─── Pre-allocated scratch (reused every frame, never heap-allocated in hot path) ─

const _s_driverPos = new Vector3();
const _s_rawVel = new Vector3();
const _s_restTailWS = new Vector3();
const _s_boneHeadWS = new Vector3();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _s_restHeadWS = new Vector3();
const _s_restDir = new Vector3();
const _s_simDir = new Vector3();
const _s_springTarget = new Vector3();
const _s_vel = new Vector3();
const _s_spring = new Vector3();
const _s_inertia = new Vector3();
const _s_deltaQ = new Quaternion();
const _s_invDriver = new Matrix4();
const _s_invParent = new Matrix4();
const _s_down = new Vector3(0, -1, 0);
const _s_headLocal = new Vector3();
const _s_restLocal = new Vector3();
const _s_simLocal = new Vector3();
const _s_diff = new Vector3();
// Collision scratch — reused per sphere per bone.
const _s_colPush = new Vector3();
// Up vector reused for degenerate eject (avoids new Vector3 allocation in hot path).
const _s_up = new Vector3(0, 1, 0);
// Bounding-box fallback scratch — avoids per-frame Box3/Vector3 allocation.
const _s_box = new Box3();
const _s_boxSize = new Vector3();


// ─── SecondaryMotionSystem ────────────────────────────────────────────────────

export class SecondaryMotionSystem {
  private chains: ChainState[] = [];
  private configs: SecondaryChainConfig[];
  private configMap = new Map<string, SecondaryChainConfig>();
  private scene: Object3D;
  /** Phase 1: rolling frame counter used for bounding-box throttle. */
  private _frameCount = 0;

  /**
   * When true, wireframe spheres are rendered at each collision sphere
   * position every frame, showing both the bounding-sphere size and the
   * effective push radius (radius + collisionMargin).
   *
   * Toggle at runtime: `system.debugCollision = true`
   * Or set it before the component mounts in useSecondaryMotion.
   */
  public debugCollision = false;

  constructor(scene: Object3D, configs: SecondaryChainConfig[]) {
    this.scene = scene;
    this.configs = configs;
    this._init();
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  private _init(): void {
    this.scene.updateWorldMatrix(true, true);

    for (const cfg of this.configs) {

      this.configMap.set(cfg.id, cfg);

      const driver = this._find(cfg.driver);
      if (!driver) {
        console.warn(
          `[SecondaryMotion] driver "${cfg.driver}" not found — skipping "${cfg.id}".`,
        );
        continue;
      }

      const startBone = this._find(cfg.chainStart);
      if (!startBone) {
        console.warn(
          `[SecondaryMotion] chainStart "${cfg.chainStart}" not found — skipping "${cfg.id}".`,
        );
        continue;
      }

      const boneChain = this._collectChain(startBone, cfg.chainEnd);
      if (boneChain.length === 0) continue;

      // Capture driver-inverse at bind pose for rest-tail storage.
      _s_invDriver.copy(driver.matrixWorld).invert();

      const bones: BoneState[] = [];

      for (let i = 0; i < boneChain.length; i++) {
        const bone = boneChain[i];
        const child = boneChain[i + 1] ?? null;

        // Bind-pose tail world position.
        let tailWS: Vector3;
        if (child) {
          tailWS = new Vector3();
          child.getWorldPosition(tailWS);
        } else {
          // Leaf: extend 4 cm along bind-pose bone Y axis in world space.
          const boneWQ = new Quaternion();
          bone.getWorldQuaternion(boneWQ);
          tailWS = new Vector3();
          bone.getWorldPosition(tailWS);
          tailWS.addScaledVector(
            new Vector3(0, 1, 0).applyQuaternion(boneWQ),
            0.04,
          );
        }

        const headWS = new Vector3();
        bone.getWorldPosition(headWS);
        const len = Math.max(tailWS.distanceTo(headWS), 0.005);

        bones.push({
          bone,
          boneParent: bone.parent ?? bone,
          boneLength: len,
          simTail: tailWS.clone(),
          prevTail: tailWS.clone(),
          restTailDriverLocal: tailWS.clone().applyMatrix4(_s_invDriver),
          // Snapshot the bind-pose local quaternion — this is the zero-rotation reference.
          restLocalQuat: bone.quaternion.clone(),
        });
      }

      const prevDriverPos = new Vector3();
      driver.getWorldPosition(prevDriverPos);

      // ── Resolve collision spheres for this chain ──────────────────────
      const collisionSpheres: CollisionSphere[] = [];

      // ── Strategy A: explicit sphere definitions (preferred, O(1)/frame) ─
      if (cfg.collisionSpheresDef && cfg.collisionSpheresDef.length > 0) {
        for (const def of cfg.collisionSpheresDef) {
          if (!def.node) continue;
          const node = this._find(def.node);
          if (!node) {
            console.warn(
              `[SecondaryMotion] collisionSpheresDef node "${def.node}" not found for chain "${cfg.id}" — skipping.`
            );
            continue;
          }
          node.updateWorldMatrix(true, false);

          // Radius resolution:
          //   - Explicit positive number → use as-is (world units).
          //   - 0 / undefined → auto-read from geometry bounding sphere × world scale.
          let resolvedRadius = (def.radius ?? 0) > 0 ? def.radius! : 0;
          if (resolvedRadius === 0 && (node as Mesh).isMesh) {
            const geo = (node as Mesh).geometry as BufferGeometry;
            if (geo) {
              if (!geo.boundingSphere) geo.computeBoundingSphere();
              if (geo.boundingSphere) {
                const worldScale = new Vector3();
                node.getWorldScale(worldScale);
                resolvedRadius = geo.boundingSphere.radius * Math.max(worldScale.x, worldScale.y, worldScale.z);
              }
            }
          }
          if (resolvedRadius <= 0) resolvedRadius = 0.1; // safe fallback

          // For SkinnedMesh nodes the Object3D world position sits at the
          // skeleton root — it does NOT follow the bone the mesh is weighted to.
          // Resolution: find the dominant bone from skin weights and track it.
          // localCenter stores the offset from that bone to the geometry centroid
          // in the bone's local space, applied each frame to get worldCenter.
          let trackNode: Object3D = node;
          let localCenter = new Vector3();

          if ((node as SkinnedMesh).isSkinnedMesh) {
            const sm = node as SkinnedMesh;
            const dominantBone = this._dominantBone(sm);
            if (dominantBone) {
              trackNode = dominantBone;
              // Compute geometry centroid in world space at bind time, then
              // convert to the dominant bone's local space for per-frame use.
              const worldCentroid = new Vector3();
              node.getWorldPosition(worldCentroid); // mesh origin as approximation
              if (sm.geometry.boundingSphere) {
                // Add geometry bounding sphere center (object-space) transformed to world.
                const bsc = sm.geometry.boundingSphere.center.clone()
                  .applyMatrix4(sm.matrixWorld);
                worldCentroid.copy(bsc);
              }
              // Convert world centroid → dominant bone local space.
              const invBone = new Matrix4().copy(dominantBone.matrixWorld).invert();
              localCenter = worldCentroid.applyMatrix4(invBone);
              console.log(
                `[SecondaryMotion] "${def.node}" skinned → tracking bone "${dominantBone.name}" ` +
                `r=${resolvedRadius.toFixed(4)} for chain "${cfg.id}".`
              );
            } else {
              console.warn(
                `[SecondaryMotion] "${def.node}" is SkinnedMesh but no skeleton bones found — ` +
                `falling back to node world position.`
              );
            }
          } else {
            console.log(
              `[SecondaryMotion] explicit sphere "${def.node}" r=${resolvedRadius.toFixed(4)} ` +
              `(${(def.radius ?? 0) > 0 ? "manual" : "auto from geometry"}) for chain "${cfg.id}".`
            );
          }

          const worldCenter = new Vector3();
          trackNode.getWorldPosition(worldCenter);
          // Apply local offset if we resolved a dominant bone.
          if ((node as SkinnedMesh).isSkinnedMesh && trackNode !== node) {
            worldCenter.copy(localCenter).applyMatrix4(trackNode.matrixWorld);
          }

          collisionSpheres.push({
            trackNode,
            isExplicit: true,
            isSkinned: (node as SkinnedMesh).isSkinnedMesh === true,
            localCenter,
            radius: resolvedRadius,
            worldCenter,
          });
        }
      }

      // ── Strategy B: bounding-box / bounding-sphere fallback ─────────────
      // Used when collisionMeshes is set (no explicit radii known).
      // For SkinnedMesh: Box3.setFromObject() is called every frame — correct
      // but costs O(vertex count). Suitable for prototyping; prefer Strategy A
      // once you know the right radii.
      const rawNames = cfg.collisionMeshes;
      if (rawNames) {
        const nameList = Array.isArray(rawNames) ? rawNames : [rawNames];
        for (const meshName of nameList) {
          if (!meshName) continue;
          const node = this._find(meshName);
          if (!node) {
            console.warn(
              `[SecondaryMotion] collisionMesh "${meshName}" not found for chain "${cfg.id}" — skipping.`
            );
            continue;
          }

          node.updateWorldMatrix(true, false);
          const isSkinned = (node as SkinnedMesh).isSkinnedMesh === true;
          console.log(
            `[SecondaryMotion] "${meshName}" resolved as ${isSkinned ? "SkinnedMesh (bounding-box, O(verts)/frame)" : "static Mesh"} ` +
            `for chain "${cfg.id}". TIP: switch to collisionSpheresDef for O(1) cost.`
          );

          let localCenter = new Vector3();
          let radius = 0.1;
          const worldCenter = new Vector3();

          if (isSkinned) {
            // Live bounding box — correct for deforming mesh, computed each frame.
            const box = new Box3().setFromObject(node);
            const size = new Vector3();
            box.getSize(size);
            box.getCenter(worldCenter);
            // Use the largest axis half-extent, not the diagonal.
            // size.length() * 0.5 gives the box diagonal / 2 which is ~1.73x
            // too large for a sphere mesh. Math.max of the three half-extents
            // matches the actual sphere radius in world units.
            radius = Math.max(size.x, size.y, size.z) * 0.5;
          } else if ((node as Mesh).isMesh) {
            const geo = (node as Mesh).geometry as BufferGeometry;
            if (geo) {
              if (!geo.boundingSphere) geo.computeBoundingSphere();
              if (geo.boundingSphere) {
                localCenter = geo.boundingSphere.center.clone();
                // Scale geometry radius by the node's uniform world scale so
                // a sphere scaled in the DCC gives the correct collision size.
                const worldScale = new Vector3();
                node.getWorldScale(worldScale);
                radius = geo.boundingSphere.radius * Math.max(worldScale.x, worldScale.y, worldScale.z);
                worldCenter.copy(localCenter).applyMatrix4(node.matrixWorld);
              }
            }
          } else {
            const box = new Box3().setFromObject(node);
            const size = new Vector3();
            box.getSize(size);
            box.getCenter(worldCenter);
            const invNode = new Matrix4().copy(node.matrixWorld).invert();
            localCenter = worldCenter.clone().applyMatrix4(invNode);
            radius = Math.max(size.x, size.y, size.z) * 0.5;
          }

          collisionSpheres.push({
            trackNode: node,
            isExplicit: false,
            isSkinned,
            localCenter,
            radius,
            worldCenter,
          });
        }
      }

      this.chains.push({
        id: cfg.id,
        driver,
        bones,
        smoothDriverVel: new Vector3(),
        prevDriverPos,
        collisionSpheres,
        sleepFrames: 0,
        isSleeping: false,
      });
    }
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  public update(deltaTime: number): void {
    if (this.chains.length === 0) return;

    // Clamp dt so a tab-switch / pause doesn't explode velocities.
    const dt = Math.min(deltaTime, 0.05);

    // Phase 1 opt: targeted matrix updates — walk only each chain's skeleton
    // path and its collision nodes instead of traversing the whole scene graph.
    // updateWorldMatrix(true, false) updates this node AND all its ancestors
    // up to the scene root, so calling it on the chain's last bone ensures every
    // parent bone (including the driver) is current. O(skeleton depth) per chain
    // vs. O(total scene nodes) for the old scene.updateWorldMatrix(true, true).
    for (let ci = 0; ci < this.chains.length; ci++) {
      const chain = this.chains[ci];
      const lastBone = chain.bones[chain.bones.length - 1];
      if (lastBone) lastBone.bone.updateWorldMatrix(true, false);
      for (let si = 0; si < chain.collisionSpheres.length; si++) {
        chain.collisionSpheres[si].trackNode.updateWorldMatrix(true, false);
      }
    }

    for (let ci = 0; ci < this.chains.length; ci++) {
      const chain = this.chains[ci];
      const cfg = this.configMap.get(chain.id);
      if (!cfg) continue;

      const stiffness = cfg.stiffness ?? 0.28;
      const damping = cfg.damping ?? 0.8;
      const gravity = cfg.gravity ?? 0.07;
      const inertiaScale = cfg.inertiaScale ?? 0.08;
      const smoothing = cfg.smoothing ?? 0.12;
      // collisionMargin: extra stand-off on top of the bounding-sphere radius.
      // Default 0.02 (2 cm) keeps hair visually clear of the collision surface.
      const collisionMargin = cfg.collisionMargin ?? 0.02;

      // ── Driver velocity (exponentially smoothed) ──────────────────────
      chain.driver.getWorldPosition(_s_driverPos);

      _s_rawVel
        .copy(_s_driverPos)
        .sub(chain.prevDriverPos)
        .divideScalar(Math.max(dt, 1e-4));

      // Hard cap before smoothing so sudden jumps stay bounded.
      const rawSpeed = _s_rawVel.length();
      if (rawSpeed > 3.0) _s_rawVel.multiplyScalar(3.0 / rawSpeed);

      // α = smoothing → slow follower = smooth lag without overshoot.
      const alpha = 1 - smoothing;
      chain.smoothDriverVel.lerp(_s_rawVel, alpha);

      // Dead zone: eliminate micro-movements that cause jitter on small motions.
      if (chain.smoothDriverVel.length() < 0.01) {
        chain.smoothDriverVel.set(0, 0, 0);
      }

      chain.prevDriverPos.copy(_s_driverPos);

      // Rebuild driver inverse this frame (driver moves with the skeleton).
      _s_invDriver.copy(chain.driver.matrixWorld).invert();

      // ── Sleep detection ───────────────────────────────────────────────────
      // Sleep is driven purely by driver stillness — bones can be anywhere
      // (mid-swing, against a collider, or at rest pose) and will sleep
      // wherever they currently are once the driver stops moving.
      // The chain wakes instantly the moment the driver starts moving again.
      //
      // Tunables (single source of truth):
      //   SLEEP_FRAMES  — consecutive still frames before sleep.
      //                   At 60 fps: 30 = ~0.5s | 60 = ~1s | 120 = ~2s
      //                   Raise to delay sleep; lower for faster sleep.

      const SLEEP_FRAMES = 4200;
      //   DRIVER_VEL_SQ — driver velocity² threshold below which we count
      //                   the driver as "still". Lower = more sensitive to
      //                   tiny movements; higher = requires more motion to
      //                   stay awake.
      const DRIVER_VEL_SQ = 0.0000000001;

      const driverMoving = chain.smoothDriverVel.lengthSq() > DRIVER_VEL_SQ;

      if (!driverMoving) {
        if (!chain.isSleeping) {
          chain.sleepFrames++;
          if (chain.sleepFrames > SLEEP_FRAMES) {
            chain.isSleeping = true;
          }
        }
        if (chain.isSleeping) continue;
      } else {
        // Driver is moving — wake up immediately.
        chain.sleepFrames = 0;
        chain.isSleeping = false;
      }

      // ── Collision sphere world-center pre-pass ────────────────────────
      // Update every sphere's worldCenter once before the per-bone loop.
      for (let si = 0; si < chain.collisionSpheres.length; si++) {
        const col = chain.collisionSpheres[si];

        if (col.isExplicit) {
          if (col.isSkinned) {
            // Explicit skinned sphere: trackNode is the dominant bone.
            // Apply the stored local offset to get the geometry centroid in world space.
            col.worldCenter
              .copy(col.localCenter)
              .applyMatrix4(col.trackNode.matrixWorld);
          } else {
            // Explicit rigid node: O(1) world position lookup.
            col.trackNode.getWorldPosition(col.worldCenter);
          }
        } else if (col.isSkinned) {
          // Skinned bounding-box fallback: O(vertex count) — correct but heavier.
          // Phase 1 opt: throttle to every 4 frames and reuse pre-allocated scratch
          // to avoid per-frame Box3/Vector3 allocation.
          // Use collisionSpheresDef to avoid this cost in production.
          if (this._frameCount % 4 === 0) {
            _s_box.setFromObject(col.trackNode);
            _s_box.getSize(_s_boxSize);
            _s_box.getCenter(col.worldCenter);
            col.radius = Math.max(_s_boxSize.x, _s_boxSize.y, _s_boxSize.z) * 0.5;
          }
          // else: reuse cached col.worldCenter and col.radius from last recompute.
        } else {
          // Rigid mesh: transform local center by matrixWorld.
          col.worldCenter
            .copy(col.localCenter)
            .applyMatrix4(col.trackNode.matrixWorld);
        }

        // ── Debug wireframe ───────────────────────────────────────────────
        if (this.debugCollision) {
          const cfg2 = this.configMap.get(chain.id);
          const margin = cfg2?.collisionMargin ?? 0.02;
          const effectiveR = col.radius + margin;

          if (!col.debugMesh) {
            // Create wireframe sphere on first debug frame.
            const geo = new SphereGeometry(1, 12, 8);
            const mat = new MeshBasicMaterial({
              color: 0x00ffff,
              wireframe: true,
              depthTest: false,
              transparent: true,
              opacity: 0.5,
            });
            const edges = new EdgesGeometry(geo);
            col.debugMesh = new LineSegments(edges, mat);
            (col.debugMesh.material as MeshBasicMaterial).depthTest = false;
            col.debugMesh.renderOrder = 999;
            this.scene.add(col.debugMesh);
          }

          // Scale to effective radius and position at live world center.
          col.debugMesh.position.copy(col.worldCenter);
          col.debugMesh.scale.setScalar(effectiveR);
          col.debugMesh.visible = true;
        } else if (col.debugMesh) {
          col.debugMesh.visible = false;
        }
      }

      // ── Per-bone spring ───────────────────────────────────────────────
      const chainLength = chain.bones.length;

      for (let bi = 0; bi < chain.bones.length; bi++) {
        const b = chain.bones[bi];
        const chainFactor = chainLength <= 1 ? 1 : bi / (chainLength - 1);

        // Root ≈ 0.3
        // Tip  ≈ 1.0
        const tipWeight = 0.3 + chainFactor * 0.7;

        // 1. Rest-pose tail in world space this frame.
        _s_restTailWS
          .copy(b.restTailDriverLocal)
          .applyMatrix4(chain.driver.matrixWorld);



        // 2. Bone head world position.
        b.bone.getWorldPosition(_s_boneHeadWS);

        // 3. Gravity sag: nudge the spring target downward.
        //    target = restTailWS + down * gravity * boneLength
        //    This is additive, not a force — it always resolves back to rest.
        _s_springTarget
          .copy(_s_restTailWS)
          .addScaledVector(_s_down, gravity * b.boneLength);

        const speedSq = chain.smoothDriverVel.lengthSq();
        const speed = Math.sqrt(speedSq);
        const deadZone = 0.08;

        if (speed > deadZone) {

          const normalizedSpeed = Math.min((speed - deadZone) / 2.0, 1.0);
          const motionWeight = Math.pow(normalizedSpeed, 3.0);



          const baseInertia = speed * inertiaScale;
          const weightedInertia = baseInertia * tipWeight * motionWeight;
          const maxInertia = b.boneLength * 0.7;

          _s_inertia
            .copy(chain.smoothDriverVel)
            .normalize()
            .negate()
            .multiplyScalar(Math.min(weightedInertia, maxInertia));

          _s_springTarget.add(_s_inertia);
        }

        // 5. Verlet integrate.
        _s_vel.copy(b.simTail).sub(b.prevTail).multiplyScalar(damping);
        _s_spring
          .copy(_s_springTarget)
          .sub(b.simTail)
          .multiplyScalar(stiffness);
        _s_vel.add(_s_spring);

        b.prevTail.copy(b.simTail);
        b.simTail.add(_s_vel);

        // 6. Re-read head (parent may have been updated earlier this loop)
        //    then constrain tail to bone-length sphere.
        b.bone.getWorldPosition(_s_boneHeadWS);
        _s_diff.copy(b.simTail).sub(_s_boneHeadWS);
        const dist = _s_diff.length();
        if (dist > 1e-6) {
          b.simTail
            .copy(_s_diff)
            .normalize()
            .multiplyScalar(b.boneLength)
            .add(_s_boneHeadWS);
        }

        // 6b. Collision resolution — push simTail out of each collision sphere.
        for (let si = 0; si < chain.collisionSpheres.length; si++) {
          const col = chain.collisionSpheres[si];
          // worldCenter was already refreshed once per frame in the pre-pass
          // above (before the per-bone loop), so reuse it here.
          const effectiveRadius = col.radius + collisionMargin;

          _s_colPush.copy(b.simTail).sub(col.worldCenter);
          const penetrationDist = _s_colPush.length();

          if (penetrationDist < effectiveRadius && penetrationDist > 1e-6) {
            // Push particle to effective surface.
            b.simTail
              .copy(_s_colPush)
              .normalize()
              .multiplyScalar(effectiveRadius)
              .add(col.worldCenter);

            // Cancel inward Verlet velocity to prevent tunnelling oscillation.
            _s_colPush.normalize();
            const velAlongNormal = b.prevTail
              .clone()
              .sub(b.simTail)
              .dot(_s_colPush);
            if (velAlongNormal < 0) {
              b.prevTail.addScaledVector(_s_colPush, -velAlongNormal);
            }
          }

          // Degenerate: particle exactly at sphere center — eject up.
          if (penetrationDist <= 1e-6 && effectiveRadius > 0) {
            b.simTail.copy(col.worldCenter).addScaledVector(_s_up, effectiveRadius);
          }
        }

        // 7. Compute delta rotation in parent-local space: restDir → simDir.
        _s_invParent.copy(b.boneParent.matrixWorld).invert();

        // Re-read head world pos after constraint (simTail may have changed).
        b.bone.getWorldPosition(_s_boneHeadWS);

        // Transform both tail endpoints into parent-local space.
        _s_headLocal.copy(_s_boneHeadWS).applyMatrix4(_s_invParent);

        _s_restLocal
          .copy(_s_restTailWS)
          .applyMatrix4(_s_invParent)
          .sub(_s_headLocal);

        _s_simLocal
          .copy(b.simTail)
          .applyMatrix4(_s_invParent)
          .sub(_s_headLocal);

        _s_restDir.copy(_s_restLocal).normalize();
        _s_simDir.copy(_s_simLocal).normalize();

        // 8. SET bone quat = restLocalQuat * delta — stable version
        if (
          _s_restDir.lengthSq() > 1e-6 &&
          _s_simDir.lengthSq() > 1e-6
        ) {
          _s_deltaQ.setFromUnitVectors(_s_restDir, _s_simDir);

          b.bone.quaternion
            .copy(b.restLocalQuat)
            .multiply(_s_deltaQ)   // FIX: multiply (not premultiply)
            .normalize();
        } else {
          b.bone.quaternion.slerp(b.restLocalQuat, 0.08);
        }
      }
    }

    // Increment frame counter — used for bounding-box throttle (every 4 frames).
    this._frameCount++;
  }

  // ── Snapshot (for recording) ──────────────────────────────────────────────

  /**
   * Returns the current live bone quaternions for every chain, keyed by bone
   * name. Called once per frame by the recorder immediately after update().
   * Allocates a plain object but re-uses the existing Quaternion values stored
   * on each bone — no extra heap pressure on the hot path.
   */
  public snapshotBoneQuaternions(): Record<string, [number, number, number, number]> {
    const snap: Record<string, [number, number, number, number]> = {};
    for (const chain of this.chains) {
      for (const b of chain.bones) {
        const q = b.bone.quaternion;
        snap[b.bone.name] = [q.x, q.y, q.z, q.w];
      }
    }
    return snap;
  }

  // ── Dispose ────────────────────────────────────────────────────────────────

  /**
   * Remove all debug wireframe meshes from the scene and free their GPU memory.
   * Call this when the avatar unmounts or the system is destroyed.
   */
  public dispose(): void {
    for (const chain of this.chains) {
      for (const col of chain.collisionSpheres) {
        if (col.debugMesh) {
          this.scene.remove(col.debugMesh);
          (col.debugMesh.geometry as EdgesGeometry).dispose();
          (col.debugMesh.material as MeshBasicMaterial).dispose();
          col.debugMesh = undefined;
        }
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Find the dominant skeleton bone for a SkinnedMesh by scanning its skin
   * weight data and returning the bone with the highest total weight influence.
   * This is the bone the mesh is "most attached to" — its matrixWorld gives
   * the best O(1) world-space position for the collision sphere each frame.
   * Returns null if the mesh has no skeleton or empty bone array.
   */
  private _dominantBone(sm: SkinnedMesh): Object3D | null {
    const skeleton = sm.skeleton;
    if (!skeleton || skeleton.bones.length === 0) return null;

    const skinWeight = sm.geometry.attributes.skinWeight;
    const skinIndex = sm.geometry.attributes.skinIndex;
    if (!skinWeight || !skinIndex) {
      // No skin data — fall back to first bone.
      return skeleton.bones[0] ?? null;
    }

    const boneTotals = new Float32Array(skeleton.bones.length);
    const itemSize = skinWeight.itemSize; // usually 4
    const count = skinWeight.count;

    for (let vi = 0; vi < count; vi++) {
      for (let c = 0; c < itemSize; c++) {
        const boneIdx = Math.round(skinIndex.getComponent(vi, c));
        const weight = skinWeight.getComponent(vi, c);
        if (boneIdx >= 0 && boneIdx < boneTotals.length) {
          boneTotals[boneIdx] += weight;
        }
      }
    }

    let maxIdx = 0;
    for (let i = 1; i < boneTotals.length; i++) {
      if (boneTotals[i] > boneTotals[maxIdx]) maxIdx = i;
    }
    return skeleton.bones[maxIdx];
  }

  private _find(name: string): Object3D | null {
    let found: Object3D | null = null;
    this.scene.traverse((o) => {
      if (!found && o.name === name) found = o;
    });
    return found;
  }

  private _collectChain(start: Object3D, endName: string): Object3D[] {
    const chain: Object3D[] = [];
    let cur: Object3D | null = start;
    while (cur) {
      chain.push(cur);
      if (cur.name === endName) break;
      cur = cur.children[0] ?? null;
    }
    return chain;
  }
}
