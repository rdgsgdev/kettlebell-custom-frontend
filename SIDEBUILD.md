# Sideloading KBC on iPhone (Free Apple ID, No Paid Developer Account)

This guide produces an installable `.ipa` and installs it via **Sideloadly**,
which automatically refreshes the 7-day signing profile in the background — so
you never have to manually re-install the app each week.

> **Why Sideloadly?** AltStore PAL is region-locked to EU/Japan/Brazil, and
> AltStore Classic requires running AltServer on a Mac with the Mail plug-in
> enabled. **Sideloadly works worldwide** (including Canada), is a standalone
> app with no Mail plug-in, and has the same background auto-refresh capability.
> It consumes the same `.ipa` file AltStore would.

> **Why this approach at all?** iOS 17.1+ is not eligible for permanent
> (TrollStore) installs. With a free Apple ID, Apple caps every sideloaded app
> at 7 days. Sideloadly works around this with a background daemon that re-signs
> apps automatically before they expire.

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

### 2. Install Sideloadly (on your Mac)

1. Download **Sideloadly** from <https://sideloadly.io> (macOS version).
2. Move it to `/Applications` and launch it.
3. Connect your iPhone to your Mac **via cable** for the first install.

### 3. Install KBC via Sideloadly

1. Open Sideloadly. It should detect your connected iPhone.
2. Drag `build/KBC-<version>.ipa` into the Sideloadly window (or click the IPA
   icon to browse).
3. Enter your **free Apple ID** and password. Sideloadly uses it to request a
   7-day provisioning profile from Apple (the credentials are sent directly to
   Apple, not stored by Sideloadly).
4. Click **Start**. Sideloadly re-signs the app and installs it.
5. On your iPhone: **Settings → General → VPN & Device Management** → tap your
   Apple ID → **Trust**.

The KBC icon appears on your home screen.

### 4. Enable background auto-refresh (the key step)

This is what keeps the app alive past 7 days:

1. In Sideloadly, after installing, look for the **"Automatic Refresh"** /
   **"Auto refresh"** option (in the app's per-device settings, or the daemon
   menu-bar icon).
2. Enable it and set the refresh interval (e.g., every 12–24 hours).
3. **Enable Wi-Fi sync** for your iPhone:
   - Open Finder (or Apple Devices app) with the iPhone cable-connected.
   - Select the iPhone → check **"Show this iPhone when on Wi-Fi"** → **Apply**.

Sideloadly's daemon will now re-sign KBC automatically when your iPhone and Mac
are on the same Wi-Fi and the Mac is awake.

---

## Keeping it alive

Sideloadly's daemon refreshes apps **automatically** when **all** of these are
true:

- Your iPhone and your Mac are on the **same Wi-Fi network**.
- Your Mac is **awake** with Sideloadly's daemon running.
- The iPhone is reachable via Wi-Fi sync (set up in step 4 above).

You can also force a refresh any time by opening Sideloadly and clicking
**Refresh** for the app.

**Practical tip:** plug in your Mac, leave the daemon running, and connect your
iPhone to the same Wi-Fi overnight occasionally. As long as it refreshes within
any 7-day window, the app never expires from your perspective.

### If an app expires

If it does lapse past 7 days (e.g., Mac was off / you were traveling):

- The app simply won't open — nothing is deleted.
- Connect your iPhone, open Sideloadly, click **Refresh** (or reinstall). It
  re-signs and the app works again, with all your data intact (data is stored
  locally + synced to Supabase).

---

## Rebuilding after code changes

```bash
# 1. Make your code changes
# 2. Rebuild the IPA
./scripts/build-ipa.sh
# 3. In Sideloadly: drag the new build/KBC-<version>.ipa in, click Start
#    (installs over the old one)
```

Re-installing over the existing app **preserves data** (same bundle ID, same
keychain/local storage).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ARCHIVE FAILED` with push-notification capability error | Ensure `ios/KBC/KBC.entitlements` is empty (no `aps-environment`). Run `git checkout ios/KBC/KBC.entitlements` if it was modified. |
| Sideloadly says "No device found" | Connect via cable, ensure Wi-Fi sync is enabled in Finder, unlock the iPhone, restart Sideloadly. |
| Refresh fails ("incorrect Apple ID or password") | Re-enter your Apple ID password in Sideloadly. If you use 2FA, Sideloadly will prompt for the code. |
| App won't open after install | Settings → General → VPN & Device Management → trust your Apple ID again. |
| "Anisette data" error | This is a known Sideloadly hiccup talking to Apple's auth. Update to the latest Sideloadly version; if it persists, retry after a few minutes. |

---

## How the build works (technical detail)

- **`scripts/build-ipa.sh`** — runs `xcodebuild archive` with `-configuration Release`
  (Release uses `KBCRelease.entitlements`, which is empty — the `aps-environment`
  entitlement that free teams can't provision is Debug-only and excluded).
- **`scripts/AltStoreExportOptions.plist`** — `method: development`,
  `signingStyle: automatic`, `teamID: M26S98DGFB`, `compileBitcode: false`. Lets
  `xcodebuild -exportArchive` produce a free-team-signed IPA without a specific
  profile UUID pinned.
- Sideloadly then **re-signs** the whole bundle with your Apple ID on install,
  replacing the build-time signature with a fresh 7-day profile.

