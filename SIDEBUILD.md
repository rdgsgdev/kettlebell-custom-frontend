# Sideloading KBC on iPhone (Free Apple ID, No Paid Developer Account)

This guide produces an installable `.ipa` and installs it via **AltStore**, which
automatically refreshes the 7-day signing profile in the background — so you
never have to manually re-install the app each week.

> **Why this approach?** iOS 17.1+ is not eligible for permanent (TrollStore)
> installs. With a free Apple ID, Apple caps every sideloaded app at 7 days.
> AltStore works around this by re-signing your apps in the background whenever
> your iPhone is on the same Wi-Fi as a computer running AltServer. As long as
> that happens at least once every 7 days, the app keeps working.

---

## One-time setup

### 1. Build the IPA

```bash
cd ~/Development/workspace/kettlebell-custom-frontend
./scripts/build-ipa.sh
```

This archives the app with the **Release** configuration (free-team-compatible,
no push-notification entitlement) and exports a signed IPA to:

```
build/KBC-<version>.ipa
```

The build takes ~2–3 minutes. It uses your free Apple ID signing identity
(`Apple Development: sebastien.dangeuger@gmail.com`) automatically — no Xcode GUI
needed.

> **If you changed `app.json` / native config:** run `./scripts/build-ipa.sh --prebuild`
> to regenerate the `ios/` folder first. Otherwise the script skips prebuild
> (uses the existing `ios/` folder as-is).

### 2. Install AltServer (on your Mac)

1. Download **AltServer** from <https://altstore.io>.
2. Move it to `/Applications`.
3. Launch it — it runs as a menu-bar icon (a diamond).
4. Install the **Mail plug-in** when prompted (AltServer needs it):
   - macOS Mail → Settings → Manage Plug-ins → enable AltPlugin.
   - Restart Mail.

### 3. Install AltStore (on your iPhone)

1. Connect your iPhone to your Mac **via cable** (wireless sync must be enabled
   first; do the cable install once, then wireless works).
2. Click the AltServer menu-bar icon → **Install AltStore** → select your iPhone.
3. Enter your **free Apple ID** and password (same one used to sign the IPA).
   AltServer uses it to request the 7-day provisioning profile from Apple.
4. On your iPhone: **Settings → General → VPN & Device Management** → tap your
   Apple ID → **Trust**.

### 4. Enable wireless sync (so refreshes work over Wi-Fi)

1. Open Finder (or Apple Devices app) with the iPhone connected.
2. Select the iPhone → check **"Show this iPhone when on Wi-Fi"** → **Apply**.

---

## Install the KBC IPA

1. Make sure AltStore is running on your Mac (menu-bar icon present).
2. Open **AltStore** on your iPhone.
3. Tap the **+** (top-left) → browse to the IPA file.
   - Easiest: AirDrop `build/KBC-<version>.ipa` from your Mac to the iPhone,
     then in AltStore tap **+** → it appears under recently received files.
   - Or put the IPA in iCloud Drive / Files and pick it from there.
4. AltStore re-signs it with your Apple ID and installs it. The KBC icon appears
   on your home screen.

---

## Keeping it alive (the 7-day refresh)

AltStore refreshes apps **automatically** when **all** of these are true:

- Your iPhone and your Mac are on the **same Wi-Fi network**.
- Your Mac is **awake** with AltServer running.
- The iPhone is reachable via Wi-Fi sync (set up in step 4 above).

AltStore tries to refresh in the background roughly once per day. You can also
force a refresh any time by opening AltStore and tapping **Refresh All**.

**Practical tip:** plug in your Mac, leave AltServer running, and connect your
iPhone to the same Wi-Fi overnight occasionally. As long as it refreshes within
any 7-day window, the app never expires from your perspective.

### If an app expires

If it does lapse past 7 days (e.g., Mac was off / you were traveling):

- The app simply won't open — nothing is deleted.
- Open AltStore, tap **Refresh All**. It re-signs and the app works again,
  with all your data intact (data is stored locally + synced to Supabase).

---

## Rebuilding after code changes

```bash
# 1. Make your code changes
# 2. Rebuild the IPA
./scripts/build-ipa.sh
# 3. AirDrop the new build/KBC-<version>.ipa to your iPhone
# 4. In AltStore: + → select the new IPA → install over the old one
```

Re-installing over the existing app **preserves data** (same bundle ID, same
keychain/local storage).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ARCHIVE FAILED` with push-notification capability error | Ensure `ios/KBC/KBC.entitlements` is empty (no `aps-environment`). Run `git checkout ios/KBC/KBC.entitlements` if it was modified. |
| AltStore says "No devices found" / can't install AltStore | Connect via cable, ensure Wi-Fi sync is enabled in Finder, restart AltServer. |
| AltStore refresh fails ("incorrect Apple ID or password") | Re-enter your Apple ID password in AltStore settings (the app-specific password may have expired). |
| App won't open after install | Settings → General → VPN & Device Management → trust your Apple ID again. |
| "Cannot connect to AltServer" on refresh | Check Mac is awake, AltServer running, same Wi-Fi, and the Mail plug-in is enabled. |

---

## How the build works (technical detail)

- **`scripts/build-ipa.sh`** — runs `xcodebuild archive` with `-configuration Release`
  (Release uses `KBCRelease.entitlements`, which is empty — the `aps-environment`
  entitlement that free teams can't provision is Debug-only and excluded).
- **`ios/AltStoreExportOptions.plist`** — `method: development`, `signingStyle: automatic`,
  `teamID: M26S98DGFB`, `compileBitcode: false`. Lets `xcodebuild -exportArchive`
  produce a free-team-signed IPA without a specific profile UUID pinned.
- AltStore then **re-signs** the whole bundle with your Apple ID on install,
  replacing the build-time signature with a fresh 7-day profile.
