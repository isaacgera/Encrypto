# Encrypto — Changelog

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
