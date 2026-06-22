/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 */

/**
 * useDriveSync.ts
 *
 * All Google Drive appDataFolder operations for facial-motion-capture.
 * - Token management (store / retrieve / refresh via Supabase session)
 * - Upload GLB blob  → returns driveFileId
 * - List all GLB files in appDataFolder
 * - Download one file by driveFileId → returns Blob
 * - Delete one file by driveFileId
 *
 * The Drive scope used is "https://www.googleapis.com/auth/drive.appdata"
 * (appDataFolder) — sandboxed, no CASA review required, cannot see any
 * user file outside this app's hidden folder.
 *
 * Token storage
 * ─────────────
 * We use sessionStorage (not localStorage) so tokens disappear when the
 * tab closes. Keys: "gd_access_token", "gd_refresh_token".
 * Supabase's SIGNED_IN event hands us provider_token / provider_refresh_token
 * only on the initial OAuth redirect; supabaseClient.ts captures them and
 * calls storeDriveTokens() right there so we never miss them.
 */

// ─── upload notification (module-level pub/sub) ───────────────────────────────
// After a successful uploadToDrive() call, we notify subscribers with the
// resulting DriveMotionFile so App.tsx can optimistically update the library
// without polling.

type UploadedListener = (file: DriveMotionFile) => void;
const _uploadListeners = new Set<UploadedListener>();

export function subscribeMotionUploaded(fn: UploadedListener): () => void {
  _uploadListeners.add(fn);
  return () => _uploadListeners.delete(fn);
}

function _notifyUploaded(file: DriveMotionFile) {
  _uploadListeners.forEach((fn) => fn(file));
}

// ─── no-Drive-scope notification ─────────────────────────────────────────────
// Fired by supabaseClient.ts when a SIGNED_IN event arrives but provider_token
// is absent — meaning the user authenticated with Google but did NOT grant the
// Drive appdata scope. App.tsx listens to re-open AuthModal so the user can
// retry without losing their pending recording blob.

type NoDriveScopeListener = () => void;
const _noDriveScopeListeners = new Set<NoDriveScopeListener>();

export function subscribeNoDriveScope(fn: NoDriveScopeListener): () => void {
  _noDriveScopeListeners.add(fn);
  return () => _noDriveScopeListeners.delete(fn);
}

export function notifyNoDriveScope(): void {
  _noDriveScopeListeners.forEach((fn) => fn());
}

// ─── quota notification ───────────────────────────────────────────────────────
// Fired when any uploadToDrive() call fails with DriveQuotaError so App.tsx
// can update driveUploadStatus="quota" regardless of which call site triggered it.

type QuotaListener = () => void;
const _quotaListeners = new Set<QuotaListener>();

export function subscribeQuotaExceeded(fn: QuotaListener): () => void {
  _quotaListeners.add(fn);
  return () => _quotaListeners.delete(fn);
}

function _notifyQuota() {
  _quotaListeners.forEach((fn) => fn());
}

// ─── upload-failed notification ───────────────────────────────────────────────
// Fired by uploadToDrive() on any non-quota error so App.tsx can always react
// to upload failures, even when the upload was initiated from useMotionRecorder
// (where App.tsx has no direct .catch() handle).

type UploadFailedListener = (err: Error) => void;
const _uploadFailedListeners = new Set<UploadFailedListener>();

export function subscribeUploadFailed(fn: UploadFailedListener): () => void {
  _uploadFailedListeners.add(fn);
  return () => _uploadFailedListeners.delete(fn);
}

function _notifyUploadFailed(err: Error) {
  _uploadFailedListeners.forEach((fn) => fn(err));
}

// ─── constants ────────────────────────────────────────────────────────────────

const DRIVE_UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,modifiedTime,appProperties";
const DRIVE_FILES_URL =
  "https://www.googleapis.com/drive/v3/files";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

const SS_ACCESS  = "gd_access_token";
const SS_REFRESH = "gd_refresh_token";
const SS_EMAIL   = "gd_user_email";

// ─── token helpers ────────────────────────────────────────────────────────────

/** Store tokens obtained from Supabase SIGNED_IN provider_token fields. */
export function storeDriveTokens(
  accessToken: string,
  refreshToken: string | null,
  email?: string
): void {
  try {
    sessionStorage.setItem(SS_ACCESS, accessToken);
    if (refreshToken) sessionStorage.setItem(SS_REFRESH, refreshToken);
    if (email) sessionStorage.setItem(SS_EMAIL, email);
  } catch {
    // sessionStorage blocked (private mode in some browsers) — silently skip
  }
}

/** Clear Drive tokens on sign-out. */
export function clearDriveTokens(): void {
  try {
    sessionStorage.removeItem(SS_ACCESS);
    sessionStorage.removeItem(SS_REFRESH);
    sessionStorage.removeItem(SS_EMAIL);
  } catch { /* */ }
}

/** True when we have a Drive access token in session. */
export function hasDriveAccess(): boolean {
  try {
    return !!sessionStorage.getItem(SS_ACCESS);
  } catch {
    return false;
  }
}

function getAccessToken(): string | null {
  try { return sessionStorage.getItem(SS_ACCESS); } catch { return null; }
}
function getRefreshToken(): string | null {
  try { return sessionStorage.getItem(SS_REFRESH); } catch { return null; }
}

// ─── token refresh ────────────────────────────────────────────────────────────

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Uses the Google OAuth token endpoint. Requires REACT_APP_GOOGLE_CLIENT_ID
 * and REACT_APP_GOOGLE_CLIENT_SECRET (or handle via Supabase if available).
 * Returns the new access token, or null on failure.
 */
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  // Try via supabase session refresh first (preferred — no client secret needed)
  try {
    const { supabase } = await import("./supabaseClient");
    if (supabase) {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session?.provider_token) {
        storeDriveTokens(
          data.session.provider_token,
          data.session.provider_refresh_token ?? null
        );
        return data.session.provider_token;
      }
    }
  } catch { /* supabase refresh failed — fall through */ }

  return null;
}

// ─── fetch with auto-retry on 401 ────────────────────────────────────────────

async function driveFetch(
  input: RequestInfo,
  init: RequestInit,
  retry = true
): Promise<Response> {
  const token = getAccessToken();
  if (!token) throw new DriveAuthError("No Drive access token. Please sign in.");

  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401 && retry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return driveFetch(input, init, false);
    }
    clearDriveTokens();
    throw new DriveAuthError("Drive session expired. Please reconnect Google Drive.");
  }

  return res;
}

// ─── errors ───────────────────────────────────────────���───────────────────────

export class DriveAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveAuthError";
  }
}

export class DriveQuotaError extends Error {
  constructor() {
    super("Google Drive storage quota exceeded.");
    this.name = "DriveQuotaError";
  }
}

// ─── types ────────────────────────────────────────────────────────────────────

export interface DriveMotionFile {
  driveFileId: string;
  name: string;
  /** bytes */
  size: number;
  /** ISO string */
  modifiedTime: string;
  /** duration in seconds stored as appProperty */
  duration?: number;
  /** the avatar URL that was active when this motion was recorded */
  avatarUrl?: string;
}

// ─── upload ───────────────────────────────────────────────────────────────────

/**
 * Upload a GLB blob to the Drive appDataFolder.
 * Returns the Drive file ID on success.
 */
export async function uploadToDrive(
  blob: Blob,
  fileName: string,
  durationSeconds?: number,
  avatarUrl?: string
): Promise<string> {
  // Wrap the entire function so that DriveAuthError thrown by driveFetch
  // (e.g. no token, expired session) also triggers the failure notification,
  // which App.tsx uses to clear the stuck "saving…" card.
  try {
    return await _uploadToDriveImpl(blob, fileName, durationSeconds, avatarUrl);
  } catch (err: any) {
    // Only re-notify here for errors we haven't already notified inside _uploadToDriveImpl.
    // DriveAuthError from driveFetch (no token / 401) lands here; the
    // 403/non-ok paths already called _notifyUploadFailed before throwing.
    if (err instanceof DriveAuthError) {
      _notifyUploadFailed(err);
    }
    throw err;
  }
}

async function _uploadToDriveImpl(
  blob: Blob,
  fileName: string,
  durationSeconds?: number,
  avatarUrl?: string
): Promise<string> {
  const appProperties: Record<string, string> = {};
  if (durationSeconds != null) appProperties.duration = String(durationSeconds);
  if (avatarUrl) appProperties.avatarUrl = avatarUrl;

  const metadata = {
    name: fileName,
    parents: ["appDataFolder"],
    mimeType: "model/gltf-binary",
    appProperties: Object.keys(appProperties).length > 0 ? appProperties : undefined,
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("file", blob, fileName);

  const res = await driveFetch(DRIVE_UPLOAD_URL, { method: "POST", body: form });

  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (body?.error?.errors?.[0]?.reason === "storageQuotaExceeded") {
      _notifyQuota();
      throw new DriveQuotaError();
    }
    const forbiddenErr = new Error(`Drive upload forbidden: ${body?.error?.message ?? res.statusText}`);
    _notifyUploadFailed(forbiddenErr);
    throw forbiddenErr;
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    const uploadErr = new Error(`Drive upload failed (${res.status}): ${txt}`);
    _notifyUploadFailed(uploadErr);
    throw uploadErr;
  }

  const json = await res.json();
  const driveFileId = json.id as string;

  // Notify subscribers so the library can update immediately without polling.
  const motionFile: DriveMotionFile = {
    driveFileId,
    name: fileName,
    size: blob.size,
    modifiedTime: new Date().toISOString(),
    duration: durationSeconds,
    avatarUrl,
  };
  _notifyUploaded(motionFile);

  return driveFileId;
}

// ─── list ─────────────────────────────────────────────────────────────────────

/**
 * List all GLB files stored in the Drive appDataFolder.
 * Returns newest-first.
 */
export async function listDriveMotions(): Promise<DriveMotionFile[]> {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    fields: "files(id,name,size,modifiedTime,appProperties)",
    q: "mimeType='model/gltf-binary' and trashed=false",
    orderBy: "modifiedTime desc",
    pageSize: "100",
  });

  const res = await driveFetch(`${DRIVE_FILES_URL}?${params}`, { method: "GET" });

  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`Drive list failed (${res.status}): ${txt}`);
  }

  const json = await res.json();
  return (json.files ?? []).map((f: any): DriveMotionFile => ({
    driveFileId: f.id,
    name: f.name,
    size: Number(f.size ?? 0),
    modifiedTime: f.modifiedTime,
    duration: f.appProperties?.duration != null
      ? parseFloat(f.appProperties.duration)
      : undefined,
    avatarUrl: f.appProperties?.avatarUrl ?? undefined,
  }));
}

// ─── download ─────────────────────────────────────────────────────────────────

/**
 * Download a GLB file from Drive by its file ID.
 * Returns the raw Blob.
 */
export async function downloadFromDrive(driveFileId: string): Promise<Blob> {
  const res = await driveFetch(
    `${DRIVE_FILES_URL}/${encodeURIComponent(driveFileId)}?alt=media`,
    { method: "GET" }
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`Drive download failed (${res.status}): ${txt}`);
  }

  return res.blob();
}

// ─── delete ───────────────────────────────────────────────────────────────────

/**
 * Permanently delete a file from Drive appDataFolder by its file ID.
 */
export async function deleteDriveFile(driveFileId: string): Promise<void> {
  const res = await driveFetch(
    `${DRIVE_FILES_URL}/${encodeURIComponent(driveFileId)}`,
    { method: "DELETE" }
  );

  if (res.status === 204 || res.status === 200) return; // success

  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`Drive delete failed (${res.status}): ${txt}`);
  }
}

// ─── bulk sync ────────────────────────────────────────────────────────────────

export interface BulkSyncProgress {
  total: number;
  done: number;
  failed: number;
  current?: string;
}

export type BulkSyncListener = (progress: BulkSyncProgress) => void;

/**
 * Upload an array of { blob, name, duration } items to Drive in sequence.
 * Calls onProgress after each item. Returns the list of results (fileId or error).
 */
export async function bulkUploadToDrive(
  items: Array<{ blob: Blob; name: string; duration?: number }>,
  onProgress?: BulkSyncListener
): Promise<Array<{ name: string; driveFileId?: string; error?: string }>> {
  const results: Array<{ name: string; driveFileId?: string; error?: string }> = [];
  let done = 0;
  let failed = 0;

  for (const item of items) {
    onProgress?.({ total: items.length, done, failed, current: item.name });
    try {
      const driveFileId = await uploadToDrive(item.blob, item.name, item.duration);
      results.push({ name: item.name, driveFileId });
      done++;
    } catch (err: any) {
      results.push({ name: item.name, error: err?.message ?? "Upload failed" });
      failed++;
      // quota error — abort immediately
      if (err instanceof DriveQuotaError) break;
    }
    onProgress?.({ total: items.length, done, failed });
  }

  onProgress?.({ total: items.length, done, failed });
  return results;
}

export { DRIVE_SCOPE };
