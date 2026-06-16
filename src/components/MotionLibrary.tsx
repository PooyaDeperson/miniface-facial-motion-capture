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
  /**
   * Incrementing this value triggers a background re-fetch of the Drive list.
   * App.tsx bumps it after a successful upload to ensure the list is canonical.
   */
  refreshKey?: number;
  /**
   * A motion that was just uploaded — optimistically prepended to the list
   * immediately so the user sees it without waiting for a Drive round-trip.
   * Once the re-fetch completes the real Drive entry replaces it.
   */
  pendingMotion?: DriveMotionFile | null;
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
  refreshKey = 0,
  pendingMotion,
}) => {
  const [motions, setMotions] = useState<DriveMotionFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  // Track which refreshKey value we last fetched for, so we refetch on change
  const lastRefreshKey = useRef(-1);

  // Load Drive motions
  const fetchMotions = useCallback(async (silent = false) => {
    if (!hasDriveAccess()) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
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

  // Initial fetch + re-fetch whenever refreshKey increments
  useEffect(() => {
    if (lastRefreshKey.current !== refreshKey) {
      lastRefreshKey.current = refreshKey;
      // First open: show skeleton (loading=true). Subsequent refreshes: silent
      // background fetch so existing rows stay visible while we update.
      const isFirstFetch = motions.length === 0 && !lastSynced;
      fetchMotions(!isFirstFetch);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, fetchMotions]);

  // Reload when bulk sync finishes
  useEffect(() => {
    if (bulkProgress && bulkProgress.done === bulkProgress.total && bulkProgress.total > 0) {
      fetchMotions(true); // silent refresh
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

  // Merge the pending motion (optimistic) at the top, deduped by driveFileId
  const displayMotions: DriveMotionFile[] = pendingMotion
    ? [
        pendingMotion,
        ...motions.filter((m) => m.driveFileId !== pendingMotion.driveFileId),
      ]
    : motions;

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
              onClick={() => fetchMotions(false)}
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
          {/* Skeleton rows — shown while loading and no items exist yet */}
          {loading && displayMotions.length === 0 && (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="ml-skeleton-item" aria-hidden="true">
                  <div className="ml-skeleton ml-skeleton-chip" />
                  <div className="ml-skeleton-info">
                    <div className="ml-skeleton ml-skeleton-name" />
                    <div className="ml-skeleton ml-skeleton-meta" />
                  </div>
                  <div className="ml-skeleton-actions">
                    <div className="ml-skeleton ml-skeleton-btn" />
                    <div className="ml-skeleton ml-skeleton-btn" />
                    <div className="ml-skeleton ml-skeleton-btn" />
                  </div>
                </div>
              ))}
            </>
          )}

          {!loading && displayMotions.length === 0 && !loadError && (
            <p className="ml-empty">No motions saved yet.</p>
          )}

          {displayMotions.map((file) => {
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
