
/*
 * Copyright (c) 2025 Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 * 
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. pooyadeperson@gmail.com https://github.com/PooyaDeperson"
 */


import { useEffect, useState } from "react";
import CustomDropdown, { Option } from "./components/CustomDropdown";

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

interface PermissionPopupProps {
  title: string;
  subtitle: string;
  buttonText?: string;
  onClick?: () => void;
  showButton?: boolean;
  variant: "prompt" | "denied" | "refresh";
}

function PermissionPopup({ title, subtitle, buttonText, onClick, showButton, variant }: PermissionPopupProps) {
  return (
    <div className={`popup-container ${variant}-popup reveal fade scaleIn w-100 tb:w-392 pos-abs z-7 m-5 p-1 br-20 top-0`}>
      <div className="inner-container p-5 flex-col br-16">
        <div className="text-container flex-col gap-2">
          <h1 className={`title ${variant}-title`}>{title}</h1>
          <p className={`subtitle ${variant}-subtitle`}>{subtitle}</p>
        </div>
        {showButton && (
          <button onClick={onClick} className={`button primary ${variant}-button`}>
            {buttonText}
          </button>
        )}
      </div>
    </div>
  );
}

interface CameraPermissionsProps {
  onStreamReady: (stream: MediaStream) => void;
}

export default function CameraPermissions({ onStreamReady }: CameraPermissionsProps) {
  const [permissionState, setPermissionState] = useState<"prompt" | "denied" | "granted">("prompt");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [showRefreshPopup, setShowRefreshPopup] = useState(false);

  const requestCamera = async (deviceId?: string) => {
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { width: 1280, height: 720 },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setPermissionState("granted");

      const video = document.getElementById("video") as HTMLVideoElement;
      if (video) video.srcObject = stream;

      onStreamReady(stream);
    } catch (err) {
      console.error("Camera error:", err);
      setPermissionState("denied");
    }
  };

  const loadCameras = async () => {
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
  };

  const handleCameraChange = (deviceId: string) => {
    setSelectedCamera(deviceId);
    localStorage.setItem("selectedCamera", deviceId);
    setShowRefreshPopup(true);
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
  }, []);

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
      {permissionState === "prompt" && (
        <PermissionPopup
          variant="prompt"
          title="pssst… give camera access to animate!"
          subtitle="use your camera for fun face animation! by tapping 'let’s go & allow,' you agree to camera and cookie use."
          buttonText="let’s go & allow"
          onClick={() => requestCamera(selectedCamera || undefined)}
          showButton
        />
      )}

      {permissionState === "denied" && (
        <PermissionPopup
          variant="denied"
          title="oh... you haven’t given camera access yet.
"
          subtitle="At the top ⬆️, tap the ℹ️ Site Info icon and turn on camera toggle."
          showButton={false}
        />
      )}

      {permissionState === "granted" && cameras.length > 1 && (
        <div className="cp-dropdown pos-abs reveal fade scaleIn top-0 right-0 tb:left-0 tb:display-table z-7 m-6">
          <CustomDropdown
            options={dropdownOptions}
            value={selectedCamera}
            onChange={handleCameraChange}
            placeholder="Select camera"
          />
        </div>
      )}

      {showRefreshPopup && (
        <PermissionPopup
          variant="refresh"
          title="Refresh to animate your character!"
          subtitle="You changed the camera. Please refresh the page to see the animation in action."
          buttonText="Refresh page"
          onClick={() => window.location.reload()}
          showButton
        />
      )}
    </>
  );
}
