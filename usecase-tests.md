# Encrypto — Functional Use Case Test Script

**Date:** 10 Nov 2026  
**Target:** Encrypto v1.1.6 (shipped app)  
**Scope:** Functional use-case coverage audit — manual test walkthrough  

---

## How to Run These Tests

1. **Use the prototype sandbox** — the shipped app uses closure-private storage keys that cannot be safely patched. The prototype at `prototypes/index.html` uses isolated storage:
   - localStorage key: `encproto_vault_v1`
   - IndexedDB name: `encrypto_attachments_proto`
   
2. **Serve over HTTP** — open `prototypes/` via a local server (Live Server, `python -m http.server`, etc.), NOT `file://`, as service worker and IndexedDB behave differently.

3. **Use throwaway data** — when these tests ask you to create entries, use fake data (e.g., "Test Password", "Fake Card"). Do NOT use your real vault credentials or real sensitive data.

4. **Clear after testing** — when finished, click the "Clear prototype data" option in the prototype's menu, or manually clear localStorage/IndexedDB for the prototype prefix.

---

## Test Groups

### Group A: Core — Passphrase & Vault Lifecycle

| # | Test | Steps | Expected Result | Pass? |
|---|------|-------|-----------------|-------|
| A1 | **Setup new vault** | Open prototype → if no vault exists, enter a new passphrase (e.g., `test-pass-123`), confirm, acknowledge the warning. | Vault created, screen shows unlocked vault with empty state. | |
| A2 | **Lock vault manually** | While unlocked, tap the Lock button. | Screen returns to unlock prompt; vault data not visible. | |
| A3 | **Unlock with correct passphrase** | Enter the passphrase from A1. | Vault unlocks, entries visible. | |
| A4 | **Unlock with wrong passphrase** | Enter a different passphrase (e.g., `wrong-pass`). | Error message: "Incorrect Encrypto Key..." | |
| A5 | **Wrong passphrase does NOT give partial access** | After A4, check that no entries are visible and vault is locked. | Vault remains locked; no partial data shown. | |
| A6 | **Auto-lock after idle** | Leave the unlocked tab untouched for >5 minutes (or test with a shorter idle timeout if configurable). | Vault auto-locks after the idle period. | |
| A7 | **Lock on tab hide/background** | While unlocked, switch to another tab or minimize the browser. | Vault locks when tab becomes hidden (test with a preview-open grace window first). | |
| A8 | **Lock on page refresh** | While unlocked, refresh the page. | Returns to lock screen; in-memory key wiped. | |

### Group B: CRUD — Entries (Document / Password / Card / Note)

| # | Test | Steps | Expected Result | Pass? |
|---|------|-------|-----------------|-------|
| B1 | **Add a Password entry** | Tap + → type Password → title "Test Gmail", username "test@test.com", password "secret123", save. | Entry appears in list with masked password. | |
| B2 | **Add a Card entry** | Tap + → type Card → title "Test Visa", cardholder "Test User", number "4111111111111111", expiry "12/25", CVV "123", save. | Entry appears in list showing last 4 digits. | |
| B3 | **Add a Document entry** | Tap + → type Document → title "Test Passport", docType "Passport", number "AB123456", save. | Entry appears in list. | |
| B4 | **Add a Note entry** | Tap + → type Note → title "Test Note", body "This is a secret note", save. | Entry appears in list. | |
| B5 | **Edit an entry** | Tap an existing entry (e.g., "Test Gmail") → change password to "newpassword456" → save. | Entry updated; new value persists after lock/unlock cycle. | |
| B6 | **Delete an entry** | Tap an entry → tap Delete → confirm. | Entry removed from list; does not reappear after lock/unlock. | |
| B7 | **Entry persists after lock/unlock** | Add an entry → lock → unlock → verify entry still present. | Data survives lock/unlock cycle. | |
| B8 | **Newly created entry gets a pre-generated ID** | Create a new entry but cancel without saving → check no orphaned record remains. | Cancelled entry doesn't appear; no partial data left behind. | |

### Group C: Attachments (v1.1)

| # | Test | Steps | Expected Result | Pass? |
|---|------|-------|-----------------|-------|
| C1 | **Add an attachment to an entry** | Open an entry → tap Add Attachment → choose a small image file. | Attachment appears in the entry's attachment list. | |
| C2 | **Attachment shows thumbnail** | After C1, the attachment list shows a thumbnail for image files. | Thumbnail renders inline. | |
| C3 | **Attachment preview** | Tap the preview (eye) icon on an attachment. | Opens in a new tab/browser rendering; graceful for non-previewable types. | |
| C4 | **Attachment download** | Tap the download (⬇) icon on an attachment. | File downloads to device (or share sheet on mobile). | |
| C5 | **Remove attachment** | Tap the delete (🗑) icon on an attachment → confirm. | Attachment removed from the list. | |
| C6 | **Large image compression** | Add an image >5 MB → when prompted, choose to compress → confirm compression → save. | Compressed image attached; size under 5 MB. | |
| C7 | **Non-image over limit rejected** | Try to attach a PDF >5 MB. | Alert says "choose a smaller file." | |
| C8 | **Attachments persist after lock/unlock** | Add attachment → lock → unlock → verify attachment still present. | Binary data survives lock/unlock. | |
| C9 | **Attachments deleted with entry** | Add attachment to an entry → delete the entry. | Attachments are cascade-deleted. | |

### Group D: Export / Import & Backup

| # | Test | Steps | Expected Result | Pass? |
|---|------|-------|-----------------|-------|
| D1 | **Export creates backup file** | Open menu → Export → choose save location. | JSON file downloaded; contains encrypted vault + attachment array. | |
| D2 | **Export includes attachments** | Add an attachment → export → open the JSON file (in a text editor). | `attachments` array in the export contains records. | |
| D3 | **Import replaces vault** | Import the backup from D1 (using a different passphrase if desired). | Vault replaced with imported data; requires the imported backup's passphrase to unlock. | |
| D4 | **Import validates envelope** | Try to import a plain JSON file (not an Encrypto backup). | Error: "Not an Encrypto backup file." | |
| D5 | **Wipe destroys vault** | Menu → Wipe → confirm twice. | Vault removed from localStorage and IndexedDB; app returns to setup screen. | |
| D6 | **Schema-1 vault migration** | (If you have a pre-v1.1 backup) Import and unlock a schema-1 backup. | Vault opens and is transparently upgraded to schema 2; entries intact. | |

### Group E: Search & Filter

| # | Test | Steps | Expected Result | Pass? |
|---|------|-------|-----------------|-------|
| E1 | **Search by title** | Type "Gmail" in the search box. | Only entries with "Gmail" in title appear. | |
| E2 | **Search by field value** | Type a username or password value present in an entry. | Matching entry appears. | |
| E3 | **Type filter chips** | Tap the "Password" chip. | Only Password-type entries shown. | |
| E4 | **Search + filter combined** | Select "Card" type filter → search "Visa". | Only Card entries matching "Visa" shown. | |
| E5 | **No matches message** | Search for something that doesn't exist. | Empty state shows "No entries match your search or filter." | |

### Group F: Copy to Clipboard & Auto-Clear

| # | Test | Steps | Expected Result | Pass? |
|---|------|-------|-----------------|-------|
| F1 | **Copy password** | Open a Password entry → tap the copy icon next to the password field. | Value copied to clipboard; toast says "Copied — clears in 30s". | |
| F2 | **Clipboard auto-clears** | After F1, wait 30 seconds → paste anywhere. | Clipboard is cleared/empty (shows a space or empty string). | |
| F3 | **Copy username** | Copy the username field. | Copied successfully with same auto-clear behaviour. | |

### Group G: UI / UX & Edge Cases

| # | Test | Steps | Expected Result | Pass? |
|---|------|-------|-----------------|-------|
| G1 | **Empty vault state** | Create a fresh vault with no entries. | Shows empty state with "Your vault is empty" message. | |
| G2 | **Reveal masked field** | Tap the eye (👁) icon on a password field. | Password shown in plain text. | |
| G3 | **Hide masked field** | After G2, tap the hide (🙈) icon. | Password masked again. | |
| G4 | **Theme toggle** | Tap the theme button → switch through light/dark/system. | UI colors change appropriately; preference persists after reload. | |
| G5 | **Modal focus trap** | Open an entry modal → press Tab repeatedly. | Focus stays within the modal; wraps at edges. | |
| G6 | **Escape closes modal** | Open an entry modal → press Escape. | Modal closes (and discards unsaved entry if new). | |
| G7 | **Entry title required** | Try to save an entry with an empty title. | Error: "Please give this entry a title." | |
| G8 | **Very long values** | Create an entry with very long field values (>1000 chars). | Saved and displayed correctly; no truncation or crash. | |
| G9 | **Special characters in fields** | Use emojis, quotes, newlines, < > & in field values. | Saved and retrieved correctly; properly escaped in UI. | |
| G10 | **Update prompt appears** | (After a new version is deployed) Load the app with a waiting service worker. | Toast says "A new version is ready" with Update/Later buttons. | |
| G11 | **Update defers while unlocked** | With vault unlocked, a pending update should not reload the page. | Update applies on next lock. | |

---

## Isolation Verification

The prototype uses isolated storage that is **separate from your real vault**:

- **localStorage:** `encproto_vault_v1` (not `encrypto_vault_v1`)
- **IndexedDB:** `encrypto_attachments_proto` (not `encrypto_attachments`)

This ensures test data never touches your real encrypted vault. After testing, clear via the prototype's menu or manually clear these storage keys.

---

## Summary Notes

- All functional core journeys (setup, unlock, CRUD, search, copy, export/import, attachments) should work as designed.
- Any "Fail" above indicates a functional gap that needs fixing.
- This is a **manual verification** script. A previous harness attempt was deemed unsafe because the app uses closure-private storage keys that cannot be patched at runtime — the prototype sandbox is the correct isolation path.