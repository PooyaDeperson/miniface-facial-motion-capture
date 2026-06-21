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
 * - Checks cache first (by avatar display name)
 * - If hit: creates a blob URL for immediate loading
 * - If miss: fetches from URL, caches for future use, then loads
 * - Automatically invalidates cache when NEXT_PUBLIC_AVATAR_CACHE_VERSION changes
 */
export function useCachedGLTF(url: string) {
  const [cachedUrl, setCachedUrl] = useState<string>(url);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { scene } = useGLTF(cachedUrl);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }

    const avatarMeta = getAvatarMetadata(url);
    const displayName = avatarMeta.displayName;

    const loadAvatarWithCache = async () => {
      try {
        setLoading(true);
        setError(null);

        // Try cache first
        const cachedBlob = await getCachedAvatar(displayName);
        if (cachedBlob) {
          console.log("[v0] Avatar cache hit:", displayName);
          const blobUrl = URL.createObjectURL(cachedBlob);
          setCachedUrl(blobUrl);
          return;
        }

        console.log("[v0] Avatar cache miss:", displayName, "fetching from", url);

        // Cache miss: fetch from URL
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch avatar: ${response.statusText}`);
        }

        const blob = await response.blob();

        // Store in cache for next time
        await setCachedAvatar(displayName, blob);

        // Create blob URL for loading
        const blobUrl = URL.createObjectURL(blob);
        setCachedUrl(blobUrl);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("[v0] Avatar loading failed:", error);
        setError(error);
        // Fall back to original URL on error
        setCachedUrl(url);
      } finally {
        setLoading(false);
      }
    };

    loadAvatarWithCache();
  }, [url]);

  return { scene, loading, error };
}
