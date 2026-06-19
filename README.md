<div align="left">
  
  ![gh face mocap demo](https://github.com/user-attachments/assets/741b1fdd-0dab-4e97-a24b-22a7d34b9a15)
  
  # Facial Motion Capture
  
  **Real-time face tracking with 3D avatars in your browser** ✨

  Try it at : https://www.miniface.org/
  
 [![License: MIT-Attribution](https://img.shields.io/badge/License-MIT--Attribution-yellow.svg)](LICENSE.md)
 [![React](https://img.shields.io/badge/React-18.2.0-blue.svg)](https://reactjs.org/)
 [![Status](https://img.shields.io/badge/Status-Active-brightgreen.svg)]()
 [![Creator](https://img.shields.io/badge/Created%20by-Pooya%20Moradi%20M.-orange.svg)](https://github.com/pooyadeperson)
  [![Creator](https://img.shields.io/badge/Created%20by-Sercan%20Altundas-orange.svg)](https://github.com/srcnalt)

  
</div>

---

  ## 🎯 Roadmap
  [Roadmap](https://github.com/users/PooyaDeperson/projects/3/views/1?layout=board)

---

## 🚀 Quick Start

### Get Started
```bash
# Clone the project
git clone https://github.com/PooyaDeperson/miniface-facial-motion-capture.git
cd miniface-facial-motion-capture

# Install dependencies
npm install

# Start the service
npm run dev
```

Visit `http://localhost:3000` to see the face tracking in action!

### System Requirements
- Node.js 16+
- A modern browser with webcam access
- Webcam permissions (for face tracking)

---

## 💫 Project Vision

This project aims to provide a simple and effective way to perform real-time face tracking in the browser using Ready Player Me avatars.
It leverages the power of MediaPipe and Three.js to create an immersive experience where a 3D avatar mimics your facial movements.

---

## 🎯 Current Feature Status

### ✅ Implemented Features
- **🎤 Real-time Face Tracking**: Captures facial landmarks using MediaPipe in a dedicated worker thread.
- **🧵 Web Worker Architecture**: Face detection runs on a separate thread, keeping the main UI responsive.
- **🎬 3D Avatar Integration**: Renders Ready Player Me avatars with Three.js.
- **📹 Motion Capture Recording**: Record facial blendshapes and head/neck/spine bone movements in real-time.
- **💾 GLB Animation Export**: Save recorded animations as self-contained `.glb` files with full avatar geometry and animation data.
- **🎨 Avatar and Color Switcher**: Easily switch between different avatars and background colors.
- **🌪️ Secondary Motion System**: Spring-based physics for hair, clothing, and secondary body parts without a physics engine.
- **⚙️ Component-Based Architecture**: Built with React for a modular and maintainable codebase.
- **🌐 Web Application**: Runs entirely in the browser.

---

## 🏗️ Technical Architecture

### Core Design Principles
- **Performance**: Optimized for real-time performance in the browser.
- **Modularity**: Components are designed to be reusable and easy to understand.
- **Simplicity**: A straightforward setup and easy-to-follow codebase.

### Technology Stack
- **Frontend**: React, TypeScript, Three.js, react-three/fiber, react-three/drei
- **Face Tracking**: MediaPipe Tasks Vision (running in Web Worker)
- **Physics System**: Spring-based secondary motion (no external physics engine)
- **Build Tool**: Create React App
- **Export Format**: GLB (GLTF binary with embedded animations)

---

## 🛠️ Development Guide

### Environment Setup
1. Ensure you have Node.js installed (version 16 or higher).
2. Run `npm install` to install the necessary dependencies.
3. Run `npm start` to launch the development server.

### Contribution Guidelines
1. Fork the project repository.
2. Create a new branch for your feature (`git checkout -b feature/your-feature-name`).
3. Make your changes and commit them (`git commit -m 'Add some amazing feature'`).
4. Push your changes to the branch (`git push origin feature/your-feature-name`).
5. Open a Pull Request.

## ⚠️ ESLint / Build Warnings

Some ESLint warnings (missing `useEffect` dependencies, unused variables) were causing the build to fail. These issues did **not affect runtime**, which is why `master` deployed successfully.  

To deploy quickly, we temporarily set `CI=false` in Vercel (`vercel.json` or dashboard) so warnings are not treated as errors.  

> ⚠️ Future developers: These warnings should be properly fixed by wrapping functions in `useCallback` and including all dependencies in `useEffect`. Once fixed, `CI=false` can be removed to enforce lint rules in production.

---

## 📹 Motion Capture Recording

### Overview
Capture your facial expressions and head movements as animations on your selected avatar, then export them as `.glb` files for use in other 3D applications.

### How It Works
1. **Load an avatar** and enable MediaPipe face tracking
2. **Click "Record"** — The recording UI appears at the bottom of the screen
3. **Animate** with your face and head movements — A live timer shows recording duration
4. **Click "Stop"** to complete the recording
5. **Review** the captured animation with frame count and duration stats
6. **Save as GLB** — Exports a complete `.glb` file containing:
   - Full avatar mesh with all geometry
   - All skeletal bones (even if not animated)
   - All blendshapes (morphtargets) that were animated
   - Animation clip with keyframes for all animated properties
7. **Download** starts automatically with timestamped filename: `avatar-YYYY-MM-DD-HHmmss.glb`

### Recording UI States

#### Idle (Ready to Record)
- Shows a "Record" button in a pill-shaped container at the bottom
- Only visible when both avatar and MediaPipe are loaded
- Click to start recording

#### Recording (Live Capture)
- Red pulsing dot indicating active recording
- Live MM:SS timer showing elapsed time
- Frame counter showing number of frames captured
- "Stop" button to end recording
- UI stays visible even if MediaPipe momentarily loses the face

#### Review (Before Save)
- Displays final stats: frame count, total duration, frame rate
- "Save as GLB" button to export the animation
- "Discard" button to clear and start over
- Export error messages (if any) appear here
- Spinner shown during export

### Technical Details

**Captured Data per Frame:**
- All 52 facial blendshape scores (0-1 values)
- Head rotation (Euler angles: X, Y, Z)
- Timestamp for precise animation timing

**Export Format:**
- Binary GLB (gltf + embedded textures + animation)
- One `NumberKeyframeTrack` per animated morph target
- Three `QuaternionKeyframeTrack` entries for Head, Neck, and Spine2 bones
- AnimationClip automatically bound to the exported model

**File Size:**
- Typically 2–5 MB depending on animation length and complexity
- Optimized to skip static blendshapes (keeps file lean)

**Compatibility:**
- Opens in any GLB/glTF viewer (Babylon.js, Three.js, Blender, etc.)
- Animation included and ready to play
- Can be imported into game engines (Unity, Unreal) as FBX or GLB

### Edge Cases Handled
- Switching avatars automatically discards stale recordings
- Fewer than 2 captured frames rejected on export
- Missing bones safely handled (guard for non-RPM rigs)
- Export errors caught and displayed in UI
- Live timer stops recording if browser tab loses focus briefly

---

## 🌪️ Secondary Motion System

### Overview
A lightweight spring-based physics system for realistic secondary motion on hair, clothing, and other secondary body parts without requiring an external physics engine.

### How It Works
The system uses a Verlet integration approach with configurable per-chain physics:

1. **Spring chains**: Define chains of bones (e.g., ponytail, skirt) with a driver bone
2. **Driver-based inertia**: Chain follows driver movement with configurable lag
3. **Gravity simulation**: Gentle constant downward bias for natural droop
4. **Damping & stiffness**: Per-chain controls for feel and response
5. **Velocity smoothing**: Exponential smoothing for responsive yet stable motion

### Configuration
Each chain requires:
- `id`: Unique identifier
- `driver`: Bone whose movement drives the chain
- `chainStart` & `chainEnd`: Bone range in the spring chain
- `stiffness`: Spring strength (0–1, default 0.28)
- `damping`: Velocity damping (0–1, default 0.80)
- `gravity`: Downward sag bias (default 0.07)
- `inertiaScale`: Driver velocity lag multiplier (default 0.08)
- `smoothing`: Driver velocity smoothing (0–1, default 0.12)

### Technical Details
- **Per-frame algorithm**: Rest-pose computation → gravity sag → inertia offset → spring constraint → Verlet integration → bone rotation
- **Performance**: O(n) complexity where n = chain length; no broad-phase collision detection
- **Frame-rate agnostic**: All calculations are delta-time normalized for consistent feel across 20–60+ fps
- **Integration points**: Bones always spring back to rest pose; no permanent drift

---

```
miniface-facial-motion-capture/
├── 📄 .gitignore          # Specifies intentionally untracked files to ignore
├── 📄 package.json        # Lists the project's dependencies and scripts
├── 📄 package-lock.json   # Records the exact version of each installed package
├── 📄 README.md           # This file, providing an overview of the project
├── 📄 PROJECT_OVERVIEW.md # Detailed technical documentation of the codebase
├── 📄 tsconfig.json       # The configuration file for the TypeScript compiler
├── 📄 vercel.json         # Vercel deployment configuration
├── 📁 public/              # Contains static assets that are publicly accessible
│   ├── 📁 animation/       # Idle animation GLB files for avatars
│   ├── 📁 avatar/          # Stores the 3D avatar models in .glb format
│   ├── 📁 images/          # Contains various image assets for the application
│   │   ├── 📁 app/
│   │   │   ├── 📁 avatar/
│   │   │   ├── 📁 explainers/
│   │   │   └── 📁 icons/
│   │   └── 📁 seo/
│   ├── 📁 models/          # MediaPipe model files
│   │   └── 📄 face_landmarker.task # Face detection model
│   ├── 📁 wasm/            # WebAssembly files for MediaPipe
│   │   ├── 📄 vision_wasm_internal.js
│   │   ├── 📄 vision_wasm_module_internal.js
│   │   └── 📄 vision_wasm_nosimd_internal.js
│   ├── 📄 index.html       # The main HTML file that serves as the entry point
│   ├── 📄 manifest.json    # PWA manifest for web app installation
│   ├── 📄 robots.txt       # SEO robots configuration
│   └── 📄 sitemap.xml      # XML sitemap for search engines
└── 📁 src/                # Contains the main source code for the application
    ├── 📁 components/     # Reusable React components used throughout the app
    │   ├── 📄 AvatarSwitcher.tsx     # Allows users to switch between different avatars
    │   ├── 📄 ColorSwitcher.tsx      # Enables changing the background color
    │   ├── 📄 CustomDropdown.tsx     # A custom dropdown component for UI elements
    │   ├── 📄 PermissionPopup.tsx    # Camera permission request popup
    │   └── 📄 RecordingControls.tsx  # Motion capture recording UI
    ├── 📄 App.css          # Styles for the main application component (includes recording UI)
    ├── 📄 App.tsx          # The root component of the application
    ├── 📄 Avatar.tsx       # Renders the 3D avatar model (integrated with motion capture)
    ├── 📄 AvatarCanvas.tsx # The Three.js canvas where the avatar is displayed
    ├── 📄 AvatarLoader.tsx # A loading avatar indicator component
    ├── 📄 AvatarOrbitControls.tsx   # Implements camera controls for the avatar
    ├── 📄 camera-permission.tsx     # Handles requesting and managing camera permissions
    ├── 📄 FaceTracking.tsx # Face detection host — owns video element, pumps frames to worker
    ├── 📄 faceWorker.js    # Web Worker for face tracking (runs MediaPipe on separate thread)
    ├── 📄 SecondaryMotionSystem.ts  # Spring-based physics for secondary motion (hair, cloth)
    ├── 📄 smoothing.ts     # Pure math utilities for real-time motion smoothing
    ├── 📄 useAnimationPlayer.ts     # Hook for playing idle animations with proper bone exclusion
    ├── 📄 useMotionRecorder.ts      # Motion capture recording engine and GLB export
    ├── 📄 useSecondaryMotion.ts     # React Three Fiber hook for secondary motion integration
    ├── 📄 avatarMetadata.ts         # Avatar metadata and configuration
    ├── 📄 color.css        # Color theme and styling
    ├── 📄 icon.css         # Icon styling
    ├── 📄 index.css        # Global styles
    ├── 📄 index.tsx        # The entry point for the React application
    └── 📄 react-app-env.d.ts        # TypeScript type declarations for the React environment
```
