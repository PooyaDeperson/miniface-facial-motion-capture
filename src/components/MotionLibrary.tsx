/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

/**
 * MotionLibrary.tsx
 *
 * A slide-in panel that shows the user's motions stored in Google Drive
 * (appDataFolder). Only rendered when the user is logged in with Drive scope.
 *
 * Layout (top → bottom)
 * ─────────────────────
 * 1. Header: "motion library" + close button
 * 2. Cloud sync status row
 * 3. Bulk sync progress bar (when syncing)
 * 4. "live motion capture" button
 * 5. Scrollable motion list
 *
 * On desktop: fixed right-edge column.
 * On mobile:  full-screen overlay; tapping backdrop closes it.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  listDriveMotions,
  downloadFromDrive,
  deleteDriveFile,
  hasDriveAccess,
  DriveMotionFile,
  BulkSyncProgress,
} from "../useDriveSync";
import IconButton from "./IconButton";

// ─── types ────────────────────────────────────────────────────────────────────

export interface MotionLibraryProps {
  /** Called when user closes the panel */
  onClose: () => void;
  /** Currently playing motion's Drive file ID (highlights the row) */
  activeMotionId?: string | null;
  /** Called when user selects a motion to play — passes the Blob */
  onSelectMotion: (blob: Blob, file: DriveMotionFile) => void;
  /** Called when user wants to start live motion capture */
  onStartLive: () => void;
  /** Optional bulk-sync progress (set externally by App.tsx) */
  bulkProgress?: BulkSyncProgress | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds?: number): string {
  if (seconds == null) return "";
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Stable hue from a string — used as the motion row colour chip */
function stringToHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % 360;
}

// ─── component ────────────────────────────────────────────────────────────────

const MotionLibrary: React.FC<MotionLibraryProps> = ({
  onClose,
  activeMotionId,
  onSelectMotion,
  onStartLive,
  bulkProgress,
}) => {
  const [motions, setMotions] = useState<DriveMotionFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const fetchedRef = useRef(false);

  // Load Drive motions on mount
  const fetchMotions = useCallback(async () => {
    if (!hasDriveAccess()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const files = await listDriveMotions();
      setMotions(files);
      setLastSynced(new Date());
    } catch (err: any) {
      setLoadError(err?.message ?? "Failed to load motions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchMotions();
    }
  }, [fetchMotions]);

  // Reload when bulk sync finishes
  useEffect(() => {
    if (bulkProgress && bulkProgress.done === bulkProgress.total && bulkProgress.total > 0) {
      fetchMotions();
    }
  }, [bulkProgress, fetchMotions]);

  const handlePlay = useCallback(async (file: DriveMotionFile) => {
    setDownloadingId(file.driveFileId);
    setDownloadError(null);
    try {
      const blob = await downloadFromDrive(file.driveFileId);
      onSelectMotion(blob, file);
    } catch (err: any) {
      setDownloadError(err?.message ?? "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }, [onSelectMotion]);

  const handleDownload = useCallback(async (file: DriveMotionFile) => {
    setDownloadingId(file.driveFileId);
    setDownloadError(null);
    try {
      const blob = await downloadFromDrive(file.driveFileId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      setDownloadError(err?.message ?? "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }, []);

  const handleDelete = useCallback(async (file: DriveMotionFile) => {
    if (!window.confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
    setDeletingId(file.driveFileId);
    try {
      await deleteDriveFile(file.driveFileId);
      setMotions((prev) => prev.filter((m) => m.driveFileId !== file.driveFileId));
    } catch (err: any) {
      setDownloadError(err?.message ?? "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }, []);

  const isBulkSyncing = bulkProgress != null && bulkProgress.done < bulkProgress.total;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="ml-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className="motion-library-panel reveal slide-left"
        aria-label="Motion library"
      >
        {/* ── Header ── */}
        <div className="ml-header">
          <h2 className="ml-title">motion library</h2>
          <IconButton
            icon="close-icon"
            iconSize="icon-size-16"
            className="icon-size-32"
            tooltip={true}
            tooltipText="Close"
            tooltipPosition="pos-bottom-right"
            onClick={onClose}
          />
        </div>

        {/* ── Bulk sync progress ── */}
        {isBulkSyncing && bulkProgress && (
          <div className="ml-sync-progress">
            <div className="ml-sync-progress-bar">
              <div
                className="ml-sync-progress-fill"
                style={{
                  width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%`,
                }}
              />
            </div>
            <p className="ml-sync-label">
              {bulkProgress.current
                ? `syncing: ${bulkProgress.current}`
                : `synced ${bulkProgress.done} / ${bulkProgress.total}`}
              {bulkProgress.failed > 0 && ` · ${bulkProgress.failed} failed`}
            </p>
          </div>
        )}

        {/* ── Sync status ── */}
        {lastSynced && !isBulkSyncing && (
          <div className="ml-sync-status">
            <span className="has-icon icon-size-12 cloud-check-icon" aria-hidden="true" />
            <span>synced to Google Drive</span>
            <button
              className="ml-refresh-btn"
              onClick={fetchMotions}
              aria-label="Refresh motion list"
              title="Refresh"
            >
              <span className="has-icon icon-size-12 refresh-icon" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* ── Live capture button ── */}
        <button
          className="rec-btn rec-btn-record ml-live-btn outline-5 outline-soft gap-2"
          onClick={onStartLive}
          aria-label="Start live motion capture"
        >
          <span className="rec-dot rec-dot-idle" aria-hidden="true" />
          live motion capture
        </button>

        {/* ── Error ── */}
        {(loadError || downloadError) && (
          <p className="ml-error" role="alert">
            {loadError ?? downloadError}
          </p>
        )}

        {/* ── List ── */}
        <div className="ml-list" role="list">
          {loading && (
            <div className="ml-loading">
              <span className="rec-spinner" aria-hidden="true" />
              <span>loading motions&hellip;</span>
            </div>
          )}

          {!loading && motions.length === 0 && !loadError && (
            <p className="ml-empty">No motions saved yet.</p>
          )}

          {motions.map((file) => {
            const hue = stringToHue(file.driveFileId);
            const isActive = file.driveFileId === activeMotionId;
            const isDownloading = downloadingId === file.driveFileId;
            const isDeleting = deletingId === file.driveFileId;

            return (
              <div
                key={file.driveFileId}
                className={`ml-item${isActive ? " ml-item-active" : ""}`}
                role="listitem"
              >
                {/* Colour chip */}
                <div
                  className="ml-item-chip"
                  style={{ background: `hsl(${hue}, 60%, 65%)` }}
                  aria-hidden="true"
                />

                {/* Info */}
                <div className="ml-item-info">
                  <span className="ml-item-name" title={file.name}>
                    {file.name.replace(/\.glb$/i, "")}
                  </span>
                  <span className="ml-item-meta">
                    {file.duration != null && (
                      <>{formatDuration(file.duration)} &middot; </>
                    )}
                    {formatBytes(file.size)}
                  </span>
                </div>

                {/* Actions */}
                <div className="ml-item-actions">
                  {/* Play */}
                  <button
                    className="ml-action-btn"
                    onClick={() => handlePlay(file)}
                    disabled={isDownloading || isDeleting}
                    aria-label={`Play ${file.name}`}
                    title="Play"
                  >
                    {isDownloading ? (
                      <span className="rec-spinner rec-spinner-xs" aria-hidden="true" />
                    ) : (
                      <span className="playback-play-icon playback-play-icon-sm" aria-hidden="true" />
                    )}
                  </button>

                  {/* Download */}
                  <button
                    className="ml-action-btn"
                    onClick={() => handleDownload(file)}
                    disabled={isDownloading || isDeleting}
                    aria-label={`Download ${file.name}`}
                    title="Download .glb"
                  >
                    <span className="has-icon icon-size-14 download-icon" aria-hidden="true" />
                  </button>

                  {/* Delete */}
                  <button
                    className="ml-action-btn ml-action-btn-danger"
                    onClick={() => handleDelete(file)}
                    disabled={isDownloading || isDeleting}
                    aria-label={`Delete ${file.name}`}
                    title="Delete"
                  >
                    {isDeleting ? (
                      <span className="rec-spinner rec-spinner-xs" aria-hidden="true" />
                    ) : (
                      <span className="has-icon icon-size-14 trash-icon" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
};

export default MotionLibrary;
