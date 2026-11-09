/*
 * Encrypto — store.js  [PROTOTYPE — v1.1.0-proto]
 * -----------------------------------------------------------------------------
 * Faithful copy of the shipped v1.0.0 vault store, with PROTOTYPE isolation and
 * the v1.1 schema bump:
 *   - STORAGE_KEY = 'encproto_vault_v1'  (isolated — cannot touch the live vault)
 *   - APP_VERSION = '1.1.0-proto'
 *   - SCHEMA_VERSION = 2  (attachments era). Schema-1 vaults still open
 *     (backward compatible) — entries are unchanged; attachments live in
 *     IndexedDB, exported/imported alongside the vault by app.js.
 *
 * Persistence rule unchanged: localStorage holds ONLY
 *   { schema, appVersion, kdf:{salt,iterations,hash}, cipher:{iv,ciphertext} }.
 * Never plaintext, never the passphrase, never the derived key.
 * -----------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var C = global.EncryptoCrypto;
  if (!C) throw new Error('store.js requires crypto.js to be loaded first.');

  var STORAGE_KEY = 'encproto_vault_v1';  // PROTOTYPE-isolated key
  var SCHEMA_VERSION = 2;                 // v1.1 attachments era
  var APP_VERSION = '1.1.0-proto';
  var EXPORT_TYPE = 'encrypto-backup';    // same envelope type (compatible)

  var state = { key: null, entries: null, meta: null };

  function rawRead() {
    var s;
    try { s = global.localStorage.getItem(STORAGE_KEY); }
    catch (e) { throw new StoreError('Cannot read local storage (is it blocked?).', e); }
    if (!s) return null;
    try { return JSON.parse(s); }
    catch (e) { throw new StoreError('Stored vault is corrupt (invalid JSON).', e); }
  }
  function rawWrite(record) {
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(record)); }
    catch (e) { throw new StoreError('Could not save to local storage (it may be full or blocked).', e); }
  }

  function StoreError(message, cause) {
    this.name = 'StoreError'; this.message = message; if (cause) this.cause = cause;
  }
  StoreError.prototype = Object.create(Error.prototype);
  StoreError.prototype.constructor = StoreError;

  function buildRecord(saltB64, iterations, cipher) {
    return {
      schema: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      kdf: { salt: saltB64, iterations: iterations, hash: C.HASH },
      cipher: { iv: cipher.iv, ciphertext: cipher.ciphertext }
    };
  }

  function validateRecord(rec) {
    if (!rec || typeof rec !== 'object') return 'not an object';
    if (typeof rec.schema !== 'number') return 'missing schema version';
    if (rec.schema > SCHEMA_VERSION) return 'vault was written by a newer version';
    if (!rec.kdf || typeof rec.kdf.salt !== 'string' ||
        typeof rec.kdf.iterations !== 'number') return 'missing/invalid kdf params';
    if (!rec.cipher || typeof rec.cipher.iv !== 'string' ||
        typeof rec.cipher.ciphertext !== 'string') return 'missing/invalid cipher payload';
    return null;
  }

  function exists() { return rawRead() !== null; }
  function isUnlocked() { return state.key !== null && state.entries !== null; }

  function setup(passphrase) {
    if (exists()) return Promise.reject(new StoreError('A vault already exists on this device.'));
    var saltBytes = C.newSalt();
    var saltB64 = C.bytesToBase64(saltBytes);
    var iterations = C.ITERATIONS;
    return C.deriveKey(passphrase, saltBytes, iterations).then(function (key) {
      var entries = [];
      return C.encrypt(JSON.stringify(entries), key).then(function (cipher) {
        rawWrite(buildRecord(saltB64, iterations, cipher));
        state.key = key; state.entries = entries;
        state.meta = { salt: saltB64, iterations: iterations };
        return true;
      });
    });
  }

  function unlock(passphrase) {
    var rec = rawRead();
    if (!rec) return Promise.reject(new StoreError('No vault exists yet.'));
    var problem = validateRecord(rec);
    if (problem) return Promise.reject(new StoreError('Vault is invalid: ' + problem + '.'));
    var saltBytes = C.base64ToBytes(rec.kdf.salt);
    return C.deriveKey(passphrase, saltBytes, rec.kdf.iterations).then(function (key) {
      return C.decrypt(rec.cipher, key).then(function (plaintext) {
        var entries;
        try { entries = JSON.parse(plaintext); }
        catch (e) { throw new StoreError('Vault decrypted but contents are unreadable.', e); }
        if (!Array.isArray(entries)) throw new StoreError('Vault contents are not in the expected format.');
        state.key = key; state.entries = entries;
        state.meta = { salt: rec.kdf.salt, iterations: rec.kdf.iterations };
        // If an older schema-1 vault opened, re-persist at the current schema.
        if (rec.schema < SCHEMA_VERSION) { persist(); }
        return entries.length;
      });
    });
  }

  function lock() { state.key = null; state.entries = null; }

  function requireUnlocked() { if (!isUnlocked()) throw new StoreError('Vault is locked.'); }

  // Expose the in-memory key so app.js can hand it to the attachments store.
  function getKey() { requireUnlocked(); return state.key; }

  function getEntries() { requireUnlocked(); return state.entries.map(function (e) { return e; }); }

  function persist() {
    requireUnlocked();
    return C.encrypt(JSON.stringify(state.entries), state.key).then(function (cipher) {
      rawWrite(buildRecord(state.meta.salt, state.meta.iterations, cipher));
      return true;
    });
  }

  function setEntries(entries) {
    requireUnlocked();
    if (!Array.isArray(entries)) return Promise.reject(new StoreError('Entries must be an array.'));
    state.entries = entries;
    return persist();
  }

  // Export the vault record. Attachments are added by app.js (it owns the
  // EncryptoAttachments dependency) into envelope.attachments before download.
  function exportBackup() {
    var rec = rawRead();
    if (!rec) throw new StoreError('No vault to export.');
    return {
      type: EXPORT_TYPE,
      exportVersion: 2,            // v1.1 envelope (may carry attachments)
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      vault: rec,
      attachments: []             // app.js fills this from EncryptoAttachments
    };
  }

  function importBackup(envelope, opts) {
    opts = opts || {};
    if (!envelope || envelope.type !== EXPORT_TYPE) {
      return Promise.reject(new StoreError('Not an Encrypto backup file.'));
    }
    var rec = envelope.vault;
    var problem = validateRecord(rec);
    if (problem) return Promise.reject(new StoreError('Backup is invalid: ' + problem + '.'));
    if (exists() && !opts.overwrite) {
      return Promise.reject(new StoreError('A vault already exists. Importing will replace it.', null));
    }
    rawWrite(rec);
    lock();
    state.meta = { salt: rec.kdf.salt, iterations: rec.kdf.iterations };
    return Promise.resolve(true);
  }

  function wipe() {
    try { global.localStorage.removeItem(STORAGE_KEY); }
    catch (e) { throw new StoreError('Could not clear local storage.', e); }
    state.key = null; state.entries = null; state.meta = null;
  }

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
    _validateRecord: validateRecord
  };

  global.EncryptoStore = EncryptoStore;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EncryptoStore;
  }

})(typeof self !== 'undefined' ? self : this);
