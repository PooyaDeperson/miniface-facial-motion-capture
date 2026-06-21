# Setting Up Environment Variables on Vercel

## Step-by-Step Guide

### Step 1: Open Your Vercel Project

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Find your Miniface project in the list
3. Click on it to open the project dashboard

### Step 2: Open Environment Variables

1. In the top right, click **Settings**
2. In the left sidebar, find **Environment Variables**
3. Click it

You should see a page like this:

```
┌─────────────────────────────────────────┐
│  Environment Variables                  │
├─────────────────────────────────────────┤
│  [Add New]  [Cancel]                    │
│                                         │
│  No environment variables yet.          │
└─────────────────────────────────────────┘
```

### Step 3: Add Avatar URL Variables

Click **[Add New]** and fill in the first variable:

```
Name:          NEXT_PUBLIC_AVATAR_PONYTAIL_URL
Value:         https://res.cloudinary.com/da1zca4wj/image/upload/v1782023142/miniface/avatar/avatar-ponytail.glb
Environment:   Production  ← Select this
```

Then click **Save**.

Repeat for the remaining 4 avatars:

#### Avatar 2 - Short Hair
```
Name:          NEXT_PUBLIC_AVATAR_SHORT_URL
Value:         https://res.cloudinary.com/da1zca4wj/image/upload/v1782023143/miniface/avatar/avatar-short.glb
Environment:   Production
```

#### Avatar 3 - Curly Hair
```
Name:          NEXT_PUBLIC_AVATAR_CURLY_URL
Value:         https://res.cloudinary.com/da1zca4wj/image/upload/v1782022983/miniface/avatar/avatar-curly.glb
Environment:   Production
```

#### Avatar 4 - Wavy Hair
```
Name:          NEXT_PUBLIC_AVATAR_WAVY_URL
Value:         https://res.cloudinary.com/da1zca4wj/image/upload/v1782023132/miniface/avatar/avatar-wavy.glb
Environment:   Production
```

#### Avatar 5 - Braids
```
Name:          NEXT_PUBLIC_AVATAR_BRAIDS_URL
Value:         https://res.cloudinary.com/da1zca4wj/image/upload/v1782023136/miniface/avatar/avatar-braids.glb
Environment:   Production
```

### Step 4: Add Cache Version Variable

Add one more variable:

```
Name:          NEXT_PUBLIC_AVATAR_CACHE_VERSION
Value:         1
Environment:   Production
```

This controls cache invalidation. You'll bump this to `2`, `3`, etc. when you need to force avatars to refresh.

### Step 5: Verify All Variables Are Added

After adding all 6, your Environment Variables page should look like:

```
┌─────────────────────────────────────────────────────────────────┐
│  Environment Variables                                          │
├─────────────────────────────────────────────────────────────────┤
│  [Add New]  [Cancel]                                            │
│                                                                 │
│  ✓ NEXT_PUBLIC_AVATAR_PONYTAIL_URL      [Production]  [Edit]   │
│  ✓ NEXT_PUBLIC_AVATAR_SHORT_URL         [Production]  [Edit]   │
│  ✓ NEXT_PUBLIC_AVATAR_CURLY_URL         [Production]  [Edit]   │
│  ✓ NEXT_PUBLIC_AVATAR_WAVY_URL          [Production]  [Edit]   │
│  ✓ NEXT_PUBLIC_AVATAR_BRAIDS_URL        [Production]  [Edit]   │
│  ✓ NEXT_PUBLIC_AVATAR_CACHE_VERSION     [Production]  [Edit]   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Alternative: Using Vercel CLI

If you prefer command-line setup:

```bash
# Install Vercel CLI
npm i -g vercel

# Link your project (if not already)
vercel link

# Set environment variables
vercel env add NEXT_PUBLIC_AVATAR_PONYTAIL_URL
# → Paste URL when prompted

vercel env add NEXT_PUBLIC_AVATAR_SHORT_URL
# → Paste URL when prompted

# ... repeat for all 6 variables

# View all variables
vercel env list
```

---

## What Happens After Adding Env Vars

1. **Deployment triggers** — Vercel automatically redeploys with the new env vars
2. **Build process** — Next.js bundles env vars into the app (read-only at runtime)
3. **Your code** — Can now access via `process.env.NEXT_PUBLIC_AVATAR_PONYTAIL_URL`
4. **avatarMetadata.ts** — Loads URLs into `AVATAR_URLS` object at build time

---

## Testing Production

After deployment, to verify env vars are working:

### In Browser DevTools Console:

```javascript
// Check if avatars are loading from cache
// Refresh page and watch Console tab
// Look for [v0] messages:

[v0] Avatar cache miss: ponytail
[v0] Avatar cache miss: short
// ... etc on first load

[v0] Avatar cache hit: ponytail
// ... on subsequent loads
```

### Check the Network Tab:

1. Open DevTools → Network tab
2. Filter: Type → `fetch` / `xhr`
3. Load first avatar → should see request to Cloudinary `.glb` file
4. Switch to different avatar and back → NO new request (cache hit!)

---

## Updating an Avatar URL

When you need to change an avatar URL:

1. Go back to **Settings** → **Environment Variables**
2. Find the variable (e.g., `NEXT_PUBLIC_AVATAR_PONYTAIL_URL`)
3. Click **[Edit]**
4. Update the URL
5. Click **Save**
6. Vercel auto-redeploys

Users will get the new URL on their next deploy.

---

## Forcing Cache Refresh (Version Bump)

When you update an avatar file on Cloudinary and want all users to see the new version:

1. Go to **Environment Variables**
2. Find `NEXT_PUBLIC_AVATAR_CACHE_VERSION`
3. Click **[Edit]**
4. Change from `1` to `2`
5. Click **Save**
6. Vercel auto-redeploys

Result: All users' browsers will ignore the old cached avatar (version 1) and fetch the fresh one on next visit.

---

## Troubleshooting

### "Env var not found" errors

- Verify the variable is set in Vercel Settings → Environment Variables
- Check spelling: `NEXT_PUBLIC_` prefix is required
- Redeploy after adding variables: It's usually automatic, but you can manually trigger it in Vercel dashboard
- Hard refresh your browser: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)

### Avatars still loading slowly

- Check Network tab → confirm `.glb` file is being downloaded
- Verify IndexedDB cache is working: DevTools → Application → IndexedDB → avatarCache
- Check console for errors: DevTools → Console tab

### Can't see Environment Variables page

- Make sure you have admin access to the project
- If you're not the owner, ask the project owner to add the env vars
- Or ask to be added as a team member with admin permissions

---

## Environment Switching

By default, we set all vars to **Production**. If you want different values for Preview/Development:

1. When adding a variable, select **Production, Preview & Development** (all three)
   - Then each deploy can have different values

For this project, we recommend:
- **Production**: Real Cloudinary URLs
- **Preview**: Same as production (or different if testing)
- **Development**: Use `.env.local` locally (not through Vercel)

---

## Security Notes

These avatar URLs are **not secrets** — they're public assets meant to be downloaded by browsers. It's safe to store them as `NEXT_PUBLIC_*` env vars because:

- ✅ They're public CDN URLs
- ✅ Browsers need to fetch them anyway
- ✅ They're not API keys or passwords
- ✅ They're configuration, not secrets

If you later add actual secrets (API keys), use env vars **without** the `NEXT_PUBLIC_` prefix, and keep them in Vercel's environment variables only (never in `.env.local`).

---

## Next Steps

Once your env vars are set and deployed:

1. ✅ Go to your production URL
2. ✅ Test loading each avatar
3. ✅ Open DevTools → Console
4. ✅ Verify cache hits: `[v0] Avatar cache hit: ...`
5. ✅ Check Network tab for reduced downloads

You're done! 🎉
