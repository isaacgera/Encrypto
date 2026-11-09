/*
 * Encrypto — app.js  (v1.1)
 * -----------------------------------------------------------------------------
 * The UI controller: gate (setup/unlock), vault list, entry modal, search/
 * filter, copy-with-auto-clear, export/import, theme, auto-lock, AND the v1.1
 * attachments feature (add / list / thumbnail / unified preview / download /
 * remove, image thumbnails + over-5MB downscale-and-recompress, attachments in
 * the encrypted backup).
 *
 * All crypto goes through EncryptoStore / EncryptoCrypto; attachments through
 * EncryptoAttachments (IndexedDB). This layer never persists plaintext.
 * -----------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var S = window.EncryptoStore;
  var A = window.EncryptoAttachments;

  var AUTO_LOCK_MS = 5 * 60 * 1000;
  var CLIPBOARD_CLEAR_MS = 30 * 1000;
  var MAX_BYTES = A.MAX_BYTES; // 5 MB

  var TYPE_FIELDS = {
    Document: [
      { key: 'docType', label: 'Document type', type: 'text', placeholder: 'Passport, Licence, Policy…' },
      { key: 'number', label: 'Reference / number', type: 'text', secret: true },
      { key: 'expiry', label: 'Expiry (optional)', type: 'text', placeholder: 'YYYY-MM-DD' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    Password: [
      { key: 'username', label: 'Username / email', type: 'text' },
      { key: 'password', label: 'Password', type: 'text', secret: true },
      { key: 'url', label: 'Website (optional)', type: 'text', placeholder: 'https://…' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    Card: [
      { key: 'cardholder', label: 'Cardholder name', type: 'text' },
      { key: 'number', label: 'Card number', type: 'text', secret: true },
      { key: 'expiry', label: 'Expiry', type: 'text', placeholder: 'MM/YY' },
      { key: 'cvv', label: 'CVV', type: 'text', secret: true },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    Note: [
      { key: 'body', label: 'Note', type: 'textarea', secret: true }
    ]
  };
  var TYPE_ICON = { Document: '📄', Password: '🔑', Card: '💳', Note: '📝' };

  function $(id) { return document.getElementById(id); }
  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  var ui = { filterType: 'all', search: '', clipboardTimer: null, idleTimer: null, tickTimer: null, idleDeadline: 0 };

  // When the user previews an attachment, we open it in a new tab — which makes
  // this tab "hidden" and would otherwise trip lock-on-background. We briefly
  // mark the NEXT hide as expected so an intentional in-app preview doesn't lock
  // the vault. Kept short so genuinely walking away still locks normally.
  var expectHideUntil = 0;
  function expectBriefHide() { expectHideUntil = Date.now() + 4000; }

  var attachCounts = {};
  var liveUrls = []; // thumbnail object URLs, revoked on lock
  function trackUrl(u) { liveUrls.push(u); return u; }
  function revokeUrls() { liveUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} }); liveUrls = []; }

  function setScreen(which) {
    ['Setup', 'Unlock', 'Vault'].forEach(function (name) {
      $('screen' + name).classList.toggle('active', name === which);
    });
    $('topbar').hidden = (which !== 'Vault');
  }

  var toastTimer;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  var THEME_KEY = 'encrypto_theme';
  function applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme || ''); }
  function themeLabel(theme) { return 'Theme: ' + (theme === '' ? 'system' : theme) + ' — tap to switch'; }
  function initTheme() {
    var saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch (e) {}
    applyTheme(saved);
    var btn = $('themeBtn');
    if (btn) { btn.setAttribute('aria-label', themeLabel(saved)); btn.title = themeLabel(saved); }
  }
  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    var next = cur === 'dark' ? 'light' : (cur === 'light' ? '' : 'dark');
    applyTheme(next);
    try { next ? localStorage.setItem(THEME_KEY, next) : localStorage.removeItem(THEME_KEY); } catch (e) {}
    var btn = $('themeBtn');
    if (btn) { btn.setAttribute('aria-label', themeLabel(next)); btn.title = themeLabel(next); }
    toast(next === '' ? 'Theme: system' : 'Theme: ' + next);
  }

  function strength(pw) {
    if (!pw) return { score: 0, label: '' };
    var score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (pw.length >= 16) score++;
    if (/[0-9]/.test(pw) && /[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (/(.)\1\1/.test(pw)) score = Math.max(0, score - 1);
    score = Math.min(4, score);
    return { score: score, label: ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][score] };
  }
  function renderStrength(pw) {
    var s = strength(pw);
    var bar = $('setupMeterBar');
    var colors = ['var(--danger)', 'var(--danger)', 'var(--warn)', 'var(--success)', 'var(--success)'];
    bar.style.width = (s.score / 4 * 100) + '%';
    bar.style.background = colors[s.score];
    $('setupMeterLabel').textContent = pw
      ? 'Strength: ' + s.label + (s.score < 2 ? ' — consider a longer phrase.' : '')
      : 'Use a long, memorable phrase — length beats complexity.';
  }

  function wireReveal() {
    document.querySelectorAll('.reveal-btn[data-reveal]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = $(btn.getAttribute('data-reveal'));
        var showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        btn.setAttribute('aria-label', showing ? 'Show passphrase' : 'Hide passphrase');
        btn.textContent = showing ? '👁' : '🙈';
      });
    });
  }

  // ===================== SETUP =====================
  function initSetup() {
    $('setupPass').addEventListener('input', function (e) { renderStrength(e.target.value); });
    $('setupForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('setupError'); err.textContent = '';
      var p1 = $('setupPass').value, p2 = $('setupPass2').value;
      if (p1.length < 8) { err.textContent = 'Use at least 8 characters (longer is better).'; return; }
      if (p1 !== p2) { err.textContent = 'The two passphrases do not match.'; return; }
      if (!$('setupAck').checked) { err.textContent = 'Please acknowledge that there is no recovery.'; return; }
      var btn = $('setupSubmit'); btn.disabled = true; btn.textContent = 'Encrypting…';
      S.setup(p1).then(function () {
        $('setupPass').value = ''; $('setupPass2').value = '';
        openVault('Vault created. Welcome.');
      }).catch(function (ex) { err.textContent = ex.message || 'Could not create the vault.'; })
        .then(function () { btn.disabled = false; btn.textContent = 'Create vault'; });
    });
    $('setupImportBtn').addEventListener('click', triggerImport);
  }

  // ===================== UNLOCK =====================
  function initUnlock() {
    $('unlockForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('unlockError'); err.textContent = '';
      var pass = $('unlockPass').value;
      if (!pass) { err.textContent = 'Enter your passphrase.'; return; }
      var btn = $('unlockSubmit'); btn.disabled = true; btn.textContent = 'Decrypting…';
      S.unlock(pass).then(function () { $('unlockPass').value = ''; openVault('Unlocked.'); })
        .catch(function () { err.textContent = 'Incorrect passphrase, or the stored data has been altered.'; })
        .then(function () { btn.disabled = false; btn.textContent = 'Unlock'; });
    });
    $('unlockImportBtn').addEventListener('click', triggerImport);
  }

  // ===================== VAULT LIST =====================
  function openVault(msg) {
    setScreen('Vault');
    refreshAttachCounts().then(renderList);
    startIdleWatch();
    if (msg) toast(msg);
  }

  function refreshAttachCounts() {
    if (!S.isUnlocked()) return Promise.resolve();
    var key = S.getKey();
    var entries = S.getEntries();
    attachCounts = {};
    return Promise.all(entries.map(function (e) {
      return A.listMeta(e.id, key).then(function (list) { attachCounts[e.id] = list.length; })
        .catch(function () { attachCounts[e.id] = 0; });
    }));
  }

  function matchesSearch(entry, q) {
    if (!q) return true;
    q = q.toLowerCase();
    if ((entry.title || '').toLowerCase().indexOf(q) !== -1) return true;
    if ((entry.type || '').toLowerCase().indexOf(q) !== -1) return true;
    var f = entry.fields || {};
    return Object.keys(f).some(function (k) { return String(f[k] || '').toLowerCase().indexOf(q) !== -1; });
  }

  function subtitleFor(entry) {
    var f = entry.fields || {};
    switch (entry.type) {
      case 'Password': return f.username || f.url || '••••';
      case 'Card': return f.cardholder || (f.number ? '•••• ' + String(f.number).slice(-4) : '••••');
      case 'Document': return f.docType || '••••';
      case 'Note': return 'Secure note';
      default: return '';
    }
  }

  function renderList() {
    if (!S.isUnlocked()) return;
    var list = $('entryList');
    var entries = S.getEntries().filter(function (e) {
      if (ui.filterType !== 'all' && e.type !== ui.filterType) return false;
      return matchesSearch(e, ui.search);
    });
    entries.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });

    if (entries.length === 0) {
      var total = S.getEntries().length;
      list.innerHTML = '<li class="empty"><div class="big" aria-hidden="true">' +
        (total === 0 ? '🗂️' : '🔍') + '</div><div>' +
        (total === 0 ? 'Your vault is empty. Tap <strong>+ Add</strong> to store your first item.'
                     : 'No entries match your search or filter.') + '</div></li>';
      return;
    }

    list.innerHTML = entries.map(function (e) {
      var n = attachCounts[e.id] || 0;
      var clip = n > 0 ? '<span class="entry-clip" title="' + n + ' attachment' + (n === 1 ? '' : 's') + '">📎 ' + n + '</span>' : '';
      return '<li class="entry" tabindex="0" role="button" data-id="' + esc(e.id) + '" ' +
        'aria-label="' + esc(e.title) + ', ' + esc(e.type) + (n ? ', ' + n + ' attachments' : '') + '">' +
        '<span class="type-badge" aria-hidden="true">' + (TYPE_ICON[e.type] || '•') + '</span>' +
        '<div class="entry-main" aria-hidden="true">' +
          '<div class="entry-type">' + esc(e.type) + '</div>' +
          '<div class="entry-title">' + esc(e.title) + '</div>' +
          '<div class="entry-sub">' + esc(subtitleFor(e)) + '</div>' +
        '</div>' + clip + '</li>';
    }).join('');
  }

  function initVaultControls() {
    $('addBtn').addEventListener('click', function () { openEntryModal(null); });
    $('searchInput').addEventListener('input', function (e) { ui.search = e.target.value.trim(); renderList(); });
    $('typeFilters').addEventListener('click', function (e) {
      var btn = e.target.closest('.chip-btn'); if (!btn) return;
      ui.filterType = btn.getAttribute('data-type');
      Array.prototype.forEach.call(this.querySelectorAll('.chip-btn'), function (b) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      renderList();
    });
    $('entryList').addEventListener('click', function (e) {
      var li = e.target.closest('.entry'); if (li) openEntryModal(li.getAttribute('data-id'));
    });
    $('entryList').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var li = e.target.closest('.entry'); if (li) { e.preventDefault(); openEntryModal(li.getAttribute('data-id')); }
    });
    $('lockBtn').addEventListener('click', function () { doLock('Locked.'); });
    $('themeBtn').addEventListener('click', toggleTheme);
    $('menuBtn').addEventListener('click', openMenu);
  }

  // ===================== ENTRY MODAL =====================
  function renderEntryFields(type, values) {
    values = values || {};
    $('entryFields').innerHTML = (TYPE_FIELDS[type] || []).map(function (f) {
      var val = esc(values[f.key] || '');
      if (f.type === 'textarea') {
        return '<div class="field"><label for="f_' + f.key + '">' + esc(f.label) + '</label>' +
          '<textarea id="f_' + f.key + '" data-key="' + f.key + '">' + val + '</textarea></div>';
      }
      var secretCls = f.secret ? ' class="masked"' : '';
      var revealBtn = f.secret ? '<button type="button" class="btn btn-ghost btn-icon reveal-field" aria-label="Show value">👁</button>' : '';
      var copyBtn = (f.secret || f.key === 'username' || f.key === 'url')
        ? '<button type="button" class="btn btn-ghost btn-icon copy-field" aria-label="Copy value" title="Copy (auto-clears in 30s)">📋</button>' : '';
      return '<div class="field"><label for="f_' + f.key + '">' + esc(f.label) + '</label>' +
        '<div class="value-row"><input type="' + (f.secret ? 'password' : 'text') + '" id="f_' + f.key + '"' +
        secretCls + ' data-key="' + f.key + '" data-secret="' + (f.secret ? '1' : '0') + '" autocomplete="off" value="' + val + '" placeholder="' + esc(f.placeholder || '') + '">' +
        revealBtn + copyBtn + '</div></div>';
    }).join('');
    wireFieldButtons();
  }

  function wireFieldButtons() {
    $('entryFields').querySelectorAll('.reveal-field').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = btn.closest('.value-row').querySelector('input');
        var showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        input.classList.toggle('masked', showing);
        btn.textContent = showing ? '👁' : '🙈';
        btn.setAttribute('aria-label', showing ? 'Show value' : 'Hide value');
      });
    });
    $('entryFields').querySelectorAll('.copy-field').forEach(function (btn) {
      btn.addEventListener('click', function () {
        copyWithAutoClear(btn.closest('.value-row').querySelector('input').value);
      });
    });
  }

  var editingId = null;
  var isNewEntry = false;
  function openEntryModal(id) {
    $('entryError').textContent = '';
    var delBtn = $('entryDeleteBtn');
    if (id) {
      var entry = S.getEntries().filter(function (e) { return e.id === id; })[0];
      if (!entry) { toast('Entry not found.'); return; }
      editingId = id; isNewEntry = false;
      $('entryModalTitle').textContent = 'Edit entry';
      $('entryId').value = entry.id;
      $('entryType').value = entry.type;
      $('entryTitle').value = entry.title || '';
      renderEntryFields(entry.type, entry.fields);
      show(delBtn);
    } else {
      // Pre-generate the id so attachments can be added immediately, before the
      // first save. If the user cancels without saving, we clean these up.
      editingId = genId(); isNewEntry = true;
      $('entryModalTitle').textContent = 'Add entry';
      $('entryId').value = editingId;
      $('entryType').value = 'Document';
      $('entryTitle').value = '';
      renderEntryFields('Document', {});
      hide(delBtn);
    }
    setupAttachSection(editingId);
    openModal('entryModalBackdrop');
    setTimeout(function () { $('entryTitle').focus(); }, 50);
  }

  function discardUnsavedEntry() {
    if (isNewEntry && editingId) {
      var orphanId = editingId;
      A.removeForEntry(orphanId).catch(function () {}).then(function () {
        return refreshAttachCounts();
      }).then(renderList);
    }
    isNewEntry = false;
    editingId = null;
  }

  function collectFields(type) {
    var out = {};
    (TYPE_FIELDS[type] || []).forEach(function (f) {
      var el = document.getElementById('f_' + f.key);
      if (el) out[f.key] = el.value;
    });
    return out;
  }

  function initEntryModal() {
    $('entryType').addEventListener('change', function () { renderEntryFields(this.value, {}); });
    $('entryCloseBtn').addEventListener('click', function () { discardUnsavedEntry(); closeModal('entryModalBackdrop'); });
    $('entryCancelBtn').addEventListener('click', function () { discardUnsavedEntry(); closeModal('entryModalBackdrop'); });

    $('entryForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('entryError'); err.textContent = '';
      var type = $('entryType').value;
      var title = $('entryTitle').value.trim();
      if (!title) { err.textContent = 'Please give this entry a title.'; return; }
      var fields = collectFields(type);
      var now = Date.now();
      var entries = S.getEntries();
      var wasNew = isNewEntry;
      var existing = entries.filter(function (en) { return en.id === editingId; })[0];
      if (existing) {
        entries = entries.map(function (en) {
          if (en.id !== editingId) return en;
          return { id: en.id, type: type, title: title, fields: fields, tags: en.tags || [], createdAt: en.createdAt || now, updatedAt: now };
        });
      } else {
        entries.push({ id: editingId, type: type, title: title, fields: fields, tags: [], createdAt: now, updatedAt: now });
      }
      var btn = $('entrySaveBtn'); btn.disabled = true; btn.textContent = 'Saving…';
      S.setEntries(entries).then(function () {
        isNewEntry = false;
        closeModal('entryModalBackdrop');
        return refreshAttachCounts();
      }).then(function () {
        renderList();
        toast(wasNew ? 'Entry added.' : 'Entry updated.');
      }).catch(function (ex) { err.textContent = ex.message || 'Could not save.'; })
        .then(function () { btn.disabled = false; btn.textContent = 'Save'; });
    });

    $('entryDeleteBtn').addEventListener('click', function () {
      if (!editingId) return;
      if (!confirm('Delete this entry and its attachments permanently? This cannot be undone.')) return;
      var id = editingId;
      var entries = S.getEntries().filter(function (en) { return en.id !== id; });
      S.setEntries(entries).then(function () {
        return A.removeForEntry(id).catch(function () {});
      }).then(function () {
        closeModal('entryModalBackdrop');
        return refreshAttachCounts();
      }).then(function () { renderList(); toast('Entry deleted.'); })
        .catch(function (ex) { $('entryError').textContent = ex.message || 'Could not delete.'; });
    });
  }

  function genId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // ===================== ATTACHMENTS (v1.1) =====================
  function setupAttachSection(entryId) {
    $('attachAddBtn').disabled = false;
    $('attachHint').textContent = 'Attach scans, photos or PDFs. Each file is encrypted with your vault key.';
    $('attachList').innerHTML = '';
    renderAttachList(entryId);
  }

  function renderAttachList(entryId) {
    var key = S.getKey();
    var list = $('attachList');
    return A.listMeta(entryId, key).then(function (items) {
      if (!items.length) { list.innerHTML = ''; return; }
      list.innerHTML = '';
      items.forEach(function (m) {
        var li = document.createElement('li');
        li.className = 'attach-item';
        li.innerHTML =
          '<span class="attach-thumb" data-id="' + esc(m.id) + '">' + (isImage(m.mimeType) ? '' : fileGlyph(m.mimeType)) + '</span>' +
          '<span class="attach-meta"><span class="attach-name">' + esc(m.name) + '</span>' +
          '<span class="attach-size">' + fmtSize(m.size) + '</span></span>' +
          '<span class="attach-actions">' +
            '<button type="button" class="btn btn-ghost btn-icon act-view" data-id="' + esc(m.id) + '" aria-label="Preview in a new tab" title="Preview">👁</button>' +
            '<button type="button" class="btn btn-ghost btn-icon act-dl" data-id="' + esc(m.id) + '" aria-label="Download / save" title="Download">⬇</button>' +
            '<button type="button" class="btn btn-ghost btn-icon act-del" data-id="' + esc(m.id) + '" aria-label="Remove attachment" title="Remove">🗑</button>' +
          '</span>';
        list.appendChild(li);
        if (isImage(m.mimeType)) loadThumb(m.id, li.querySelector('.attach-thumb'));
      });
      list.querySelectorAll('.act-view').forEach(function (b) {
        b.addEventListener('click', function () { previewAttachment(b.getAttribute('data-id')); });
      });
      list.querySelectorAll('.act-dl').forEach(function (b) {
        b.addEventListener('click', function () { downloadAttachment(b.getAttribute('data-id')); });
      });
      list.querySelectorAll('.act-del').forEach(function (b) {
        b.addEventListener('click', function () { removeAttachment(b.getAttribute('data-id'), entryId); });
      });
    }).catch(function (ex) { toast(ex.message || 'Could not list attachments.'); });
  }

  function isImage(mime) { return /^image\//.test(mime || ''); }
  function fileGlyph(mime) {
    if (/pdf/.test(mime)) return '📕';
    if (/word|document/.test(mime)) return '📘';
    if (/sheet|excel/.test(mime)) return '📗';
    if (/^text\//.test(mime)) return '📄';
    return '📎';
  }

  function loadThumb(id, el) {
    var key = S.getKey();
    A.getBytes(id, key).then(function (file) {
      var url = trackUrl(URL.createObjectURL(new Blob([file.bytes], { type: file.mimeType })));
      var img = new Image();
      img.alt = file.name; img.src = url;
      el.innerHTML = ''; el.appendChild(img);
    }).catch(function () { el.textContent = '🖼'; });
  }

  function setBusy(on) { var b = $('attachBusy'); if (b) b.hidden = !on; $('attachAddBtn').disabled = on; }

  function initAttachments() {
    $('attachAddBtn').addEventListener('click', function () { $('attachFile').click(); });
    $('attachFile').addEventListener('change', onAttachFile);
  }

  function onAttachFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !editingId) return;
    var entryId = editingId;
    setBusy(true);
    prepareFile(file).then(function (prepared) {
      if (!prepared) { setBusy(false); return; }
      var key = S.getKey();
      return A.add(entryId, prepared, key).then(function () {
        return renderAttachList(entryId);
      }).then(function () {
        return refreshAttachCounts();
      }).then(function () {
        renderList();
        toast('Attachment added.');
      });
    }).catch(function (ex) {
      toast(ex.message || 'Could not add the file.');
    }).then(function () { setBusy(false); });
  }

  function prepareFile(file) {
    if (file.size <= MAX_BYTES) {
      return fileToBytes(file).then(function (bytes) {
        return { name: file.name, mimeType: file.type || 'application/octet-stream', bytes: bytes };
      });
    }
    if (isImage(file.type)) {
      var ok = confirm(
        'This image is ' + fmtSize(file.size) + ', over the 5 MB limit.\n\n' +
        'OK = compress it to fit under 5 MB\nCancel = choose a smaller file instead'
      );
      if (!ok) return Promise.resolve(null);
      return compressImageUnder(file, MAX_BYTES).then(function (out) {
        var proceed = confirm(
          'Compressed: ' + fmtSize(file.size) + '  →  ' + fmtSize(out.bytes.length) +
          '\n(' + out.width + '×' + out.height + ', quality ' + Math.round(out.quality * 100) + '%)\n\n' +
          'OK = attach the compressed image\nCancel = don\u2019t attach'
        );
        if (!proceed) return null;
        return { name: renameExt(file.name, out.ext), mimeType: out.mimeType, bytes: out.bytes };
      });
    }
    alert('This file is ' + fmtSize(file.size) + ', over the 5 MB limit. ' +
          'Non-image files can\u2019t be compressed here — please choose a smaller file.');
    return Promise.resolve(null);
  }

  function renameExt(name, ext) {
    if (!ext) return name;
    return name.replace(/\.[^.]+$/, '') + '.' + ext;
  }

  function fileToBytes(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(new Uint8Array(r.result)); };
      r.onerror = function () { reject(new Error('Could not read the file.')); };
      r.readAsArrayBuffer(file);
    });
  }

  function compressImageUnder(file, maxBytes) {
    return loadImage(file).then(function (img) {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var mimeType = 'image/jpeg';
      var ext = 'jpg';
      function attempt(scale, quality) {
        var w = Math.max(1, Math.round(img.naturalWidth * scale));
        var h = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.width = w; canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        return new Promise(function (resolve) {
          canvas.toBlob(function (blob) { resolve({ blob: blob, w: w, h: h, quality: quality }); }, mimeType, quality);
        });
      }
      var scales = [1, 0.85, 0.7, 0.55, 0.4, 0.3];
      var qualities = [0.82, 0.7, 0.6, 0.5];
      var chain = Promise.resolve(null);
      scales.forEach(function (sc) {
        qualities.forEach(function (q) {
          chain = chain.then(function (done) {
            if (done) return done;
            return attempt(sc, q).then(function (res) {
              if (res.blob && res.blob.size <= maxBytes) return res;
              return null;
            });
          });
        });
      });
      return chain.then(function (res) {
        if (!res) throw new Error('Could not compress this image under 5 MB — please choose a smaller one.');
        return blobToBytes(res.blob).then(function (bytes) {
          return { bytes: bytes, mimeType: mimeType, ext: ext, width: res.w, height: res.h, quality: res.quality };
        });
      });
    });
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read this image.')); };
      img.src = url;
    });
  }
  function blobToBytes(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(new Uint8Array(r.result)); };
      r.onerror = function () { reject(new Error('Could not process the compressed image.')); };
      r.readAsArrayBuffer(blob);
    });
  }

  // Unified preview: decrypt → object URL → open in a new tab. The browser
  // renders what it can (images, PDFs, text); unpreviewable types will offer a
  // download. Same path for every file type.
  function previewAttachment(id) {
    var key = S.getKey();
    expectBriefHide(); // intentional in-app preview, not "walking away"
    A.getBytes(id, key).then(function (file) {
      var url = URL.createObjectURL(new Blob([file.bytes], { type: file.mimeType }));
      var win = window.open(url, '_blank');
      if (!win) {
        toast('Preview was blocked — downloading instead.');
        downloadBlob(new Blob([file.bytes], { type: file.mimeType }), file.name);
      }
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 60000);
    }).catch(function (ex) { toast(ex.message || 'Could not open the attachment.'); });
  }

  function downloadAttachment(id) {
    var key = S.getKey();
    A.getBytes(id, key).then(function (file) {
      deliverFile(new Blob([file.bytes], { type: file.mimeType }), file.name);
    }).catch(function (ex) { toast(ex.message || 'Could not download the attachment.'); });
  }

  function removeAttachment(id, entryId) {
    if (!confirm('Remove this attachment? This cannot be undone.')) return;
    A.remove(id).then(function () { return renderAttachList(entryId); })
      .then(refreshAttachCounts).then(function () { renderList(); toast('Attachment removed.'); })
      .catch(function (ex) { toast(ex.message || 'Could not remove.'); });
  }

  // Adaptive delivery: share sheet on touch/mobile where available, else download.
  function deliverFile(blob, name) {
    var file;
    try { file = new File([blob], name, { type: blob.type }); } catch (e) { file = null; }
    var canShareFiles = file && navigator.canShare && navigator.canShare({ files: [file] });
    var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (canShareFiles && touch && navigator.share) {
      navigator.share({ files: [file], title: name }).catch(function () { downloadBlob(blob, name); });
    } else {
      downloadBlob(blob, name);
    }
  }

  // ===================== COPY w/ auto-clear =====================
  function copyWithAutoClear(value) {
    if (value == null || value === '') { toast('Nothing to copy.'); return; }
    writeClipboard(value).then(function () {
      toast('Copied — clears in 30s');
      clearTimeout(ui.clipboardTimer);
      ui.clipboardTimer = setTimeout(function () {
        writeClipboard(' ').then(function () { return writeClipboard(''); }).catch(function () {});
      }, CLIPBOARD_CLEAR_MS);
    }).catch(function () { toast('Copy not available — select and copy manually.'); });
  }
  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', '');
        ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
        var ok = document.execCommand('copy'); document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('copy failed'));
      } catch (e) { reject(e); }
    });
  }

  // ===================== AUTO-LOCK =====================
  function startIdleWatch() {
    resetIdle();
    ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach(function (ev) {
      window.addEventListener(ev, resetIdle, { passive: true });
    });
    document.addEventListener('visibilitychange', onVisibility);
    clearInterval(ui.tickTimer);
    ui.tickTimer = setInterval(updateLockTimer, 1000);
  }
  function stopIdleWatch() {
    ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach(function (ev) {
      window.removeEventListener(ev, resetIdle);
    });
    document.removeEventListener('visibilitychange', onVisibility);
    clearTimeout(ui.idleTimer); clearInterval(ui.tickTimer);
    $('lockTimer').textContent = '';
  }
  function resetIdle() {
    if (!S.isUnlocked()) return;
    clearTimeout(ui.idleTimer);
    ui.idleDeadline = Date.now() + AUTO_LOCK_MS;
    ui.idleTimer = setTimeout(function () { doLock('Locked after inactivity.'); }, AUTO_LOCK_MS);
  }
  function onVisibility() {
    if (document.visibilityState !== 'hidden' || !S.isUnlocked()) return;
    // An in-app preview just opened a new tab — don't treat that one hide as
    // "walked away". Consume the grace window so it only applies once.
    if (Date.now() < expectHideUntil) { expectHideUntil = 0; return; }
    doLock(null);
  }
  function updateLockTimer() {
    if (!S.isUnlocked()) { $('lockTimer').textContent = ''; return; }
    var remain = Math.max(0, ui.idleDeadline - Date.now());
    var m = Math.floor(remain / 60000), s = Math.floor((remain % 60000) / 1000);
    $('lockTimer').textContent = 'Locks in ' + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function doLock(msg) {
    clearTimeout(ui.clipboardTimer);
    stopIdleWatch();
    if (isNewEntry) { discardUnsavedEntry(); }
    closeModal('entryModalBackdrop'); closeModal('menuModalBackdrop');
    $('entryFields').innerHTML = ''; $('attachList').innerHTML = '';
    revokeUrls();
    $('searchInput').value = ''; ui.search = '';
    S.lock();
    setScreen('Unlock');
    setTimeout(function () { $('unlockPass').focus(); }, 50);
    if (msg) toast(msg);
  }

  // ===================== EXPORT / IMPORT (with attachments) =====================
  function initBackup() {
    $('menuCloseBtn').addEventListener('click', function () { closeModal('menuModalBackdrop'); });
    $('exportBtn').addEventListener('click', doExport);
    $('importBtn').addEventListener('click', triggerImport);
    $('wipeBtn').addEventListener('click', doWipe);
    $('importFile').addEventListener('change', onImportFile);
  }
  function openMenu() { openModal('menuModalBackdrop'); }

  function doExport() {
    try {
      var backup = S.exportBackup();
      A.exportAll().then(function (atts) {
        backup.attachments = atts;
        var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        downloadBlob(blob, 'encrypto-backup-' + new Date().toISOString().slice(0, 10) + '.json');
        var note = atts.length ? (' (incl. ' + atts.length + ' attachment' + (atts.length === 1 ? '' : 's') + ')') : '';
        toast('Encrypted backup downloaded' + note + '.');
      }).catch(function (ex) { toast(ex.message || 'Export failed.'); });
    } catch (ex) { toast(ex.message || 'Export failed.'); }
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function triggerImport() { $('importFile').click(); }

  function onImportFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var envelope;
      try { envelope = JSON.parse(reader.result); }
      catch (ex) { toast('That file is not valid JSON.'); return; }
      if (S.exists() && !confirm(
        'Importing will REPLACE the vault (and attachments) currently on this device. ' +
        'You will need the imported backup\u2019s passphrase to open it. Continue?'
      )) return;
      S.importBackup(envelope, { overwrite: true }).then(function () {
        var atts = Array.isArray(envelope.attachments) ? envelope.attachments : [];
        return A.importAll(atts, { clear: true });
      }).then(function () {
        closeModal('menuModalBackdrop');
        toast('Backup imported. Unlock with its passphrase.');
        route();
      }).catch(function (ex) { toast(ex.message || 'Import failed.'); });
    };
    reader.onerror = function () { toast('Could not read that file.'); };
    reader.readAsText(file);
  }

  function doWipe() {
    if (!confirm('Delete the entire vault AND attachments from this device? This is PERMANENT and cannot be undone. Make sure you have an export if you still need the data.')) return;
    if (!confirm('Last chance — really delete everything?')) return;
    S.wipe();
    A.clearAll().catch(function () {}).then(function () {
      closeModal('menuModalBackdrop');
      stopIdleWatch();
      toast('Vault deleted from this device.');
      route();
    });
  }

  // ===================== MODAL plumbing =====================
  var lastFocused = null;
  var FOCUSABLE = 'a[href],button:not([disabled]),textarea,input:not([disabled]),select,[tabindex]:not([tabindex="-1"])';
  function focusables(container) {
    return Array.prototype.filter.call(container.querySelectorAll(FOCUSABLE),
      function (el) { return el.offsetParent !== null && !el.hidden; });
  }
  function openModal(backdropId) {
    lastFocused = document.activeElement;
    var bd = $(backdropId); bd.classList.add('open');
    document.addEventListener('keydown', escClose);
    document.addEventListener('keydown', trapTab, true);
    bd.addEventListener('mousedown', backdropClose);
    setTimeout(function () { var f = focusables(bd); if (f.length) f[0].focus(); }, 60);
  }
  function closeModal(backdropId) {
    var bd = $(backdropId);
    if (!bd.classList.contains('open')) return;
    bd.classList.remove('open');
    bd.removeEventListener('mousedown', backdropClose);
    if (!document.querySelector('.modal-backdrop.open')) {
      document.removeEventListener('keydown', trapTab, true);
      document.removeEventListener('keydown', escClose);
    }
    if (lastFocused && lastFocused.focus) try { lastFocused.focus(); } catch (e) {}
  }
  function escClose(e) {
    if (e.key !== 'Escape') return;
    if ($('entryModalBackdrop').classList.contains('open')) discardUnsavedEntry();
    closeModal('entryModalBackdrop'); closeModal('menuModalBackdrop');
  }
  function backdropClose(e) {
    if (!e.target.classList.contains('modal-backdrop')) return;
    if (e.target.id === 'entryModalBackdrop') discardUnsavedEntry();
    closeModal(e.target.id);
  }
  function trapTab(e) {
    if (e.key !== 'Tab') return;
    var open = document.querySelector('.modal-backdrop.open'); if (!open) return;
    var f = focusables(open); if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!open.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }

  // ===================== ROUTING / BOOT =====================
  function route() {
    if (!window.crypto || !window.crypto.subtle || !window.isSecureContext) {
      setScreen('Unlock');
      $('unlockError').textContent = 'Encrypto needs a secure context (HTTPS or localhost) with Web Crypto. It will not run here.';
      $('unlockSubmit').disabled = true;
      return;
    }
    if (S.exists()) { setScreen('Unlock'); setTimeout(function () { $('unlockPass').focus(); }, 50); }
    else { setScreen('Setup'); setTimeout(function () { $('setupPass').focus(); }, 50); }
  }

  function boot() {
    var vt = $('verTag'); if (vt) vt.textContent = 'v' + S.APP_VERSION; // from the single source of truth
    initTheme(); wireReveal(); initSetup(); initUnlock();
    initVaultControls(); initEntryModal(); initAttachments(); initBackup();
    route();
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
