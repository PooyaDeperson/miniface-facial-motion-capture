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
 * avatarCache.ts
 * 
 * Browser-level IndexedDB caching for avatar .glb files
 * with TTL and version-based cache invalidation.
 * 
 * Features:
 * - Stores cached blobs with timestamp and version
 * - Auto-expires after 7 days (configurable)
 * - Invalidates cache when NEXT_PUBLIC_AVATAR_CACHE_VERSION changes
 * - Optional manual clear for dev/testing
 */

const DB_NAME = "avatarCache";
const STORE_NAME = "avatars";
const CACHE_VERSION = process.env.NEXT_PUBLIC_AVATAR_CACHE_VERSION || "1";

// 7 days in milliseconds
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000;

interface CachedAvatar {
  blob: Blob;
  timestamp: number;
  version: string;
}

interface StoredAvatar {
  data: ArrayBuffer;
  timestamp: number;
  version: string;
}

/**
 * Initialize IndexedDB database
 */
function getDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Check if cached avatar exists, is valid (not expired), and version matches
 * Returns blob if valid, null otherwise
 */
export async function getCachedAvatar(avatarName: string): Promise<Blob | null> {
  try {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(avatarName);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const stored = request.result as StoredAvatar | undefined;

        if (!stored) {
          resolve(null);
          return;
        }

        // Check version match
        if (stored.version !== CACHE_VERSION) {
          resolve(null);
          return;
        }

        // Check if expired (7 days)
        const now = Date.now();
        if (now - stored.timestamp > DEFAULT_TTL) {
          resolve(null);
          return;
        }

        // Cache is valid — reconstruct blob
        const blob = new Blob([stored.data]);
        resolve(blob);
      };
    });
  } catch (error) {
    console.warn("[v0] Avatar cache read failed:", error);
    return null;
  }
}

/**
 * Store avatar blob in cache with current timestamp and version
 */
export async function setCachedAvatar(avatarName: string, blob: Blob): Promise<void> {
  try {
    const db = await getDatabase();
    const arrayBuffer = await blob.arrayBuffer();

    const stored: StoredAvatar = {
      data: arrayBuffer,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(stored, avatarName);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.warn("[v0] Avatar cache write failed:", error);
  }
}

/**
 * Check if a cached entry has expired or version changed
 */
export function isCacheExpired(timestamp: number): boolean {
  return Date.now() - timestamp > DEFAULT_TTL;
}

/**
 * Clear specific avatar cache, or all avatars if name not provided
 */
export async function clearAvatarCache(avatarName?: string): Promise<void> {
  try {
    const db = await getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      let request: IDBRequest;
      if (avatarName) {
        request = store.delete(avatarName);
      } else {
        request = store.clear();
      }

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const msg = avatarName ? `Cleared cache for ${avatarName}` : "Cleared all avatar cache";
        console.log("[v0]", msg);
        resolve();
      };
    });
  } catch (error) {
    console.warn("[v0] Avatar cache clear failed:", error);
  }
}

/**
 * Get current cache stats (debug utility)
 */
export async function getAvatarCacheStats(): Promise<{ count: number; totalSize: number }> {
  try {
    const db = await getDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const items = request.result as StoredAvatar[];
        const totalSize = items.reduce((sum, item) => sum + item.data.byteLength, 0);
        resolve({ count: items.length, totalSize });
      };
    });
  } catch (error) {
    console.warn("[v0] Avatar cache stats failed:", error);
    return { count: 0, totalSize: 0 };
  }
}
