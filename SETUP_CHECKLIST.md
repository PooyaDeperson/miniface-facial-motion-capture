# Avatar Setup Checklist

Complete this checklist to get your avatars working with caching in production.

---

## ✅ Phase 1: Implementation Review (Already Done!)

- [x] Cache utility created (`src/utils/avatarCache.ts`)
- [x] Cached GLTF hook created (`src/hooks/useCachedGLTF.ts`)
- [x] Avatar metadata updated to use env vars
- [x] Avatar component updated to use cached hook
- [x] Documentation created (setup guides, architecture, etc.)

---

## ⚠️ Phase 2: Local Testing (You, Now)

### 2.1 Create .env.local

- [ ] Copy env template: `cp .env.example .env.local`
- [ ] Edit `.env.local` and add your 5 Cloudinary URLs:
  - [ ] `NEXT_PUBLIC_AVATAR_PONYTAIL_URL`
  - [ ] `NEXT_PUBLIC_AVATAR_SHORT_URL`
  - [ ] `NEXT_PUBLIC_AVATAR_CURLY_URL`
  - [ ] `NEXT_PUBLIC_AVATAR_WAVY_URL`
  - [ ] `NEXT_PUBLIC_AVATAR_BRAIDS_URL`
  - [ ] `NEXT_PUBLIC_AVATAR_CACHE_VERSION=1`

### 2.2 Test Locally

- [ ] Start dev server: `npm run dev` (or `yarn dev` / `pnpm dev`)
- [ ] Open browser DevTools → Console
- [ ] Load app and select first avatar
- [ ] Look for console message: `[v0] Avatar cache miss: ponytail`
- [ ] Wait for avatar to load
- [ ] Switch to different avatar
- [ ] Switch back to first avatar
- [ ] Look for: `[v0] Avatar cache hit: ponytail` ✅
- [ ] Test all 5 avatars work

### 2.3 Verify Cache Storage

- [ ] Open DevTools → Application tab
- [ ] Left sidebar → IndexedDB → avatarCache
- [ ] Open "avatars" store
- [ ] Verify entries exist for each avatar tested
- [ ] Each entry should show: `{ data: ArrayBuffer(...), timestamp: ..., version: "1" }`

### 2.4 Test Cache Expiry (Optional)

- [ ] Edit `avatarCache.ts` line: `const DEFAULT_TTL = 100` (100ms for testing)
- [ ] Load avatar → cache hit
- [ ] Wait >100ms
- [ ] Load same avatar → should see "cache miss" (expired!)
- [ ] Revert `DEFAULT_TTL` to `7 * 24 * 60 * 60 * 1000`

### 2.5 Test Version Bump

- [ ] Edit `.env.local`: `NEXT_PUBLIC_AVATAR_CACHE_VERSION=2`
- [ ] Restart dev server
- [ ] Open same avatar
- [ ] Should see `[v0] Avatar cache miss:` (version mismatch!)
- [ ] This confirms version invalidation works ✅
- [ ] Revert to `NEXT_PUBLIC_AVATAR_CACHE_VERSION=1`

---

## 🚀 Phase 3: Production Deployment (Vercel)

### 3.1 Add Environment Variables

- [ ] Go to [vercel.com/dashboard](https://vercel.com/dashboard)
- [ ] Select your Miniface project
- [ ] Click **Settings** (top right)
- [ ] Left sidebar → **Environment Variables**
- [ ] Add 6 new variables:

| Name | Value | Environment |
|------|-------|-------------|
| `NEXT_PUBLIC_AVATAR_PONYTAIL_URL` | Your URL | Production |
| `NEXT_PUBLIC_AVATAR_SHORT_URL` | Your URL | Production |
| `NEXT_PUBLIC_AVATAR_CURLY_URL` | Your URL | Production |
| `NEXT_PUBLIC_AVATAR_WAVY_URL` | Your URL | Production |
| `NEXT_PUBLIC_AVATAR_BRAIDS_URL` | Your URL | Production |
| `NEXT_PUBLIC_AVATAR_CACHE_VERSION` | `1` | Production |

- [ ] Double-check all 6 are added
- [ ] All set to "Production" environment

### 3.2 Commit & Push

```bash
git add .
git commit -m "feat: add avatar URL security with IndexedDB caching

- Add environment-based avatar URL configuration
- Implement browser-level IndexedDB caching with 7-day TTL
- Add version-based cache invalidation system
- Users experience instant avatar switching after first load
- Maintainers can force cache refresh by bumping version number"

git push
```

- [ ] Commit message descriptive
- [ ] Changes pushed to repository

### 3.3 Verify Deployment

- [ ] Vercel auto-deploys (watch for "Deployed" status)
- [ ] Visit production URL
- [ ] Test avatar switching
- [ ] Open DevTools → Console
- [ ] Should see `[v0] Avatar cache miss:` on first load
- [ ] Should see `[v0] Avatar cache hit:` on subsequent loads ✅

### 3.4 Document for Contributors

- [ ] Ensure `.env.example` is in git (✅ already done)
- [ ] Update project README (if needed) to mention avatar setup
- [ ] New contributors can: `cp .env.example .env.local` and add URLs

---

## 🔄 Phase 4: Future Maintenance

### When You Update an Avatar

1. [ ] Update file on Cloudinary
2. [ ] Update URL in Vercel Settings → Environment Variables
3. [ ] Bump `NEXT_PUBLIC_AVATAR_CACHE_VERSION` (e.g., `1` → `2`)
4. [ ] Save & redeploy
5. [ ] All users' caches auto-clear on next session ✅

### When Something Goes Wrong

- [ ] Check console for `[v0]` log messages
- [ ] Verify env vars exist in Vercel Settings
- [ ] Test URLs directly in browser (should download .glb)
- [ ] Check DevTools → Application → IndexedDB → avatarCache
- [ ] Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
- [ ] See TROUBLESHOOTING in AVATAR_SETUP.md for more

---

## 📋 Files Status

| File | Status | Notes |
|------|--------|-------|
| `src/utils/avatarCache.ts` | ✅ Created | Core cache logic |
| `src/hooks/useCachedGLTF.ts` | ✅ Created | React integration |
| `src/Avatar.tsx` | ✅ Updated | Uses cached hook |
| `src/avatarMetadata.ts` | ✅ Updated | Loads from env vars |
| `.env.example` | ✅ Created | In git, for contributors |
| `AVATAR_SETUP.md` | ✅ Created | Detailed guide |
| `AVATAR_QUICK_REFERENCE.md` | ✅ Created | Quick ref card |
| `AVATAR_ARCHITECTURE.md` | ✅ Created | System diagrams |
| `SETUP_CHECKLIST.md` | ✅ Created | This file |
| `IMPLEMENTATION_SUMMARY.md` | ✅ Created | Overview |

---

## ❓ Quick Links

- **Stuck?** → Read `AVATAR_SETUP.md` (full guide)
- **Forgot how?** → Read `AVATAR_QUICK_REFERENCE.md` (cheat sheet)
- **Want details?** → Read `AVATAR_ARCHITECTURE.md` (system design)
- **Local URLs wrong?** → Check `.env.example` (template)
- **Need to debug?** → DevTools Console, look for `[v0]` logs

---

## 🎉 You're Done When

- [x] Local `.env.local` created with all 5 URLs
- [x] Dev server tested: cache miss → cache hit works
- [x] All 6 env vars added to Vercel
- [x] Code committed and pushed
- [x] Production deployed successfully
- [x] Avatar switching works with instant loading

**Next time someone loads the app, they'll experience instant avatar switching thanks to browser-level caching!**

---

## Questions?

See `AVATAR_SETUP.md` for detailed documentation or check the code comments in:
- `src/utils/avatarCache.ts` – Cache implementation
- `src/hooks/useCachedGLTF.ts` – Hook integration
- `src/avatarMetadata.ts` – Config & metadata
