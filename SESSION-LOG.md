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

---

## Session 2 (wrap-up) — 31 Oct 2026 — v1.0.0 shipped & signed off

**Finished, deployed and signed off Encrypto v1.0.0. Verified live on a real mobile phone via
GitHub Pages. Status flipped to Built.**

### Since code-complete
- **Tests:** `tests/store-test.html` → 12/12 green (one conditional block; `crypto-test.html`
  already 11/11). Both suites pass in a real engine.
- **Theme-toggle bug (app) — fixed.** `html[data-theme="light"]` only set `color-scheme` but
  didn't restate the light token set, so on a dark-OS machine all three toggle states rendered
  dark (the toggle looked dead). Fixed by giving the light override the full light token set;
  Isaac re-verified it works.
- **Test-harness bug (not an app bug) — fixed.** `assertThrows` didn't tolerate a *synchronous*
  throw, and `setEntries()`'s unlocked-guard throws synchronously. Made `assertThrows` accept a
  thunk and passed the call as one. The store was always correct (it refuses while locked).
- **Icons:** PNGs generated via `icons/make-icons.html` and placed in `icons/`.
- **Delivery files added:** `README.md`, `.gitignore`, `CHANGELOG.md`, `LICENSE` (MIT,
  © Isaac A Gera).

### Deployment
- Forjé set up the local git repo (`git init -b main`, add, commit `dbec615` — 25 files).
- Isaac created the public `encrypto` GitHub repo, pushed, and enabled GitHub Pages himself
  (Forjé can't create repos / push — needs Isaac's auth; the local terminal is also flaky).
- Deployed to GitHub Pages and **verified on a real mobile phone**, then **signed off**.

### Status
- **Ideas.md → `Built (Encrypto v1.0.0)`.** SPEC-tasks status → Built; verification section
  completed.

### Deferred to v1.1 (requirements captured)
Isaac asked for two features during sign-off, both deferred:
1. **Encrypted file attachments** per entry (documents/cards) — a storage-architecture change
   (IndexedDB), so it needs its own **Plan/Quick-Spec** pass before code.
2. **Folders within categories** — smaller, data-model + UI only.
Requirements written up in **SPEC-requirements.md §8-9** (REQ-10..17, NFR-07..13) and noted on
the Ideas.md row.

### Doc staleness (flagged by the Session-Log Scribe)
- **SPEC-requirements.md** — minor: status header still says "In Progress (build kickoff)";
  should read Built. §8-9 reqs are correct.
- **SPEC-design.md** — minor: same status-header lag; crypto body still accurate.
- **userguide.html** — current (no v1.0.0 behaviour changed at sign-off); revisit at v1.1.

### Next session
**v1.1 — start in Plan mode on the encrypted-attachments design (IndexedDB)**, then folders.
Any future change: bump `APP_VERSION` + SW `CACHE_NAME` so the installed PWA picks it up.

---

## Session 3 — 31 Oct 2026 — v1.1.0 Encrypted Attachments (built, ported, shipped)

**Built encrypted file attachments in a prototype first (prototype-first workflow), tested on
desktop + mobile emulator, then ported to the live app and deployed. Shipped as v1.1.0.**

### Flow
- Started v1.1 in Plan mode; agreed scope: attachments on all four entry types, 5 MB/file cap,
  inline image thumbnails + unified preview, over-5MB image compress (with before/after confirm)
  / non-image "pick smaller", attachments in the encrypted backup. IndexedDB for binary storage.
- **Mid-build course-correction:** caught that I'd begun editing the live app directly; reverted
  the live `crypto.js`, removed the stray live files, and rebuilt properly in
  `prototypes/` (isolated storage: `encproto_` localStorage + `encrypto_attachments_proto`
  IndexedDB, PROTOTYPE banner, `1.1.0-proto` tag).
- Verified the crypto/storage layer via `attachments-test.html` (11 green). Built the full
  prototype app (index/css/store/app) and tested interactively.
- **Fixes from Isaac's testing:** (1) attach on first attempt via a pre-generated entry id, with
  orphan cleanup on cancel/close/esc/lock; (2) unified "open in new tab" preview for all file
  types (retired the image-only lightbox); (3) a short one-shot grace window so an in-app preview
  doesn't trip lock-on-background. Re-tested on desktop + mobile emulator — good.

### Decisions captured for later (not built)
- **Biometric unlock (WebAuthn / Face ID)** → v1.2; needs Plan mode (it changes the "key never
  persisted" stance — see SPEC-requirements §10, NFR-14 the key tradeoff).
- **Unlock throttle** → only if Encrypto ever becomes a Play/App Store app; non-destructive only
  (SPEC-requirements §11). Decision for the web/PWA version: do nothing.

### Ported to live + released
- Binary `encryptBytes`/`decryptBytes` added to `crypto.js`; new `js/attachments.js`
  (live DB `encrypto_attachments`); `store.js` schema → 2 (schema-1 vaults auto-migrate on
  unlock, no data loss) + `getKey()` + attachments in the export envelope; attachments UI in
  `index.html`/`app.js`/`styles.css`; `tests/attachments-test.html` brought across.
- **Version bump:** `APP_VERSION` 1.0.0 → **1.1.0**; SW `CACHE_NAME` → **encrypto-v1.1.0**.
  CHANGELOG + userguide updated.
- Committed and pushed to the `encrypto` GitHub repo; GitHub Pages redeploys.

### Verification
- `tests/crypto-test.html` (11) and `tests/attachments-test.html` (11) green; store tests green.
- Prototype tested on desktop + device emulator (layout/flow). **Still pending: real installed
  iPhone PWA** check of attachments preview/download + the preview/lock interaction + (future)
  Face ID — per the iOS-PWA rule, that only tells the truth on a real device.

### Status
**Built (Encrypto v1.1.0)** — shipped to GitHub Pages. Prototype retained under `prototypes/`
for the next feature.

---

## Session 3 (cont.) — 31 Oct 2026 — v1.1.1 update prompt + mobile fit

**Small follow-up release after v1.1.0.** Built in the prototype, then ported to live and shipped.

- **Version tag** next to the title (display-only, read from `APP_VERSION`) — shipped first as a
  no-bump change on v1.1.0, now carried forward.
- **"New version ready" prompt** — service-worker-driven action toast (Update / Later).
  **Lock-aware (apply-on-next-lock):** never reloads a live unlocked vault; applies on the next
  lock (manual/idle) or via "Lock & update". Prototype used a hidden "simulate update" button
  (no SW in the prototype); that button is NOT in the live build.
- **Mobile viewport fix** — vault loaded zoomed-out and snap-fit on tap; fixed with `100dvh`
  (vh fallback), `overflow-x:hidden`, and `interactive-widget=resizes-content`.
- **Release:** `APP_VERSION` 1.1.0 → **1.1.1**; SW `CACHE_NAME` → **encrypto-v1.1.1** (the bump
  is also what makes the update prompt fire for installed PWAs going forward). Committed + pushed.

### Standing practice confirmed
Every future release **must bump `CACHE_NAME`** or the update prompt won't trigger (and installed
PWAs keep serving stale assets).

### Still pending (real device)
The update prompt's genuine SW detection/activation, the mobile viewport fit, and the attachments
preview/download all need confirming on the **real installed iPhone PWA** now that they're live.

---

## Session 3 (wrap-up) — 31 Oct 2026 — v1.1.x attachments + mobile polish, shipped

**Shipped encrypted attachments and then a run of mobile-polish patches, all prototype-first
then ported/deployed to GitHub Pages. Ended at v1.1.6.**

### Releases today (all live on GitHub Pages)
- **v1.1.0** — Encrypted file attachments: IndexedDB store (`encrypto_attachments`), binary
  `encryptBytes`/`decryptBytes`, filename+MIME encrypted; add on any of the 4 types; image
  thumbnails; unified preview; 5 MB cap with in-browser image compression; attachments in the
  encrypted backup; schema → 2 with transparent migration.
- **v1.1.1** — "New version ready" update prompt (service-worker driven, lock-aware =
  apply-on-next-lock); app version tag by the title; first (partial) mobile viewport attempt.
- **v1.1.2** — Proper mobile layout fix attempt (fixed topbar/footer, internal scroll).
- **v1.1.3** — iOS safe-area insets (`env(safe-area-inset-*)`).
- **v1.1.4** — iOS web-app meta tags (`apple-mobile-web-app-*`, status-bar-style
  black-translucent) — the real fix that made the header clear the status bar. (Needs a
  home-screen reinstall to take effect.)
- **v1.1.5** — Reworked layout to a **3-row CSS grid** (`auto 1fr auto`) so the footer anchors
  to the bottom reliably — ended the footer/height whack-a-mole.
- **v1.1.6** — Renamed **"master passphrase" → "Encrypto Key"** throughout (app + user guide);
  centred full-width button labels (Unlock/Create vault); footer nudged lower.

### Workflow notes
- Course-corrected early to **prototype-first**: all features built in `prototypes/` (isolated
  `encproto_` localStorage + `encrypto_attachments_proto` IndexedDB, PROTOTYPE banner, no SW),
  tested, then ported to live. Mobile-polish patches were ported + deployed directly because the
  effects (safe-area, SW update, installed-PWA layout) can only be verified on the real device.
- **Standing practice reaffirmed:** every release bumps `APP_VERSION` + SW `CACHE_NAME` together,
  or the update prompt won't fire and installed PWAs serve stale assets.
- The Windows terminal git push returns empty output; confirmed each push via
  `git rev-parse origin/main` before calling it done.

### Verified
- Crypto (11) + attachments (11) + store tests green. Attachments flow + preview + update toast
  tested in prototype and on desktop. Mobile fit verified by Isaac on the real iPhone through
  the v1.1.x iterations (header now clears the status bar; footer anchored).
- The **update toast** swaps silently on iOS before the popup is seen (expected SW behaviour);
  mechanism confirmed working via the version advancing each release.

### Captured for a future v1.2 (NOT built) — see SPEC-requirements
- §10 Biometric unlock (WebAuthn / Face ID) — needs Plan (changes the "key never persisted"
  stance).
- §11 Unlock throttle — only if ever a Play/App Store app; non-destructive only.
- §12 **Custom entry types / categories** — user-defined types + fields beyond the built-in
  four; data-model change, ~attachments-scale; open questions (custom fields depth; whether to
  edit the defaults) to settle in Plan. Could share a v1.2 release with §10.

### Status
**Built (Encrypto v1.1.6)** — attachments + mobile polish shipped and signed off. Prototype
retained under `prototypes/`. Next pickup: a Plan-mode pass for v1.2 (custom types and/or
biometric unlock).
