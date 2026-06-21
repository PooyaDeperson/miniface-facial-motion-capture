# Facial Motion Capture - Project Overview

**Author:** Pooya Moradi M. (poamrd@gmail.com)  
**Repository:** https://github.com/PooyaDeperson/facial-motion-capture  
**License:** MIT with Attribution

---

## Project Summary

A React-based facial motion capture application that uses MediaPipe face detection and Three.js 3D rendering to animate 3D avatars in real-time based on user's facial expressions and head movements. The app captures camera feed, detects facial landmarks, applies motion data to deform 3D models using morphtargets and skeletal animation, and supports recording and exporting animations as `.glb` files.

**Key Features:**
- Real-time face tracking with blendshapes & head rotation
- Live 3D avatar animation in the browser
- Motion capture recording (blendshapes + joints)
- Export recorded animations as binary `.glb` format with full geometry and animation data

---

## Tech Stack

### Core Technologies
- **React 18.2.0** - UI framework
- **TypeScript 4.9.5** - Type safety
- **React Scripts 5.0.1** - Create React App tooling

### 3D Graphics
- **Three.js 0.152.2** - 3D rendering engine
- **React Three Fiber 8.13.0** - React renderer for Three.js
- **React Three Drei 9.68.3** - Helpful abstractions for R3F (GLTFLoader, OrbitControls)

### Computer Vision / AI
- **MediaPipe Tasks Vision 0.10.0** - Face detection, landmarks, blendshapes, head pose
  - Runs on GPU
  - Uses WebAssembly
  - Model: `face_landmarker.task` (float16)

### UI / Input
- **React Dropzone 14.2.3** - File upload handling

### Testing
- **Testing Library** - React & Jest DOM testing
- **Web Vitals 2.1.4** - Performance monitoring

---

## Project Structure

```
src/
├── App.tsx                    # Main app component - orchestrates state
├── index.tsx                  # React DOM entry point
├── index.css                  # Global styles
├── App.css                    # App-specific styles (including recording UI)
│
├── FaceTracking.tsx           # MediaPipe face detection & blendshape extraction
├── Avatar.tsx                 # Three.js avatar mesh - applies blendshapes & rotations
├── AvatarCanvas.tsx           # R3F Canvas - contains 3D scene
├── AvatarOrbitControls.tsx    # OrbitControls wrapper - camera movement
├── AvatarLoader.tsx           # 2D loading overlay with timed messages
├── useMotionRecorder.ts       # Motion capture recording engine (recorder singleton)
│
├── camera-permission.tsx      # Camera permission UI + device selection
├── react-app-env.d.ts         # TypeScript ambient declarations
├── tsconfig.json              # TypeScript config
│
└── components/
    ├── ColorSwitcher.tsx      # Background color & pattern selector
    ├── AvatarSwitcher.tsx     # Avatar switcher buttons
    ├── CustomDropdown.tsx     # Reusable dropdown component
    └── RecordingControls.tsx  # Motion capture recording UI (Record/Stop/Save/Discard)
```

---

## Key Components & Data Flow

### 1. **App.tsx** (Main Orchestrator)
**State:**
- `url: string | null` - Currently loaded avatar GLB URL
- `avatarKey: number` - Forces Avatar re-render on URL change
- `avatarReady: boolean` - Avatar 3D model loaded
- `videoStream: MediaStream | null` - Camera stream
- `mediapipeReady: boolean` - Face detection model initialized

**Responsibilities:**
- Manages all top-level state
- Passes camera stream to `FaceTracking`
- Shows "Keep smiling..." loader while mediapipe initializes
- Renders `CameraPermissions`, `FaceTracking`, `AvatarCanvas`, `ColorSwitcher`, `AvatarSwitcher`

---

### 2. **FaceTracking.tsx** (Face Detection)
**Global Exports:**
- `blendshapes: any[]` - Array of facial blendshape categories (smile, blink, eyeLookUp, etc.)
- `rotation: Euler` - Head rotation (x, y, z) in radians
- `headMesh: any[]` - References to mesh objects being animated

**Key Flow:**
1. Initializes `FaceLandmarker` with GPU delegate
2. Loads model from CDN on first mount
3. Runs continuous `requestAnimationFrame` loop
4. For each video frame:
   - Detects face landmarks
   - Extracts `blendshapes` (facial expressions)
   - Extracts 4x4 transformation matrix → converts to `rotation` (Euler)
5. Calls `onMediapipeReady()` callback when model is ready

**Important:** Uses `lastVideoTime` to avoid processing same frame twice

---

### 3. **Avatar.tsx** (3D Model Animation)
**Props:**
- `url: string` - GLB file URL to load
- `onLoaded?: () => void` - Callback when model finishes loading

**Key Flow:**
1. Loads GLTF model with `useGLTF(url)`
2. Extracts all head-related mesh objects:
   - `Wolf3D_Head`, `Wolf3D_Teeth`, `Wolf3D_Beard`, `Wolf3D_Avatar`, `Wolf3D_Head_Custom`
3. Stores in `headMesh` global (shared with `FaceTracking`)
4. In `useFrame()` loop:
   - Reads global `blendshapes` array
   - For each blendshape category, finds corresponding morphTarget index
   - Sets `morphTargetInfluences[index] = score` (0-1 value)
   - Updates rotations:
     - `Head.rotation = rotation` (full head rotation)
     - `Neck.rotation = rotation / 5` (reduced influence)
     - `Spine2.rotation = rotation / 10` (minimal influence)

**Important:** Blendshapes use morphTargets (pre-computed vertex deformations on the mesh)

---

### 4. **AvatarCanvas.tsx** (R3F Scene)
**Props:**
- `url: string | null` - Avatar URL (triggers load)
- `avatarKey: number` - Force re-mount Avatar
- `setAvatarReady: (bool) => void` - Callback for load completion

**Scene Setup:**
- **Camera:** FOV 27, position [-0.0, 1.62, 1.09], rotation [0.05, -0.0, 0.0]
- **Lighting:**
  - Ambient light (intensity 0.5)
  - 3× Point lights with shadows
- **Controls:** `AvatarOrbitControls` (limited to horizontal pan + zoom)
- **Suspense:** Fallback `null` while loading

**States:**
- `loading: boolean` - Shows/hides `AvatarLoader` overlay

---

### 5. **AvatarOrbitControls.tsx** (Camera Controls)
**Constraints:**
- **Pan:** Disabled
- **Zoom:** Enabled (configurable)
- **Rotation:** Locked to horizontal only (polar angle = π/2)
- **Distance:** Clamped between `minZ` (0.59) and `maxZ` (1.27)

---

### 6. **camera-permission.tsx** (Camera Access & Selection)
**Features:**
- Requests camera permission on load
- Uses `navigator.permissions.query({ name: "camera" })`
- Enumerates available cameras with `enumerateDevices()`
- Shows dropdown if multiple cameras detected
- Saves selected camera to localStorage
- Three permission states: `prompt`, `denied`, `granted`
- Displays instructional popups for each state

---

### 7. **ColorSwitcher.tsx** (Background Styling)
**Colors:** 6 preset hex values (yellow, pink, green, orange, blue, white)  
**Patterns:** 6 CSS variable patterns (None, Stripes, Waves, Checker, Crosshatch, Waves2)

**Behavior:**
- Sets `document.body.backgroundColor` and `backgroundImage`
- Auto-adjusts text color for contrast (light vs dark)
- Persists choices to localStorage
- Tab-based UI (color tab / pattern tab)

---

### 8. **AvatarSwitcher.tsx** (Avatar Selection)
**Props:**
- `onAvatarChange: (newUrl: string) => void`
- `activeUrl: string | null`

**Features:**
- 5 predefined avatars (`/avatar/avatar-ponytail.glb` through `avatar-braids.glb`)
- Loads last selected avatar from localStorage on mount
- Displays as button group (visually styled as "avatar1", "avatar2", etc.)
- Disables active button to prevent re-selection

---

### 9. **AvatarLoader.tsx** (Loading Overlay)
**Props:**
- `visible: boolean` - Show/hide overlay
- `initialMessage, secondMessage, thirdMessage` - Timed messages
- `secondDelay, thirdDelay` - Delays in ms (default 10s, 20s)

**Behavior:**
- Shows initial message immediately
- Transitions to 2nd message after `secondDelay`
- Transitions to 3rd message after `thirdDelay`
- Resets when `visible` toggles

---

### 10. **CustomDropdown.tsx** (Reusable UI Component)
**Props:**
- `options: Option[]` - List of {label, value, leftIcon?, rightIcon?}
- `value: string | null` - Current selection
- `onChange: (value: string) => void` - Selection callback
- `placeholder?: string` - Default text

**Features:**
- Click-outside detection to close
- Icon support (left & right)
- Highlights selected option
- Smooth open/close animation

---

### 11. **useMotionRecorder.ts** (Motion Capture Engine)
**Exports:**
- `startRecording()` - Begin capturing blendshapes & bone rotations
- `stopRecording()` - Stop recording without discarding
- `discardRecording()` - Clear all recorded frames
- `captureFrame(blendshapes, rotation)` - Record current frame (called from Avatar.useFrame)
- `buildAndExportGLB(scene, nodes, headMesh)` - Build AnimationClip and export to `.glb`
- `setSceneForExport(scene, nodes, headMesh)` - Store live references for export
- `subscribe(callback)` - Listen to recorder state changes
- `getState()` - Get current {phase, frames, startTime, isExporting, error}

**Key Implementation:**
- **Module-level singleton** - Zero-overhead hot path (module-level mutable state)
- **MotionFrame structure:**
  ```typescript
  {
    timestamp: number,              // Performance.now() time
    blendshapes: Record<string, number>,  // Shape name → score (0-1)
    rotation: [x, y, z]            // Euler angles in radians (Head bone)
  }
  ```
- **Three-phase recording:**
  1. **Idle** - No recording
  2. **Recording** - Capturing frames at 60 fps
  3. **Review** - Frames captured, awaiting save/discard
- **GLB Export Process:**
  1. Extracts all bone/morph data from captured frames
  2. Builds `NumberKeyframeTrack` for each morph target with motion > 0.001
  3. Builds `QuaternionKeyframeTrack` for Head/Neck/Spine2 (with Euler→Quat conversion)
  4. Creates `AnimationClip` with all tracks
  5. Calls `GLTFExporter.parseAsync(scene, {binary: true, onlyVisible: false})`
  6. Triggers browser download with ISO-timestamped `.glb` filename

**Edge Cases:**
- Fewer than 2 frames → reject export
- Avatar switch → auto-discard stale frames
- Zero-motion morphtargets → skip (keep file lean)
- Missing bones → safe guard against non-RPM rigs
- Export error → display in UI, keep frames for retry

---

### 12. **RecordingControls.tsx** (Recording UI Component)
**Props:**
- `mediapipeReady: boolean` - Is MediaPipe face detection initialized?
- `avatarReady: boolean` - Is 3D avatar loaded?

**Features:**
- **Three-phase UI:**
  - **Idle:** Record button (only visible when both ready)
  - **Recording:** Pulsing red dot + live MM:SS timer + frame count + Stop button
  - **Review:** Frame stats + Save GLB + Discard, with export error message slot
- **Live timer:** Updates every 100 ms via `setInterval`
- **Visibility persistence:** Stays visible during recording/review even if MediaPipe momentarily loses the face
- **Pub/sub subscription:** Listens to `useMotionRecorder` state via `subscribe()`
- **Error handling:** Displays export errors in the UI

**CSS Classes (App.css):**
- `.recording-controls` - Fixed bottom-center pill container
- `.rec-bar`, `.rec-bar-live`, `.rec-bar-review` - State containers
- `.rec-btn-record`, `.rec-btn-stop`, `.rec-btn-save`, `.rec-btn-discard` - Buttons
- `.rec-dot-pulse` - Pulsing red dot animation
- `.rec-timer`, `.rec-frames`, `.rec-stats` - Data displays
- `.rec-spinner` - Export busy spinner
- `.rec-error` - Error message text

---

## Styling System

### CSS Files
- **index.css** - Global styles
- **App.css** - App-specific styles
- **Custom classes** - Across components (e.g., `avatar-switcher`, `camera-feed`, `popup-container`)

### Key CSS Classes

#### Layout/Positioning
- `.pos-abs`, `.pos-fixed`, `.pos-rel` - Positioning helpers
- `.pos-abs-important` - Absolute with !important
- `.flex-row`, `.flex-col` - Flexbox shortcuts
- `.items-center`, `.justify-center`, `.justify-between` - Flex alignment
- `.gap-*` - Gap spacing

#### Sizing
- `.w-100`, `.w-full`, `.h-full` - Width/height utilities
- `.m-*`, `.p-*` - Margin/padding
- `.br-*` - Border radius (e.g., `br-12`, `br-16`, `br-24`)

#### Responsive
- `.mb:*` - Mobile breakpoint
- `.tb:*` - Tablet breakpoint

#### Effects
- `.reveal`, `.fade`, `.slide-up`, `.slide-down`, `.slide-left` - Animations
- `.scaleIn` - Scale animation
- `.bg-blur` - Blur background
- `.animate-pulse` - Pulsing animation

#### Theme
- `.bg-opacity-*` - Background opacity
- `.bg-white`, `.bg-black`, `.text-white`, `.text-gray-*` - Colors

---

## Data Flow Diagram

```
User Camera
    ↓
CameraPermissions → getUserMedia() → MediaStream
    ↓
App.state.videoStream
    ↓
FaceTracking.tsx
├─ MediaPipe.detectForVideo()
├─ extracts blendshapes[] (global export)
└─ extracts rotation (global export)
    ↓
AvatarCanvas → Avatar.tsx
├─ reads global blendshapes[]
├─ reads global rotation
├─ setSceneForExport(scene, nodes, headMesh) ← sends to recorder
├─ useFrame() applies to mesh.morphTargetInfluences[] & node rotations
└─ captureFrame(blendshapes, rotation) ← recorder captures if recording
    ↓
[Recording Phase]
    ↓
RecordingControls.tsx
├─ User clicks "Record" → startRecording()
├─ User clicks "Stop" → stopRecording()
├─ User clicks "Save GLB" → buildAndExportGLB(scene, nodes, headMesh)
│   ├─ Build AnimationClip from captured frames
│   ├─ Call GLTFExporter.parseAsync()
│   ├─ Trigger browser download
│   └─ Result: avatar.glb with all bones + morphtargets + animation
└─ User clicks "Discard" → discardRecording()
```

---

## Important Implementation Details

### 1. Global State Pattern
`FaceTracking` and `Avatar` share global exports to bypass React prop drilling:
```typescript
// FaceTracking.tsx (exports)
export let blendshapes: any[] = [];
export let rotation: Euler;
export let headMesh: any[] = [];

// Avatar.tsx (imports)
import { blendshapes, rotation, headMesh } from "./FaceTracking";
```
This works but is not ideal for maintainability. Consider Context API refactor.

### 2. GLB Model Structure
Models must contain specific named meshes for animation to work:
- `Wolf3D_Head` (main head mesh with morphTargets)
- `Wolf3D_Teeth`, `Wolf3D_Beard`, `Wolf3D_Avatar`, `Wolf3D_Head_Custom` (optional variations)
- Skeletal bones: `Head`, `Neck`, `Spine2` (for rotation blending)

### 3. MorphTargets
- Precomputed vertex deformations (shape keys) on the model
- Named in blendshape categories from MediaPipe (e.g., "smile", "eyeLookUp")
- Applied by setting `morphTargetInfluences[index]` (0-1 score)

### 4. Avatar Re-mounting
When changing avatars, `avatarKey` is incremented to force React re-mount:
```typescript
const handleAvatarChange = (newUrl: string) => {
  useGLTF.clear(newUrl);
  // ... set new url & increment avatarKey
  setAvatarKey((k) => k + 1);
};
```

### 5. LocalStorage Usage
- Selected camera: `localStorage.getItem("selectedCamera")`
- Active avatar: `localStorage.getItem("activeAvatar")`
- Active color: `localStorage.getItem("activeColor")`
- Active pattern: `localStorage.getItem("activePattern")`

### 6. Motion Capture Recording
- **Start:** User clicks "Record" when avatar is loaded and MediaPipe is ready
- **Capture:** Every frame during `Avatar.useFrame()`, blendshape scores and head/neck/spine rotations are captured into a `MotionFrame` array
- **Stop:** User clicks "Stop" to complete the recording
- **Export:** `buildAndExportGLB()` converts captured frames into a Three.js `AnimationClip`:
  - One `NumberKeyframeTrack` per morph target with any motion (score > 0.001)
  - Three `QuaternionKeyframeTrack` entries for Head, Neck, Spine2 (Euler angles converted to Quaternions)
  - Full scene exported via `GLTFExporter.parseAsync()` with `binary: true` to include all geometry
  - Browser download triggered with ISO-timestamped filename

---

## Performance Considerations

1. **RequestAnimationFrame Loop** - Runs at 60fps (or device refresh rate)
2. **MediaPipe GPU** - Uses GPU delegate for faster inference
3. **Mesh Pooling** - `headMesh` array reuses references
4. **Conditional Updates** - Only updates if `lastVideoTime` changed
5. **Suspense Boundary** - Prevents 3D canvas from blocking UI load

---

## Known Limitations & TODO

1. **Global State:** Consider migrating `blendshapes`, `rotation`, `headMesh` to Context API
2. **Avatar URL Handling:** Current avatars are hardcoded; consider dynamic upload/loading
3. **Error Handling:** Limited error boundaries; add try-catch for media access failures
4. **Mobile Optimization:** May need viewport/dpr tweaks for mobile performance
5. **Accessibility:** Missing ARIA labels on UI controls
6. **Recording Export:** GLB export is currently synchronous via `GLTFExporter.parseAsync()`; consider chunking for very long recordings
7. **Animation Timeline:** Currently no timeline scrubber/editor for exported animations

---

## Common Tasks

### Add a New Component
1. Create file in `src/` or `src/components/`
2. Import in relevant parent (usually `App.tsx`)
3. Add TypeScript interfaces for props
4. Export default

### Add a New Avatar
1. Add `.glb` file to `/public/avatar/`
2. Add entry to `avatars` array in `AvatarSwitcher.tsx`
3. Ensure model has required meshes (see GLB Model Structure above)

### Modify Face Detection
1. Edit `FaceTracking.tsx`
2. Update `FaceLandmarkerOptions` for different settings
3. Modify `predict()` to extract additional data if needed

### Change Background/Pattern
1. Edit color list in `ColorSwitcher.tsx`
2. Add CSS variable patterns in global CSS
3. Update CSS variables in `globals.css` (e.g., `--pattern-stripes`)

---

## Git Info

**Repository:** PooyaDeperson/facial-motion-capture  
**Current Branch:** no-dev-script (recently merged dev script to package.json)  
**Base Branch:** master

---

## Quick Links

- MediaPipe Docs: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker
- React Three Fiber: https://docs.pmnd.rs/react-three-fiber/
- Three.js Docs: https://threejs.org/docs/
- GLTF Format: https://www.khronos.org/gltf/
