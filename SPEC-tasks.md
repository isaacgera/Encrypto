# Encrypto — Tasks

- **Status:** Built (Encrypto v1.1.0) — attachments shipped 31 Oct 2026 (v1.0.0 signed off earlier same day)

> Built and shipped 31 Oct 2026. Deployed to GitHub Pages and verified by Isaac on a real
> mobile phone, then signed off. v1.1 (attachments + folders) requirements captured in
> SPEC-requirements §8-9 for a future build.

## Planning (done)
- [x] Agree v1 scope (master-passphrase vault; Document/Password/Card/Note; search;
      copy-with-auto-clear; auto-lock; encrypted export/import; offline PWA)
- [x] Agree the crypto model (PBKDF2-SHA256 ~310k + random salt; AES-GCM-256 + per-op IV;
      non-extractable in-memory key; unlock = decrypt; unrecoverable by design)
- [x] Agree build-standards flags (Medium-high rigour; vanilla no-build; installable
      mobile-first PWA; ZERO network; local-first localStorage only)
- [x] Capture the design in SPEC-requirements.md + SPEC-design.md

## Build kickoff (done — 31 Oct 2026)
- [x] Re-confirm the crypto model in Plan mode before any code
- [x] Licence decision → MIT; copyright holder → Isaac A Gera
- [x] Auto-lock default 5 min; clipboard auto-clear delay 30 s — confirmed

## Build (code-complete — 31 Oct 2026)
- [x] Crypto module (`js/crypto.js`): PBKDF2 deriveKey (salt + iterations), AES-GCM
      encrypt/decrypt with per-op IV; non-extractable key. **Verified** via
      `tests/crypto-test.html` — 11/11 green (round-trip, wrong-passphrase, tamper,
      IV uniqueness, salt isolation, input validation).
- [x] Vault store (`js/store.js`): localStorage schema (version/salt/iterations/iv/ciphertext
      only — no plaintext); load/save. Test harness `tests/store-test.html` (13 tests).
- [x] Set-up flow: create master passphrase + strength meter + unmistakable "no recovery"
      warning + mandatory acknowledgement.
- [x] Unlock/lock flow: decrypt-to-verify (generic error); auto-lock on 5-min idle + on
      tab-hide/background; key wiped on lock; idle countdown on the top bar.
- [x] Entries: add/edit/delete for Document/Password/Card/Note; masked fields + reveal.
- [x] Search/filter over in-memory decrypted data (title, type, field values) + type chips.
- [x] Copy-to-clipboard with 30 s auto-clear (async Clipboard API + execCommand fallback).
- [x] Encrypted export/import (typed envelope + validation + version tag) + delete-vault.
- [x] PWA: manifest + service worker (app-shell cache only, never vault data); installable,
      fully offline. SVG icons + `icons/make-icons.html` generator for the PNGs.
- [x] Accessibility + responsive pass (Pre-Live Testing Agent — no blockers; AA contrast fix,
      modal focus trap, system-mode `color-scheme`). Empty/locked/error states present.
- [x] Docs: userguide.html (incl. honest limitations + "no recovery"), overview.html,
      CHANGELOG.md, LICENSE (MIT); version constant `APP_VERSION='1.0.0'`.
- [x] Ideas.md status -> In Progress (at build start). **-> Built pending Isaac's sign-off.**

## Verification (done — 31 Oct 2026)
- [x] `tests/crypto-test.html` — 11/11 green (confirmed by Isaac).
- [x] `tests/store-test.html` — 12/12 green (confirmed by Isaac; one conditional block).
- [x] PNG icons generated via `icons/make-icons.html` and placed in `icons/`.
- [x] Installed as a desktop PWA; theme toggle fixed + re-verified.
- [x] Deployed to GitHub Pages (dedicated `encrypto` repo) and **verified on a real mobile
      phone** by Isaac, then signed off.
- [~] iOS-specific clipboard/auto-lock/lock-on-background behaviours: covered by the real-device
      test above. (If an installed *iPhone* PWA is later used specifically, re-confirm per the
      `ios-pwa-patterns` rule — the pattern/fallbacks are already in place.)

## Deferred to v1.1 (requirements captured — see SPEC-requirements §8-9)
- Encrypted file attachments per entry (IndexedDB-backed; needs its own Plan/Quick-Spec).
- Optional folders within each entry type.

## Deferred to v2+
- Argon2 KDF (behind a version flag); per-entry encryption; password generator; attachments;
  folders/categories; biometric unlock. NOT planned: any sync/cloud (breaks zero-network).
