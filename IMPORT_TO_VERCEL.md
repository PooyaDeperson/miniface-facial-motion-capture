# How to Import .env Variables to Vercel

Your `.env.local` file is ready with all the avatar URLs. Here's how to add them to your Vercel project:

## Option 1: Manual Entry (Recommended for First Time)

1. **Go to your Vercel Dashboard**
   - Navigate to [vercel.com/dashboard](https://vercel.com/dashboard)
   - Select your project: `miniface-facial-motion-capture`

2. **Open Environment Variables**
   - Click **Settings** (top menu)
   - Click **Environment Variables** (left sidebar)

3. **Add Each Variable**
   - Click **Add New**
   - Copy from `.env.local` and paste into Vercel:

   ```
   Variable Name: NEXT_PUBLIC_AVATAR_PONYTAIL_URL
   Value: https://res.cloudinary.com/da1zca4wj/image/upload/v1782023142/miniface/avatar/avatar1.glb
   Environment: Production, Preview, Development (select all)
   ```

   Repeat for all 6 variables:
   - `NEXT_PUBLIC_AVATAR_PONYTAIL_URL`
   - `NEXT_PUBLIC_AVATAR_SHORT_URL`
   - `NEXT_PUBLIC_AVATAR_CURLY_URL`
   - `NEXT_PUBLIC_AVATAR_WAVY_URL`
   - `NEXT_PUBLIC_AVATAR_BRAIDS_URL`
   - `NEXT_PUBLIC_AVATAR_CACHE_VERSION`

4. **Done!**
   - Vercel will automatically redeploy with new env vars

---

## Option 2: Via Vercel CLI (If You Have It Installed)

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Link your project
vercel link

# Push env variables
vercel env pull .env.local

# Then push back to production
vercel env push NEXT_PUBLIC_AVATAR_PONYTAIL_URL production
vercel env push NEXT_PUBLIC_AVATAR_SHORT_URL production
# ... repeat for all 6 variables
```

---

## ⚠️ Important Notes

- **Do NOT commit `.env.local`** — add it to `.gitignore`
- **Set for all environments** — Production, Preview, Development
- **After adding vars** — Vercel auto-redeploys your project
- **Changes are live** — No additional steps needed

---

## Verify It Worked

1. Visit your production URL
2. Open DevTools Console (F12)
3. Load an avatar
4. Look for: `[v0] Avatar loaded: ponytail`
5. If you see this, the env vars are loaded correctly ✅

---

## To Update an Avatar Later

1. Go to Vercel Settings → Environment Variables
2. Edit the URL (e.g., `NEXT_PUBLIC_AVATAR_PONYTAIL_URL`)
3. **Important**: Also bump `NEXT_PUBLIC_AVATAR_CACHE_VERSION` (1 → 2)
4. This forces users' browsers to refresh the cache

---

## Reference: What Each Variable Does

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_AVATAR_PONYTAIL_URL` | Ponytail avatar model |
| `NEXT_PUBLIC_AVATAR_SHORT_URL` | Short hair avatar model |
| `NEXT_PUBLIC_AVATAR_CURLY_URL` | Curly hair avatar model |
| `NEXT_PUBLIC_AVATAR_WAVY_URL` | Wavy hair avatar model |
| `NEXT_PUBLIC_AVATAR_BRAIDS_URL` | Braids avatar model |
| `NEXT_PUBLIC_AVATAR_CACHE_VERSION` | Cache invalidation trigger |

---

## Need Help?

- Env vars not showing? → Check Vercel Settings → Environment Variables
- Avatars not loading? → Check the URLs in `.env.local` are correct
- Want to clear cache? → Bump `NEXT_PUBLIC_AVATAR_CACHE_VERSION` to `2`

That's it! Your avatars are now securely configured in Vercel.
