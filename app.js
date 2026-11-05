/* Zonal Attendance System: the browser side. Everything the server sends is escaped
   before it is shown. The server checks every permission itself; this code only decides
   what to draw. */
var Z = (function () {
  'use strict';
  var state = { token: null, me: null, logo: null, route: null, cache: {} };
  try { state.token = sessionStorage.getItem('zas-token'); } catch (e) {}

  // ------------------------------------------------------------------ helpers
  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { return v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('en-GB'); }
  function money(v) { return v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pct(v) { return v === null || v === undefined ? '' : (Math.round(v * 10) / 10).toLocaleString('en-GB') + '%'; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function qs(obj) {
    var parts = [];
    Object.keys(obj || {}).forEach(function (k) {
      if (obj[k] !== null && obj[k] !== undefined && obj[k] !== '') parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }
  function href(path, q) { return '#' + path + qs(q); }

  var ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
    chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
    org: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c1.8.7 3 2.5 3.5 5.2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 006 6L16 13l5 2v4a2 2 0 01-2 2A17 17 0 013 5a2 2 0 012-2"/>',
    out: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function icon(name) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>'; }

  // ------------------------------------------------------------------ talking to the server
  // Two ways to reach the same server: on GitHub Pages (window.ZAS_API is the script's /exec
  // address) a plain web request; on the script's own address, Google's built-in channel.
  var UNREACHABLE = 'The server could not be reached. Check the internet connection and try again.';
  // How long to wait for the server before treating the signal as gone. A new report is safe to
  // keep on the device after WAIT_SAVE (its one-time reference stops a second copy if the first
  // did arrive); signing in gives up after WAIT_LOGIN; reports and other pages wait longer.
  var WAIT_SAVE = 20000, WAIT_LOGIN = 25000, WAIT_OTHER = 90000, WAIT_KEPT = 6000;
  var SAVES = { 'entry.create': 1, 'fs.create': 1 };
  function send(action, payload) {
    if (window.ZAS_API) {
      var ctl = window.AbortController ? new AbortController() : null;
      var limit = SAVES[action] ? WAIT_SAVE : action === 'login' ? WAIT_LOGIN : WAIT_OTHER;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, limit) : null;
      // text/plain keeps this a "simple" request, which Apps Script can answer across sites.
      return fetch(window.ZAS_API, { method: 'POST', redirect: 'follow', credentials: 'omit', cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: state.token, action: action, payload: payload || {} }), signal: ctl ? ctl.signal : undefined })
        .then(function (res) {
          if (timer) clearTimeout(timer);
          if (!res.ok) throw { message: UNREACHABLE, detail: 'HTTP ' + res.status, offline: true };
          return res.text();
        }, function (err) {
          if (timer) clearTimeout(timer);
          if (err && err.offline) throw err;
          throw { message: err && err.name === 'AbortError' ? 'The network is too weak to reach the server just now. Try again.' : UNREACHABLE, detail: String(err && err.message || err), offline: true };
        });
    }
    return new Promise(function (resolve, reject) {
      if (!window.google || !google.script || !google.script.run) { reject({ message: 'Open this page from the web app address.' }); return; }
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(function (err) { reject({ message: UNREACHABLE, detail: String(err && err.message || err), offline: true }); })
        .api(state.token, action, payload || {});
    });
  }

  function call(action, payload) {
    var req = ask_(action, payload);
    // What the forms need and is kept on the device: on a weak signal, use the kept copy after a
    // few seconds instead of waiting, and let the fresh answer update the copy when it arrives.
    var copy = KEEP[action] ? kept(action, payload) : null;
    if (!copy) return req;
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        try { var r = JSON.parse(copy); if (r.ok) { settled = true; networkIs(false); resolve(r.data); } } catch (e) {}
      }, WAIT_KEPT);
      req.then(function (d) { clearTimeout(timer); if (!settled) { settled = true; resolve(d); } },
        function (e) { clearTimeout(timer); if (!settled) { settled = true; reject(e); } });
    });
  }
  function ask_(action, payload) {
    return send(action, payload).then(function (raw) {
      var r;
      try { r = JSON.parse(raw); } catch (e) { throw { message: 'The server sent an answer that could not be read.' }; }
      networkIs(true);
      if (r.ok) { if (KEEP[action] && !(action === 'me' && r.data && r.data.role === 'system')) keep(action, payload, raw); return r.data; }
      if (r.code === 'SESSION' && action !== 'login') signedOut(r.message);
      throw r;
    }, function (err) {
      if (err && err.offline) {
        networkIs(false);
        var hit = KEEP[action] ? kept(action, payload) : null;
        if (hit) { try { var r = JSON.parse(hit); if (r.ok) return r.data; } catch (e) {} }
      }
      throw err;
    });
  }

  // ------------------------------------------------------------------ working without network
  // What the report forms need is kept on the device, so they can be filled in with no network:
  // the account, the lists of units and meetings. Reports saved with no network wait on the
  // device (at most LIMIT of them) and are sent, each with a one-time reference, when it returns.
  var KEEP = { 'boot': 1, 'logo': 1, 'me': 1, 'entry.setup': 1, 'fs.setup': 1, 'org.children': 1 };
  var LIMIT = 200, OUTBOX = 'zas-outbox';
  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch (e) { return v === undefined ? null : false; }
  }
  function keepKey(action, payload) {
    if (action === 'me') return 'zas-k:me';
    var who = action === 'boot' || action === 'logo' ? 'all' : state.me ? state.me.id : '';
    return 'zas-k:' + who + ':' + action + ':' + JSON.stringify(payload || {});
  }
  function keep(action, payload, raw) { if (raw.length < 150000) ls(keepKey(action, payload), raw); }
  function kept(action, payload) { return ls(keepKey(action, payload)); }
  function forgetKept() {
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('zas-k:') === 0) localStorage.removeItem(k); }); } catch (e) {}
  }
  function rememberMe(me) { if (me && me.role !== 'system') ls('zas-k:me', JSON.stringify({ ok: true, data: me })); }
  /** The account last used on this device, for entering reports with no network. */
  function offlineProfile() { var raw = kept('me'); try { var r = raw && JSON.parse(raw); return r && r.ok ? r.data : null; } catch (e) { return null; } }

  function networkIs(up) {
    if (state.offline === !up) return;
    state.offline = !up;
    badge();
    if (up) setTimeout(flush, 500);
  }

  function boxAll() { try { var l = JSON.parse(ls(OUTBOX) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function boxSave(list) { return ls(OUTBOX, JSON.stringify(list)); }
  function boxMine() { var id = state.me && state.me.id; return boxAll().filter(function (x) { return x.uid === id; }); }
  function boxChange(ref, patch) {
    var list = boxAll();
    list.forEach(function (x, i) { if (x.ref === ref) list[i] = patch === null ? null : Object.assign(x, patch); });
    boxSave(list.filter(Boolean));
    badge();
  }
  function newRef() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  /** Keep a report on this device until there is network. Throws a plain message when it cannot. */
  function queue(action, payload, label) {
    var list = boxAll();
    if (list.length >= LIMIT) throw { message: 'This device is already keeping ' + LIMIT + ' reports waiting for the network, which is the most it keeps. They are sent as soon as there is network; then you can enter more.' };
    var p = {};
    Object.keys(payload).forEach(function (k) { if (k !== 'confirmed' && k !== 'client_ref') p[k] = payload[k]; });
    var item = { ref: payload.client_ref || newRef(), uid: state.me.id, user: state.me.full_name, action: action, payload: p, label: label || {}, at: new Date().toISOString(), status: 'waiting', review: !state.token };
    list.push(item);
    if (!boxSave(list)) throw { message: 'This report could not be kept on the device: its storage is full or switched off (for example in a private window). It has not been saved. Write the figures down and enter them when there is network.' };
    badge();
    return item;
  }

  var flushing = false;
  /** Send the reports waiting on this device, one by one, while there is network and a session. */
  function flush() {
    if (flushing || !state.token || !state.me) return Promise.resolve(0);
    var mine = boxMine().filter(function (x) { return x.status === 'waiting' && !x.review; });
    if (!mine.length) return Promise.resolve(0);
    flushing = true;
    var sent = 0;
    var next = function (i) {
      if (i >= mine.length) return null;
      var x = mine[i];
      return call(x.action, Object.assign({}, x.payload, { client_ref: x.ref }, x.confirmed ? { confirmed: '1' } : {})).then(function () {
        boxChange(x.ref, null); sent++;
        return next(i + 1);
      }, function (err) {
        if (err && (err.offline || err.code === 'SESSION')) return null;   // try again later
        boxChange(x.ref, { status: 'problem', message: err && err.message || 'It could not be saved.', code: err && err.code || '', notes: err && err.fields && err.fields._notes || null, fields: err && err.fields || null });
        return next(i + 1);
      });
    };
    return Promise.resolve(next(0)).then(function () {
      flushing = false;
      badge();
      if (sent) {
        state.cache = {};
        toast(sent + ' waiting report' + (sent === 1 ? ' was' : 's were') + ' sent.');
        if (state.route && state.route.path === '/outbox' && !unsaved().length) route();
      }
      var problems = boxMine().filter(function (x) { return x.status === 'problem'; }).length;
      if (problems && !sent) toast(problems + ' waiting report' + (problems === 1 ? ' needs' : 's need') + ' your attention.');
      return sent;
    }, function () { flushing = false; return 0; });
  }
  window.addEventListener('online', function () { setTimeout(flush, 1500); });
  setInterval(function () { if (navigator.onLine !== false) flush(); }, 60 * 1000);

  /** The marker in the top bar: no network, reports waiting, reports needing attention. */
  function badge() {
    var pill = $('#outboxPill');
    if (!pill) return;
    var mine = state.me ? boxMine() : [];
    var waiting = mine.filter(function (x) { return x.status === 'waiting'; }).length;
    var problems = mine.length - waiting;
    var parts = [];
    if (state.offline || state.offlineOnly) parts.push('No network');
    if (waiting) parts.push(waiting + ' waiting');
    if (problems) parts.push(problems + ' to check');
    pill.textContent = parts.join(' · ');
    pill.className = 'outbox-pill' + (problems ? ' bad' : state.offline || state.offlineOnly ? ' off' : '') + (parts.length ? '' : ' hidden');
    pill.setAttribute('aria-label', parts.length ? parts.join(', ') + '. Open the reports waiting to be sent.' : '');
  }

  function signedOut(message) {
    closeDrawer();
    state.token = null; state.me = null; state.cache = {}; state.offlineOnly = false;
    try { sessionStorage.removeItem('zas-token'); } catch (e) {}
    App.login(message);
  }

  // ------------------------------------------------------------------ theme
  function theme() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function toggleTheme() {
    var next = theme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('zas-theme', next); } catch (e) {}
    $$('[data-theme-toggle]').forEach(labelThemeButton);
    document.dispatchEvent(new CustomEvent('zas-theme'));
  }
  function labelThemeButton(b) {
    var dark = theme() === 'dark';
    b.innerHTML = icon(dark ? 'sun' : 'moon');
    b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    b.title = b.getAttribute('aria-label');
  }
  var beforePrintTheme = null;
  window.addEventListener('beforeprint', function () { beforePrintTheme = theme(); document.documentElement.setAttribute('data-theme', 'light'); });
  window.addEventListener('afterprint', function () { if (beforePrintTheme) document.documentElement.setAttribute('data-theme', beforePrintTheme); });

  // ------------------------------------------------------------------ toast
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 4200);
  }

  /**
   * The system's own question box, used instead of the browser's confirm(), which shows the
   * web address of the page and plain buttons. ask({ title, message, notes, after, ok, cancel, tone })
   * gives a promise of true (the main button) or false (Cancel, Escape, or a click outside).
   * tone: 'danger' for something that cannot easily be undone, 'warn' for a check, otherwise plain.
   */
  var asking = null;
  function ask(o) {
    o = typeof o === 'string' ? { message: o } : o;
    if (asking) asking(false);
    return new Promise(function (resolve) {
      var back = document.activeElement;
      var box = document.createElement('div');
      box.className = 'ask-back';
      var tone = o.tone || 'plain';
      box.innerHTML = '<div class="ask ' + tone + '" role="alertdialog" aria-modal="true" aria-labelledby="askT" aria-describedby="askM">'
        + '<div class="ask-head"><span class="ask-icon" aria-hidden="true">' + (tone === 'danger' ? '!' : tone === 'warn' ? '?' : 'i') + '</span><h2 id="askT">' + esc(o.title || 'Please confirm') + '</h2></div>'
        + '<div id="askM" class="ask-body">' + (o.message ? '<p>' + esc(o.message) + '</p>' : '')
        + (o.notes && o.notes.length ? '<ul>' + o.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '') + (o.after ? '<p>' + esc(o.after) + '</p>' : '') + '</div>'
        + '<div class="ask-foot"><button type="button" class="btn" data-ask="0">' + esc(o.cancel || 'Cancel') + '</button>'
        + '<button type="button" class="btn ' + (tone === 'danger' ? 'danger-solid' : 'primary') + '" data-ask="1">' + esc(o.ok || 'OK') + '</button></div></div>';
      document.body.appendChild(box);
      document.body.classList.add('asking');
      var key = function (e) {
        if (e.key === 'Escape') { e.preventDefault(); done(false); }
        if (e.key === 'Tab') {   // keep the keyboard inside the box
          var b = $$('button', box), i = b.indexOf(document.activeElement);
          e.preventDefault(); b[(i + (e.shiftKey ? b.length - 1 : 1)) % b.length].focus();
        }
      };
      var done = function (yes) {
        if (!box.parentNode) return;
        asking = null;
        document.removeEventListener('keydown', key, true);
        box.parentNode.removeChild(box);
        document.body.classList.remove('asking');
        if (back && back.focus) try { back.focus(); } catch (e) {}
        resolve(!!yes);
      };
      asking = done;
      document.addEventListener('keydown', key, true);
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ask]');
        if (b) done(b.getAttribute('data-ask') === '1');
        else if (e.target === box) done(false);
      });
      // A risky step starts on Cancel; anything else on the main button.
      $('[data-ask="' + (tone === 'danger' ? '0' : '1') + '"]', box).focus();
    });
  }

  // ------------------------------------------------------------------ router
  function parseHash() {
    var h = location.hash.replace(/^#/, '') || '/';
    var i = h.indexOf('?');
    var path = i < 0 ? h : h.substring(0, i);
    var q = {};
    if (i >= 0) h.substring(i + 1).split('&').forEach(function (p) {
      if (!p) return;
      var kv = p.split('=');
      q[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
    });
    return { path: path, q: q, parts: path.split('/').filter(Boolean) };
  }
  function go(path, q) {
    var target = href(path, q);
    if (location.hash === target) route(); else location.hash = target;
  }
  window.addEventListener('hashchange', function () { route(); });
  // The pages visited, so Close can return to the one before.
  var visited = [];
  function route() {
    if (!state.me || (!state.token && !state.offlineOnly)) return;
    if (state.token) setTimeout(flush, 0);
    var here = location.hash || '#/';
    if (visited[visited.length - 1] !== here) visited.push(here);
    if (visited.length > 50) visited.shift();
    var r = parseHash();
    state.route = r;
    closeDrawer();
    shell(r);
    var main = $('#main');
    main.innerHTML = '<div class="loading">Loading…</div>';
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    var view = Views.find(r);
    Promise.resolve().then(function () { return view(main, r); }).catch(function (e) { showError(main, e); }).then(function () { pageTitle(main); });
  }
  function pageTitle(main) {
    var h = main.querySelector('h1');
    var name = state.me && state.me.settings ? state.me.settings.app_name : (BOOT.appName || 'Attendance');
    document.title = h && h.textContent.trim() ? h.textContent.trim() + ' · ' + name : name;
    edges(main);
  }

  function showError(el, e) {
    if (e && e.code === 'SESSION') return;
    if (e && e.offline) {
      var enter = state.me && state.me.arm ? '#/fs/entry/new' : '#/entry/attendance/new';
      el.innerHTML = '<h1>No network</h1><div class="notice warn" role="status">This page needs the network, and this device cannot reach the server just now.</div>'
        + (state.me && state.me.role !== 'system' ? '<p>You can still enter reports. They wait on this device and are sent by themselves as soon as the network returns.</p><div class="btn-row"><a class="btn primary" href="' + enter + '">Enter a report</a><a class="btn" href="#/outbox">Reports waiting to be sent</a></div>' : '<p>Try again when the device is connected.</p>');
      return;
    }
    el.innerHTML = '<h1>' + esc(e && e.code === 'FORBIDDEN' ? 'No access' : 'This page could not be shown') + '</h1><div class="notice bad" role="alert">' + esc(e && e.message ? e.message : 'Something went wrong.') + '</div>'
      + '<p><a href="#/">Back to the dashboard</a></p>';
  }

  // ------------------------------------------------------------------ shell
  function menuSections(me) {
    var r = me.rank;
    var sys = me.role === 'system';
    if (me.arm) {
      // DLSO and DLCF coordinators: their own arm only.
      var A = me.armLabel, places = me.arm === 'dlso' ? '/schools' : '/campuses';
      return [['', [['/', 'Home']]], [A.code, [['/fs/entry/new', 'Enter a report'], ['/fs/entry', 'Reports entered'], ['/reports/' + me.arm, A.code + ' report'], [places, A.places]]],
        ['Account', [['/account', 'Change password']]]];
    }
    var entry = [['/entry/attendance', 'Attendance'], ['/entry/hcf', 'HCF attendance'], ['/entry/gck', 'GCK'], ['/entry/metrics', 'Church Metrics']];
    var reports = [['/reports/attendance', 'Attendance report'], ['/reports/hcf', 'HCF report'], ['/reports/daily', 'Daily report'],
      ['/reports/metrics', 'Church Metrics report'], ['/reports/gck', 'GCK report'], ['/reports/compliance', 'Submission status'], ['/reports/analysis', 'Analysis']];
    if (r <= 2) reports = reports.concat([['/reports/dlso', 'DLSO report'], ['/reports/dlcf', 'DLCF report'], ['/reports/overview', 'Overall picture']]);
    var org = [];
    ['region', 'division', 'district', 'location', 'hcf'].forEach(function (l, i) {
      if (i + 1 > r) org.push(['/org/' + l, { region: 'Regions', division: 'Divisions', district: 'Districts', location: 'Locations', hcf: 'HCF locations' }[l]]);
      if (l === 'division' && r <= 3) org.push(['/groups', 'Groups']);   // groups of districts, between division and district
    });
    if (sys) org = [];   // the System Admin reads reports but leaves the organisation to the Zonal Admin
    org.push(['/reports/pastors', 'Pastors']);
    org.push(['/reports/locations', 'Location directory']);
    org.push(['/reports/heads', 'Sectional heads']);
    if (r <= 2) { org.push(['/schools', 'DLSO schools']); org.push(['/campuses', 'DLCF campuses']); }
    org.push(['/search', 'Search']);
    var admin = [];
    if (sys) admin = [['/users', 'Zonal Admins'], ['/admin/settings', 'Settings'], ['/admin/picture', 'Sign-in picture'], ['/admin/backups', 'Backups'],
      ['/admin/maintenance', 'Maintenance'], ['/admin/diagnostics', 'Data checks'], ['/admin/audit', 'Audit log']];
    else {
      if (r < 4) admin.push(['/users', 'Users']);
      if (r === 0) admin = admin.concat([['/admin/types', 'Meeting types'], ['/admin/crusades', 'Crusade periods']]);
    }
    admin.push(['/account', 'Change password']);
    return [['', [['/', 'Dashboard']]], ['Enter reports', sys ? [] : entry], ['Reports', reports], ['Organisation', org], [sys ? 'System' : 'Administration', admin]];
  }
  function menuHtml(me, path) {
    var out = '<nav class="menu" aria-label="Main menu"><div class="who"><b>' + esc(me.full_name) + '</b><span class="small muted">'
      + esc(me.role_label) + (me.unit.level !== 'zone' ? ', ' + esc(me.unit.name) : '') + '</span></div>';
    menuSections(me).forEach(function (s) {
      if (!s[1].length) return;
      if (s[0]) out += '<h3>' + esc(s[0]) + '</h3>';
      s[1].forEach(function (it) {
        var on = it[0] === '/' ? path === '/' : (path === it[0] || path.indexOf(it[0] + '/') === 0 || (it[0] === '/reports/heads' && path === '/heads') || (it[0] === '/reports/pastors' && path === '/zone'));
        out += '<a href="#' + it[0] + '"' + (on ? ' class="on" aria-current="page"' : '') + '>' + esc(it[1]) + '</a>';
      });
    });
    out += '<div class="signout"><button type="button" class="btn small" data-signout>' + icon('out') + 'Sign out</button></div></nav>';
    return out;
  }
  function shell(r) {
    var me = state.me;
    var app = $('#app');
    if (!$('#main')) {
      app.innerHTML =
        '<header class="top"><button type="button" class="icon-btn menu-btn" data-open-menu aria-label="Open the menu">' + icon('menu') + '</button>'
        + '<a class="brand" href="#/"><span class="logo">' + logoHtml() + '</span><span class="brand-text"><b>' + esc(me.settings.app_name)
        + '</b><span>' + esc(me.settings.church) + '</span></span></a>'
        + '<a class="outbox-pill hidden" id="outboxPill" href="#/outbox" aria-live="polite"></a>'
        + '<button type="button" class="icon-btn" data-theme-toggle></button></header>'
        + '<div class="layout"><aside class="side" id="side"></aside><main class="main" id="main" tabindex="-1"></main></div>'
        + '<nav class="bottom" aria-label="Shortcuts" id="bottom"></nav>';
      $$('[data-theme-toggle]').forEach(labelThemeButton);
    }
    $('#side').innerHTML = menuHtml(me, r.path);
    badge();
    var p = r.path;
    var tabs = me.arm ? [['/', 'Home', 'home', p === '/'], ['/fs/entry/new', 'Enter', 'edit', p.indexOf('/fs') === 0], ['/reports/' + me.arm, 'Reports', 'chart', p.indexOf('/reports') === 0]]
      : [['/', 'Home', 'home', p === '/'], me.role === 'system' ? ['/admin/maintenance', 'System', 'edit', p.indexOf('/admin') === 0 || p.indexOf('/users') === 0] : ['/entry/attendance', 'Enter', 'edit', p.indexOf('/entry') === 0],
      ['/reports/attendance', 'Reports', 'chart', p.indexOf('/reports') === 0 && p !== '/reports/pastors' && p !== '/reports/locations' && p !== '/reports/heads']];
    $('#bottom').innerHTML = tabs.map(function (t) {
      return '<a href="#' + t[0] + '"' + (t[3] ? ' class="on" aria-current="page"' : '') + '>' + icon(t[2]) + '<span>' + t[1] + '</span></a>';
    }).join('') + '<button type="button" data-open-menu>' + icon('more') + '<span>More</span></button>';
  }
  function logoHtml() {
    return state.logo ? '<img src="' + esc(state.logo) + '" alt="">' : esc((state.me ? state.me.settings.zone : BOOT.appName || 'Z').charAt(0));
  }
  var drawerOpener = null;
  function openDrawer() {
    closeDrawer();
    drawerOpener = document.activeElement;
    document.body.classList.add('no-scroll');
    var bg = document.createElement('div');
    bg.className = 'drawer-bg'; bg.setAttribute('data-close-menu', '');
    var d = document.createElement('div');
    d.className = 'drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Menu'); d.id = 'drawer';
    d.innerHTML = '<div class="btn-row" style="justify-content:flex-end"><button type="button" class="icon-btn" data-close-menu aria-label="Close the menu">' + icon('close') + '</button></div>'
      + menuHtml(state.me, state.route ? state.route.path : '/');
    document.body.appendChild(bg); document.body.appendChild(d);
    var first = d.querySelector('a'); if (first) first.focus();
  }
  /** A Close button: back to the page before (a list, a report), or to the fallback. */
  function closeBtn(fallback) {
    return '<a class="btn close-page" href="' + esc(fallback || '#/') + '" data-close-page aria-label="Close this page">' + icon('close') + 'Close</a>';
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-close-page]') : null;
    if (!a) return;
    e.preventDefault();
    var current = visited.pop();
    var prev = visited.pop();
    // Go back to the page before, unless it was this same page's edit form.
    while (prev && prev.split('?')[0].indexOf((current || '').split('?')[0].replace(/\/edit$/, '')) === 0 && prev !== a.getAttribute('href')) prev = visited.pop();
    location.hash = prev || a.getAttribute('href');
  });
  function closeDrawer() {
    var open = $$('.drawer, .drawer-bg');
    if (!open.length) return;
    open.forEach(function (n) { n.remove(); });
    document.body.classList.remove('no-scroll');
    if (drawerOpener && document.body.contains(drawerOpener) && drawerOpener.focus) drawerOpener.focus();
    drawerOpener = null;
  }

  // Phone numbers: a phone calls them; a computer (mouse, no touch) copies the number instead of asking for a calling app.
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="tel:"]') : null;
    if (!a || !window.matchMedia || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    e.preventDefault();
    var number = a.getAttribute('href').substring(4);
    var done = function () { toast('Phone number ' + number + ' copied.'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(number).then(done, function () { toast('Phone number: ' + number); });
    else toast('Phone number: ' + number);
  }, true);

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-theme-toggle],[data-open-menu],[data-close-menu],[data-signout],[data-print],[data-csv]') : null;
    if (!t) return;
    if (t.hasAttribute('data-theme-toggle')) toggleTheme();
    else if (t.hasAttribute('data-open-menu')) openDrawer();
    else if (t.hasAttribute('data-close-menu')) closeDrawer();
    else if (t.hasAttribute('data-signout')) {
      var waiting = boxMine().length;
      (waiting ? ask({ title: 'Sign out?', message: waiting + ' report' + (waiting === 1 ? ' is' : 's are') + ' waiting on this device to be sent. ' + (waiting === 1 ? 'It stays' : 'They stay') + ' here and ' + (waiting === 1 ? 'is' : 'are') + ' sent the next time you sign in on this device with network.', ok: 'Sign out', tone: 'warn' }) : Promise.resolve(true))
        .then(function (yes) {
          if (!yes) return;
          forgetKept();
          (state.token ? call('logout').catch(function () {}) : Promise.resolve()).then(function () { signedOut('You have signed out.'); });
        });
    }
    else if (t.hasAttribute('data-print')) window.print();
    else if (t.hasAttribute('data-csv') && state.lastTable) csv(state.lastTable);
  });
  document.addEventListener('keydown', function (e) {
    var d = $('#drawer');
    if (!d) return;
    if (e.key === 'Escape') { closeDrawer(); return; }
    if (e.key !== 'Tab') return;
    // Keep the keyboard inside the open menu.
    var f = $$('a[href], button:not([disabled])', d);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ------------------------------------------------------------------ tables
  var NUMERIC = { int: 1, money: 1, pct: 1, delta: 1, dec: 1 };
  function cellText(c, v) {
    if (v === null || v === undefined || v === '') return '';
    switch (c.type) {
      case 'int': return num(v);
      case 'money': return money(v);
      case 'pct': return pct(v);
      case 'dec': return (Math.round(v * 10) / 10).toLocaleString('en-GB');
      case 'delta': return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-GB');
      default: return String(v);
    }
  }
  var MARKS = { Submitted: 'ok', Partly: 'part', Pending: 'no' };
  function cellHtml(c, row) {
    var v = row[c.key];
    if (c.type === 'edit') return row._edit ? '<a class="btn small" href="' + esc(href(row._edit.path, row._edit.q || {})) + '">Edit</a>' : '';
    if (c.type === 'tel') return v ? '<a href="tel:' + esc(String(v).replace(/[^\d+]/g, '')) + '">' + esc(v) + '</a>' : '';
    if (c.type === 'mark') return v === null || v === undefined ? '<span class="dash">Not due yet</span>' : '<span class="badge ' + (MARKS[v] || 'no') + '">' + esc(v) + '</span>';
    var t = cellText(c, v);
    if (t === '' && NUMERIC[c.type]) return '<span class="dash" aria-label="no figure">–</span>';
    if (c.type === 'delta') return '<span class="' + (v > 0 ? 'delta-up' : v < 0 ? 'delta-down' : '') + '">' + esc(t) + '</span>';
    return esc(t);
  }
  /** Cut a wide table with a heading over each block of columns into one table per block (for paper). */
  function split(t) {
    if (!t.groups || t.columns.length <= 14) return [t];
    var lead = t.groups[0].span, at = lead, out = [];
    t.groups.slice(1).forEach(function (g) {
      out.push({ heading: ((t.heading || '') + ' ' + g.label).trim(), columns: t.columns.slice(0, lead).concat(t.columns.slice(at, at + g.span)), rows: t.rows, totals: t.totals });
      at += g.span;
    });
    return out;
  }
  function tableHtml(t, linkFor) {
    var edges = {};
    if (t.groups) { var a = 0; t.groups.forEach(function (g) { edges[a] = 1; a += g.span; }); }
    var lead = t.groups ? t.groups[0].span : 0;
    var cls = function (c, i) { return (c.type === 'edit' ? 'no-print ' : '') + (NUMERIC[c.type] ? '' : 'text') + (c.strong ? ' strong' : '') + (edges[i] && i >= lead && i > 0 ? ' edge' : ''); };
    var h = '<div class="table-box"><div class="table-wrap" tabindex="0" role="region" aria-label="' + esc(t.heading || t.title || 'Table') + '"><table class="data"><thead>';
    if (t.groups) {
      h += '<tr class="group-row">' + t.groups.map(function (g) { return g.label ? '<th scope="colgroup" colspan="' + g.span + '">' + esc(g.label) + '</th>' : '<td colspan="' + g.span + '"></td>'; }).join('') + '</tr>';
    }
    h += '<tr>' + t.columns.map(function (c, i) {
      return '<th scope="col" class="' + cls(c, i) + '"' + (c.full ? ' title="' + esc(c.full) + '"' : '') + '>' + (c.full ? '<abbr title="' + esc(c.full) + '">' + esc(c.label) + '</abbr>' : esc(c.label)) + '</th>';
    }).join('') + '</tr></thead><tbody>';
    t.rows.forEach(function (row) {
      h += '<tr' + (row._class ? ' class="' + esc(row._class) + '"' : '') + '>';
      t.columns.forEach(function (c, i) {
        if (i === 0) {
          var inner = cellHtml(c, row);
          var l = row._link && linkFor ? linkFor(row._link) : null;
          h += '<th scope="row">' + (l ? '<a href="' + esc(l) + '">' + inner + '</a>' : inner) + '</th>';
        } else h += '<td class="' + cls(c, i) + '">' + cellHtml(c, row) + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody>';
    if (t.totals) {
      h += '<tfoot><tr>' + t.columns.map(function (c, i) {
        var inner = c.type === 'mark' ? '' : cellHtml(c, t.totals);
        return i === 0 ? '<th scope="row">' + inner + '</th>' : '<td class="' + cls(c, i) + '">' + inner + '</td>';
      }).join('') + '</tr></tfoot>';
    }
    return h + '</table></div></div>';
  }
  /** Mark tables that have more columns off to the right, and clear the mark at the end. */
  function edges(root) {
    $$('.table-box', root).forEach(function (b) {
      var w = b.firstElementChild;
      var upd = function () { b.classList.toggle('more', w.scrollWidth - w.clientWidth - w.scrollLeft > 4); };
      if (!w.edgeWired) { w.addEventListener('scroll', upd, { passive: true }); w.edgeWired = true; }
      upd();
    });
  }
  window.addEventListener('resize', function () { edges(document); });
  function sectionHtml(s, linkFor) {
    var out = '';
    if (s.heading) out += '<h2 class="section-title ' + esc(s.tone || '') + '">' + esc(s.heading) + '</h2>';
    if (!s.rows.length) return out + '<div class="card empty">Nothing has been reported for this selection.</div>';
    var parts = split(s);
    if (parts.length > 1) {
      out += '<div class="screen-only">' + tableHtml(s, linkFor) + '</div><div class="print-only">'
        + parts.map(function (p) { return '<h3 style="margin:8pt 0 3pt">' + esc(p.heading) + '</h3>' + tableHtml(p, linkFor); }).join('') + '</div>';
    } else out += tableHtml(s, linkFor);
    return out;
  }
  function reportHtml(t, linkFor) {
    state.lastTable = t;
    var sections = t.sections || [t];
    var has = sections.some(function (s) { return s.rows.length; });
    var h = '<div class="print-only"><b>' + esc(state.me.settings.app_name) + '</b><h1 style="margin:2pt 0 6pt">' + esc(t.title) + '</h1></div>'
      + '<div class="page-head"><dl class="meta">' + t.meta.map(function (m) {
        return '<dt' + (m[0] === 'Generated' ? ' class="print-only"' : '') + '>' + esc(m[0]) + '</dt><dd' + (m[0] === 'Generated' ? ' class="print-only"' : '') + '>' + esc(m[1]) + '</dd>';
      }).join('') + '</dl>'
      + (has ? '<div class="btn-row no-print"><button type="button" class="btn small" data-print>Print or PDF</button><button type="button" class="btn small" data-csv>Download CSV</button></div>' : '')
      + '</div>';
    sections.forEach(function (s) { h += sectionHtml(s, linkFor); });
    if (t.notes && t.notes.length) h += '<h2 class="h3" style="font-size:.9rem;margin-top:1rem">' + esc(t.notesTitle || 'How these figures are worked out') + '</h2><ul class="notes">'
      + t.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
    return h;
  }
  function csv(t) {
    var lines = [];
    var cell = function (v, c) {
      if (v === null || v === undefined) return '';
      var s = c && NUMERIC[c.type] ? String(v) : String(v);
      if (!(c && NUMERIC[c.type]) && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    lines.push(cell(state.me.settings.app_name)); lines.push(cell(t.title));
    t.meta.forEach(function (m) { lines.push(cell(m[0]) + ',' + cell(m[1])); });
    (t.sections || [t]).forEach(function (s) {
      lines.push('');
      if (s.heading) lines.push(cell(s.heading));
      if (s.groups) lines.push(s.groups.map(function (g) { var a = [cell(g.label)]; for (var i = 1; i < g.span; i++) a.push(''); return a.join(','); }).join(','));
      var cols = s.columns.filter(function (c) { return c.type !== 'edit'; });
      lines.push(cols.map(function (c) { return cell(c.label); }).join(','));
      s.rows.concat(s.totals ? [s.totals] : []).forEach(function (r) { lines.push(cols.map(function (c) { return cell(r[c.key], c); }).join(',')); });
    });
    if (t.notes) { lines.push(''); t.notes.forEach(function (n) { lines.push(cell(n)); }); }
    var name = (t.title + ' ' + (t.meta[0] ? t.meta[0][1] : '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.csv';
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Downloaded ' + name);
  }

  // ------------------------------------------------------------------ cascading unit picker
  var LEVELS = ['region', 'division', 'district', 'location', 'hcf'];
  var LABEL = { institution: 'School or campus', region: 'Region', division: 'Division', group: 'Group', district: 'District', location: 'Location', hcf: 'HCF location' };
  /**
   * opts: target (deepest level), chain {region_id…}, filter (every level optional), name (field for the chosen ID),
   *       onChange(level, id) for filters.
   * The server only returns units inside the user's own scope.
   */
  function picker(box, opts) {
    var start = state.me.picker;
    var first = LEVELS.indexOf(start.level || 'region');
    var last = LEVELS.indexOf(opts.target);
    box.classList.add('picker');
    box.innerHTML = '';
    if (last < first) {
      // Nothing to choose: the user's own unit is the only one.
      if (!opts.filter) box.innerHTML = '<input type="hidden" name="' + esc(opts.name) + '" value="' + esc(start.own ? start.own.id : '') + '"><p class="small muted">' + esc(state.me.unit.name) + '</p>';
      return;
    }
    var chain = opts.chain || {};
    var selects = {};
    for (var i = first; i <= last; i++) {
      var lv = LEVELS[i];
      var wrap = document.createElement('div');
      var id = 'pk_' + Math.random().toString(36).slice(2, 8);
      wrap.innerHTML = '<label for="' + id + '">' + LABEL[lv] + '</label><select id="' + id + '"' + (i === last && opts.name ? ' name="' + esc(opts.name) + '"' : '') + ' disabled><option value="">' + (opts.filter ? 'All' : 'Choose') + '</option></select>';
      box.appendChild(wrap);
      selects[lv] = wrap.querySelector('select');
    }
    function deepest() {
      for (var j = last; j >= first; j--) { var s = selects[LEVELS[j]]; if (s.value) return { level: LEVELS[j], id: Number(s.value) }; }
      return null;
    }
    function clear(from) {
      for (var j = from; j <= last; j++) { var s = selects[LEVELS[j]]; s.ticket = (s.ticket || 0) + 1; s.innerHTML = '<option value="">' + (opts.filter ? 'All' : 'Choose the ' + Z.lc(LABEL[LEVELS[j - 1]]) + ' first') + '</option>'; s.disabled = true; }
    }
    function load(j, parent) {
      var lv = LEVELS[j], s = selects[lv];
      var ticket = s.ticket = (s.ticket || 0) + 1;
      s.innerHTML = '<option value="">Loading…</option>'; s.disabled = true;
      return call('org.children', { level: lv, parent: parent }).then(function (units) {
        if (ticket !== s.ticket) return;   // a newer choice has been made since
        s.innerHTML = '<option value="">' + (opts.filter ? 'All' : units.length ? 'Choose ' + (lv === 'hcf' ? 'an ' : 'a ') + Z.lc(LABEL[lv]) : 'None available') + '</option>'
          + units.map(function (u) { return '<option value="' + u.id + '">' + esc(u.name) + '</option>'; }).join('');
        s.disabled = !units.length;
        var want = chain[lv + '_id'];
        if (want && units.some(function (u) { return u.id === want; })) s.value = String(want);
        else if (units.length === 1 && !opts.filter) s.value = String(units[0].id);
        if (s.value && j < last) return load(j + 1, s.value);
      });
    }
    Object.keys(selects).forEach(function (lv) {
      var j = LEVELS.indexOf(lv);
      selects[lv].addEventListener('change', function () {
        chain = {};
        if (j < last) { clear(j + 1); if (selects[lv].value) load(j + 1, selects[lv].value); }
        if (opts.onChange) opts.onChange(deepest());
      });
    });
    clear(first + 1);
    box.ready = load(first, start.parent).catch(function () { selects[LEVELS[first]].innerHTML = '<option value="">Could not load. Reload the page.</option>'; });
    box.value = deepest;
  }

  // ------------------------------------------------------------------ forms
  function formData(form) {
    var o = {};
    $$('input, select, textarea', form).forEach(function (el) {
      if (!el.name || el.disabled && el.type !== 'hidden') return;
      if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) return;
      o[el.name] = el.value;
    });
    return o;
  }
  function showFieldErrors(form, err) {
    $$('.error-text', form).forEach(function (n) { n.remove(); });
    $$('.invalid', form).forEach(function (n) { n.classList.remove('invalid'); });
    $$('[aria-invalid]', form).forEach(function (n) { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); });
    var box = $('[data-form-error]', form);
    var fields = err && err.fields || {};
    var clashPath = form.dataset.clash || (form.dataset.kind ? '/entry/' + form.dataset.kind + '/' : '');
    var clash = fields._existing && clashPath ? ' <a href="' + esc(href(clashPath + fields._existing, fields._p ? { p: fields._p } : {})) + '">Open the report already entered</a>.' : '';
    if (box) { box.innerHTML = err ? '<div class="notice bad" role="alert">' + esc(err.message || 'Something went wrong.') + clash + '</div>' : ''; }
    if (!err || !err.fields) return;
    var firstBad = null;
    Object.keys(fields).forEach(function (k) {
      if (k.charAt(0) === '_') return;
      var f = $('[data-field="' + k + '"]', form);
      if (!f) return;
      f.classList.add('invalid');
      var p = document.createElement('div');
      p.className = 'error-text'; p.id = 'err_' + k; p.textContent = fields[k];
      f.appendChild(p);
      $$('input,select,textarea', f).forEach(function (inp) { inp.setAttribute('aria-invalid', 'true'); inp.setAttribute('aria-describedby', p.id); });
      if (!firstBad) firstBad = f;
    });
    if (firstBad) { var inp = $('input,select,textarea', firstBad); if (inp) inp.focus(); }
  }
  /** Submit a form through the API with a busy button and field errors. */
  function bindForm(form, action, extra, done) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('button[type=submit]', form);
      if (btn.getAttribute('aria-busy') === 'true') return;
      // Fields that must be filled are checked here first, before any question or trip to the server.
      var missing = {};
      $$('[data-required]', form).forEach(function (el) { if (!el.disabled && !String(el.value).trim()) { var f = el.closest('[data-field]'); if (f) missing[f.getAttribute('data-field')] = el.getAttribute('data-required'); } });
      if (Object.keys(missing).length) { showFieldErrors(form, { message: 'Please fill in the highlighted field' + (Object.keys(missing).length > 1 ? 's' : '') + '.', fields: missing }); return; }
      if (form.dataset.confirm && !form.askedOk) {
        ask({ title: form.dataset.confirmTitle || 'Please confirm', message: form.dataset.confirm, ok: form.dataset.confirmOk || 'Continue', tone: form.dataset.confirmTone || 'plain' })
          .then(function (yes) { if (yes) { form.askedOk = true; if (form.requestSubmit) form.requestSubmit(btn); else btn.click(); } });
        return;
      }
      form.askedOk = false;
      var payload = formData(form);
      // A new report gets its one-time reference before the first try, so that if the reply is
      // lost on a weak signal and the report is sent again later, it is recognised, not saved twice.
      if (form.dataset.offline) payload.client_ref = newRef();
      if (extra) Object.keys(typeof extra === 'function' ? extra() : extra).forEach(function (k) { payload[k] = (typeof extra === 'function' ? extra() : extra)[k]; });
      btn.setAttribute('aria-busy', 'true');
      var label = btn.textContent;
      btn.textContent = 'Saving…';
      showFieldErrors(form, null);
      if (state.offlineOnly && form.dataset.offline) {
        // Working with no network and no session: keep it at once (it is checked when sent).
        try { var held = queue(action, payload, form.offlineLabel ? form.offlineLabel(payload) : null); }
        catch (err) { showFieldErrors(form, err); btn.removeAttribute('aria-busy'); btn.textContent = label; return; }
        form.dirty = false; done({ queued: held }, payload); btn.removeAttribute('aria-busy'); btn.textContent = label;
        return;
      }
      var send = function () {
        return call(action, payload).catch(function (err) {
          if (err && err.offline && form.dataset.offline && state.me) {
            return { queued: queue(action, payload, form.offlineLabel ? form.offlineLabel(payload) : null) };
          }
          // Figures worth a second look: ask once, then save again with the answer.
          if (err && err.code === 'CONFIRM') {
            var notes = err.fields && err.fields._notes;
            return ask({ title: 'Please check before saving', message: notes ? 'Some of what you entered is unusual:' : String(err.message).replace(/\s*Save anyway\?$/, ''), notes: notes,
              after: 'If it is correct, save it. Otherwise go back and change it.', ok: 'Save anyway', cancel: 'Go back and check', tone: 'warn' })
              .then(function (yes) {
                if (yes) { payload.confirmed = '1'; return send(); }
                throw { message: 'Not saved yet. Check the figures and the date, then save again.' };
              });
          }
          throw err;
        });
      };
      send().then(function (data) {
        state.cache = {};
        form.dirty = false;
        done(data, payload);
      }).catch(function (err) {
        showFieldErrors(form, err);
        if (err && err.offline) { try { form.dispatchEvent(new Event('zas-offline')); } catch (e) {} }
      }).then(function () { btn.removeAttribute('aria-busy'); btn.textContent = label; });
    });
    // Remember unsaved typing, so leaving the page can ask first.
    form.addEventListener('input', function () { form.dirty = true; });
    form.addEventListener('change', function () { form.dirty = true; });
  }

  /** The forms on the page with typing that has not been saved. */
  function unsaved() {
    return $$('#main form').filter(function (f) { return f.dirty && !f.classList.contains('filters') && f.getAttribute('role') !== 'search'; });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"], [data-close-page]') : null;
    if (!a || a.target === '_blank' || !$('#main')) return;
    if (a.closest('#main form') || a.closest('.ask-back')) return;   // links inside the form itself (a clash link) leave on purpose
    var forms = unsaved();
    if (!forms.length) return;
    e.preventDefault(); e.stopImmediatePropagation();
    ask({ title: 'Leave without saving?', message: 'You have changes on this page that have not been saved. If you leave now, they will be lost.', ok: 'Leave without saving', cancel: 'Stay on this page', tone: 'warn' })
      .then(function (yes) { if (yes) { forms.forEach(function (f) { f.dirty = false; }); a.click(); } });
  }, true);
  window.addEventListener('beforeunload', function (e) {
    if ($$('#main form').some(function (f) { return f.dirty && !f.classList.contains('filters'); })) { e.preventDefault(); e.returnValue = ''; }
  });

  // Keep the session alive while someone is working (typing a long report), so it does not end mid-form.
  var lastActivity = Date.now(), lastPing = Date.now();
  ['input', 'keydown', 'click', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { lastActivity = Date.now(); }, { passive: true }); });
  setInterval(function () {
    if (!state.token || Date.now() - lastActivity > 10 * 60 * 1000 || Date.now() - lastPing < 10 * 60 * 1000) return;
    lastPing = Date.now();
    call('me').catch(function () {});
  }, 60 * 1000);

  // Show or hide a password while typing it.
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-pw-toggle]') : null;
    if (!b) return;
    var i = b.parentNode.querySelector('input');
    var show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    b.textContent = show ? 'Hide' : 'Show';
    b.setAttribute('aria-pressed', show ? 'true' : 'false');
    b.setAttribute('aria-label', show ? 'Hide the password' : 'Show the password');
    i.focus();
  });
  function field(name, label, input, hint) {
    return '<div class="field" data-field="' + esc(name) + '"><label for="f_' + esc(name) + '">' + esc(label) + '</label>' + input + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
  }
  function text(name, label, value, attrs, hint) {
    return field(name, label, '<input type="text" id="f_' + esc(name) + '" name="' + esc(name) + '" value="' + esc(value) + '" ' + (attrs || '') + '>', hint);
  }

  // ------------------------------------------------------------------ charts (Chart.js when it loads; bars drawn in HTML otherwise)
  var charts = [];
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function chart(box, kind, labels, values, label, waited) {
    // Chart.js loads in the background; give it a moment before drawing plain bars instead.
    if (!window.Chart && !waited) { setTimeout(function () { if (document.body.contains(box)) chart(box, kind, labels, values, label, true); }, 1500); box.innerHTML = '<p class="muted small">Drawing…</p>'; return; }
    var total = values.reduce(function (a, b) { return a + (b || 0); }, 0);
    if (!total) { box.innerHTML = '<p class="muted small">No figures yet.</p>'; return; }
    if (!window.Chart) {
      var max = Math.max.apply(null, values) || 1;
      box.innerHTML = '<ul class="bar-list">' + labels.map(function (l, i) {
        return '<li><span>' + esc(l) + '</span><span class="track"><span class="bar" style="display:block;width:' + Math.round(values[i] * 100 / max) + '%"></span></span><b>' + num(values[i]) + '</b></li>';
      }).join('') + '</ul>';
      return;
    }
    var horizontal = kind === 'hbar';
    box.innerHTML = '<div class="chart-box"' + (horizontal ? ' style="height:' + Math.max(180, labels.length * 28 + 40) + 'px"' : '') + '><canvas role="img" aria-label="'
      + esc(label + ': ' + labels.map(function (l, i) { return l + ' ' + num(values[i]); }).join(', ')) + '"></canvas></div>';
    var c = $('canvas', box);
    var series = cssVar('--brand'), grid = cssVar('--line'), ink = cssVar('--muted');
    var ch = new Chart(c, {
      type: kind === 'line' ? 'line' : 'bar',
      data: { labels: labels, datasets: [{ label: label, data: values, backgroundColor: series, borderColor: series, borderWidth: kind === 'line' ? 2 : 0,
        pointRadius: kind === 'line' ? 3 : 0, tension: .25, borderRadius: 4, maxBarThickness: 42 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, indexAxis: horizontal ? 'y' : 'x',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { return ' ' + num(ctx.parsed[horizontal ? 'x' : 'y']); } } } },
        scales: { x: { grid: { color: horizontal ? grid : 'transparent' }, ticks: { color: ink } }, y: { beginAtZero: true, grid: { color: horizontal ? 'transparent' : grid }, ticks: { color: ink } } } }
    });
    charts.push(ch);
  }
  document.addEventListener('zas-theme', function () {
    charts = charts.filter(function (ch) { return ch.canvas && document.body.contains(ch.canvas); });
    charts.forEach(function (ch) {
      var s = cssVar('--brand'), g = cssVar('--line'), k = cssVar('--muted');
      ch.data.datasets[0].backgroundColor = s; ch.data.datasets[0].borderColor = s;
      ['x', 'y'].forEach(function (ax) { ch.options.scales[ax].ticks.color = k; if (ch.options.scales[ax].grid.color !== 'transparent') ch.options.scales[ax].grid.color = g; });
      ch.update();
    });
  });

  // ------------------------------------------------------------------ dates people read
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  /** "2026-10-25" -> "Sun 25 Oct 2026". Anything else is shown as it came. */
  function date(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    if (!m) return String(v || '');
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return DAY[d.getUTCDay()] + ' ' + (+m[3]) + ' ' + MON[+m[2] - 1] + ' ' + m[1];
  }
  /** "2026-11-01 05:52:10" or an ISO stamp -> "1 Nov 2026, 05:52". */
  function when(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(v || ''));
    if (!m) return date(v);
    return (+m[3]) + ' ' + MON[+m[2] - 1] + ' ' + m[1] + ', ' + m[4] + ':' + m[5];
  }

  return {
    date: date, when: when, closeBtn: closeBtn, lc: function (l) { l = String(l || ''); return /^[A-Z][a-z]/.test(l) ? l.charAt(0).toLowerCase() + l.slice(1) : l; },
    state: state, esc: esc, num: num, money: money, pct: pct, $: $, $$: $$, href: href, go: go, call: call, toast: toast, ask: ask, route: route,
    outbox: { mine: boxMine, change: boxChange, flush: flush, queue: queue, limit: LIMIT }, offlineProfile: offlineProfile, rememberMe: rememberMe, badge: badge,
    icon: icon, reportHtml: reportHtml, sectionHtml: sectionHtml, picker: picker, bindForm: bindForm, field: field, text: text, showFieldErrors: showFieldErrors,
    chart: chart, labelThemeButton: labelThemeButton, parseHash: parseHash, signedOut: signedOut, formData: formData, LABEL: LABEL
  };
})();
