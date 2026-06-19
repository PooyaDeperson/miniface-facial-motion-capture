/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

/**
 * MotionLibrary.tsx
 *
 * Redesigned as a narrow 90px transparent column on the right edge.
 *
 * Each motion is a 57×72 card with:
 *   - motionlibrary-icon (idle) → download-icon (active)
 *   - transparent 2px border → purple-800 when active
 *   - always-visible tooltip to the left showing filename + duration + size
 *   - tooltips completely hidden on mobile
 *   - trash-icon appears below download-icon on active card (flex-col gap-1)
 *   - saving/downloading dims the card
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import clsx from "clsx";
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
import "./motionlibrary.css";

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
  isLoggedIn?: boolean;
  onLoginRequest?: () => void;
  onNoDriveAccessRetry?: () => void;
  onNoDriveAccess?: (detected: boolean) => void;
  onDrivePermissionError?: () => void;
  isInPlayback?: boolean;
  playbackBlob?: Blob | null;
  isPendingUploading?: boolean;
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
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ─── empty slot config ────────────────────────────────────────────────────────
//
// EMPTY_SLOT_BATCH controls how many empty placeholder slots appear when there
// are NO real motion files (pure empty state). Once the user has at least one
// motion, no empty slots are rendered at all.
//
// Change this number to control how many slots show in the empty state:
const EMPTY_SLOT_BATCH = 5; // ← adjust here (e.g. 5 or 10)

/** Returns the number of empty placeholder slots to render.
 *  Only renders slots when there are zero real motions (empty state).
 */
function calcEmptySlots(realCount: number): number {
  if (realCount > 0) return 0;
  return EMPTY_SLOT_BATCH;
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
  onNoDriveAccessRetry,
  onNoDriveAccess,
  onDrivePermissionError,
  isInPlayback = false,
  playbackBlob = null,
  isPendingUploading = false,
}) => {
  const [motions, setMotions] = useState<DriveMotionFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noDriveAccess, setNoDriveAccess] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const lastRefreshKey = useRef(-1);

  const [deleteConfirmFile, setDeleteConfirmFile] = useState<DriveMotionFile | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load Drive motions
  const fetchMotions = useCallback(async (silent = false) => {
    if (!hasDriveAccess()) {
      setNoDriveAccess(true);
      setLoading(false);
      return;
    }
    setNoDriveAccess(false);
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const files = await listDriveMotions();
      setMotions(files);
      setLastSynced(new Date());
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      const isDrivePermissionError =
        msg.includes("403") ||
        msg.toLowerCase().includes("insufficient") ||
        msg.toLowerCase().includes("permission_denied") ||
        msg.toLowerCase().includes("insufficientpermissions");
      if (isDrivePermissionError) {
        setNoDriveAccess(true);
        setLoadError(null);
        onDrivePermissionError?.();
      } else {
        setLoadError(msg || "Failed to load motions");
      }
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

  useEffect(() => {
    onNoDriveAccess?.(noDriveAccess);
  }, [noDriveAccess, onNoDriveAccess]);

  // Click on a card → select / activate it (no download yet)
  const handleCardClick = useCallback(async (file: DriveMotionFile) => {
    if (deletingId === file.driveFileId) return;
    setDownloadingId(file.driveFileId);
    setDownloadError(null);
    try {
      if (!isLoggedIn && file.driveFileId === pendingMotion?.driveFileId) {
        onSelectMotion(new Blob(), file);
      } else {
        const blob = await downloadFromDrive(file.driveFileId);
        onSelectMotion(blob, file);
      }
    } catch (err: any) {
      setDownloadError(err?.message ?? "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }, [onSelectMotion, deletingId, isLoggedIn, pendingMotion]);

  // Download button on active card
  const handleDownload = useCallback(async (e: React.MouseEvent, file: DriveMotionFile) => {
    e.stopPropagation();
    setDownloadingId(file.driveFileId);
    setDownloadError(null);
    try {
      let blob: Blob;
      if (!isLoggedIn && file.driveFileId === pendingMotion?.driveFileId && playbackBlob) {
        blob = playbackBlob;
      } else if (!isLoggedIn && file.driveFileId === pendingMotion?.driveFileId) {
        setDownloadError("Motion data not available for download");
        return;
      } else {
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

  // ─── render a single empty placeholder slot ───────────────────────────────

  const renderEmptySlot = (index: number) => (
    <div
      key={`empty-slot-${index}`}
      className="ml-empty-slot"
      aria-hidden="true"
    />
  );

  // ─── render a single motion card ──────────────────────────────────────────

  const renderMotionCard = (file: DriveMotionFile) => {
    const isActive = file.driveFileId === activeMotionId;
    const isDownloading = downloadingId === file.driveFileId;
    const isDeleting = deletingId === file.driveFileId;
    const isThisPending = pendingMotion?.driveFileId === file.driveFileId;
    const isSaving = isThisPending && isPendingUploading;
    const isDim = isDownloading || isSaving;

    const displayName = file.name.replace(/\.glb$/i, "");
    const durationStr = file.duration != null ? formatDuration(file.duration) : null;
    const sizeStr = formatBytes(file.size);

    return (
      <div key={file.driveFileId} className="pos-rel">
        {/* Always-visible tooltip to the left */}
        <div className="ml-card-tooltip hidden" aria-hidden="true">
          <div className="ml-card-tooltip-inner">
            <div className="ml-card-tooltip-content">
              <span className="ml-card-tooltip-name">{displayName}</span>
              {(durationStr || sizeStr) && (
                <span className="ml-card-tooltip-meta">
                  {durationStr ? `${durationStr} · ${sizeStr}` : sizeStr}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card button */}
        <button
          className={clsx(
            "ml-motion-card",
            isActive && "ml-motion-card-active",
            isDim && "ml-motion-card-dim",
            isDeleting && "ml-motion-card-deleting"
          )}
          onClick={() => !isDeleting && !isDim && handleCardClick(file)}
          aria-label={isActive ? `Download ${displayName}` : `Select ${displayName}`}
          aria-pressed={isActive}
          disabled={isDeleting || isDim}
        >
          {isActive ? (
            /* Active card: flex-col with download + trash */
            <div className="ml-card-actions">
              {/* Download icon button */}
              <IconButton
                icon="download-icon"
                iconSize="icon-size-20"
                className="icon-size-32"
                tooltip={false}
                onClick={(e) => handleDownload(e, file)}
                disabled={isDownloading || isSaving}
                aria-label={`Download ${displayName}`}
              />
              {/* Trash icon button */}
              {isLoggedIn && (
                <IconButton
                  icon="trash-icon"
                  iconSize="icon-size-20"
                  className="icon-size-32"
                  tooltip={false}
                  onClick={(e) => handleDeleteClick(e, file)}
                  disabled={isDeleting || isDownloading || isSaving}
                  aria-label={`Delete ${displayName}`}
                />
              )}
            </div>
          ) : (
            /* Idle: motion library icon */
            <span
              className="has-icon motionlibrary-icon icon-size-20"
              aria-hidden="true"
            />
          )}
        </button>
      </div>
    );
  };

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Mobile backdrop — hidden by CSS since panel is narrow */}
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
        {/* ── Header: only refresh icon-button ── */}
        <div className="ml-header display-none">
          {isLoggedIn ? (
            <IconButton
              icon="refresh-icon"
              iconSize="icon-size-20"
              className="icon-size-32"
              tooltip={true}
              tooltipText="Refresh Google Drive"
              tooltipPosition="pos-left"
              onClick={() => fetchMotions(false)}
              aria-label="Refresh motion list"
            />
          ) : (
            <IconButton
              icon="close-icon"
              iconSize="icon-size-16"
              className="icon-size-32"
              tooltip={true}
              tooltipText="Close"
              tooltipPosition="pos-left"
              onClick={onClose}
            />
          )}
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
              {bulkProgress.done}/{bulkProgress.total}
              {bulkProgress.failed > 0 && ` · ${bulkProgress.failed}✗`}
            </p>
          </div>
        )}

        {/* ── No Drive access ── */}
        {isLoggedIn && noDriveAccess && (
          <p className="ml-no-drive-label" role="status" aria-live="polite">
            no drive
          </p>
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
              <strong>Drive full.</strong>
              <p>
                Free up space in{" "}
                <a href="mailto:arkitface@gmail.com" className="ml-quota-link">
                  Google Drive
                </a>
                .
              </p>
            </div>
          </div>
        )}

        {/* ── Guest empty state ── */}
        {!isLoggedIn && (
          <div className="ml-guest-empty guest-empty-state">
            <p className="ml-guest-headline">your motions</p>
            <p className="ml-guest-sub">connect to keep them</p>
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

        {/* ── Logged-in motion list ── */}
        {isLoggedIn && (
          <div className="ml-list motion-list-container" role="list">
            {loading && displayMotions.length === 0 && (
              <div className="ml-loading" aria-busy="true">
                <span className="rec-spinner rec-spinner-xs" aria-hidden="true" />
              </div>
            )}
            {!loading && displayMotions.length === 0 && !loadError && (
              <p className="ml-empty">no motions</p>
            )}
            {/* Real motion cards */}
            {displayMotions.map((file) => renderMotionCard(file))}
            {/* Empty placeholder slots — always visible, count rounds up in batches of EMPTY_SLOT_BATCH */}
            {!loading && Array.from({ length: calcEmptySlots(displayMotions.length) }, (_, i) =>
              renderEmptySlot(i)
            )}
          </div>
        )}

        {/* ── Guest with pending motion ── */}
        {!isLoggedIn && pendingMotion && (
          <div className="ml-list motion-list-container guest-motion-list" role="list">
            {/* Pending motion card */}
            {renderMotionCard(pendingMotion)}
            {/* Empty placeholder slots after the single guest card */}
            {Array.from({ length: calcEmptySlots(1) }, (_, i) => renderEmptySlot(i))}
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
