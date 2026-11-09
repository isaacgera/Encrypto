# Encrypto — Changelog

## [1.1.6] — 2026-10-31

Terminology + small UI polish.

### Changed
- **"Master passphrase" renamed to "Encrypto Key"** throughout the app and user
  guide (setup, unlock, warnings, errors, backup import, and references).
- **Full-width buttons centre their label** (Unlock / Create vault were
  left-aligned).
- Footer nudged closer to the bottom edge.
- Service worker `CACHE_NAME` → `encrypto-v1.1.6`.



## [1.1.5] — 2026-10-31

Layout rework (grid) — footer sits at the bottom reliably.

### Fixed
- **Footer floating above the bottom** of the screen on the installed iPhone.
  Reworked the app shell from nested flex to a **3-row CSS grid**
  (`grid-template-rows: auto 1fr auto` → topbar / scrolling screen / footer),
  with explicit row placement so it holds whether or not the topbar is shown.
  The footer is now always the bottom row; the entry list fills and scrolls in
  the middle. Clearer, more predictable than the previous flex model.

### Changed
- Service worker `CACHE_NAME` → `encrypto-v1.1.5`.



## [1.1.4] — 2026-10-31

iOS status-bar meta (completes the safe-area fix).

### Fixed
- **Header still cut off under the status bar** on the installed iPhone PWA,
  because the iOS web-app meta tags were missing — so `env(safe-area-inset-top)`
  wasn't reporting the real status-bar height and the v1.1.3 padding had little
  effect. Added `apple-mobile-web-app-capable`, `mobile-web-app-capable`,
  `apple-mobile-web-app-status-bar-style = black-translucent`, and the app
  title meta. With these, the safe-area padding now clears the status bar.

### Changed
- Service worker `CACHE_NAME` → `encrypto-v1.1.4`.



## [1.1.3] — 2026-10-31

iOS safe-area fix.

### Fixed
- **Header hidden under the status bar / notch** on installed iOS PWAs. Added
  `env(safe-area-inset-*)` padding to the app shell (with a small extra top
  cushion), so the topbar sits clearly below the status bar and the footer
  clears the home indicator. Pairs with the existing `viewport-fit=cover`.
  (Insets resolve to real values only on device; desktop is unaffected.)

### Changed
- Service worker `CACHE_NAME` → `encrypto-v1.1.3`.



## [1.1.2] — 2026-10-31

Mobile layout fix (proper).

### Fixed
- **Mobile vault layout** — on first load the topbar was clipped at the top and
  a large empty gap sat above the footer (the page was taller than the screen
  and scrolled). Reworked the layout so the app shell fills the viewport exactly
  (`height: 100dvh`, `overflow: hidden`), the **topbar and footer are fixed
  rows**, and the active screen **scrolls internally**. Supersedes the partial
  v1.1.1 attempt.

### Changed
- Service worker `CACHE_NAME` → `encrypto-v1.1.2`. (This release is also the
  first chance to see the v1.1.1 "new version ready" prompt on an installed PWA.)



## [1.1.1] — 2026-10-31

Update prompt + mobile viewport fix.

### Added
- **"New version ready" prompt** — when an updated app version is available, a
  toast offers **Update / Later**. Lock-aware: if the vault is unlocked it does
  not reload mid-session; the update applies on the next lock (manual, idle, or
  "Lock & update"). Driven by the service worker; requires a `CACHE_NAME` bump
  per release to trigger (now standard practice).
- App version shown as a small tag next to the title (from `APP_VERSION`).

### Fixed
- **Mobile viewport fit** — the vault no longer loads zoomed-out and snap-fits
  on tap. Uses dynamic viewport height (`100dvh`, `vh` fallback),
  `overflow-x: hidden`, and `interactive-widget=resizes-content`.

### Changed
- Service worker `CACHE_NAME` → `encrypto-v1.1.1`.

## [1.1.0] — 2026-10-31

Encrypted file attachments.

### Added
- **Attachments on any entry** (Document, Password, Card, Note): attach scans,
  photos, PDFs and other files. Each file's bytes — plus its filename and MIME
  type — are encrypted with the vault key and stored in **IndexedDB**. Nothing
  is kept in plaintext.
- **Add files on first attempt** — a new entry can take attachments before its
  first save; abandoning the entry cleans up any orphaned files.
- **Unified preview** — opens any attachment (image, PDF, text, …) in a new tab;
  a preview launched from inside the app no longer trips the auto-lock. Separate
  **download/save** action (share sheet on touch devices where available).
- **Image thumbnails** inline in the entry; non-images show a file icon.
- **Over-5 MB handling** — images can be downscaled/recompressed in-browser to
  fit (with a before/after confirm); non-images prompt for a smaller file.
- **Attachments included in the encrypted backup** (export/import).
- **5 MB per-file cap.**

### Changed
- On-disk schema bumped to **2**; existing v1.0.0 vaults upgrade transparently
  on unlock (no data loss, backward compatible).
- Service worker `CACHE_NAME` → `encrypto-v1.1.0`.

### Notes
- Binary crypto added to the core as `encryptBytes` / `decryptBytes` (same
  AES-GCM model, fresh IV per item) — verified by `tests/attachments-test.html`.
- Biometric unlock (WebAuthn/Face ID) and an unlock throttle were considered and
  **deferred** — see SPEC-requirements §10–§11.



All notable changes to Encrypto are recorded here. Versions follow
[semantic versioning](https://semver.org/) (major.minor.patch). The version
constant lives in `js/store.js` (`APP_VERSION`) and the PWA cache name in
`sw.js` (`CACHE_NAME`) — bump both on release.

## [1.0.0] — 2026-10-31

First release. A local-first, zero-network, installable PWA vault.

### Added
- **Master-passphrase vault** with first-run setup (passphrase + confirm, live
  strength meter, mandatory "no recovery" acknowledgement).
- **Client-side encryption** via the native Web Crypto API: PBKDF2-SHA256
  (~310,000 iterations, random per-vault salt) to derive a non-extractable
  AES-GCM-256 key; fresh random IV per save. Unlock works by attempting to
  decrypt — a wrong passphrase or tampered data fails cleanly.
- **Entries** across four types — Document, Password, Card, Note — with
  type-specific fields, add/edit/delete, and masked sensitive fields with a
  reveal toggle.
- **Search & filter** over the decrypted-in-memory vault (title, type, and
  field values) plus per-type filter chips.
- **Copy to clipboard with 30-second auto-clear**; async Clipboard API with an
  `execCommand` fallback for installed iOS PWAs.
- **Auto-lock** after 5 minutes idle (with an on-screen countdown) and on tab
  hide/background; the in-memory key is wiped on lock.
- **Encrypted export / import** backup — the export file is ciphertext plus
  salt/params, useless without the passphrase; import replaces the local vault.
- **Delete-vault** option with a double confirmation.
- **PWA**: manifest, offline service worker (app-shell only — never caches vault
  data), SVG icons (standard + maskable) and a one-time PNG icon generator.
- **Theming**: light/dark via tokens, following the OS preference with a manual
  system → dark → light toggle that persists.
- **Accessibility**: visible focus, keyboard-operable list and modals (with a
  focus trap), labelled forms, reduced-motion support, AA-compliant text
  contrast in both themes.

### Security stance
- Zero network — nothing ever leaves the device; no accounts, no telemetry.
- Only non-secret material is persisted (version, salt, iterations, IV,
  ciphertext). The passphrase is never stored and the derived key is never
  persisted.
- **No recovery by design**: lose the passphrase and the data is permanently
  unreadable.

### Verified
- `tests/crypto-test.html` — 11/11 passed in-browser (round-trip,
  wrong-passphrase failure, tamper detection, IV uniqueness, salt isolation,
  input validation).
- `tests/store-test.html` — vault store round-trips, wrong-passphrase, tamper,
  export/import, wipe. *(Run in-browser to confirm.)*
