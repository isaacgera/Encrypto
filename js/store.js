/*
 * Encrypto — store.js
 * -----------------------------------------------------------------------------
 * The vault store. Sits on top of the verified crypto core (crypto.js) and owns:
 *   - the localStorage schema (ONLY non-secret material is persisted),
 *   - the in-memory state while unlocked (derived key + decrypted entries),
 *   - setup / unlock / lock / save / wipe operations,
 *   - encrypted export / import (delegated here; UI just wires buttons).
 *
 * Persistence rule (SPEC-design §2.4): localStorage holds ONLY
 *   { schema, appVersion, kdf:{salt, iterations, hash}, cipher:{iv, ciphertext} }
 * i.e. version + salt + iterations + iv + ciphertext. Never plaintext, never the
 * passphrase, never the derived key.
 *
 * In-memory rule (§2.3): the derived key is a non-extractable CryptoKey held in
 * `state.key` only while unlocked. `lock()` drops it and the decrypted entries.
 * -----------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var C = global.EncryptoCrypto;
  if (!C) throw new Error('store.js requires crypto.js to be loaded first.');

  // --- Constants ------------------------------------------------------------
  var STORAGE_KEY = 'encrypto_vault_v1'; // namespaced; bump suffix if schema changes
  var SCHEMA_VERSION = 2;                // v1.1: attachments era (schema-1 vaults still open)
  var APP_VERSION = '1.1.6';             // single source of truth for app version
  var EXPORT_TYPE = 'encrypto-backup';   // identifies our export envelope

  // --- In-memory state (never persisted) ------------------------------------
  // key: the derived CryptoKey while unlocked (null when locked)
  // entries: the decrypted entries array while unlocked (null when locked)
  // meta: the kdf params in use (salt/iterations) once a vault exists
  var state = {
    key: null,
    entries: null,
    meta: null // { salt (b64), iterations }
  };

  // --- Low-level persistence ------------------------------------------------
  function rawRead() {
    var s;
    try {
      s = global.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      throw new StoreError('Cannot read local storage (is it blocked?).', e);
    }
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch (e) {
      throw new StoreError('Stored vault is corrupt (invalid JSON).', e);
    }
  }

  function rawWrite(record) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch (e) {
      throw new StoreError(
        'Could not save to local storage (it may be full or blocked).', e
      );
    }
  }

  // --- Error type -----------------------------------------------------------
  function StoreError(message, cause) {
    this.name = 'StoreError';
    this.message = message;
    if (cause) this.cause = cause;
  }
  StoreError.prototype = Object.create(Error.prototype);
  StoreError.prototype.constructor = StoreError;

  // --- Record shape helpers -------------------------------------------------
  function buildRecord(saltB64, iterations, cipher) {
    return {
      schema: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      kdf: { salt: saltB64, iterations: iterations, hash: C.HASH },
      cipher: { iv: cipher.iv, ciphertext: cipher.ciphertext }
    };
  }

  // Validate a persisted/imported record has the fields we require.
  function validateRecord(rec) {
    if (!rec || typeof rec !== 'object') return 'not an object';
    if (typeof rec.schema !== 'number') return 'missing schema version';
    if (rec.schema > SCHEMA_VERSION) return 'vault was written by a newer version';
    if (!rec.kdf || typeof rec.kdf.salt !== 'string' ||
        typeof rec.kdf.iterations !== 'number') return 'missing/invalid kdf params';
    if (!rec.cipher || typeof rec.cipher.iv !== 'string' ||
        typeof rec.cipher.ciphertext !== 'string') return 'missing/invalid cipher payload';
    return null; // ok
  }

  // --- Public queries -------------------------------------------------------
  function exists() {
    return rawRead() !== null;
  }

  function isUnlocked() {
    return state.key !== null && state.entries !== null;
  }

  // --- Setup (first run) ----------------------------------------------------
  // Create a brand-new vault from a passphrase. Generates a fresh salt, derives
  // the key, encrypts an empty entries array, persists, and leaves us unlocked.
  function setup(passphrase) {
    if (exists()) {
      return Promise.reject(new StoreError('A vault already exists on this device.'));
    }
    var saltBytes = C.newSalt();
    var saltB64 = C.bytesToBase64(saltBytes);
    var iterations = C.ITERATIONS;
    return C.deriveKey(passphrase, saltBytes, iterations).then(function (key) {
      var entries = [];
      return C.encrypt(JSON.stringify(entries), key).then(function (cipher) {
        rawWrite(buildRecord(saltB64, iterations, cipher));
        state.key = key;
        state.entries = entries;
        state.meta = { salt: saltB64, iterations: iterations };
        return true;
      });
    });
  }

  // --- Unlock ---------------------------------------------------------------
  // Unlock by ATTEMPTING to decrypt. AES-GCM's auth tag means a wrong passphrase
  // or tampered storage fails here — surfaced as a clean "incorrect passphrase /
  // altered data" error, never partial access.
  function unlock(passphrase) {
    var rec = rawRead();
    if (!rec) return Promise.reject(new StoreError('No vault exists yet.'));
    var problem = validateRecord(rec);
    if (problem) return Promise.reject(new StoreError('Vault is invalid: ' + problem + '.'));

    var saltBytes = C.base64ToBytes(rec.kdf.salt);
    return C.deriveKey(passphrase, saltBytes, rec.kdf.iterations).then(function (key) {
      return C.decrypt(rec.cipher, key).then(function (plaintext) {
        var entries;
        try {
          entries = JSON.parse(plaintext);
        } catch (e) {
          throw new StoreError('Vault decrypted but contents are unreadable.', e);
        }
        if (!Array.isArray(entries)) {
          throw new StoreError('Vault contents are not in the expected format.');
        }
        state.key = key;
        state.entries = entries;
        state.meta = { salt: rec.kdf.salt, iterations: rec.kdf.iterations };
        // Transparently upgrade an older schema-1 vault to the current schema.
        // Entries are unchanged; this just re-stamps the record. No data loss.
        if (rec.schema < SCHEMA_VERSION) { persist(); }
        return entries.length;
      });
    });
  }

  // --- Lock -----------------------------------------------------------------
  // Drop the in-memory key and decrypted entries. The persisted ciphertext is
  // untouched. After this, only unlock() can restore access.
  function lock() {
    state.key = null;
    state.entries = null;
    // keep state.meta (salt/iterations) — it's non-secret and avoids a reread
  }

  // --- Entries access (only while unlocked) ---------------------------------
  function requireUnlocked() {
    if (!isUnlocked()) throw new StoreError('Vault is locked.');
  }

  // Expose the in-memory key so the attachments layer (v1.1) can use it.
  function getKey() { requireUnlocked(); return state.key; }

  // Returns a shallow copy so callers can't mutate internal state directly.
  function getEntries() {
    requireUnlocked();
    return state.entries.map(function (e) { return e; });
  }

  // Persist the current in-memory entries: re-encrypt with a FRESH IV and write.
  // The key stays the same; only the ciphertext + iv change.
  function persist() {
    requireUnlocked();
    var key = state.key;
    var saltB64 = state.meta.salt;
    var iterations = state.meta.iterations;
    return C.encrypt(JSON.stringify(state.entries), key).then(function (cipher) {
      rawWrite(buildRecord(saltB64, iterations, cipher));
      return true;
    });
  }

  // Replace the whole entries array (used by import-merge / CRUD layer) and save.
  function setEntries(entries) {
    requireUnlocked();
    if (!Array.isArray(entries)) {
      return Promise.reject(new StoreError('Entries must be an array.'));
    }
    state.entries = entries;
    return persist();
  }

  // --- Export / Import (encrypted) ------------------------------------------
  // Export is just the persisted record wrapped in a small typed envelope — it's
  // already ciphertext + salt + params, useless without the passphrase.
  function exportBackup() {
    var rec = rawRead();
    if (!rec) throw new StoreError('No vault to export.');
    return {
      type: EXPORT_TYPE,
      exportVersion: 2,           // v1.1 envelope (may carry attachments)
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      vault: rec,
      attachments: []            // app.js fills this from EncryptoAttachments
    };
  }

  // Import validates the envelope and the inner record, then REPLACES the local
  // vault with it. The imported vault keeps its own salt/iterations, so it is
  // unlocked with the passphrase that created it (which may differ from any
  // current one). We do not attempt to decrypt here — that happens at unlock.
  function importBackup(envelope, opts) {
    opts = opts || {};
    if (!envelope || envelope.type !== EXPORT_TYPE) {
      return Promise.reject(new StoreError('Not an Encrypto backup file.'));
    }
    var rec = envelope.vault;
    var problem = validateRecord(rec);
    if (problem) {
      return Promise.reject(new StoreError('Backup is invalid: ' + problem + '.'));
    }
    if (exists() && !opts.overwrite) {
      return Promise.reject(new StoreError(
        'A vault already exists. Importing will replace it.', null
      ));
    }
    // Replace local vault, then lock so the user must unlock with the backup's
    // passphrase — proving they can actually open what they imported.
    rawWrite(rec);
    lock();
    state.meta = { salt: rec.kdf.salt, iterations: rec.kdf.iterations };
    return Promise.resolve(true);
  }

  // --- Danger: wipe ---------------------------------------------------------
  // Destroy the local vault entirely. Irreversible. UI must confirm first.
  function wipe() {
    try {
      global.localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      throw new StoreError('Could not clear local storage.', e);
    }
    state.key = null;
    state.entries = null;
    state.meta = null;
  }

  // --- Public API -----------------------------------------------------------
  var EncryptoStore = {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    APP_VERSION: APP_VERSION,
    EXPORT_TYPE: EXPORT_TYPE,
    Error: StoreError,

    exists: exists,
    isUnlocked: isUnlocked,

    setup: setup,
    unlock: unlock,
    lock: lock,

    getKey: getKey,           // v1.1: needed by the attachments layer
    getEntries: getEntries,
    setEntries: setEntries,
    persist: persist,

    exportBackup: exportBackup,
    importBackup: importBackup,

    wipe: wipe,

    // exposed for validation reuse / tests
    _validateRecord: validateRecord
  };

  global.EncryptoStore = EncryptoStore;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EncryptoStore;
  }

})(typeof self !== 'undefined' ? self : this);
