# Unpacked

Paste a Chrome Web Store link or a 32-character extension id. Get the raw,
unpacked source as a zip. No login, no install, nothing stored server-side.

## How it works

1. `lib/crx.ts` pulls the extension id out of whatever you paste.
2. `app/api/meta/route.ts` scrapes the Chrome Web Store detail page for the
   name, icon, and description shown in the preview card.
3. `app/api/extract/route.ts` calls Google's own (public, unauthenticated)
   extension update endpoint — the same one every installed Chrome browser
   uses — downloads the `.crx`, strips its binary header (CRX2 or CRX3),
   and repackages the remaining zip data for download. Nothing is written
   to disk; everything happens in memory and streams straight back.

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Go to vercel.com → **Add New Project** → import the repo.
3. Leave all settings as default — Vercel auto-detects Next.js. No
   environment variables are required.
4. Click **Deploy**.

That's it. No database, no auth provider, no API keys.

### A note on Vercel's limits

- **Function timeout**: the extract route is configured for up to 60
  seconds (`maxDuration`), which needs a Pro plan to actually take effect —
  on the free Hobby plan it's capped at 10 seconds. Most extensions finish
  well under that; very large ones (tens of MB) might not on Hobby.
- **Response size**: serverless functions on Hobby cap responses around
  4.5 MB. Extensions bundling large video/image assets can exceed that. If
  you hit this in practice, the fix is to upload the zip to temporary
  object storage (e.g. Vercel Blob, S3, or Cloudflare R2) inside the route
  and return a signed download link instead of streaming the file through
  the function directly.

## Stack

- Next.js 14 (App Router) — pages *and* API routes in one deploy
- `adm-zip` — reads/rewrites the zip payload
- `cheerio` — scrapes store metadata for the preview card
- `framer-motion` — the one deliberate animation (the "unpack" burst)
- Tailwind CSS

## Legal note

This tool only touches packages Google already serves publicly to every
Chrome install. It doesn't bypass any authentication or access anything
private. What people do with the downloaded source is on them — same as
any existing CRX-extractor site.
