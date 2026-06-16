/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

/**
 * MotionLibrary.tsx
 *
 * A slide-in panel that shows the user's motions.
 *
 * - When not logged in: shows an empty-state CTA with a login button.
 * - When logged in: shows motions from Google Drive.
 *
 * Clicking a motion row plays it (no separate play button).
 * Delete uses a PermissionPopup confirmation instead of window.confirm.
 *
 * Layout (top → bottom)
 * ─────────────────────
 * 1. Header: "motion library" + close button
 * 2. Cloud sync status / bulk progress
 * 3. "live motion capture" button (logged-in only)
 * 4. Scrollable motion list OR unauthenticated empty state
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
import PermissionPopup from "./PermissionPopup";

// ─── types ────────────────────────────────────────────────────────────────────

export interface MotionLibraryProps {
  onClose: () => void;
  activeMotionId?: string | null;
  onSelectMotion: (blob: Blob, file: DriveMotionFile) => void;
  onStartLive: () => void;
  bulkProgress?: BulkSyncProgress | null;
  refreshKey?: number;
  pendingMotion?: DriveMotionFile | null;
  quotaReached?: boolean;
  /** Whether the user is logged in with Drive access */
  isLoggedIn?: boolean;
  /** Called when the guest-state login button is clicked */
  onLoginRequest?: () => void;
  /** Whether currently in playback mode */
  isInPlayback?: boolean;
  /** The playback blob for guest users (used to download guest recordings) */
  playbackBlob?: Blob | null;
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
  quotaReached = false,
  isLoggedIn = false,
  onLoginRequest,
  isInPlayback = false,
  playbackBlob = null,
}) => {
  const [motions, setMotions] = useState<DriveMotionFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const lastRefreshKey = useRef(-1);

  /** The file currently pending delete confirmation (null = no confirm shown) */
  const [deleteConfirmFile, setDeleteConfirmFile] = useState<DriveMotionFile | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  useEffect(() => {
    if (lastRefreshKey.current !== refreshKey) {
      lastRefreshKey.current = refreshKey;
      const isFirstFetch = motions.length === 0 && !lastSynced;
      fetchMotions(!isFirstFetch);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, fetchMotions]);

  useEffect(() => {
    if (bulkProgress && bulkProgress.done === bulkProgress.total && bulkProgress.total > 0) {
      fetchMotions(true);
    }
  }, [bulkProgress, fetchMotions]);

  // Click on a row → play it
  const handleRowClick = useCallback(async (file: DriveMotionFile) => {
    if (deletingId === file.driveFileId) return;
    setDownloadingId(file.driveFileId);
    setDownloadError(null);
    try {
      // For guest users with pending motion, if it's already active/in playback,
      // just call onSelectMotion with empty blob (App will use existing playbackBlob)
      if (!isLoggedIn && file.driveFileId === pendingMotion?.driveFileId) {
        onSelectMotion(new Blob(), file);
      } else {
        // For Drive motions, download from Drive
        const blob = await downloadFromDrive(file.driveFileId);
        onSelectMotion(blob, file);
      }
    } catch (err: any) {
      setDownloadError(err?.message ?? "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }, [onSelectMotion, deletingId, isLoggedIn, pendingMotion]);

  const handleDownload = useCallback(async (e: React.MouseEvent, file: DriveMotionFile) => {
    e.stopPropagation();
    setDownloadingId(file.driveFileId);
    setDownloadError(null);
    try {
      let blob: Blob;
      
      // For guest users with pending motion, use the playbackBlob
      if (!isLoggedIn && file.driveFileId === pendingMotion?.driveFileId && playbackBlob) {
        blob = playbackBlob;
      } else if (!isLoggedIn && file.driveFileId === pendingMotion?.driveFileId) {
        // Guest motion without playback blob available
        setDownloadError("Motion data not available for download");
        return;
      } else {
        // For Drive motions, download from Drive
        blob = await downloadFromDrive(file.driveFileId);
      }
      
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
  }, [isLoggedIn, pendingMotion, playbackBlob]);

  const handleDeleteClick = useCallback((e: React.MouseEvent, file: DriveMotionFile) => {
    e.stopPropagation();
    setDeleteConfirmFile(file);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmFile) return;
    const file = deleteConfirmFile;
    setDeleteConfirmFile(null);
    setDeletingId(file.driveFileId);
    try {
      await deleteDriveFile(file.driveFileId);
      setMotions((prev) => prev.filter((m) => m.driveFileId !== file.driveFileId));
    } catch (err: any) {
      setDownloadError(err?.message ?? "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }, [deleteConfirmFile]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmFile(null);
  }, []);

  const isBulkSyncing = bulkProgress != null && bulkProgress.done < bulkProgress.total;

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
        className="ml-backdrop motion-library-backdrop"
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

        {/* ── Sync status (logged-in only) ── */}
        {isLoggedIn && lastSynced && !isBulkSyncing && (
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

        {/* ── Live capture button (logged-in only) ── */}
        {isLoggedIn && (
          <button
            className="rec-btn rec-btn-record ml-live-btn outline-5 outline-soft gap-2 live-capture-button"
            onClick={onStartLive}
            aria-label="Start live motion capture"
          >
            <span className="rec-dot rec-dot-idle" aria-hidden="true" />
            live motion capture
          </button>
        )}

        {/* ── Live motion button (during playback for guests and logged-in users) ── */}
        {isInPlayback && (
          <button
            className="rec-btn rec-btn-record ml-live-btn outline-5 outline-soft gap-2 playback-live-motion-button"
            onClick={onStartLive}
            aria-label="Start live motion capture"
          >
            <span className="rec-dot rec-dot-idle" aria-hidden="true" />
            live motion
          </button>
        )}

        {/* ── Error ── */}
        {(loadError || downloadError) && (
          <p className="ml-error" role="alert">
            {loadError ?? downloadError}
          </p>
        )}

        {/* ── Drive quota full banner ── */}
        {quotaReached && (
          <div className="ml-quota-banner" role="alert">
            <div className="ml-quota-icon" aria-hidden="true">&#9888;</div>
            <div className="ml-quota-body">
              <strong>Your Google Drive is full.</strong>
              <p>
                There is no space left to save your motion. To keep recording,
                free up space by deleting unnecessary files in your Google Drive.
              </p>
              <p>
                Need help?{" "}
                <a href="mailto:arkitface@gmail.com" className="ml-quota-link">
                  arkitface@gmail.com
                </a>
              </p>
            </div>
          </div>
        )}

      {/* ── Guest empty state (only when not in playback with a pending motion) ── */}
      {!isLoggedIn && !isInPlayback && (
        <div className="ml-guest-empty guest-empty-state">
          <p className="ml-guest-headline">your motions will show up here</p>
          <p className="ml-guest-sub">connect to keep them forever</p>
          <button
            className="rec-btn rec-btn-record ml-live-btn outline-5 outline-soft gap-2 mt-8 guest-login-button"
            onClick={onLoginRequest}
            aria-label="Sign in to save motions"
          >
            <span className="has-icon icon-size-16 login-icon" aria-hidden="true" />
            connect
          </button>
        </div>
      )}

        {/* ── Guest with pending motion (during playback or after recording) ── */}
        {!isLoggedIn && pendingMotion && (
          <div className="ml-list motion-list-container guest-motion-list" role="list">
            {(() => {
              const file = pendingMotion;
              const hue = stringToHue(file.driveFileId);
              const isActive = file.driveFileId === activeMotionId;
              const isDownloading = downloadingId === file.driveFileId;

              return (
                <div
                  key={file.driveFileId}
                  className={`ml-item ml-item-clickable motion-row${isActive ? " ml-item-active" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Play ${file.name.replace(/\.glb$/i, "")}`}
                  onClick={() => handleRowClick(file)}
                  onKeyDown={(e) => e.key === "Enter" && handleRowClick(file)}
                >
                  {/* Colour chip */}
                  <div
                    className="ml-item-chip motion-row-chip"
                    style={{ background: `hsl(${hue}, 60%, 65%)` }}
                    aria-hidden="true"
                  />

                  {/* Loading spinner overlay when downloading this row */}
                  {isDownloading && (
                    <span className="rec-spinner rec-spinner-xs ml-row-spinner" aria-hidden="true" />
                  )}

                  {/* Info */}
                  <div className="ml-item-info motion-row-info">
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
                  <div className="ml-item-actions motion-row-actions">
                    {/* Download */}
                    <button
                      className="ml-action-btn"
                      onClick={(e) => handleDownload(e, file)}
                      disabled={isDownloading}
                      aria-label={`Download ${file.name}`}
                      title="Download .glb"
                    >
                      <span className="has-icon icon-size-14 download-icon" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </aside>

      {/* ── Delete confirmation popup ── */}
      {deleteConfirmFile && (
        <PermissionPopup
          variant="prompt"
          centered
          backdrop
          onBackdropClick={handleDeleteCancel}
          aria-label="Confirm delete"
          title={`delete "${deleteConfirmFile.name.replace(/\.glb$/i, "")}"?`}
          className="ml-delete-popup motion-delete-confirmation"
        >
          <p className="subtitle prompt-subtitle">
            this cannot be undone.
          </p>
          <button
            className="button primary w-full mt-8"
            onClick={handleDeleteConfirm}
            style={{ background: "var(--red-900, #c0137b)", color: "#fff" }}
          >
            delete
          </button>
          <button
            className="button primary w-full mt-8"
            onClick={handleDeleteCancel}
            style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}
          >
            cancel
          </button>
        </PermissionPopup>
      )}
    </>
  );
};

export default MotionLibrary;
