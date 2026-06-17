/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 * 
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson"
 */


import { useCallback, useEffect, useRef, useState } from "react";
import CustomDropdown, { Option } from "./components/CustomDropdown";
import PermissionPopup from "./components/PermissionPopup";

const CameraIcon = (
  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h2l2-3h10l2 3h2v13H3V7z" />
    <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const VideoIcon = (
  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276a1 1 0 011.447.894v8.764a1 1 0 01-1.447.894L15 14M4 6h11a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
  </svg>
);

interface CameraPermissionsProps {
  onStreamReady: (stream: MediaStream) => void;
  disabled?: boolean;
  isFlipped: boolean;
  setIsFlipped: (value: boolean) => void;
}

export default function CameraPermissions({ onStreamReady, disabled, isFlipped, setIsFlipped }: CameraPermissionsProps) {
  const [permissionState, setPermissionState] = useState<"prompt" | "denied" | "granted">("prompt");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  const requestCamera = async (deviceId?: string) => {
    try {
      // Stop any previously active tracks before opening a new stream so the
      // old camera is released and we don't accumulate stale MediaStreamTracks.
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((t) => t.stop());
        activeStreamRef.current = null;
      }

      // On mobile, strict resolution constraints (e.g. 1280x720) cause
      // getUserMedia to fail or return a degraded stream on many Samsung/Xiaomi
      // front cameras. Use ideal (not exact) constraints so the browser can
      // negotiate the best available resolution.
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      const videoConstraints: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId } }
        : isMobile
          ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } };

      const constraints: MediaStreamConstraints = {
        video: videoConstraints,
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      activeStreamRef.current = stream;
      setPermissionState("granted");

      onStreamReady(stream);
    } catch (err: any) {
      setPermissionState("denied");
    }
  };

  const loadCameras = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((d) => d.kind === "videoinput");
    setCameras(videoInputs);

    const savedCamera = localStorage.getItem("selectedCamera");
    if (savedCamera && videoInputs.find((d) => d.deviceId === savedCamera)) {
      setSelectedCamera(savedCamera);
      requestCamera(savedCamera);
    } else if (videoInputs.length > 0) {
      const firstCam = videoInputs[0].deviceId;
      setSelectedCamera(firstCam);
      requestCamera(firstCam);
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleCameraChange = (deviceId: string) => {
    setSelectedCamera(deviceId);
    localStorage.setItem("selectedCamera", deviceId);
    requestCamera(deviceId);
  };

  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions.query({ name: "camera" as PermissionName }).then((result) => {
        setPermissionState(result.state as any);
        if (result.state === "granted") loadCameras();

        result.onchange = () => {
          setPermissionState(result.state as any);
          if (result.state === "granted") loadCameras();
        };
      });
    }
  }, [loadCameras]);

  const dropdownOptions: Option[] = cameras.map((cam, idx) => {
    const icon = idx % 2 === 0 ? CameraIcon : VideoIcon;
    return {
      label: cam.label || `Camera ${idx + 1}`,
      value: cam.deviceId,
      icon,
    };
  });

  return (
    <>
      {/* Permission popup at root level - above the control div */}
      {permissionState === "prompt" && (
        <PermissionPopup
          variant="prompt"
          title="pssst… give camera access to animate!"
          subtitle="use your camera for fun face animation! by tapping 'let's go & allow,' you agree to camera and cookie use."
          buttonText="let's go & allow"
          onClick={() => requestCamera(selectedCamera || undefined)}
          showButton
        />
      )}
      
      {permissionState === "denied" && (() => {
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        return (
          <PermissionPopup
            variant="denied"
            title="oh... you haven't given camera access yet."
            image={isMobile
              ? "/images/app/explainers/campermission-denied-mobile.webp"
              : "/images/app/explainers/campermission-denied-pc.webp"
            }
            imagAlt={isMobile
              ? "How to enable camera permission on mobile"
              : "How to enable camera permission on desktop"
            }
            subtitle="at the top, tap the Site Info icon and enable the camera toggle in the settings."
            showButton={false}
          />
        );
      })()}

      {/* Main control div */}
      <div className={`flex flex-row flex-start gap-1 pos-abs reveal fade scaleIn top-0 left-0 z-9991 m-1 tb:m-6`}>
        {permissionState === "granted" && cameras.length > 1 && (
          <div className={`flex camera-selection cp-dropdown ${disabled ? " switcher-disabled" : ""}`}>
            <CustomDropdown
              options={dropdownOptions}
              value={selectedCamera}
              onChange={handleCameraChange}
              placeholder="Select camera"
            />
          </div>
        )}
        <button
          className="flex video-flip-switcher icon-holder br-12 tab-button size-30 mb:size-48"
          onClick={() => setIsFlipped(!isFlipped)}
        >
          <span className={`has-icon icon-size-18 flip-icon ${isFlipped ? "flipped" : ""}`}></span>
        </button>
      </div>
    </>
  );
}