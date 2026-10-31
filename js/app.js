/*
 * Encrypto — app.js
 * -----------------------------------------------------------------------------
 * The UI controller. Wires the gate (setup/unlock), vault list, entry modal,
 * search/filter, copy-with-auto-clear, export/import, theme, and auto-lock.
 * All crypto goes through EncryptoStore -> EncryptoCrypto; this layer never
 * touches crypto.subtle directly and never persists plaintext.
 * -----------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var S = window.EncryptoStore;
  var APP_VERSION = S.APP_VERSION;

  // --- Agreed defaults ------------------------------------------------------
  var AUTO_LOCK_MS = 5 * 60 * 1000;   // 5 minutes idle
  var CLIPBOARD_CLEAR_MS = 30 * 1000; // 30 seconds

  // --- Type field definitions -----------------------------------------------
  // field: { key, label, type, secret?, placeholder? }
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

  // --- DOM helpers ----------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // --- App state (view only; the vault lives in the store) ------------------
  var ui = {
    filterType: 'all',
    search: '',
    revealClearTimer: null,
    clipboardTimer: null,
    idleTimer: null,
    tickTimer: null,
    idleDeadline: 0
  };

  // --- Screens --------------------------------------------------------------
  function setScreen(which) {
    ['Setup', 'Unlock', 'Vault'].forEach(function (name) {
      $('screen' + name).classList.toggle('active', name === which);
    });
    var unlocked = which === 'Vault';
    $('topbar').hidden = !unlocked;
  }

  // --- Toast ----------------------------------------------------------------
  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  // --- Theme ----------------------------------------------------------------
  var THEME_KEY = 'encrypto_theme';
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme || '');
  }
  function initTheme() {
    var saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch (e) {}
    applyTheme(saved);
    var btn = $('themeBtn');
    if (btn) { btn.setAttribute('aria-label', themeLabel(saved)); btn.title = themeLabel(saved); }
  }
  function themeLabel(theme) {
    var name = theme === '' ? 'system' : theme;
    return 'Theme: ' + name + ' — tap to switch';
  }
  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    // cycle: system -> dark -> light -> system
    var next = cur === 'dark' ? 'light' : (cur === 'light' ? '' : 'dark');
    applyTheme(next);
    try { next ? localStorage.setItem(THEME_KEY, next) : localStorage.removeItem(THEME_KEY); } catch (e) {}
    var btn = $('themeBtn');
    if (btn) { btn.setAttribute('aria-label', themeLabel(next)); btn.title = themeLabel(next); }
    toast(next === '' ? 'Theme: system' : 'Theme: ' + next);
  }

  // --- Passphrase strength (zxcvbn-lite heuristic, no dependency) -----------
  function strength(pw) {
    if (!pw) return { score: 0, label: '' };
    var score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (pw.length >= 16) score++;
    if (/[0-9]/.test(pw) && /[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (/(.)\1\1/.test(pw)) score = Math.max(0, score - 1); // repeats
    score = Math.min(4, score);
    var labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
    return { score: score, label: labels[score] };
  }
  function renderStrength(pw) {
    var s = strength(pw);
    var bar = $('setupMeterBar');
    var colors = ['var(--danger)', 'var(--danger)', 'var(--warn)', 'var(--success)', 'var(--success)'];
    bar.style.width = (s.score / 4 * 100) + '%';
    bar.style.background = colors[s.score];
    if (pw) $('setupMeterLabel').textContent = 'Strength: ' + s.label +
      (s.score < 2 ? ' — consider a longer phrase.' : '');
    else $('setupMeterLabel').textContent = 'Use a long, memorable phrase — length beats complexity.';
  }

  // --- Reveal toggle for passphrase inputs ----------------------------------
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

  // ==========================================================================
  //  SETUP
  // ==========================================================================
  function initSetup() {
    $('setupPass').addEventListener('input', function (e) { renderStrength(e.target.value); });
    $('setupForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('setupError'); err.textContent = '';
      var p1 = $('setupPass').value;
      var p2 = $('setupPass2').value;
      if (p1.length < 8) { err.textContent = 'Use at least 8 characters (longer is better).'; return; }
      if (p1 !== p2) { err.textContent = 'The two passphrases do not match.'; return; }
      if (!$('setupAck').checked) { err.textContent = 'Please acknowledge that there is no recovery.'; return; }

      var btn = $('setupSubmit'); btn.disabled = true; btn.textContent = 'Encrypting…';
      S.setup(p1).then(function () {
        // clear the inputs immediately — don't leave the passphrase in the DOM
        $('setupPass').value = ''; $('setupPass2').value = '';
        openVault('Vault created. Welcome.');
      }).catch(function (ex) {
        err.textContent = ex.message || 'Could not create the vault.';
      }).then(function () {
        btn.disabled = false; btn.textContent = 'Create vault';
      });
    });
    $('setupImportBtn').addEventListener('click', triggerImport);
  }

  // ==========================================================================
  //  UNLOCK
  // ==========================================================================
  function initUnlock() {
    $('unlockForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('unlockError'); err.textContent = '';
      var pass = $('unlockPass').value;
      if (!pass) { err.textContent = 'Enter your passphrase.'; return; }
      var btn = $('unlockSubmit'); btn.disabled = true; btn.textContent = 'Decrypting…';
      S.unlock(pass).then(function () {
        $('unlockPass').value = '';
        openVault('Unlocked.');
      }).catch(function (ex) {
        // generic message — do not distinguish wrong-passphrase from tamper
        err.textContent = 'Incorrect passphrase, or the stored data has been altered.';
      }).then(function () {
        btn.disabled = false; btn.textContent = 'Unlock';
      });
    });
    $('unlockImportBtn').addEventListener('click', triggerImport);
  }

  // ==========================================================================
  //  VAULT (list / search / filter)
  // ==========================================================================
  function openVault(msg) {
    setScreen('Vault');
    renderList();
    startIdleWatch();
    if (msg) toast(msg);
  }

  function matchesSearch(entry, q) {
    if (!q) return true;
    q = q.toLowerCase();
    if ((entry.title || '').toLowerCase().indexOf(q) !== -1) return true;
    if ((entry.type || '').toLowerCase().indexOf(q) !== -1) return true;
    // search decrypted field values too (we're in-memory already)
    var f = entry.fields || {};
    return Object.keys(f).some(function (k) {
      return String(f[k] || '').toLowerCase().indexOf(q) !== -1;
    });
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
    // newest first
    entries.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });

    if (entries.length === 0) {
      var total = S.getEntries().length;
      list.innerHTML = '<li class="empty">' +
        '<div class="big" aria-hidden="true">' + (total === 0 ? '🗂️' : '🔍') + '</div>' +
        '<div>' + (total === 0
          ? 'Your vault is empty. Tap <strong>+ Add</strong> to store your first item.'
          : 'No entries match your search or filter.') + '</div></li>';
      return;
    }

    list.innerHTML = entries.map(function (e) {
      return '<li class="entry" tabindex="0" role="button" data-id="' + esc(e.id) + '" ' +
        'aria-label="' + esc(e.title) + ', ' + esc(e.type) + '">' +
        '<span class="type-badge" aria-hidden="true">' + (TYPE_ICON[e.type] || '•') + '</span>' +
        '<div class="entry-main" aria-hidden="true">' +
          '<div class="entry-type">' + esc(e.type) + '</div>' +
          '<div class="entry-title">' + esc(e.title) + '</div>' +
          '<div class="entry-sub">' + esc(subtitleFor(e)) + '</div>' +
        '</div></li>';
    }).join('');
  }

  function initVaultControls() {
    $('addBtn').addEventListener('click', function () { openEntryModal(null); });

    $('searchInput').addEventListener('input', function (e) {
      ui.search = e.target.value.trim();
      renderList();
    });

    $('typeFilters').addEventListener('click', function (e) {
      var btn = e.target.closest('.chip-btn');
      if (!btn) return;
      ui.filterType = btn.getAttribute('data-type');
      Array.prototype.forEach.call(this.querySelectorAll('.chip-btn'), function (b) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      renderList();
    });

    // open an entry (click or keyboard)
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

  // ==========================================================================
  //  ENTRY MODAL (create / edit / delete)
  // ==========================================================================
  function renderEntryFields(type, values) {
    values = values || {};
    var defs = TYPE_FIELDS[type] || [];
    $('entryFields').innerHTML = defs.map(function (f) {
      var val = esc(values[f.key] || '');
      if (f.type === 'textarea') {
        return '<div class="field"><label for="f_' + f.key + '">' + esc(f.label) + '</label>' +
          '<textarea id="f_' + f.key + '" data-key="' + f.key + '">' + val + '</textarea></div>';
      }
      var secretCls = f.secret ? ' class="masked"' : '';
      var revealBtn = f.secret
        ? '<button type="button" class="btn btn-ghost btn-icon reveal-field" aria-label="Show value">👁</button>'
        : '';
      var copyBtn = (f.secret || f.key === 'username' || f.key === 'url')
        ? '<button type="button" class="btn btn-ghost btn-icon copy-field" aria-label="Copy value" title="Copy (auto-clears in 30s)">📋</button>'
        : '';
      return '<div class="field"><label for="f_' + f.key + '">' + esc(f.label) + '</label>' +
        '<div class="value-row"><input type="' + (f.secret ? 'password' : 'text') + '" id="f_' + f.key + '"' +
        secretCls + ' data-key="' + f.key + '" data-secret="' + (f.secret ? '1' : '0') + '" ' +
        'autocomplete="off" value="' + val + '" placeholder="' + esc(f.placeholder || '') + '">' +
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
        var input = btn.closest('.value-row').querySelector('input');
        copyWithAutoClear(input.value);
      });
    });
  }

  var editingId = null;
  function openEntryModal(id) {
    editingId = id;
    var titleEl = $('entryModalTitle');
    var delBtn = $('entryDeleteBtn');
    $('entryError').textContent = '';
    if (id) {
      var entry = S.getEntries().filter(function (e) { return e.id === id; })[0];
      if (!entry) { toast('Entry not found.'); return; }
      titleEl.textContent = 'Edit entry';
      $('entryId').value = entry.id;
      $('entryType').value = entry.type;
      $('entryTitle').value = entry.title || '';
      renderEntryFields(entry.type, entry.fields);
      show(delBtn);
    } else {
      titleEl.textContent = 'Add entry';
      $('entryId').value = '';
      $('entryType').value = 'Document';
      $('entryTitle').value = '';
      renderEntryFields('Document', {});
      hide(delBtn);
    }
    openModal('entryModalBackdrop');
    setTimeout(function () { $('entryTitle').focus(); }, 50);
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
    $('entryType').addEventListener('change', function () {
      // preserve title; swap the field set
      renderEntryFields(this.value, {});
    });
    $('entryCloseBtn').addEventListener('click', function () { closeModal('entryModalBackdrop'); });
    $('entryCancelBtn').addEventListener('click', function () { closeModal('entryModalBackdrop'); });

    $('entryForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('entryError'); err.textContent = '';
      var type = $('entryType').value;
      var title = $('entryTitle').value.trim();
      if (!title) { err.textContent = 'Please give this entry a title.'; return; }
      var fields = collectFields(type);
      var now = Date.now();
      var entries = S.getEntries();

      if (editingId) {
        entries = entries.map(function (en) {
          if (en.id !== editingId) return en;
          return { id: en.id, type: type, title: title, fields: fields,
                   tags: en.tags || [], createdAt: en.createdAt || now, updatedAt: now };
        });
      } else {
        entries.push({ id: genId(), type: type, title: title, fields: fields,
                       tags: [], createdAt: now, updatedAt: now });
      }

      var btn = $('entrySaveBtn'); btn.disabled = true; btn.textContent = 'Saving…';
      S.setEntries(entries).then(function () {
        closeModal('entryModalBackdrop');
        renderList();
        toast(editingId ? 'Entry updated.' : 'Entry added.');
      }).catch(function (ex) {
        err.textContent = ex.message || 'Could not save.';
      }).then(function () {
        btn.disabled = false; btn.textContent = 'Save';
      });
    });

    $('entryDeleteBtn').addEventListener('click', function () {
      if (!editingId) return;
      if (!confirm('Delete this entry permanently? This cannot be undone.')) return;
      var entries = S.getEntries().filter(function (en) { return en.id !== editingId; });
      S.setEntries(entries).then(function () {
        closeModal('entryModalBackdrop');
        renderList();
        toast('Entry deleted.');
      }).catch(function (ex) { $('entryError').textContent = ex.message || 'Could not delete.'; });
    });
  }

  function genId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // ==========================================================================
  //  COPY with auto-clear (iOS-PWA aware)
  // ==========================================================================
  function copyWithAutoClear(value) {
    if (value == null || value === '') { toast('Nothing to copy.'); return; }
    writeClipboard(value).then(function () {
      toast('Copied — clears in 30s');
      clearTimeout(ui.clipboardTimer);
      ui.clipboardTimer = setTimeout(function () {
        // best-effort clear; overwrite with a space then empty
        writeClipboard(' ').then(function () { return writeClipboard(''); }).catch(function () {});
      }, CLIPBOARD_CLEAR_MS);
    }).catch(function () {
      toast('Copy not available — select and copy manually.');
    });
  }

  // Prefer async Clipboard API; fall back to a hidden textarea + execCommand,
  // which is more reliable in some standalone iOS PWA contexts.
  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select(); ta.setSelectionRange(0, text.length);
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('copy failed'));
      } catch (e) { reject(e); }
    });
  }

  // ==========================================================================
  //  AUTO-LOCK (idle + tab hidden) + key wipe
  // ==========================================================================
  function startIdleWatch() {
    resetIdle();
    ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach(function (ev) {
      window.addEventListener(ev, resetIdle, { passive: true });
    });
    document.addEventListener('visibilitychange', onVisibility);
    // countdown ticker on the topbar
    clearInterval(ui.tickTimer);
    ui.tickTimer = setInterval(updateLockTimer, 1000);
  }

  function stopIdleWatch() {
    ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach(function (ev) {
      window.removeEventListener(ev, resetIdle);
    });
    document.removeEventListener('visibilitychange', onVisibility);
    clearTimeout(ui.idleTimer);
    clearInterval(ui.tickTimer);
    $('lockTimer').textContent = '';
  }

  function resetIdle() {
    if (!S.isUnlocked()) return;
    clearTimeout(ui.idleTimer);
    ui.idleDeadline = Date.now() + AUTO_LOCK_MS;
    ui.idleTimer = setTimeout(function () { doLock('Locked after inactivity.'); }, AUTO_LOCK_MS);
  }

  function onVisibility() {
    // Lock as soon as the tab is hidden/backgrounded (phone home, tab switch).
    if (document.visibilityState === 'hidden' && S.isUnlocked()) {
      doLock(null);
    }
  }

  function updateLockTimer() {
    if (!S.isUnlocked()) { $('lockTimer').textContent = ''; return; }
    var remain = Math.max(0, ui.idleDeadline - Date.now());
    var m = Math.floor(remain / 60000);
    var s = Math.floor((remain % 60000) / 1000);
    $('lockTimer').textContent = 'Locks in ' + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function doLock(msg) {
    // wipe timers + sensitive UI, then drop the key via the store
    clearTimeout(ui.clipboardTimer);
    stopIdleWatch();
    closeModal('entryModalBackdrop');
    closeModal('menuModalBackdrop');
    $('entryFields').innerHTML = '';
    $('searchInput').value = ''; ui.search = '';
    S.lock();
    setScreen('Unlock');
    setTimeout(function () { $('unlockPass').focus(); }, 50);
    if (msg) toast(msg);
  }

  // ==========================================================================
  //  EXPORT / IMPORT
  // ==========================================================================
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
      var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      var stamp = new Date().toISOString().slice(0, 10);
      var name = 'encrypto-backup-' + stamp + '.json';
      downloadBlob(blob, name);
      toast('Encrypted backup downloaded.');
    } catch (ex) {
      toast(ex.message || 'Export failed.');
    }
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function triggerImport() { $('importFile').click(); }

  function onImportFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-selecting same file
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var envelope;
      try { envelope = JSON.parse(reader.result); }
      catch (ex) { toast('That file is not valid JSON.'); return; }

      var hasExisting = S.exists();
      if (hasExisting && !confirm(
        'Importing will REPLACE the vault currently on this device. ' +
        'You will need the imported backup\u2019s passphrase to open it. Continue?'
      )) return;

      S.importBackup(envelope, { overwrite: true }).then(function () {
        closeModal('menuModalBackdrop');
        toast('Backup imported. Unlock with its passphrase.');
        route(); // -> unlock screen
      }).catch(function (ex) {
        toast(ex.message || 'Import failed.');
      });
    };
    reader.onerror = function () { toast('Could not read that file.'); };
    reader.readAsText(file);
  }

  function doWipe() {
    if (!confirm(
      'Delete the entire vault from this device? This is PERMANENT and cannot be undone. ' +
      'Make sure you have an export if you still need the data.'
    )) return;
    if (!confirm('Last chance — really delete everything?')) return;
    try {
      S.wipe();
      closeModal('menuModalBackdrop');
      stopIdleWatch();
      toast('Vault deleted from this device.');
      route(); // -> setup screen
    } catch (ex) { toast(ex.message || 'Could not delete the vault.'); }
  }

  // ==========================================================================
  //  MODAL plumbing (with focus trap for keyboard a11y)
  // ==========================================================================
  var lastFocused = null;
  var FOCUSABLE = 'a[href],button:not([disabled]),textarea,input:not([disabled]),select,[tabindex]:not([tabindex="-1"])';

  function focusables(container) {
    return Array.prototype.filter.call(
      container.querySelectorAll(FOCUSABLE),
      function (el) { return el.offsetParent !== null && !el.hidden; }
    );
  }

  function openModal(backdropId) {
    lastFocused = document.activeElement;
    var bd = $(backdropId);
    bd.classList.add('open');
    document.addEventListener('keydown', escClose);
    document.addEventListener('keydown', trapTab, true);
    bd.addEventListener('mousedown', backdropClose);
    // move focus into the modal
    setTimeout(function () {
      var f = focusables(bd);
      if (f.length) f[0].focus();
    }, 60);
  }
  function closeModal(backdropId) {
    var bd = $(backdropId);
    if (!bd.classList.contains('open')) return;
    bd.classList.remove('open');
    bd.removeEventListener('mousedown', backdropClose);
    // only release the global handlers when no modal remains open
    if (!document.querySelector('.modal-backdrop.open')) {
      document.removeEventListener('keydown', trapTab, true);
      document.removeEventListener('keydown', escClose);
    }
    if (lastFocused && lastFocused.focus) try { lastFocused.focus(); } catch (e) {}
  }
  function escClose(e) { if (e.key === 'Escape') { closeModal('entryModalBackdrop'); closeModal('menuModalBackdrop'); } }
  function backdropClose(e) { if (e.target.classList.contains('modal-backdrop')) closeModal(e.target.id); }

  // keep Tab focus cycling inside the open modal
  function trapTab(e) {
    if (e.key !== 'Tab') return;
    var open = document.querySelector('.modal-backdrop.open');
    if (!open) return;
    var f = focusables(open);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!open.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }

  // ==========================================================================
  //  ROUTING / BOOT
  // ==========================================================================
  function route() {
    if (!window.crypto || !window.crypto.subtle || !window.isSecureContext) {
      // hard stop: we will not run with weakened/absent crypto
      setScreen('Unlock');
      $('unlockError').textContent =
        'Encrypto needs a secure context (HTTPS or localhost) with Web Crypto. ' +
        'It will not run here.';
      $('unlockSubmit').disabled = true;
      return;
    }
    if (S.exists()) {
      setScreen('Unlock');
      setTimeout(function () { $('unlockPass').focus(); }, 50);
    } else {
      setScreen('Setup');
      setTimeout(function () { $('setupPass').focus(); }, 50);
    }
  }

  function boot() {
    initTheme();
    wireReveal();
    initSetup();
    initUnlock();
    initVaultControls();
    initEntryModal();
    initBackup();
    route();

    // register the service worker (PWA / offline). Non-fatal if it fails.
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }

})();
