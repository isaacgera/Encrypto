/*
 * Encrypto — attachments.js  (v1.1)
 * -----------------------------------------------------------------------------
 * Encrypted file attachments, stored in IndexedDB (binary files need the larger
 * quota; localStorage would be unsuitable and risk the vault blob).
 *
 * Security model (reuses the verified crypto core — no new primitives):
 *   - File BYTES encrypted with the in-memory AES-GCM vault key via
 *     encryptBytes/decryptBytes (fresh IV per item).
 *   - Filename + MIME type ALSO encrypted (they can reveal the document).
 *   - Key never stored here; passed in per op. No key (locked) => unreadable.
 *
 * Stored record (all ciphertext or non-secret):
 *   { id, entryId, size, createdAt,
 *     name: {iv,ciphertext}, mime: {iv,ciphertext}, data: {iv,ciphertext} }
 * -----------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var C = global.EncryptoCrypto;
  if (!C) throw new Error('attachments.js requires crypto.js first.');

  var DB_NAME = 'encrypto_attachments';
  var DB_VERSION = 1;
  var STORE = 'attachments';

  function AttachError(message, cause) {
    this.name = 'AttachError';
    this.message = message;
    if (cause) this.cause = cause;
  }
  AttachError.prototype = Object.create(Error.prototype);
  AttachError.prototype.constructor = AttachError;

  var _dbPromise = null;
  function db() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new AttachError('IndexedDB is unavailable in this browser.')); return; }
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          var os = d.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('entryId', 'entryId', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(new AttachError('Could not open attachment storage.', req.error)); };
    });
    return _dbPromise;
  }

  function tx(mode) {
    return db().then(function (d) { return d.transaction(STORE, mode).objectStore(STORE); });
  }
  function reqToPromise(makeReq) {
    return new Promise(function (resolve, reject) {
      var r = makeReq();
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(new AttachError('Storage operation failed.', r.error)); };
    });
  }
  function genId() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'a_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function add(entryId, file, key) {
    if (!key) return Promise.reject(new AttachError('Vault is locked.'));
    if (!entryId) return Promise.reject(new AttachError('An entry id is required.'));
    if (!file || !(file.bytes instanceof Uint8Array)) {
      return Promise.reject(new AttachError('File bytes (Uint8Array) are required.'));
    }
    var id = genId();
    var size = file.bytes.length;
    var name = file.name || 'file';
    var mimeType = file.mimeType || 'application/octet-stream';
    return Promise.all([
      C.encryptBytes(file.bytes, key),
      C.encrypt(name, key),
      C.encrypt(mimeType, key)
    ]).then(function (parts) {
      var record = { id: id, entryId: entryId, size: size, createdAt: Date.now(),
        data: parts[0], name: parts[1], mime: parts[2] };
      return tx('readwrite').then(function (os) {
        return reqToPromise(function () { return os.add(record); });
      }).then(function () {
        return { id: id, entryId: entryId, name: name, mimeType: mimeType, size: size };
      });
    });
  }

  function listMeta(entryId, key) {
    if (!key) return Promise.reject(new AttachError('Vault is locked.'));
    return tx('readonly').then(function (os) {
      return reqToPromise(function () { return os.index('entryId').getAll(entryId); });
    }).then(function (records) {
      return Promise.all((records || []).map(function (rec) {
        return Promise.all([C.decrypt(rec.name, key), C.decrypt(rec.mime, key)])
          .then(function (nm) {
            return { id: rec.id, entryId: rec.entryId, name: nm[0], mimeType: nm[1],
              size: rec.size, createdAt: rec.createdAt };
          });
      }));
    });
  }

  function getBytes(id, key) {
    if (!key) return Promise.reject(new AttachError('Vault is locked.'));
    return tx('readonly').then(function (os) {
      return reqToPromise(function () { return os.get(id); });
    }).then(function (rec) {
      if (!rec) throw new AttachError('Attachment not found.');
      return Promise.all([
        C.decryptBytes(rec.data, key), C.decrypt(rec.name, key), C.decrypt(rec.mime, key)
      ]).then(function (parts) {
        return { name: parts[1], mimeType: parts[2], bytes: parts[0] };
      });
    });
  }

  function remove(id) {
    return tx('readwrite').then(function (os) {
      return reqToPromise(function () { return os.delete(id); });
    }).then(function () { return true; });
  }

  function removeForEntry(entryId) {
    return tx('readwrite').then(function (os) {
      return reqToPromise(function () { return os.index('entryId').getAllKeys(entryId); })
        .then(function (keys) {
          return Promise.all((keys || []).map(function (k) {
            return reqToPromise(function () { return os.delete(k); });
          })).then(function () { return (keys || []).length; });
        });
    });
  }

  function exportAll() {
    return tx('readonly').then(function (os) {
      return reqToPromise(function () { return os.getAll(); });
    }).then(function (records) { return records || []; });
  }

  function importAll(records, opts) {
    opts = opts || {};
    if (!Array.isArray(records)) {
      return Promise.reject(new AttachError('Attachment backup must be an array.'));
    }
    return tx('readwrite').then(function (os) {
      var startup = opts.clear ? reqToPromise(function () { return os.clear(); }) : Promise.resolve();
      return startup.then(function () {
        return Promise.all(records.map(function (rec) {
          if (!rec || !rec.id || !rec.data || !rec.name || !rec.mime) {
            throw new AttachError('A backup attachment record is malformed.');
          }
          return reqToPromise(function () { return os.put(rec); });
        })).then(function () { return records.length; });
      });
    });
  }

  function clearAll() {
    return tx('readwrite').then(function (os) {
      return reqToPromise(function () { return os.clear(); });
    }).then(function () { return true; });
  }

  var EncryptoAttachments = {
    MAX_BYTES: 5 * 1024 * 1024,
    Error: AttachError,
    add: add,
    listMeta: listMeta,
    getBytes: getBytes,
    remove: remove,
    removeForEntry: removeForEntry,
    exportAll: exportAll,
    importAll: importAll,
    clearAll: clearAll,
    _dbName: DB_NAME
  };

  global.EncryptoAttachments = EncryptoAttachments;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EncryptoAttachments;
  }

})(typeof self !== 'undefined' ? self : this);
