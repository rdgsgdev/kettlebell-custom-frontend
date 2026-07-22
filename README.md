# kettlebell-custom-frontend

React Native / Expo frontend for **KBC – Kettlebell Coach**. This is the frontend half of the split from the original all-in-one `kb-custom` project. It keeps the existing UI and adds Supabase auth, an online-with-local-cache data layer, and a one-time data-import flow.

> **Architecture:** Supabase Auth (email/password) + PostgREST for data + two Edge Functions (`ai-exercise`, `import`). On native the app holds a local SQLite cache (expo-sqlite) and syncs write-through: every save hits the cache immediately (so the UI is instant and works offline), then pushes to Supabase and pulls remote changes on app foreground. On web there is no local cache — reads/writes go straight to Supabase.

---

## What changed vs `kb-custom`

| Area | Before (kb-custom) | After (this repo) |
|------|--------------------|-------------------|
| Persistence | AsyncStorage (offline only) | SQLite cache + Supabase sync (native); direct Supabase (web) |
| Auth | None | Supabase email/password (`AuthScreen`) |
| Data model | `src/models/index.ts` | Same (synced from backend `shared/types.ts`) |
| AI exercise lookup | Perplexity key in the app | Calls `ai-exercise` edge function — no key in app |
| Storage API | `src/storage/index.ts` (AsyncStorage) | Same exported function names, now write-through sync underneath |
| Platforms | iOS only | iOS (native) + web (hosted on Render) |

### Files added
- `src/config/supabase.ts` — platform-aware Supabase client (session in Keychain via expo-secure-store on native, AsyncStorage on web)
- `src/context/AuthContext.tsx` — session state, signIn/signUp/signOut
- `src/screens/AuthScreen.tsx` — email/password UI
- `src/screens/ImportScreen.tsx` — pick a KBC export JSON, send to `import` edge function
- `src/storage/db.ts` — local SQLite cache + dirty tracking (native only)
- `src/storage/api.ts` — Supabase CRUD (flattens nested model ↔ normalized tables)
- `src/storage/sync.ts` — write-through push + pull (last-write-wins by `updated_at`); no-op on web
- `src/services/ai.ts` — calls the `ai-exercise` edge function

### Files changed (minimally)
- `App.tsx` — auth gate + bootstrap pull before showing tabs
- `src/screens/ExercisesScreen.tsx` — AI call goes through `services/ai` (no API key)
- `src/screens/SettingsScreen.tsx` — removed Perplexity key field (now server-side); data import moved here from Profile
- `src/screens/HistoryScreen.tsx` — progression chart replaced with weekly weighted-tonnage chart

---

## Setup

### 1. Prerequisites
- The backend (`kettlebell-custom-api`) deployed to Supabase — see that repo's README.
- Your Supabase project URL + anon key.

### 2. Configure the client
For local dev, copy the example and fill in your project values:
```bash
cp src/config/supabase.local.example.ts src/config/supabase.local.ts
# edit supabase.local.ts with SUPABASE_URL and SUPABASE_ANON_KEY
```
(`supabase.local.ts` is gitignored.)

For hosted builds (Render, CI), set environment variables instead — see **Web deployment** below.

### 3. Install & run
```bash
npm install
npx expo start
# press i for iOS simulator, w for web, or scan the QR with Expo Go
```

---

## Migrating your existing data (one-time)

Because iOS sandboxes each app's storage, the new app cannot read the old app's AsyncStorage. Use the export flow added to `kb-custom`:

1. In the **old** `kb-custom` app, open the **Export** tab → tap **Export & Share JSON** → save the file (AirDrop, Mail, Files, etc.).
2. In **this** app, sign in (create an account if needed).
3. Go to **Settings → Migrate data** → choose the JSON file.
4. The `import` edge function upserts everything (idempotent). Your exercises, templates, history logs, settings, and profile now live in Supabase and sync to this app's cache.

---

## Sync behaviour
- **Write-through (native):** every create/update/delete writes to the local SQLite cache immediately, then queues a push. The UI never blocks on the network.
- **Pull on foreground:** returning to the app pulls all rows updated since the last sync (`updated_at` cursor) and applies remote soft-deletes.
- **Conflicts:** last-write-wins by server `updated_at`. Logs use soft delete (`deleted_at`) so a deletion on one device propagates to others.
- **Offline (native):** you can log a workout with no signal; it pushes when you're back online.
- **Web:** no local cache — every read/write hits Supabase directly (online-only, which is fine for web).

---

## Build & install on iPhone (free Apple ID, no paid developer account)

Build a `.ipa` and install it via **Sideloadly**. The 7-day signing limit (Apple's cap on free accounts) is handled by Sideloadly's background auto-refresh daemon.

> AltStore PAL is region-locked (EU/Japan/Brazil only). Sideloadly works worldwide and is a better fit: standalone app (no Mail plug-in), same background auto-refresh.

### 1. Build the IPA
```bash
./scripts/build-ipa.sh
```
Archives the app with the Release configuration (free-team-compatible, no push-notification entitlement) and exports a signed IPA to `build/KBC-<version>.ipa`. Takes ~2–3 minutes. Uses your free Apple ID signing identity automatically — no Xcode GUI needed.

If you changed `app.json` / native config, regenerate the native `ios/` folder first:
```bash
./scripts/build-ipa.sh --prebuild
```

### 2. Install via Sideloadly
1. Download **Sideloadly** from <https://sideloadly.io> (macOS version), move to `/Applications`, launch it.
2. Cable-connect your iPhone, unlock it, tap **Trust This Computer** if prompted.
3. Drag `build/KBC-<version>.ipa` into Sideloadly.
4. Enter your **free Apple ID** and password (used to request the 7-day profile from Apple).
5. Click **Start**. Sideloadly re-signs and installs.
6. On the iPhone: **Settings → General → VPN & Device Management** → tap your Apple ID → **Trust**.

### 3. Keep it alive (background refresh)
The 7-day profile expires unless refreshed. To make it automatic:
1. In Sideloadly, enable **Automatic Refresh** for the app and set the interval (e.g. every 12–24h).
2. Enable **Wi-Fi sync** in Finder: cable-connect → select iPhone → check *"Show this iPhone when on Wi-Fi"* → Apply.
3. Sideloadly's daemon re-signs KBC automatically when your iPhone and Mac are on the same Wi-Fi and the Mac is awake.

As long as it refreshes once within any 7-day window, the app never expires from your perspective. If it does lapse, the app won't open but nothing is deleted — connect, open Sideloadly, click Refresh.

> **3-app limit:** a free Apple ID allows only 3 simultaneously-installed sideloaded apps per device. Delete one before installing if all 3 slots are full. Re-installing over the same bundle ID preserves data.

Full step-by-step + troubleshooting: see [`SIDEBUILD.md`](./SIDEBUILD.md).

### Rebuilding after code changes
```bash
./scripts/build-ipa.sh                 # rebuild
# then in Sideloadly: drag the new build/KBC-<version>.ipa in, click Start
```
Re-installing over the existing app preserves data (same bundle ID, same keychain/local storage).

---

## Web deployment (Render)

The web build is hosted on Render and served as a static site.

### Build command (Render dashboard)
```bash
npm install && npx expo export --platform web && node scripts/inject-pwa-tags.js
```
- `expo export --platform web` outputs to `dist/` (Metro, not Webpack).
- `inject-pwa-tags.js` patches Metro's generated `index.html` with PWA meta tags so the app runs fullscreen when added to the iPhone home screen.

### Publish directory
```
dist
```

### Environment variables (Render dashboard)
Supabase credentials are read at build time from `EXPO_PUBLIC_*` env vars via `app.config.ts` → `Constants.expoConfig.extra`. Set these in Render:
```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

For local web builds, set the same vars in your shell before running `npx expo export`.

---

## Supabase configuration
In your Supabase dashboard → **Authentication → URL Configuration**, set:
- **Site URL** to your Render web URL (e.g. `https://kbc.onrender.com`)
- **Redirect URLs** to include the same URL

This is required for the email/password sign-in flow to redirect correctly on web.
