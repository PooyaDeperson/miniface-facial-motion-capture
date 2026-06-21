/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 * 
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson"
 */

import { useEffect, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { getCachedAvatar, setCachedAvatar } from "../utils/avatarCache";
import { getAvatarMetadata } from "../avatarMetadata";

/**
 * Wraps useGLTF with browser-level caching via IndexedDB.
 *
 * - Checks IndexedDB cache first (by avatar display name)
 * - If hit: creates a blob URL so drei loads from memory — no network request
 * - If miss: fetches from the Cloudinary URL, stores in cache, then loads
 * - Automatically invalidates cache when NEXT_PUBLIC_AVATAR_CACHE_VERSION changes
 *
 * resolvedUrl is null until the async cache check completes, which prevents
 * useGLTF from firing the original Cloudinary URL in parallel with the blob URL
 * on a cache hit.
 */
export function useCachedGLTF(url: string) {
  // null = still resolving (cache check in progress); string = ready to load
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Only call useGLTF once resolvedUrl is known — avoids a redundant Cloudinary
  // fetch on cache hits, because useGLTF is unconditional once called.
  // Fallback to an empty string (never a valid GLTF) so the hook call is stable.
  const { scene } = useGLTF(resolvedUrl ?? "");

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }

    // Reset state when URL changes (avatar switch)
    setResolvedUrl(null);
    setLoading(true);
    setError(null);

    const avatarMeta = getAvatarMetadata(url);
    const displayName = avatarMeta.displayName;

    const loadAvatarWithCache = async () => {
      try {
        // Try IndexedDB cache first
        const cachedBlob = await getCachedAvatar(displayName);
        if (cachedBlob) {
          const blobUrl = URL.createObjectURL(cachedBlob);
          setResolvedUrl(blobUrl);
          setLoading(false);
          return;
        }

        // Cache miss: fetch from Cloudinary, store for next time
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch avatar: ${response.statusText}`);
        }

        const blob = await response.blob();
        await setCachedAvatar(displayName, blob);

        const blobUrl = URL.createObjectURL(blob);
        setResolvedUrl(blobUrl);
      } catch (err) {
        const fetchError = err instanceof Error ? err : new Error(String(err));
        console.error("[v0] Avatar loading failed:", fetchError);
        setError(fetchError);
        // Fall back to original URL on error so the avatar still attempts to load
        setResolvedUrl(url);
      } finally {
        setLoading(false);
      }
    };

    loadAvatarWithCache();
  }, [url]);

  return { scene, loading, error };
}
