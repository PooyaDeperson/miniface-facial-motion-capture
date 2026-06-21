# Avatar Setup - Quick Reference Card

## TL;DR: 3 Steps to Production

### Step 1: Add to Vercel (Settings → Environment Variables)

```
NEXT_PUBLIC_AVATAR_PONYTAIL_URL  = https://res.cloudinary.com/da1zca4wj/image/upload/v1782023142/miniface/avatar/avatar1.glb
NEXT_PUBLIC_AVATAR_SHORT_URL     = https://res.cloudinary.com/da1zca4wj/image/upload/v1782023143/miniface/avatar/avatar2.glb
NEXT_PUBLIC_AVATAR_CURLY_URL     = https://res.cloudinary.com/da1zca4wj/image/upload/v1782022983/miniface/avatar/avatar3.glb
NEXT_PUBLIC_AVATAR_WAVY_URL      = https://res.cloudinary.com/da1zca4wj/image/upload/v1782023132/miniface/avatar/avatar4.glb
NEXT_PUBLIC_AVATAR_BRAIDS_URL    = https://res.cloudinary.com/da1zca4wj/image/upload/v1782023136/miniface/avatar/avatar5.glb
NEXT_PUBLIC_AVATAR_CACHE_VERSION = 1
```

### Step 2: Local Development Setup

```bash
# Create local env file
cp .env.example .env.local

# Edit .env.local and add your URLs (same as Vercel above)

# Start dev server
npm run dev
```

### Step 3: Commit & Deploy

```bash
git add .
git commit -m "feat: avatar URL security and caching"
git push
# Vercel auto-deploys
```

---

## How to Force Cache Clear

When you update an avatar URL or need to refresh all caches:

**On Vercel Dashboard:**
1. Settings → Environment Variables
2. Find `NEXT_PUBLIC_AVATAR_CACHE_VERSION`
3. Change from `1` → `2`
4. Redeploy

✅ **Done!** All users' browsers auto-clear old cache on next session.

---

## Testing Cache Locally

```javascript
// In browser DevTools Console:

// See cache activity
> [v0] Avatar cache miss: ponytail
> [v0] Avatar cache hit: ponytail

// View cache storage
// DevTools → Application → IndexedDB → avatarCache → avatars

// Manual cache clear
> indexedDB.deleteDatabase("avatarCache")
```

---

## Env Var Mapping

| Env Var | Avatar | URL |
|---------|--------|-----|
| `NEXT_PUBLIC_AVATAR_PONYTAIL_URL` | Ponytail | avatar1.glb |
| `NEXT_PUBLIC_AVATAR_SHORT_URL` | Short Hair | avatar2.glb |
| `NEXT_PUBLIC_AVATAR_CURLY_URL` | Curly Hair | avatar3.glb |
| `NEXT_PUBLIC_AVATAR_WAVY_URL` | Wavy Hair | avatar4.glb |
| `NEXT_PUBLIC_AVATAR_BRAIDS_URL` | Braids | avatar5.glb |

---

## Cache Behavior

| Event | Behavior | Time |
|-------|----------|------|
| **First Load** | Fetch from Cloudinary, store in IndexedDB | 5-30s (file size) |
| **Second Load** | Load from IndexedDB (no network) | <100ms |
| **Version Bump** | Old cache ignored, fetch fresh | 5-30s |
| **7+ Days Old** | Auto-delete expired cache | Automatic |

---

## File Reference

| File | Purpose |
|------|---------|
| `.env.local` | Local env vars (add URLs here, don't commit) |
| `src/utils/avatarCache.ts` | Cache manager (IndexedDB + TTL + versioning) |
| `src/hooks/useCachedGLTF.ts` | React hook (transparent caching) |
| `AVATAR_SETUP.md` | Detailed setup guide |

---

## Troubleshooting

**Avatars not loading?**
- Check `.env.local` exists and has URLs
- Check Vercel Settings → Environment Variables (all 6 vars?)
- Test URLs in browser directly

**Cache not clearing after version bump?**
- Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
- Clear IndexedDB: DevTools → Application → IndexedDB → right-click → Delete

**No console logs?**
- Open DevTools → Console
- Look for `[v0]` prefix messages
- Check Network tab to see cache hits (no new requests)

---

## API for Developers

```typescript
import { 
  getCachedAvatar,      // Returns cached blob or null
  setCachedAvatar,      // Store blob in cache
  clearAvatarCache,     // Clear one or all avatars
  getAvatarCacheStats   // Debug: { count, totalSize }
} from "@/utils/avatarCache";

// Example: manual clear button
<button onClick={() => clearAvatarCache()}>
  Clear Avatar Cache
</button>
```

---

**Need more details?** See `AVATAR_SETUP.md` for complete documentation.
