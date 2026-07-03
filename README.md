# kettlebell-custom-frontend

React Native / Expo frontend for **KBC – Kettlebell Coach**. This is the frontend half of the split from the original all-in-one `kb-custom` project. It keeps 100% of the existing UI and adds Supabase auth, an online-with-local-cache data layer, and a one-time data-import flow.

> **Architecture:** Supabase Auth (email/password) + PostgREST for data + two Edge Functions (`ai-exercise`, `import`). The app holds a local SQLite cache (expo-sqlite) and syncs write-through: every save hits the cache immediately (so the UI is instant and works offline), then pushes to Supabase and pulls remote changes on app foreground.

---

## What changed vs `kb-custom`

| Area | Before (kb-custom) | After (this repo) |
|------|--------------------|-------------------|
| Persistence | AsyncStorage (offline only) | SQLite cache + Supabase sync |
| Auth | None | Supabase email/password (`AuthScreen`) |
| Data model | `src/models/index.ts` | Same (synced from backend `shared/types.ts`) |
| AI exercise lookup | Perplexity key in the app | Calls `ai-exercise` edge function — no key in app |
| Storage API | `src/storage/index.ts` (AsyncStorage) | Same exported function names, now write-through sync underneath |
| UI | All screens/components | **Unchanged** — copied verbatim |
| New screens | — | `AuthScreen`, `ImportScreen` |

### Files added
- `src/config/supabase.ts` — Supabase client (session in Keychain via expo-secure-store)
- `src/context/AuthContext.tsx` — session state, signIn/signUp/signOut
- `src/screens/AuthScreen.tsx` — email/password UI
- `src/screens/ImportScreen.tsx` — pick a KBC export JSON, send to `import` edge function
- `src/storage/db.ts` — local SQLite cache + dirty tracking
- `src/storage/api.ts` — Supabase CRUD (flattens nested model ↔ normalized tables)
- `src/storage/sync.ts` — write-through push + pull (last-write-wins by `updated_at`)
- `src/services/ai.ts` — calls the `ai-exercise` edge function

### Files changed (minimally)
- `App.tsx` — auth gate + bootstrap pull before showing tabs
- `src/screens/ExercisesScreen.tsx` — AI call goes through `services/ai` (no API key)
- `src/screens/SettingsScreen.tsx` — removed Perplexity key field (now server-side)
- `src/screens/ProfileScreen.tsx` — added "Migrate data" entry to ImportScreen

---

## Setup

### 1. Prerequisites
- The backend (`kettlebell-custom-api`) deployed to Supabase — see that repo's README.
- Your Supabase project URL + anon key.

### 2. Configure the client
Copy the example and fill in your project values:
```bash
cp src/config/supabase.local.example.ts src/config/supabase.local.ts
# edit supabase.local.ts with SUPABASE_URL and SUPABASE_ANON_KEY
```
(`supabase.local.ts` is gitignored.)

### 3. Install & run
```bash
npm install
npx expo start
# press i for iOS simulator, or scan the QR with Expo Go
```

---

## Migrating your existing data (one-time)

Because iOS sandboxes each app's storage, the new app cannot read the old app's AsyncStorage. Use the export flow added to `kb-custom`:

1. In the **old** `kb-custom` app, open the **Export** tab → tap **Export & Share JSON** → save the file (AirDrop, Mail, Files, etc.).
2. In **this** app, sign in (create an account if needed).
3. Go to **Profile → Migrate data** → choose the JSON file.
4. The `import` edge function upserts everything (idempotent). Your exercises, templates, history logs, settings, and profile now live in Supabase and sync to this app's cache.

---

## Sync behaviour
- **Write-through:** every create/update/delete writes to the local SQLite cache immediately, then queues a push. The UI never blocks on the network.
- **Pull on foreground:** returning to the app pulls all rows updated since the last sync (`updated_at` cursor) and applies remote soft-deletes.
- **Conflicts:** last-write-wins by server `updated_at`. Logs use soft delete (`deleted_at`) so a deletion on one device propagates to others.
- **Offline:** you can log a workout with no signal; it pushes when you're back online.

---

## Build (IPA)
The original build/EAS workflow from `kb-custom` still applies. See the legacy README for `eas build` / Xcode archive steps; the only addition is the new native deps (`expo-sqlite`, `expo-secure-store`, `expo-document-picker`, `expo-file-system`), all of which are supported by EAS.
