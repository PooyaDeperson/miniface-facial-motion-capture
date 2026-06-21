# Avatar Setup & Cache Management

This guide explains how to configure avatar URLs and manage browser caching for your Miniface app.

## Quick Start

### Step 1: Local Development Setup

Create a `.env.local` file in the project root (it's `.gitignored`):

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Cloudinary avatar URLs:

```env
NEXT_PUBLIC_AVATAR_PONYTAIL_URL=https://res.cloudinary.com/da1zca4wj/image/upload/v1782023142/miniface/avatar/avatar-ponytail.glb
NEXT_PUBLIC_AVATAR_SHORT_URL=https://res.cloudinary.com/da1zca4wj/image/upload/v1782023143/miniface/avatar/avatar-short.glb
# ... etc
NEXT_PUBLIC_AVATAR_CACHE_VERSION=1
```

Then start your dev server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

### Step 2: Production Setup on Vercel

1. Go to **Vercel Dashboard** → **Your Project** → **Settings** → **Environment Variables**
2. Click **Add New** and enter each avatar URL:
   - **Name**: `NEXT_PUBLIC_AVATAR_PONYTAIL_URL`
   - **Value**: `https://res.cloudinary.com/.../avatar-ponytail.glb`
   - **Environment**: Production (or all)
3. Repeat for all avatars (short, curly, wavy, braids)
4. Add cache version:
   - **Name**: `NEXT_PUBLIC_AVATAR_CACHE_VERSION`
   - **Value**: `1`
5. Redeploy your app

---

## How Caching Works

### The Challenge
- Avatar `.glb` files are large (typically 5–20 MB each)
- Users switch between avatars frequently
- Every switch triggered a full re-download from Cloudinary

### The Solution
**Browser-level IndexedDB caching** with automatic version-based invalidation:

```
First Load (Cache Miss):
  User loads avatar → fetch from Cloudinary
                   → store in IndexedDB with version & timestamp
                   → show avatar

Second Load (Cache Hit):
  User switches to same avatar → read from IndexedDB
                               → instant load (no network)

Avatar Updated (Cache Invalidation):
  Maintainer bumps CACHE_VERSION → old cache automatically ignored
                                 → next load fetches fresh
```

### Storage & Expiry

| Property | Value | Notes |
|----------|-------|-------|
| **Cache Location** | Browser IndexedDB | Persistent across sessions & tabs |
| **TTL** | 7 days | Auto-expires old cache entries |
| **Per-Avatar Size** | ~10–20 MB | Typical GLB file sizes |
| **Version Tracking** | `NEXT_PUBLIC_AVATAR_CACHE_VERSION` | Bumping this invalidates all old cache |

---

## Force Cache Invalidation

### Method 1: Version Bump (Recommended for Production)

When you update an avatar URL or want to clear the cache app-wide:

**Local Development:**
```env
# In .env.local
NEXT_PUBLIC_AVATAR_CACHE_VERSION=2
```

**Production on Vercel:**
1. Go to **Settings** → **Environment Variables**
2. Edit `NEXT_PUBLIC_AVATAR_CACHE_VERSION`
3. Change value from `1` to `2`
4. Redeploy

**Result**: All users' browsers will auto-purge old cache on next session. No UI changes; completely seamless.

### Method 2: Manual UI Button (Optional - Dev/Testing)

Add a "Clear Cache" button in your settings panel:

```typescript
import { clearAvatarCache } from "@/utils/avatarCache";

function SettingsPanel() {
  return (
    <button onClick={() => clearAvatarCache()}>
      Clear Avatar Cache
    </button>
  );
}
```

---

## Understanding the Files

### New Files Created

| File | Purpose |
|------|---------|
| `src/utils/avatarCache.ts` | IndexedDB cache manager with TTL & versioning |
| `src/hooks/useCachedGLTF.ts` | React hook wrapping `useGLTF` with caching logic |
| `.env.example` | Template for contributors (add your URLs here) |
| `AVATAR_SETUP.md` | This guide |

### Updated Files

| File | Changes |
|------|---------|
| `src/avatarMetadata.ts` | Now loads URLs from env vars instead of hardcoding |
| `src/Avatar.tsx` | Uses `useCachedGLTF` hook for cached loading |

---

## API Reference

### avatarCache.ts

```typescript
// Get cached blob (returns null if expired/missing)
const blob = await getCachedAvatar("ponytail");

// Store blob in cache
await setCachedAvatar("ponytail", blob);

// Check if timestamp is expired (7 days)
const expired = isCacheExpired(storedTimestamp);

// Clear one avatar
await clearAvatarCache("ponytail");

// Clear all avatars
await clearAvatarCache();

// Get cache stats (debug)
const { count, totalSize } = await getAvatarCacheStats();
console.log(`${count} avatars cached, ${totalSize} bytes`);
```

### avatarMetadata.ts

```typescript
// Get metadata for URL (includes display name & secondary motion config)
const meta = getAvatarMetadata(url);
console.log(meta.displayName); // e.g., "ponytail"

// Get all registered avatars
const allAvatars = getAllAvatars();
```

---

## Debugging

### Check Cache Hit/Miss in Console

Open browser DevTools → Console and look for:

```
[v0] Avatar cache hit: ponytail
[v0] Avatar cache miss: ponytail, fetching from https://...
[v0] Cleared cache for ponytail
```

### View Cache Storage

1. Open DevTools → **Application** tab
2. Left sidebar → **IndexedDB** → **avatarCache**
3. Open **avatars** store
4. Browse cached entries (keyed by avatar name)
5. View stored metadata: `{ data, timestamp, version }`

### Force Clear (Nuclear Option)

In DevTools Console:

```javascript
// Clear all IndexedDB data
indexedDB.deleteDatabase("avatarCache");
console.log("Avatar cache cleared. Refresh page.");
```

---

## Troubleshooting

### Avatars Not Loading

1. **Check env vars exist**: 
   ```bash
   echo $NEXT_PUBLIC_AVATAR_PONYTAIL_URL
   ```

2. **Check URLs are valid**: Visit them in browser to confirm they download

3. **Check Vercel environment**: Go to Settings → Environment Variables → verify all vars exist

4. **Check DevTools errors**: Open DevTools → Console for network or parsing errors

### Cache Not Clearing After Version Bump

1. Hard refresh browser: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
2. Clear IndexedDB in DevTools → Application → IndexedDB → right-click → Delete Database
3. Wait a few seconds, refresh

### Storage Quota Exceeded

IndexedDB usually has 50 MB+ quota per domain. If you exceed it:

1. Clear old cache: `clearAvatarCache()`
2. Consider using fewer/smaller avatars
3. Check DevTools → Application → Storage → Usage

---

## For Contributors

### Adding Your Own Avatars

1. Clone the repo and create `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Add your Cloudinary URLs (or host anywhere):
   ```env
   NEXT_PUBLIC_AVATAR_PONYTAIL_URL=https://your-cdn.com/avatar-ponytail.glb
   ```

3. The app will cache on first load, blazing fast on subsequent loads

### No URLs?

If you don't have avatar URLs, you can:
- Use placeholder URLs (they'll just fail gracefully)
- Skip env vars entirely—the app won't crash
- Contact maintainers for URLs

---

## Best Practices

✅ **DO:**
- Keep URLs in `.env.local` (not committed to git)
- Add URLs to Vercel Environment Variables for production
- Bump `CACHE_VERSION` when updating avatar files
- Test cache in DevTools → Network tab (throttle to see impact)

❌ **DON'T:**
- Commit `.env.local` to git
- Hardcode URLs in source files
- Share Cloudinary URLs publicly (they're fine to be public, but don't advertise them)
- Delete cache entries manually unless testing

---

## Questions?

Check the code comments:
- `src/utils/avatarCache.ts` – Detailed cache logic
- `src/hooks/useCachedGLTF.ts` – Caching integration with `useGLTF`
- `src/avatarMetadata.ts` – Avatar URL config & lookup
