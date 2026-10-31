# Encrypto — Tasks

- **Status:** In Progress (build kickoff 31 Oct 2026)

> Build started 31 Oct 2026 after Plan mode re-confirmed the crypto model and resolved the
> kickoff decisions. Status stays `In Progress` until Isaac verifies on a real device and
> explicitly signs off (per the backlog-sync rule).

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

## Pending Isaac's manual verification (then sign-off → Built)
- [ ] Run `tests/store-test.html` in a browser (expect 13/13 green).
- [ ] Walk the full app flow over a local server: setup → add each entry type → search/filter →
      reveal/copy (watch the 30 s clear) → lock/unlock → export → import → wipe.
- [ ] Run `icons/make-icons.html` once to produce the PNG icons into `icons/`.
- [ ] Install as a PWA and confirm offline load.
- [ ] **Real installed iPhone PWA:** confirm clipboard copy/auto-clear, auto-lock on idle, and
      lock-on-background actually behave (per the iOS-PWA standing rule).

## Deferred to v2+
- Argon2 KDF (behind a version flag); per-entry encryption; password generator; attachments;
  folders/categories; biometric unlock. NOT planned: any sync/cloud (breaks zero-network).
