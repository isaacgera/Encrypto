# Encrypto - Session Log

- **Category:** Utility
- **Complexity tier:** Medium
- **Status:** In Progress (build kickoff 31 Oct 2026)
- **Description:** A private, locally-encrypted personal wallet for you and your family - securely hold key document details (passport, licence, policy numbers), passwords/logins, and card information in one place. Everything is encrypted at rest in the browser and unlocked with a single master passphrase; no accounts, no servers, nothing leaves the device. Includes encrypted export/import so you can back it up safely.
- **Scope (v1):** Master-passphrase unlock; add/edit/delete entries across types (Document, Password, Card, Note); client-side encryption via the Web Crypto API (nothing stored in plaintext); search/filter; copy-to-clipboard with auto-clear; encrypted export/import backup; auto-lock on idle; local-first, offline, installable PWA. Explicit stance: lose the passphrase and the data is unrecoverable by design.

---

## Scaffold - 10 Sep 2026
Placeholder folder + docs created from the Ideas backlog. No build work yet.
When this app is picked up: read this log first, agree build-standards flags,
move the Ideas.md row to In Progress, and start per the build-mode workflow.

---

## Session 1 — 10 Sep 2026 — Plan-mode design capture (NOT a build start)
**Worked through the crypto design for Encrypto and captured it in the SPEC files so it isn't
lost. No code written. Status deliberately stays `Idea` — this is planning, not a build start.**

Why Plan mode: Encrypto holds real sensitive data (documents, passwords, cards), so per the
build-standards rule the crypto model is agreed before any code.

Agreed crypto model (the core):
- **Key derivation:** PBKDF2 (Web Crypto `deriveKey`), SHA-256, random 16-byte per-vault salt,
  ~310,000 iterations (OWASP-aligned; iteration count stored so it can be raised later).
- **Why PBKDF2 not Argon2:** PBKDF2 is native to Web Crypto — no WASM library, no build step,
  keeps the no-build stance. Argon2 (stronger vs GPU) noted as a **v2 hardening option**.
- **Cipher:** AES-GCM 256-bit (authenticated — confidentiality + tamper detection), fresh
  random 12-byte IV per operation stored with the ciphertext.
- **Key handling:** non-extractable `CryptoKey`, in memory only while unlocked, dropped on
  lock. Passphrase never stored; derived key never persisted.
- **Persisted (all non-secret):** version, salt, iterations, IV(s), ciphertext blob. No
  plaintext, ever.
- **Unlock = attempt decrypt** (AES-GCM auth tag means wrong passphrase and tampered storage
  both fail cleanly — no separate password hash needed).
- **Unrecoverable by design:** no passphrase = no data; no reset/backdoor. Must be made
  unmistakable in the UI at set-up.

Scope + flags agreed:
- Entry types: **Document / Password / Card / Note**; v1 encrypts the whole entries array as
  one blob (per-entry encryption is v2).
- Behaviours: auto-lock on idle (~5 min default) + on tab close/refresh; copy-to-clipboard
  auto-clear (~20-30s); masked fields; encrypted export/import.
- **Stack:** vanilla HTML/CSS/JS, no build (Web Crypto is native). **Rigour:** Medium-high
  (highest in the family). **Platform:** installable, mobile-first PWA, **ZERO network** —
  nothing ever leaves the device (stronger privacy than any other app here).

Honest limitations recorded (to carry into the user guide): localStorage is device/browser-
scoped (clearing wipes the vault → export/import must be prominent); browser crypto is only as
safe as the device — not a hardware/certified vault; positioned for personal/family document
and card *details*, not oversold as bank-grade.

Done this session:
- Wrote SPEC-requirements.md (REQ-01..09, NFR-01..06 + limitations + kickoff confirms) and
  SPEC-design.md (full crypto model, data model, behaviours, PWA, limitations); replaced the
  SPEC-tasks stub with a build plan that starts in Plan mode.

Status: **Idea** (unchanged) — planning captured, no build started. Flip to `In Progress`
only when coding begins.

Confirm at build kickoff: licensing; re-confirm the crypto model in Plan mode; auto-lock +
clipboard-clear defaults.

Next session (when picked up): start in Plan mode to re-confirm the crypto model, then build
the crypto module first (with encrypt→decrypt / wrong-passphrase / tamper tests) before any UI.

---

## Session 2 — 31 Oct 2026 — Build kickoff (Plan mode → Spec/build)

**Re-confirmed the crypto model from Session 1 in Plan mode, resolved the open kickoff
decisions, and started the build. Status moved Idea → In Progress (Ideas.md + all SPEC files).**

Kickoff decisions agreed with Isaac:
- **Crypto:** PBKDF2-SHA256 ~310k + AES-GCM-256 (native Web Crypto) for v1 — re-confirmed,
  unchanged from Session 1. **Argon2id** recorded as a v2 key-derivation upgrade candidate.
- **Search:** encrypt everything; decrypt into memory on unlock; search in-memory.
- **Stack:** vanilla HTML/CSS/JS, no build (Web Crypto is native).
- **License:** MIT. **Copyright holder:** Isaac A Gera.
- **Auto-lock idle default:** 5 minutes. **Clipboard auto-clear:** 30 seconds.

Build order (crypto-first, UI after): crypto module + round-trip/wrong-passphrase/tamper
tests → vault store → setup → unlock/lock + auto-lock → entries CRUD → search → copy/clear →
encrypted export/import → PWA → a11y/responsive + footer → LICENSE/userguide/overview/version.

Done this session so far:
- Updated SPEC-requirements / SPEC-design / SPEC-tasks / SESSION-LOG to record kickoff and
  flip status to In Progress.

---

## Session 2 (cont.) — 31 Oct 2026 — v1.0.0 built (code-complete, awaiting sign-off)

**Built the whole app in one pass after kickoff: crypto core first (verified), then store, UI,
PWA and docs. Status stays In Progress — code-complete, awaiting Isaac's testing + sign-off
before flipping to Built.**

### What was built
- **`js/crypto.js`** — the security core. Native Web Crypto only: PBKDF2-SHA256 (~310k, random
  16-byte salt) → non-extractable AES-GCM-256 key; fresh 12-byte IV per op; unlock = attempt
  decrypt (GCM auth tag catches wrong passphrase *and* tampering identically). No DOM/storage/
  network — a pure, testable boundary.
- **`js/store.js`** — vault store. localStorage holds ONLY `{schema, appVersion, kdf:{salt,
  iterations,hash}, cipher:{iv,ciphertext}}` — no plaintext, no passphrase, no key. In-memory
  key + decrypted entries only while unlocked. setup/unlock/lock/getEntries/setEntries/persist/
  exportBackup/importBackup/wipe.
- **`index.html` + `css/styles.css` + `js/app.js`** — gate (setup + unlock), vault list,
  entry modal CRUD (Document/Password/Card/Note), search + type filters, reveal/copy with
  30 s clipboard auto-clear, auto-lock (5 min idle + on tab-hide) with countdown, theme toggle,
  export/import, delete-vault. Tokenised light/dark, modal focus trap, Powered by Forjé footer.
- **PWA** — `manifest.webmanifest`, `sw.js` (app-shell cache only; core atomic + optional
  best-effort; never caches vault data; nav fallback), `icons/icon.svg` + `icon-maskable.svg`,
  and `icons/make-icons.html` to generate the PNGs (no image tooling available locally).
- **Docs/delivery** — `LICENSE` (MIT, © Isaac A. Gera), `overview.html`, full `userguide.html`,
  `CHANGELOG.md` [1.0.0]. Version: `APP_VERSION='1.0.0'`, `CACHE_NAME='encrypto-v1.0.0'`.
- **Tests** — `tests/crypto-test.html` (11) and `tests/store-test.html` (13).

### Verified vs not
- **Verified:** crypto-test.html ran green in-browser (11/11) — Isaac confirmed. All files pass
  editor diagnostics. Asset references cross-checked (HTML ↔ SW precache ↔ manifest line up).
- **NOT yet verified (manual, Isaac's side — the Kiro terminal is blocked by the Windows
  autorun quirk, so no servers/tests can run here):** store-test.html, full app flow over a
  local server, PWA install/offline, running make-icons.html for the PNGs, and the definitive
  **real installed iPhone PWA** check of clipboard auto-clear + auto-lock + lock-on-background.

### Security stance recorded (and surfaced in-app)
Zero network; only ciphertext + salt/params persisted; no recovery by design (made unmistakable
at setup); positioned as a personal/family store, not a hardware/certified vault.

### Status
**In Progress — code-complete, awaiting sign-off.** Per the backlog-sync rule, Forjé does not
flip Ideas.md to Built; that waits on Isaac testing it (especially on a real iPhone) and saying
"ship it". Ideas.md row remains `In Progress`.

### v2+ backlog (noted)
Argon2id KDF (behind a version flag), per-entry encryption, password generator, attachments,
folders/categories, biometric unlock. Explicitly NOT planned: any sync/cloud (breaks zero-network).

### Next session
Once Isaac has tested and signed off: generate PNG icons, flip Ideas.md → `Built (Encrypto
v1.0.0)`, and deploy (static host; bump `CACHE_NAME` on any future change).
