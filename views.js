/* The pages. Each view draws into the main area and talks to the server through Z.call. */
var App = (function () {
  'use strict';
  var esc = Z.esc, num = Z.num, $ = Z.$, $$ = Z.$$, href = Z.href;

  function guest(inner) {
    var mark = Z.state.logo ? '<img src="' + esc(Z.state.logo) + '" alt="">' : esc((BOOT.appName || 'Z').charAt(0));
    $('#app').innerHTML = '<div class="guest"><div class="guest-visual" id="guestVisual"><div class="guest-visual-mark">' + mark + '</div>'
      + '<div class="marquee" id="guestMarquee"><span id="guestBanner"></span><button type="button" class="marquee-stop" id="marqueeStop" aria-label="Pause the scrolling line" aria-pressed="false">❚❚</button></div></div>'
      + '<div class="guest-panel"><button type="button" class="icon-btn theme-float" data-theme-toggle></button><div class="guest-form">'
      + '<div class="mark">' + mark + '</div><h1>' + esc(BOOT.church || '') + '</h1><p class="sub">' + esc(BOOT.appName || 'Attendance') + '</p>' + inner + '</div></div></div>';
    $$('[data-theme-toggle]').forEach(Z.labelThemeButton);
    $('#marqueeStop').addEventListener('click', function () {
      var m = $('#guestMarquee'), on = m.classList.toggle('paused');
      this.setAttribute('aria-pressed', on ? 'true' : 'false');
      this.setAttribute('aria-label', on ? 'Play the scrolling line' : 'Pause the scrolling line');
      this.textContent = on ? '▶' : '❚❚';
    });
    var paint = function (p) {
      var v = $('#guestVisual'), b = $('#guestBanner');
      if (!v) return;
      if (p.data) { v.style.backgroundImage = 'url("' + p.data + '")'; var m = v.querySelector('.guest-visual-mark'); if (m) m.remove(); }
      b.textContent = p.banner || '';
      if (!p.banner) b.parentNode.remove();
    };
    if (Z.state.picture) paint(Z.state.picture);
    else Z.call('picture').then(function (p) { Z.state.picture = p; paint(p); }).catch(function () {});
  }

  /** Where to open with no network: the report form for this person's role. */
  function startForm(me) { return me.arm ? '#/fs/entry/new' : '#/entry/attendance/new'; }

  function start() {
    Promise.all([Z.call('boot'), Z.call('logo').catch(function () { return null; })]).then(function (res) {
      var b = res[0];
      Z.state.logo = res[1];
      BOOT.appName = b.appName; BOOT.church = b.church; BOOT.zone = b.zone; BOOT.hasUsers = b.hasUsers; BOOT.setupPending = b.setupPending; BOOT.web = b.web || '';
      document.title = b.appName;
      if (BOOT.reset === 'invalid') { BOOT.reset = ''; return badLink(); }
      if (BOOT.reset) return resetView(BOOT.reset);
      if (!b.initialised) return guest('<div class="notice warn">The system has not been set up yet. The owner of the script must run <b>initialise</b> in the Apps Script editor first.</div>');
      if (b.needsSetup) return setupView();
      if (!Z.state.token) return login();
      return Z.call('me').then(function (me) {
        Z.state.me = me;
        if (Z.state.offline && (!location.hash || location.hash === '#' || location.hash === '#/')) location.hash = startForm(me);
        Z.route();
      }).catch(function () { login(); });
    }).catch(function (e) {
      guest('<div class="notice bad" role="alert">' + esc(e.message || 'The system could not be reached.') + '</div>');
    });
  }

  /** On the script's own address, once the GitHub address is set: show people the new address. */
  function movedNotice() {
    if (window.ZAS_API || !BOOT.web) return '';
    return '<div class="notice info" role="status">The system has a new address: <a href="' + esc(BOOT.web) + '" target="_top" rel="noopener"><b>' + esc(BOOT.web.replace(/^https:\/\//, '')) + '</b></a>. Open it and save it on your phone. Your username and password are the same.</div>';
  }

  function login(message) {
    guest(movedNotice() + (message ? '<div class="notice info" role="status">' + esc(message) + '</div>' : '')
      + '<form id="login" novalidate><div data-form-error></div>'
      + Z.field('username', 'Username', '<input type="text" id="f_username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="40" data-required="Enter your username.">')
      + Z.field('password', 'Password', '<div class="pw"><input type="password" id="f_password" name="password" autocomplete="current-password" data-required="Enter your password."><button type="button" class="pw-toggle" data-pw-toggle aria-label="Show the password" aria-pressed="false">Show</button></div>')
      + '<button type="submit" class="btn primary" style="width:100%">Sign in</button></form>'
      + '<p class="small muted" style="margin:1rem 0 0;text-align:center">Forgotten your password? Ask your administrator for a new sign-in link.</p>'
      + (BOOT.setupPending ? '<p class="small" style="margin:.6rem 0 0;text-align:center"><a href="#" id="toSetup">Create the System Admin with the set-up code</a></p>' : ''));
    var ts = $('#toSetup'); if (ts) ts.addEventListener('click', function (e) { e.preventDefault(); setupView(); });
    var f = $('#login');
    var prof = Z.offlineProfile();
    var offerOffline = function () {
      if (!prof || prof.role === 'system' || $('#offlineGo')) return;
      var p = document.createElement('div');
      p.className = 'notice warn'; p.setAttribute('role', 'status'); p.style.marginTop = '1rem';
      p.innerHTML = '<b>No network?</b> You can still enter reports on this device as <b>' + esc(prof.full_name) + '</b>. They are sent when the network returns and you sign in.'
        + '<div style="margin-top:.6rem"><button type="button" class="btn" id="offlineGo">Enter reports without network</button></div>';
      f.parentNode.insertBefore(p, f.nextSibling);
      $('#offlineGo').addEventListener('click', function () {
        Z.state.me = prof; Z.state.token = null; Z.state.offlineOnly = true;
        location.hash = startForm(prof); Z.route();
      });
    };
    if (navigator.onLine === false || Z.state.offline) offerOffline();
    f.addEventListener('zas-offline', offerOffline);
    $('#f_username').focus();
    Z.bindForm(f, 'login', null, function (d) {
      Z.state.token = d.token; Z.state.me = d.me; Z.state.offlineOnly = false;
      Z.rememberMe(d.me);
      if (Z.outbox.mine().some(function (x) { return x.review; })) { try { sessionStorage.setItem('zas-token', d.token); } catch (e) {} location.hash = '#/outbox'; Z.route(); return; }
      try { sessionStorage.setItem('zas-token', d.token); } catch (e) {}
      if (!location.hash || location.hash === '#') location.hash = '#/'; else Z.route();
    });
  }

  function setupView() {
    guest('<h2 style="margin-bottom:.5rem">Create the System Admin</h2><p class="small muted">The System Admin looks after the system: settings, backups, maintenance and the Zonal Admin accounts. The one-time set-up code is shown in the Apps Script editor when you run <b>initialise</b>.</p>'
      + '<form id="setup" novalidate><div data-form-error></div>'
      + Z.text('code', 'Set-up code', '', 'autocomplete="off" inputmode="numeric"')
      + Z.text('zone_name', 'Name of the zone', BOOT.zone || 'Northern', '')
      + Z.text('full_name', 'Your full name', '', 'autocomplete="name"')
      + Z.text('username', 'Choose a username', '', 'autocomplete="username" autocapitalize="none"')
      + Z.field('password', 'Choose a password', '<div class="pw"><input type="password" id="f_password" name="password" autocomplete="new-password"><button type="button" class="pw-toggle" data-pw-toggle aria-label="Show the password" aria-pressed="false">Show</button></div>', 'At least 10 characters.')
      + Z.field('confirm', 'Type the password again', '<div class="pw"><input type="password" id="f_confirm" name="confirm" autocomplete="new-password"><button type="button" class="pw-toggle" data-pw-toggle aria-label="Show the password" aria-pressed="false">Show</button></div>')
      + '<button type="submit" class="btn primary" style="width:100%">Create the System Admin</button></form>'
      + (BOOT.hasUsers ? '<p class="small muted" style="margin:1rem 0 0;text-align:center">Not the System Admin? <a href="#" id="toLogin">Sign in</a></p>' : ''));
    var tl = $('#toLogin'); if (tl) tl.addEventListener('click', function (e) { e.preventDefault(); login(); });
    Z.bindForm($('#setup'), 'setup', null, function () { login('The System Admin is ready. Sign in with the account you just created, then add the Zonal Admin under Zonal Admins.'); });
  }

  function badLink(text) {
    guest('<div class="notice bad" role="alert">' + esc(text || 'This sign-in link is not complete. Copy the whole link again, or ask your administrator for a new one.') + '</div><a class="btn" style="width:100%" href="' + esc(window.ZAS_API ? location.pathname : BOOT.url || '#') + '" target="_top">Go to sign in</a>');
  }
  function resetView(token) {
    // Keep the one-time code out of the address bar and the browser history.
    try {
      if (window.ZAS_API) history.replaceState(null, '', location.pathname + location.hash);
      else if (window.google && google.script && google.script.history) google.script.history.replace(null, {}, '');
    } catch (e) {}
    Z.call('link.check', { token: token }).then(function (u) {
      if (!u) { badLink('This link has expired or has already been used. Ask your administrator for a new one.'); return; }
      guest((u.choose
          ? '<h2 style="margin-bottom:.4rem">Set up your account</h2><p class="small muted">Welcome, <b>' + esc(u.full_name) + '</b>' + (u.role_label ? ' (' + esc(u.role_label) + ')' : '') + '. Choose the username and password you will sign in with.</p>'
          : '<h2 style="margin-bottom:.4rem">Set your password</h2><p class="small muted">Account: <b>' + esc(u.username) + '</b> (' + esc(u.full_name) + ')</p>')
        + '<form id="reset" novalidate><div data-form-error></div>'
        + (u.choose ? Z.field('username', 'Choose a username', '<input type="text" id="f_username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="40" data-required="Choose a username.">',
            '3 to 40 letters, numbers, dots, dashes or underscores, for example kwame.mensah. You will type it every time you sign in, and it cannot be changed later.') : '')
        + Z.field('password', 'New password', '<div class="pw"><input type="password" id="f_password" name="password" autocomplete="new-password"><button type="button" class="pw-toggle" data-pw-toggle aria-label="Show the password" aria-pressed="false">Show</button></div>', 'At least 10 characters, not containing your username.')
        + Z.field('confirm', 'Type it again', '<div class="pw"><input type="password" id="f_confirm" name="confirm" autocomplete="new-password"><button type="button" class="pw-toggle" data-pw-toggle aria-label="Show the password" aria-pressed="false">Show</button></div>')
        + '<button type="submit" class="btn primary" style="width:100%">' + (u.choose ? 'Create my account' : 'Save password') + '</button></form>');
      if (u.choose) $('#f_username').focus();
      Z.bindForm($('#reset'), 'link.use', { token: token }, function (d) {
        BOOT.reset = '';
        login(u.choose ? 'Your account is ready. Your username is ' + d.username + '. Sign in with it now.' : 'Your password is set. Sign in with it now.');
        if (d && d.username && $('#f_username')) { $('#f_username').value = d.username; $('#f_password').focus(); }
      });
    }).catch(function (e) { badLink(e.message); });
  }

  // ------------------------------------------------------------------ shared pieces
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function monthLabel(ym) { var p = String(ym).split('-'); return MONTHS[Number(p[1]) - 1] + ' ' + p[0]; }
  function sysAdmin() { return Z.state.me && Z.state.me.role === 'system'; }
  function thisMonth() { return Z.state.me.today.substring(0, 7); }

  function trail(node, path, q) {
    if (!node || !node.crumbs || node.crumbs.length < 2) return '';
    return '<nav class="trail" aria-label="Where you are">' + node.crumbs.map(function (c, i) {
      var last = i === node.crumbs.length - 1;
      var target = Object.assign({}, q, { level: c.level === 'zone' ? '' : c.level, id: c.level === 'zone' ? '' : c.id });
      return (i ? '<span class="sep" aria-hidden="true">›</span>' : '') + (last ? '<strong aria-current="page">' + esc(c.name) + '</strong>' : '<a href="' + esc(href(path, target)) + '">' + esc(c.name) + '</a>');
    }).join('') + '</nav>';
  }

  function typeOptions(selected, opts) {
    opts = opts || {};
    var out = opts.all ? '<option value="all"' + (selected === 'all' ? ' selected' : '') + '>All meeting types</option>' : '';
    Z.state.me.types.forEach(function (t) { if (opts.noHcf && t.is_hcf) return; out += '<option value="' + esc(t.code) + '"' + (selected === t.code ? ' selected' : '') + '>' + esc(t.code) + ', ' + esc(t.name) + '</option>'; });
    if (opts.metrics) out += '<option value="metrics"' + (selected === 'metrics' ? ' selected' : '') + '>Church Metrics</option>';
    return out;
  }

  /**
   * A filter bar. controls: list of names. Values come from q; submitting moves to the
   * same page with the new values.
   */
  function filters(path, q, controls, data) {
    data = data || {};
    var has = function (c) { return controls.indexOf(c) >= 0; };
    var bits = [];
    if (data.node && data.node.name) bits.push(data.node.name);
    if (has('month')) bits.push(monthLabel(q.month || data.month || thisMonth()));
    if (has('date')) bits.push(Z.date(q.date || Z.state.me.today));
    if (q.type && q.type !== 'all') bits.push(q.type);
    var h = '<details class="filter-box no-print" id="filterBox"><summary><span><span class="muted">Showing</span> ' + esc(bits.join(', ')) + '</span></summary><form class="filters" id="filters" role="search" style="margin:0">';
    if (has('unit') || has('unit-district') || has('unit-division')) h += '<div class="wide"><div id="unitPicker"' + (has('unit-district') ? ' data-target="district"' : has('unit-division') ? ' data-target="division"' : '') + '></div></div>';
    if (has('section')) h += '<div><label for="q_section">Section</label><select id="q_section" name="section"><option value="">Every section</option>' + (data.sectionList || []).map(function (x) {
      return '<option' + (q.section === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></div>';
    if (has('month')) h += '<div><label for="q_month">Month</label><input type="month" id="q_month" name="month" value="' + esc(q.month || data.month || thisMonth()) + '" max="' + esc(thisMonth()) + '"></div>';
    if (has('date')) h += '<div><label for="q_date">Date</label><input type="date" id="q_date" name="date" value="' + esc(q.date || Z.state.me.today) + '" max="' + esc(Z.state.me.today) + '"></div>';
    if (has('type') || has('type-all') || has('type-metrics')) {
      h += '<div><label for="q_type">' + (has('type-metrics') ? 'Report' : 'Meeting') + '</label><select id="q_type" name="type">'
        + typeOptions(q.type || (has('type-all') && path.indexOf('daily') >= 0 ? 'all' : 'SWS'), { all: has('type-all'), metrics: has('type-metrics') }) + '</select></div>';
    }
    if (has('fstype')) h += '<div><label for="q_type">Meeting</label><select id="q_type" name="type">' + (Z.state.me.fsTypes || []).map(function (t) {
      return '<option value="' + esc(t.code) + '"' + ((q.type || data.type) === t.code ? ' selected' : '') + '>' + esc(t.code + ', ' + t.name) + '</option>'; }).join('') + '</select></div>';
    if (has('period')) {
      h += '<div><label for="q_period">Crusade period</label><select id="q_period" name="period">' + ((data.periods || []).length ? '' : '<option value="">No crusade periods yet</option>')
        + (data.periods || []).map(function (p) { return '<option value="' + p.id + '"' + (Number(data.period) === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></div>';
    }
    if (has('gck')) {
      h += '<div><label for="q_day">GCK day</label><select id="q_day" name="day"><option value="">All days</option>'
        + ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Impact Academy'].map(function (d) { return '<option' + (q.day === d ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select></div>'
        + '<div><label for="q_layout">Columns</label><select id="q_layout" name="layout"><option value="">Full detail</option><option value="summary"' + (q.layout === 'summary' ? ' selected' : '') + '>Summary</option></select></div>';
    }
    if (has('by') && (data.byLevels || []).length > 1) {
      h += '<div><label for="q_by">Show by</label><select id="q_by" name="by">' + data.byLevels.map(function (l) {
        return '<option value="' + l + '"' + (data.by === l ? ' selected' : '') + '>' + Z.LABEL[l] + '</option>'; }).join('') + '</select></div>';
    }
    if (has('of') && (data.ofLevels || []).length > 1) {
      h += '<div><label for="q_of">Pastors of</label><select id="q_of" name="of"><option value="">Every level</option>' + data.ofLevels.map(function (l) {
        return '<option value="' + l + '"' + (q.of === l ? ' selected' : '') + '>' + { region: 'Regions', division: 'Divisions', group: 'Group Coordinators', district: 'Districts', location: 'Locations' }[l] + '</option>'; }).join('') + '</select></div>';
    }
    if (has('q')) h += '<div><label for="q_q">Search</label><input type="search" id="q_q" name="q" value="' + esc(q.q || '') + '" maxlength="60" placeholder="' + (path.indexOf('locations') >= 0 ? 'Name, pastor or phone' : path.indexOf('heads') >= 0 ? 'Name, post or phone' : 'Name, rank or phone') + '"></div>';
    if (has('detail')) h += '<div class="choice-cell"><label class="check"><input type="checkbox" name="detail" value="1"' + (q.detail ? ' checked' : '') + '> List every location</label></div>';
    h += '<div><button type="submit" class="btn primary" style="width:100%">Show</button></div>';
    if (has('range')) h += '<details class="wide"' + (q.from ? ' open' : '') + '><summary class="small">Use a date range instead of a month</summary><div class="filters" style="margin:.5rem 0 0">'
      + '<div><label for="q_from">From</label><input type="date" id="q_from" name="from" value="' + esc(q.from || '') + '"></div><div><label for="q_to">To</label><input type="date" id="q_to" name="to" value="' + esc(q.to || '') + '"></div></div></details>';
    h += '</form></details>';
    return h;
  }

  function wireFilters(path, q, node) {
    var form = $('#filters');
    if (!form) return;
    if (window.innerWidth >= 768) $('#filterBox').open = true;
    var box = $('#unitPicker');
    var chosen = node && node.level !== 'zone' ? { level: node.level, id: node.id } : null;
    if (box) {
      var chain = {};
      (node && node.crumbs || []).forEach(function (c) { if (c.level !== 'zone') chain[c.level + '_id'] = c.id; });
      Z.picker(box, { target: box.getAttribute('data-target') || 'location', chain: chain, filter: true, onChange: function (d) { chosen = d; } });
      if (!box.children.length) box.parentNode.remove();
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = Z.formData(form);
      if (box && box.value) { var c = box.value(); d.level = c ? c.level : ''; d.id = c ? c.id : ''; }
      else if (chosen) { d.level = chosen.level; d.id = chosen.id; }
      if (!d.detail) delete d.detail;
      Z.go(path, d);
    });
  }

  function figure(label, value, sub, link, cls) {
    var inner = '<span class="label">' + esc(label) + '</span><div class="value">' + value + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '');
    return link ? '<a class="card figure ' + (cls || '') + '" href="' + esc(link) + '">' + inner + '</a>' : '<div class="card figure ' + (cls || '') + '">' + inner + '</div>';
  }

  // ------------------------------------------------------------------ dashboard
  function dashboard(main, r) {
    var q = r.q;
    return Z.call('dashboard', { level: q.level, id: q.id, month: q.month, type: q.type }).then(function (d) {
      var keep = { month: d.month, type: d.type.code };
      var t = d.tiles;
      var link = function (p) { return href(p, Object.assign({ level: q.level, id: q.id }, keep)); };
      var pct = function (c) { return c.percent === null ? '–' : Z.pct(c.percent); };
      var canEnter = Z.state.me.rank >= 3;
      var h = '<div class="page-head"><div><h1>' + esc(d.node.label) + '</h1><p class="muted small">' + esc(d.type.code + ', ' + d.type.name) + ' in ' + esc(d.monthLabel) + '</p></div>'
        + (canEnter ? '<a class="btn primary" href="#/entry/attendance/new">Enter a report</a>' : '') + '</div>'
        + (d.early ? '<div class="notice info small" role="status">' + esc(d.early) + ' has only just begun, so this shows ' + esc(d.monthLabel) + '. Choose a month below to change it.</div>' : '')
        + trail(d.node, '/', keep) + filters('/', q, ['unit', 'month', 'type'], { node: d.node, month: d.month })
        + '<h2 class="sr">This month</h2><div class="grid g2 g4" style="margin-bottom:.75rem">'
        + figure('Total attendance', num(t.total), 'Average per meeting, ' + d.monthLabel, link('/reports/attendance'), 'lead')
        + figure('Newcomers', num(t.newcomers), num(t.newcomers_male) + ' male, ' + num(t.newcomers_female) + ' female')
        + (d.type.is_hcf ? figure('HCF reports', num(t.reports), 'Cumulative ' + num(t.cumulative)) : figure('Converts', num(t.converts), 'This month'))
        + figure('Reports sent', pct(t.compliance), t.compliance.expected ? t.compliance.submitted + ' of ' + t.compliance.expected + ' due so far' : 'Nothing due yet', link('/reports/compliance'))
        + figure('Highest ' + d.type.code + ' week', t.highest ? num(t.highest.total) : '–', t.highest ? 'Week ' + t.highest.week : 'No reports yet', link('/reports/analysis'))
        + figure('Average ' + d.type.code + ' week', t.average === null ? '–' : num(t.average), t.weeks + ' week' + (t.weeks === 1 ? '' : 's') + ' with reports', link('/reports/analysis'))
        + figure('Lowest ' + d.type.code + ' week', t.lowest ? num(t.lowest.total) : '–', t.lowest ? 'Week ' + t.lowest.week : 'No reports yet', link('/reports/analysis'))
        + (d.type.is_hcf ? figure('Cumulative', num(t.cumulative), 'All reports added') : figure('Tithes and offering', esc(Z.state.me.settings.currency) + ' ' + Z.money(t.offering), t.reports + ' report' + (t.reports === 1 ? '' : 's')))
        + '</div>'
        + '<div class="grid split" style="margin-bottom:.75rem"><div class="card pad"><h2>Total attendance, last 12 months</h2><p class="small muted">' + esc(d.type.code) + ': each location\'s average per meeting, added together.' + (d.trend.partial ? ' The current month is left out until it ends.' : '') + '</p><div id="trend"></div></div>'
        + '<div class="card pad"><h2>Also this month</h2><ul class="list" style="margin:.4rem -1rem -.4rem">'
        + '<li><span class="grow"><b>HCF attendance</b><span class="small muted">Sum of HCF location averages</span></span>' + (t.hcf === null ? '<span class="dash" aria-label="no figure">–</span>' : '<a href="' + esc(link('/reports/hcf')) + '"><b>' + num(t.hcf) + '</b></a>') + '</li>'
        + '<li><span class="grow"><b>Church Metrics entered</b><span class="small muted">' + t.metrics.submitted + ' of ' + t.metrics.expected + ' locations</span></span><b>' + pct(t.metrics) + '</b></li>'
        + (d.arms ? ['dlso', 'dlcf'].map(function (a) {
          return '<li><span class="grow"><b>' + a.toUpperCase() + ' ' + esc(d.type.code) + '</b><span class="small muted">' + (a === 'dlso' ? 'Schools' : 'Campuses') + ': sum of fellowship ' + esc(d.type.code) + ' averages</span></span><a href="' + esc(href('/reports/' + a, { level: q.level, id: q.id, month: d.month, type: d.type.code })) + '"><b>' + num(d.arms[a]) + '</b></a></li>';
        }).join('') + '<li><span class="grow"><b>Overall ' + esc(d.type.code) + ' picture</b><span class="small muted">Church, DLSO and DLCF ' + esc(d.type.code) + ' side by side</span></span><a href="' + esc(href('/reports/overview', { level: q.level, id: q.id, month: d.month, type: d.type.code })) + '">Open</a></li>' : '')
        + (d.gck ? '<li><span class="grow"><b>GCK: ' + esc(d.gck.name) + '</b><span class="small muted">' + num(d.gck.converts) + ' converts, ' + num(d.gck.newcomers) + ' newcomers</span></span><a href="' + esc(href('/reports/gck', { level: q.level, id: q.id, period: d.gck.id })) + '"><b>' + num(d.gck.attendance) + '</b></a></li>' : '')
        + '</ul></div></div>';
      if (d.counts.length) {
        h += '<h2 style="margin:1.2rem 0 .2rem">Reporting this month</h2><p class="small muted">' + esc(d.type.code) + ' for locations and above; HCF reports for HCF locations.</p><div class="grid g2 g5" style="margin-bottom:1rem">'
          + d.counts.map(function (c) { return '<div class="card figure"><span class="label">' + esc(c.label) + ' reporting</span><div class="value">' + num(c.reporting) + ' <span class="of">of ' + num(c.active) + '</span></div></div>'; }).join('') + '</div>';
        if (!d.counts.some(function (c) { return c.active; })) h += '<div class="notice info">No units have been created yet. Start under Organisation in the menu.</div>';
      }
      var drill = function (l) { return href('/', Object.assign({}, keep, { level: l.level, id: l.id })); };
      if (d.table) {
        h += '<div class="page-head" style="margin-top:1.2rem"><div><h2>' + esc(d.type.code) + ' attendance by ' + esc(Z.lc(Z.LABEL[d.table.by])) + '</h2><p class="small muted">Select a name to look inside it.</p></div></div>';
        h += d.table.rows.length ? tableOnly(d.table, drill) : '<div class="card empty">Nothing has been reported for this month yet.</div>';
      }
      h += '<div class="page-head" style="margin-top:1.2rem"><div><h2>Submission status</h2><p class="small muted">Church Metrics for ' + esc(d.monthLabel) + ', and ' + esc(d.type.code) + ' reports for the weeks due so far.</p></div><a class="small" href="' + esc(link('/reports/compliance')) + '">Week by week</a></div>';
      h += d.status.rows.length ? tableOnly(d.status, drill) : '<div class="card empty">No active locations yet.</div>';
      h += '<h2 style="margin:1.2rem 0 .6rem">Recent reports</h2>';
      h += d.recent.length ? '<div class="card"><ul class="list">' + d.recent.map(function (x) {
        return '<li><span class="grow"><b><a href="' + esc(href('/entry/attendance/' + x.id, { p: x.p })) + '">' + esc(x.location) + '</a></b><span class="small muted">' + esc(Z.date(x.date)) + ', ' + esc(x.district) + '</span></span><span class="badge type">' + esc(x.type) + '</span><b class="nowrap">' + num(x.total) + '</b></li>';
      }).join('') + '</ul></div>' : '<div class="card empty">No attendance reports yet.' + (sysAdmin() ? '' : ' <a href="#/entry/attendance/new">Enter the first one</a>.') + '</div>';
      main.innerHTML = h;
      wireFilters('/', q, d.node);
      var pts = d.trend.points || d.trend;
      Z.chart($('#trend'), 'line', pts.map(function (x) { return x.label; }), pts.map(function (x) { return x.value; }), 'Total attendance');
    });
  }

  function tableOnly(t, linkFor) { return Z.sectionHtml(t, linkFor); }

  // ------------------------------------------------------------------ reports
  var REPORTS = {
    attendance: ['Attendance report', ['unit', 'month', 'type-all', 'by', 'range']],
    hcf: ['HCF report', ['unit', 'month', 'by']],
    daily: ['Daily report', ['unit', 'date', 'type-all', 'by']],
    metrics: ['Church Metrics report', ['unit', 'month', 'by']],
    gck: ['GCK report', ['unit', 'period', 'gck', 'by']],
    compliance: ['Submission status', ['unit', 'month', 'type-metrics', 'by', 'detail']],
    analysis: ['Analysis', ['unit', 'month', 'type', 'by']],
    pastors: ['Pastors', ['unit', 'of', 'q']],
    locations: ['Location directory', ['unit-district', 'q']],
    heads: ['Sectional heads', ['unit-division', 'section', 'q']],
    dlso: ['DLSO report', ['unit-division', 'month', 'fstype', 'by']],
    dlcf: ['DLCF report', ['unit-division', 'month', 'fstype', 'by']],
    overview: ['Overall picture', ['unit-division', 'month', 'type']]
  };
  var TABS = [['attendance', 'Attendance'], ['hcf', 'HCF'], ['daily', 'Daily'], ['metrics', 'Church Metrics'], ['gck', 'GCK'], ['compliance', 'Submission status'], ['analysis', 'Analysis']];

  function report(main, r) {
    var name = r.parts[1];
    var def = REPORTS[name];
    if (!def) throw { message: 'That report does not exist.' };
    var q = r.q;
    var payload = Object.assign({ name: name }, q);
    if (name === 'daily' && !q.type) payload.type = 'all';
    var call = name === 'dlso' || name === 'dlcf' ? Z.call('fs.report', Object.assign({}, q, { arm: name })) : name === 'overview' ? Z.call('overview', q) : Z.call('report', payload);
    return call.then(function (t) {
      var path = '/reports/' + name;
      var keep = { level: q.level, id: q.id, month: q.month };
      var h = '<div class="page-head report-head"><h1>' + esc(def[0]) + '</h1>' + (name === 'pastors' && Z.state.me.role === 'zonal' ? '<a class="btn no-print" href="#/zone">Zonal Coordinating Overseer</a>' : '') + (name === 'heads' && t.canEdit ? '<div class="btn-row no-print">' + (Z.state.me.role === 'zonal'
          ? '<a class="btn primary" href="#/heads?level=zone&id=0">Enter zonal heads</a><a class="btn" href="#/heads?level=region">Region and division heads</a>'
          : '<a class="btn primary" href="#/heads">Update sectional heads</a>') + '</div>' : '') + '</div>';
      if (['pastors', 'locations', 'heads', 'dlso', 'dlcf', 'overview'].indexOf(name) < 0) h += '<nav class="tabs no-print" aria-label="Reports">' + TABS.map(function (tb) {
        return '<a href="' + esc(href('/reports/' + tb[0], keep)) + '"' + (tb[0] === name ? ' class="on" aria-current="page"' : '') + '>' + tb[1] + '</a>'; }).join('') + '</nav>';
      h += filters(path, q, def[1], t) + trail(t.node, path, Object.assign({}, q, { level: '', id: '' }));
      var link = function (l) { return href(path, Object.assign({}, q, { level: l.level, id: l.id, by: '' })); };
      if (name === 'analysis' && t.charts) {
        var c = t.charts.tiles;
        h += '<div class="grid g2 g4" style="margin-bottom:.5rem">' + figure('Total attendance', num(c.total), 'Average per meeting, ' + c.locations + ' locations', null, 'lead')
          + figure('Highest week', c.highest ? num(c.highest.total) : '–', c.highest ? 'Week ' + c.highest.week : '')
          + figure('Average week', c.average === null ? '–' : num(c.average), c.weeks + ' week' + (c.weeks === 1 ? '' : 's') + ' with reports')
          + figure('Lowest week', c.lowest ? num(c.lowest.total) : '–', c.lowest ? 'Week ' + c.lowest.week : '') + '</div>';
      }
      h += Z.reportHtml(t, link);
      if (name === 'analysis' && t.charts) {
        var cut = t.charts.partial ? '<p class="small muted">The current month is left out until it ends.</p>' : '';
        h += '<h2 class="section-title">Charts</h2><div class="grid md-g2"><div class="card pad"><h3>Total attendance, last 12 months</h3>' + cut + '<div id="c1"></div></div>'
          + '<div class="card pad"><h3>Who attends</h3><div id="c2"></div></div><div class="card pad"><h3>Total attendance by ' + esc(Z.lc(Z.LABEL[t.by])) + '</h3><div id="c3"></div></div>'
          + '<div class="card pad"><h3>Newcomers, last 12 months</h3>' + cut + '<div id="c4"></div></div></div>';
      }
      main.innerHTML = h;
      wireFilters(path, q, t.node);
      if (name === 'analysis' && t.charts) {
        var ch = t.charts;
        Z.chart($('#c1'), 'line', ch.trend.map(function (x) { return x.label; }), ch.trend.map(function (x) { return x.value; }), 'Total attendance');
        Z.chart($('#c2'), 'bar', ch.who.map(function (x) { return x.label; }), ch.who.map(function (x) { return x.value; }), 'Who attends');
        Z.chart($('#c3'), 'hbar', ch.groups.map(function (x) { return x.label; }), ch.groups.map(function (x) { return x.value; }), 'By unit');
        Z.chart($('#c4'), 'bar', ch.trend.map(function (x) { return x.label; }), ch.trend.map(function (x) { return x.newcomers; }), 'Newcomers');
      }
    });
  }

  // ------------------------------------------------------------------ data entry
  var KIND = {
    attendance: { title: 'Attendance', one: 'attendance report' },
    hcf: { title: 'HCF attendance', one: 'HCF report' },
    gck: { title: 'GCK', one: 'GCK report' },
    metrics: { title: 'Church Metrics', one: 'Church Metrics record' }
  };
  var PEOPLE = [['adult_male', 'Adult male'], ['adult_female', 'Adult female'], ['youth_boys', 'Youth boys'], ['youth_girls', 'Youth girls'], ['children_boys', 'Children boys'], ['children_girls', 'Children girls']];
  var NEW = [['newcomers_male', 'Newcomers male'], ['newcomers_female', 'Newcomers female']];
  var CONV = [['converts_male', 'Converts male'], ['converts_female', 'Converts female']];
  var METRICS = [['baptized', 'Baptized'], ['weddings', 'Weddings'], ['workers', 'Workers'], ['hcf_count', 'Number of HCF'], ['pastors', 'Pastors']];

  function entry(main, r) {
    var kind = r.parts[1];
    if (!KIND[kind]) throw { message: 'Unknown kind of report.' };
    if (sysAdmin() && (r.parts[2] === 'new' || r.parts[3] === 'edit')) throw { code: 'FORBIDDEN', message: 'Reports are entered and corrected by the Zonal Admin and the admins below. The System Admin can read every report.' };
    if (r.parts[2] === 'new') return entryForm(main, kind, null);
    if (r.parts[2] && r.parts[3] === 'edit') return Z.call('entry.get', { kind: kind, id: r.parts[2], p: r.q.p }).then(function (rep) { return entryForm(main, kind, rep); });
    if (r.parts[2]) return entryShow(main, kind, r.parts[2], r.q.p);
    return entryList(main, kind, r);
  }

  function entryList(main, kind, r) {
    var q = r.q;
    return Promise.all([Z.call('entry.setup'), Z.call('entry.list', { kind: kind, month: q.month || (kind === 'gck' ? '' : thisMonth()), status: q.status, type: q.type, period: q.period })]).then(function (res) {
      var setup = res[0], d = res[1];
      var h = '<div class="page-head"><div><h1>' + esc(KIND[kind].title) + '</h1><p class="small muted">' + num(d.total) + ' report' + (d.total === 1 ? '' : 's') + ' found' + (d.total > 200 ? ', newest 200 shown' : '') + '. Open a report to correct' + (Z.state.me.rank <= 3 ? ', void or delete' : '') + ' it.</p></div>'
        + (sysAdmin() ? '' : '<a class="btn primary" href="#/entry/' + kind + '/new">Enter ' + (kind === 'metrics' ? 'metrics' : 'a report') + '</a>') + '</div>';
      h += '<form class="filters" id="ef">';
      if (kind === 'gck') h += '<div><label for="e_period">Crusade period</label><select id="e_period" name="period"><option value="">All</option>' + setup.allCrusades.map(function (c) { return '<option value="' + c.id + '"' + (Number(q.period) === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></div>';
      else h += '<div><label for="e_month">Month</label><input type="month" id="e_month" name="month" value="' + esc(q.month || thisMonth()) + '"></div>';
      if (kind === 'attendance') h += '<div><label for="e_type">Meeting</label><select id="e_type" name="type"><option value="">All</option>' + setup.types.filter(function (t) { return !t.is_hcf; }).map(function (t) { return '<option value="' + t.id + '"' + (Number(q.type) === t.id ? ' selected' : '') + '>' + esc(t.code) + '</option>'; }).join('') + '</select></div>';
      if (kind !== 'metrics') h += '<div><label for="e_status">Showing</label><select id="e_status" name="status"><option value="">Active reports</option><option value="voided"' + (q.status === 'voided' ? ' selected' : '') + '>Voided reports</option></select></div>';
      h += '<div><button class="btn" type="submit" style="width:100%">Show</button></div></form>';
      if (!d.rows.length) h += '<div class="card empty">No reports for this selection.' + (sysAdmin() ? '' : ' <a href="#/entry/' + kind + '/new">Enter one</a>.') + '</div>';
      else h += '<div class="card"><ul class="list">' + d.rows.map(function (x) {
        var title = kind === 'hcf' ? x.hcf + ', ' + x.location : x.location;
        var when = kind === 'metrics' ? monthLabel(x.year + '-' + (x.month < 10 ? '0' : '') + x.month) : Z.date(x.report_date) + (kind === 'gck' ? ', ' + x.gck_day : ', week ' + x.week);
        return '<li><span class="grow"><b><a href="' + esc(href('/entry/' + kind + '/' + x.id, { p: x.p })) + '">' + esc(title) + '</a></b><span class="small muted">' + esc(when) + '</span></span>'
          + (x.type ? '<span class="badge type">' + esc(x.type) + '</span>' : '') + (x.status === 'voided' ? '<span class="badge off">Voided</span>' : '')
          + (kind !== 'metrics' ? '<b class="nowrap">' + num(x.total) + '</b>' : '') + '</li>';
      }).join('') + '</ul></div>';
      main.innerHTML = h;
      $('#ef').addEventListener('submit', function (e) { e.preventDefault(); Z.go('/entry/' + kind, Z.formData($('#ef'))); });
    });
  }

  function numInputs(list, rep) {
    return '<div class="num-grid">' + list.map(function (f) {
      return Z.field(f[0], f[1], '<input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" id="f_' + f[0] + '" name="' + f[0] + '" value="' + esc(rep ? rep[f[0]] : '') + '" placeholder="0"' + (PEOPLE.some(function (p) { return p[0] === f[0]; }) ? ' data-sum' : '') + '>');
    }).join('') + '</div>';
  }

  function entryForm(main, kind, rep) {
    return Z.call('entry.setup').then(function (s) {
      var editing = !!rep;
      var h = '<div class="page-head"><div><h1>' + (editing ? 'Correct ' : 'Enter ') + esc(KIND[kind].one) + '</h1>'
        + (editing ? '<p class="small muted">' + esc(rep.path) + '</p>' : '') + '</div>' + Z.closeBtn(editing ? href('/entry/' + kind + '/' + rep.id, { p: rep.p }) : '#/entry/' + kind) + '</div>';
      h += '<form id="ent" class="card pad" novalidate style="max-width:860px" data-kind="' + kind + '"><div data-form-error></div>';
      if (!editing) {
        if (kind === 'gck' && !s.crusades.length) {
          main.innerHTML = h.replace('<form id="ent" class="card pad" novalidate style="max-width:860px" data-kind="' + kind + '"><div data-form-error></div>', '') + '<div class="notice warn">No crusade period is open. The Zonal Admin opens one under Crusade periods.</div>';
          return;
        }
        h += '<fieldset><legend>' + (kind === 'hcf' ? 'HCF location' : 'Location') + '</legend><div data-field="' + (kind === 'hcf' ? 'hcf_id' : 'location_id') + '"><div id="where"></div></div></fieldset>';
      }
      h += '<fieldset><legend>When</legend><div class="grid md-g2">';
      if (kind === 'attendance' && !editing) h += Z.field('type_id', 'Meeting', '<select id="f_type_id" name="type_id"><option value="">Choose</option>' + s.types.filter(function (t) { return !t.is_hcf; }).map(function (t) { return '<option value="' + t.id + '">' + esc(t.code + ', ' + t.name) + '</option>'; }).join('') + '</select>');
      if (kind === 'gck' && !editing) {
        h += Z.field('period_id', 'Crusade period', '<select id="f_period_id" name="period_id">' + s.crusades.map(function (c) { return '<option value="' + c.id + '" data-from="' + esc(c.start_date) + '" data-to="' + esc(c.end_date) + '">' + esc(c.name + ' (' + Z.date(c.start_date) + ' to ' + Z.date(c.end_date) + ')') + '</option>'; }).join('') + '</select>');
        h += Z.field('gck_day', 'GCK day', '<select id="f_gck_day" name="gck_day"><option value="">Choose</option>' + s.gckDays.map(function (d) { return '<option>' + esc(d) + '</option>'; }).join('') + '</select>');
      }
      if (kind === 'metrics') { if (!editing) h += Z.field('month', 'Month', '<input type="month" id="f_month" name="month" value="' + esc(thisMonth()) + '" max="' + esc(thisMonth()) + '">'); }
      else h += Z.field('report_date', 'Date of the meeting', '<input type="date" id="f_report_date" name="report_date" value="' + esc(rep ? rep.report_date : s.today) + '" max="' + esc(s.today) + '"' + (s.backdate ? ' min="' + esc(addDays(s.today, -s.backdate)) + '"' : '') + '>', '<span id="weekHint"></span>');
      h += '</div></fieldset>';
      if (kind === 'metrics') {
        h += '<fieldset><legend>Figures for the month</legend>' + numInputs(METRICS, rep) + '<p class="hint">Leave Number of HCF empty to use the number of active HCF locations.</p></fieldset>'
          + '<fieldset><legend>The location has</legend><div class="grid md-g2">' + yesNo('has_satellite', 'A satellite church', rep) + yesNo('has_building', 'Its own church building', rep) + '</div></fieldset>';
      } else {
        h += '<fieldset data-sum-group><legend>Attendance</legend>' + numInputs(PEOPLE, rep) + '<div class="total-line"><span>Total attendance</span><b data-sum-total>0</b></div></fieldset>';
        h += '<fieldset><legend>Newcomers' + (kind !== 'hcf' ? ' and converts' : '') + '</legend>' + numInputs(kind === 'hcf' ? NEW : NEW.concat(CONV), rep) + '</fieldset>';
        if (kind === 'attendance') h += '<fieldset><legend>Giving</legend><div class="num-grid">' + Z.field('offering', 'Tithes and offering (' + esc(Z.state.me.settings.currency) + ')',
          '<input type="text" inputmode="decimal" id="f_offering" name="offering" value="' + esc(rep ? rep.offering : '') + '" placeholder="0.00">') + '</div></fieldset>';
      }
      if (editing) h += Z.field('reason', 'What was wrong (optional)', '<input type="text" id="f_reason" name="reason" maxlength="250">', 'Shown in the report\'s history.');
      h += '<div class="btn-row"><button type="submit" class="btn primary">' + (editing ? 'Save correction' : 'Save report') + '</button></div></form>';
      main.innerHTML = h;
      var form = $('#ent');
      if (!editing) Z.picker($('#where'), { target: kind === 'hcf' ? 'hcf' : 'location', name: kind === 'hcf' ? 'hcf_id' : 'location_id' });
      wireSum(form);
      wireWeek(form);
      wirePeriod(form, s);
      if (!editing) {
        form.dataset.offline = '1';
        form.offlineLabel = function (pl) { return reportLabel(form, KIND[kind].one, pl); };
      }
      Z.bindForm(form, editing ? 'entry.update' : 'entry.create', editing ? { kind: kind, id: rep.id, version: rep.version, p: rep.p } : { kind: kind }, function (d) {
        if (editing) { Z.toast('Correction saved.'); Z.go('/entry/' + kind + '/' + rep.id, { p: d && d.p ? d.p : rep.p }); return; }
        if (d && d.queued) { heldOnDevice(form); return; }
        Z.toast('Report saved.');
        // Keep the location and meeting; clear the figures for the next one.
        $$('[data-field] input[inputmode]', form).forEach(function (i) { i.value = ''; });
        $$('input[type=radio]', form).forEach(function (i) { i.checked = false; });
        wireSum(form);
        var box = $('[data-form-error]', form);
        box.innerHTML = '<div class="notice ok" role="status">Saved. <a href="' + esc(href('/entry/' + kind + '/' + d.id, { p: d.p })) + '">Open it</a>, or enter the next one below.</div>';
        box.scrollIntoView({ block: 'center' });
      });
      form.addEventListener('click', function (e) { if (e.target.matches && e.target.matches('[data-open-existing]')) { e.preventDefault(); } });
    });
  }

  /** What the waiting list shows for a report kept on the device. */
  function reportLabel(form, what, pl) {
    var picked = function (sel) { var o = sel && sel.options[sel.selectedIndex]; return o && o.value ? o.textContent : ''; };
    var unit = '';
    $$('#where select, #f_institution_id', form).forEach(function (s) { var t = picked(s); if (t) unit = t; });
    if (!unit && $('#where p', form)) unit = $('#where p', form).textContent.trim();   // a unit that was not chosen: the person's own
    var meeting = picked($('#f_type_id', form)).split(',')[0] || picked($('#f_gck_day', form));
    var total = $('[data-sum-total]', form);
    return { what: what.charAt(0).toUpperCase() + what.slice(1), unit: unit, meeting: meeting, date: pl.report_date || pl.month || '', total: total ? total.textContent : '' };
  }
  /** A report that will be sent later: clear the figures, as after saving, and say what happens next. */
  function heldOnDevice(form) {
    Z.toast('No network: kept on this device.');
    $$('[data-field] input[inputmode]', form).forEach(function (i) { i.value = ''; });
    $$('input[type=radio]', form).forEach(function (i) { i.checked = false; });
    wireSum(form);
    var n = Z.outbox.mine().length;
    var box = $('[data-form-error]', form);
    box.innerHTML = '<div class="notice warn" role="status"><b>No network, so this report is kept on this device.</b> It will be sent by itself as soon as the network returns'
      + (Z.state.offlineOnly ? ' and you sign in' : '') + '. ' + n + ' report' + (n === 1 ? ' is' : 's are') + ' waiting. <a href="#/outbox">See them</a>, or enter the next one below.</div>';
    box.scrollIntoView({ block: 'center' });
  }

  // ------------------------------------------------------------------ reports waiting on this device
  function outbox(main) {
    var mine = Z.outbox.mine().slice().sort(function (a, b) { return a.at.localeCompare(b.at); });
    var waiting = mine.filter(function (x) { return x.status === 'waiting' && !x.review; });
    var review = mine.filter(function (x) { return x.review; });
    var problems = mine.filter(function (x) { return x.status === 'problem' && !x.review; });
    var off = Z.state.offline || Z.state.offlineOnly;
    var line = function (x) {
      var l = x.label || {};
      return '<li><span class="grow"><b>' + esc(l.unit || l.what || 'Report') + '</b><span class="small muted">' + esc([l.what, l.meeting, !l.date ? '' : l.date.length === 7 ? monthLabel(l.date) : Z.date(l.date)].filter(Boolean).join(', '))
        + '. Entered ' + esc(Z.when(x.at.replace('T', ' ').substring(0, 19))) + '</span>'
        + (x.status === 'problem' ? '<span class="small" style="color:var(--bad)">' + esc(x.message) + (x.notes && x.notes.length ? ' ' + esc(x.notes.join(' ')) : '') + '</span>' : '') + '</span>'
        + (l.total ? '<b class="nowrap">' + esc(l.total) + '</b>' : '')
        + '<span class="btn-row">' + (x.status === 'problem' && x.code === 'CONFIRM' ? '<button type="button" class="btn small primary" data-ob-anyway="' + esc(x.ref) + '">Send anyway</button>' : '')
        + '<button type="button" class="btn small danger" data-ob-remove="' + esc(x.ref) + '">Remove</button></span></li>';
    };
    var h = '<div class="page-head"><div><h1>Reports waiting to be sent</h1><p class="small muted">Reports entered on this device with no network. They are sent by themselves when the network returns. This device keeps at most ' + Z.outbox.limit + '.</p></div>'
      + Z.closeBtn('#/') + '</div>';
    if (off) h += '<div class="notice warn" role="status">No network just now. ' + (Z.state.offlineOnly ? 'When it returns, sign in to send these reports.' : 'They will be sent when it returns.') + '</div>';
    if (Z.state.offlineOnly) h += '<div class="btn-row" style="margin-bottom:1rem"><button type="button" class="btn primary" data-ob-signin>Sign in to send</button></div>';
    if (!mine.length) h += '<div class="card empty">No reports are waiting on this device.</div>';
    if (review.length && !Z.state.offlineOnly) h += '<div class="card pad" style="margin-bottom:1rem"><h2>Entered while signed out</h2><p class="small muted">These were entered on this device with no network before you signed in. Check that they are yours and correct, then send them.</p><ul class="list" style="margin:0 -1rem">' + review.map(line).join('') + '</ul><div class="btn-row" style="margin-top:.75rem"><button type="button" class="btn primary" data-ob-accept>Send these ' + review.length + '</button></div></div>';
    else if (review.length) h += '<div class="card"><ul class="list">' + review.map(line).join('') + '</ul></div>';
    if (problems.length) h += '<h2 style="margin-top:1rem">Need your attention</h2><p class="small muted">The server did not accept these. Read the reason. If a figure is unusual but correct, press Send anyway. Otherwise remove the report and enter it again correctly.</p><div class="card"><ul class="list">' + problems.map(line).join('') + '</ul></div>';
    if (waiting.length) h += '<div class="page-head" style="margin-top:1rem"><h2>Waiting (' + waiting.length + ')</h2>' + (!off ? '<button type="button" class="btn small" data-ob-send>Send now</button>' : '') + '</div><div class="card"><ul class="list">' + waiting.map(line).join('') + '</ul></div>';
    main.innerHTML = h;
    main.onclick = function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      if (b.hasAttribute('data-ob-send')) { b.setAttribute('aria-busy', 'true'); b.textContent = 'Sending…'; Z.outbox.flush().then(function () { Z.route(); }); }
      if (b.hasAttribute('data-ob-signin')) { App.login('Sign in to send the reports waiting on this device.'); }
      if (b.hasAttribute('data-ob-accept')) { review.forEach(function (x) { Z.outbox.change(x.ref, { review: false }); }); Z.outbox.flush().then(function () { Z.route(); }); }
      if (b.hasAttribute('data-ob-anyway')) { Z.outbox.change(b.getAttribute('data-ob-anyway'), { status: 'waiting', confirmed: true, message: '', notes: null }); Z.outbox.flush().then(function () { Z.route(); }); }
      if (b.hasAttribute('data-ob-remove')) {
        var ref = b.getAttribute('data-ob-remove');
        Z.ask({ title: 'Remove this report?', message: 'It has not been sent. Removing it deletes it from this device, and it will not reach the system.', ok: 'Remove report', tone: 'danger' })
          .then(function (yes) { if (yes) { Z.outbox.change(ref, null); Z.toast('Removed from this device.'); Z.route(); } });
      }
    };
  }

  function yesNo(name, label, rep) {
    var v = rep ? (rep[name] ? 'yes' : 'no') : '';
    return '<div class="field" data-field="' + name + '"><span class="label-text" id="l_' + name + '">' + esc(label) + '</span><div class="choice" role="radiogroup" aria-labelledby="l_' + name + '">'
      + '<label><input type="radio" name="' + name + '" value="yes"' + (v === 'yes' ? ' checked' : '') + '> Yes</label><label><input type="radio" name="' + name + '" value="no"' + (v === 'no' ? ' checked' : '') + '> No</label></div></div>';
  }
  function addDays(s, n) { var d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().substring(0, 10); }
  function wireSum(form) {
    var g = $('[data-sum-group]', form);
    if (!g) return;
    var out = $('[data-sum-total]', g);
    var upd = function () { var t = 0; $$('[data-sum]', g).forEach(function (i) { t += /^\d+$/.test(i.value.trim()) ? Number(i.value) : 0; }); out.textContent = num(t); };
    g.oninput = upd; upd();
  }
  /** GCK: keep the date inside the chosen crusade period (and not after today). */
  function wirePeriod(form, s) {
    var sel = $('#f_period_id', form), d = $('#f_report_date', form);
    if (!sel || !d) return;
    var upd = function () {
      var o = sel.options[sel.selectedIndex];
      if (!o) return;
      var from = o.getAttribute('data-from'), to = o.getAttribute('data-to');
      var max = to < s.today ? to : s.today;
      d.min = from; d.max = max;
      if (!d.value || d.value < from || d.value > max) d.value = max >= from ? max : from;
      d.dispatchEvent(new Event('change'));
    };
    sel.addEventListener('change', upd); upd();
  }
  function wireWeek(form) {
    var d = $('#f_report_date', form), hint = $('#weekHint', form);
    if (!d || !hint) return;
    var upd = function () { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.value); hint.textContent = m ? 'Week ' + Math.ceil(Number(m[3]) / 7) + ' of ' + monthLabel(m[1] + '-' + m[2]) : 'The week of the month is worked out from the date.'; };
    d.addEventListener('input', upd); d.addEventListener('change', upd); upd();
  }

  function entryShow(main, kind, id, p) {
    return Z.call('entry.get', { kind: kind, id: id, p: p }).then(function (x) {
      var rows = [];
      if (kind === 'hcf') rows.push(['HCF location', x.hcf]);
      rows.push(['Location', x.path]);
      if (x.type) rows.push(['Meeting', x.type + ', ' + x.type_name]);
      if (x.period) rows.push(['Crusade period', x.period]);
      if (x.gck_day) rows.push(['GCK day', x.gck_day]);
      if (kind === 'metrics') rows.push(['Month', monthLabel(x.year + '-' + (x.month < 10 ? '0' : '') + x.month)]);
      else rows.push(['Date', Z.date(x.report_date) + (x.week ? ', week ' + x.week + ' of ' + monthLabel(x.year + '-' + (x.month < 10 ? '0' : '') + x.month) : '')]);
      var figs = kind === 'metrics' ? METRICS : PEOPLE.concat(NEW, kind === 'hcf' ? [] : CONV);
      figs.forEach(function (f) { rows.push([f[1], num(x[f[0]])]); });
      if (kind !== 'metrics') rows.splice(rows.length - (kind === 'hcf' ? 2 : 4), 0, ['Total attendance', num(x.total)]);
      if (kind === 'attendance') rows.push(['Tithes and offering', Z.state.me.settings.currency + ' ' + Z.money(x.offering)]);
      if (kind === 'metrics') { rows.push(['Satellite church', x.has_satellite ? 'Yes' : 'No']); rows.push(['Church building', x.has_building ? 'Yes' : 'No']); }
      rows.push(['Entered', Z.when(x.created_at) + (x.created_by_name ? ' by ' + x.created_by_name : '')]);
      var h = '<div class="page-head"><div><h1>' + esc(KIND[kind].one.charAt(0).toUpperCase() + KIND[kind].one.slice(1)) + '</h1><p class="small muted">' + esc(kind === 'hcf' ? x.hcf : x.location) + '</p></div><div class="btn-row">'
        + (x.can_edit ? '<a class="btn primary" href="' + esc(href('/entry/' + kind + '/' + x.id + '/edit', { p: x.p })) + '">Correct</a>' : '') + Z.closeBtn('#/entry/' + kind) + '</div></div>';
      if (x.status === 'voided') h += '<div class="notice bad">This report was voided and no longer counts. Reason: ' + esc(x.void_reason) + '</div>';
      h += '<div class="grid split"><div class="card"><dl class="meta" style="padding:1rem">' + rows.map(function (r2) { return '<dt>' + esc(r2[0]) + '</dt><dd><b>' + esc(r2[1]) + '</b></dd>'; }).join('') + '</dl></div><div class="stack">';
      if (x.can_void) h += '<form id="void" class="card pad" data-confirm-title="Void this report?" data-confirm-ok="Void report" data-confirm-tone="danger" data-confirm="The report stays on record with the reason you gave, but it will stop counting in every report."><h2>Void this report</h2><p class="small muted">The report stays on record with the reason, stops counting, and the correct report can then be entered.</p><div data-form-error></div>'
        + Z.text('reason', 'Reason', '', 'maxlength="250" data-required="Say why the report is being voided."') + '<button type="submit" class="btn danger">Void report</button></form>';
      if (x.can_delete) h += '<form id="del" class="card pad" data-confirm-title="Delete this report?" data-confirm-ok="Delete report" data-confirm-tone="danger" data-confirm="The report will be removed and will stop counting at once. A copy is kept in the history and the audit log."><h2>Delete this report</h2><p class="small muted">For a report entered by mistake. To keep it on record instead, void it.</p><div data-form-error></div>'
        + Z.field('reason', 'Reason', '<input type="text" id="f_del_reason" name="reason" maxlength="250" data-required="Say why the report is being deleted.">') + '<button type="submit" class="btn danger">Delete report</button></form>';
      if (!x.can_edit && x.status === 'active') h += '<div class="notice info small">' + (x.archived ? 'This report is in an archived year. It still counts in every report but can no longer be corrected.' : 'The time for correcting this report has passed. A District Admin or above can still correct it.') + '</div>';
      h += '<div class="card pad"><h2>History</h2>' + (x.history.length ? '<ul class="list" style="margin:0 -1rem">' + x.history.map(function (hh) {
        var changes = Object.keys(hh.new_values).map(function (k) { return fieldName(k) + ': ' + show(hh.old_values[k]) + ' → ' + show(hh.new_values[k]); }).join('; ');
        return '<li><span class="grow"><b>' + esc(hh.action === 'voided' ? 'Voided' : hh.action === 'deleted' ? 'Deleted' : 'Corrected') + (hh.by ? ' by ' + esc(hh.by) : '') + '</b><span class="small muted">' + esc(Z.when(hh.at)) + (hh.reason ? '. ' + esc(hh.reason) : '') + (changes ? '<br>' + esc(changes) : '') + '</span></span></li>';
      }).join('') + '</ul>' : '<p class="small muted">No changes since it was entered.</p>') + '</div></div></div>';
      main.innerHTML = h;
      if (x.can_void) Z.bindForm($('#void'), 'entry.void', { kind: kind, id: x.id, p: x.p }, function () { Z.toast('Report voided.'); Z.route(); });
      if (x.can_delete) Z.bindForm($('#del'), 'entry.delete', { kind: kind, id: x.id, p: x.p }, function () { Z.toast('Report deleted.'); Z.go('/entry/' + kind, { month: x.year ? x.year + '-' + (x.month < 10 ? '0' : '') + x.month : '' }); });
    });
  }

  var NAMES = {};
  PEOPLE.concat(NEW, CONV, METRICS).forEach(function (f) { NAMES[f[0]] = f[1]; });
  NAMES.students_male = 'Students male'; NAMES.students_female = 'Students female';
  NAMES.adults_male = 'Adults male'; NAMES.adults_female = 'Adults female'; NAMES.youth_male = 'Youth boys'; NAMES.youth_female = 'Youth girls'; NAMES.children_male = 'Children boys'; NAMES.children_female = 'Children girls';
  NAMES.offering = 'Tithes and offering'; NAMES.report_date = 'Date'; NAMES.has_satellite = 'Satellite church'; NAMES.has_building = 'Church building';
  NAMES.status = 'Status'; NAMES.gck_day = 'GCK day'; NAMES.void_reason = 'Reason';
  function fieldName(k) { return NAMES[k] || (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, ' '); }
  function show(v) { return v === true ? 'Yes' : v === false ? 'No' : v === null || v === undefined || v === '' ? 'empty' : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? Z.date(v) : String(v); }

  // ------------------------------------------------------------------ organisation
  var PLURAL = { region: 'Regions', division: 'Divisions', district: 'Districts', location: 'Locations', hcf: 'HCF locations' };
  var PARENT = { region: null, division: 'region', district: 'division', location: 'district', hcf: 'location' };
  var CHILD = { region: 'division', division: 'district', district: 'location', location: 'hcf', hcf: null };

  function org(main, r) {
    var level = r.parts[1];
    if (!PLURAL[level]) throw { message: 'Unknown level.' };
    if (sysAdmin() && r.parts[2] === 'new') throw { code: 'FORBIDDEN', message: 'The organisation is managed by the Zonal Admin.' };
    if (r.parts[2] === 'new') return orgForm(main, level, null, r.q);
    if (r.parts[2]) return Z.call('org.get', { level: level, id: r.parts[2] }).then(function (u) { return orgForm(main, level, u, r.q); });
    var q = r.q;
    return Z.call('org.list', { level: level, parent: q.parent, q: q.q, status: q.status, page: q.page }).then(function (d) {
      var who = level === 'hcf' ? 'Leader' : 'Pastor';
      var h = '<div class="page-head"><div><h1>' + esc(PLURAL[level]) + '</h1>' + (d.parent ? '<p class="small muted">In ' + esc(d.parent.path) + '</p>' : '') + '</div>'
        + (d.canAdd ? '<a class="btn primary" href="' + esc(href('/org/' + level + '/new', { parent: q.parent })) + '">Add ' + esc(Z.lc(Z.LABEL[level])) + '</a>' : '') + '</div>';
      h += '<form class="filters" id="of"><input type="hidden" name="parent" value="' + esc(q.parent || '') + '"><div><label for="o_q">Search</label><input type="search" id="o_q" name="q" value="' + esc(q.q || '') + '" placeholder="Name, ' + who.toLowerCase() + ' or phone"></div>'
        + '<div><label for="o_s">Showing</label><select id="o_s" name="status"><option value="">Active</option><option value="inactive"' + (q.status === 'inactive' ? ' selected' : '') + '>Inactive</option><option value="all"' + (q.status === 'all' ? ' selected' : '') + '>All</option></select></div>'
        + '<div><button class="btn" type="submit" style="width:100%">Show</button></div>' + (d.parent ? '<div><a class="btn" style="width:100%" href="#/org/' + level + '">Show all</a></div>' : '') + '</form>';
      if (!d.rows.length) h += '<div class="card empty">' + (q.q ? 'Nothing matches that search.' : 'None yet.') + (d.canAdd ? ' <a href="' + esc(href('/org/' + level + '/new', { parent: q.parent })) + '">Add the first one</a>.' : '') + '</div>';
      else h += '<div class="card"><ul class="list">' + d.rows.map(function (u) {
        return '<li><span class="grow"><b><a href="#/org/' + level + '/' + u.id + '">' + esc(u.name) + '</a></b><span class="small muted">' + esc(u.leader_name || '–') + (u.leader_phone ? ', <a href="tel:' + esc(String(u.leader_phone).replace(/[^\d+]/g, '')) + '">' + esc(u.leader_phone) + '</a>' : '')
          + (!q.parent && PARENT[level] ? '<br>' + esc(u.parent_name) : '') + '</span></span>'
          + (u.status !== 'active' ? '<span class="badge off">Inactive</span>' : '')
          + (CHILD[level] ? '<a class="btn small" href="' + esc(href('/org/' + CHILD[level], { parent: u.id })) + '">' + num(u.children) + ' ' + esc(Z.lc(PLURAL[CHILD[level]])) + '</a>' : '') + '</li>';
      }).join('') + '</ul></div>';
      if (d.pages > 1) h += '<div class="btn-row" style="margin-top:.75rem">' + (d.page > 1 ? '<a class="btn small" href="' + esc(href('/org/' + level, Object.assign({}, q, { page: d.page - 1 }))) + '">Previous</a>' : '')
        + '<span class="small muted" style="align-self:center">Page ' + d.page + ' of ' + d.pages + ' (' + num(d.total) + ')</span>' + (d.page < d.pages ? '<a class="btn small" href="' + esc(href('/org/' + level, Object.assign({}, q, { page: d.page + 1 }))) + '">Next</a>' : '') + '</div>';
      main.innerHTML = h;
      $('#of').addEventListener('submit', function (e) { e.preventDefault(); Z.go('/org/' + level, Z.formData($('#of'))); });
    });
  }

  function orgForm(main, level, u, q) {
    var who = level === 'hcf' ? 'Leader' : 'Pastor';
    var p = PARENT[level];
    var me = Z.state.me;
    var editing = !!u;
    var h = '<div class="page-head"><div><h1>' + (editing ? esc(u.name) : 'Add ' + esc(Z.lc(Z.LABEL[level]))) + '</h1>' + (editing ? '<p class="small muted">' + esc(u.path) + '</p>' : '') + '</div>'
      + Z.closeBtn(href('/org/' + level, { parent: editing ? '' : q.parent })) + '</div>';
    if (editing && u.status !== 'active') h += '<div class="notice warn">This ' + esc(Z.lc(Z.LABEL[level])) + ' is inactive.</div>';
    if (editing && level === 'district') h += '<div class="notice info small">' + (u.group ? 'In <a href="#/groups/' + u.group.id + '">' + esc(u.group.name) + '</a>, under Group Coordinator ' + esc(u.group.leader || '') + '.'
      : 'Not in a group; it comes directly under its division.') + ' Groups are kept under <a href="#/groups">Groups</a>.</div>';
    h += '<div class="grid split"><form id="uf" class="card pad" novalidate><div data-form-error></div>';
    if (p && (!editing || me.rank === 0)) h += '<fieldset><legend>' + (editing ? 'It belongs to' : esc(Z.LABEL[p]) + ' it belongs to') + '</legend><div data-field="parent_id"><div id="parentPick"></div>' + (editing ? '<p class="hint">Choosing another ' + esc(Z.lc(Z.LABEL[p])) + ' moves it, with all its history.</p>' : '') + '</div></fieldset>';
    h += Z.text('name', Z.LABEL[level] + ' name', editing ? u.name : '', 'maxlength="120"')
      + Z.text('leader_name', who + ' name' + (level === 'hcf' ? ' (optional)' : ''), editing ? u.leader_name : '', 'maxlength="120" autocomplete="off"')
      + (level !== 'hcf' ? Z.text('leader_rank', 'Pastor\'s rank (optional)', editing ? u.leader_rank : '', 'maxlength="60"', 'Leave empty to show the rank that goes with the level in the list of pastors.') : '')
      + Z.field('leader_phone', who + ' phone number' + (level === 'hcf' ? ' (optional)' : ''), '<input type="tel" id="f_leader_phone" name="leader_phone" value="' + esc(editing ? u.leader_phone : '') + '" maxlength="20" inputmode="tel">', 'A Ghana number, for example 0241234567.')
      + '<button type="submit" class="btn primary">' + (editing ? 'Save changes' : 'Add ' + esc(Z.lc(Z.LABEL[level]))) + '</button></form>';
    if (editing) {
      h += '<div class="stack"><div class="card pad"><h2>' + (u.status === 'active' ? 'Switch off' : 'Switch back on') + '</h2><p class="small muted">' + (u.status === 'active'
        ? 'An inactive unit stays on record with all its reports but is no longer offered for new reports. Nothing is deleted.' : 'It will be offered for new reports again.') + '</p>'
        + '<form id="sf" data-confirm-tone="' + (u.status === 'active' ? 'danger' : 'plain') + '" data-confirm-ok="' + (u.status === 'active' ? 'Deactivate' : 'Reactivate') + '" data-confirm-title="' + (u.status === 'active' ? 'Deactivate ' : 'Reactivate ') + esc(u.name) + '?" data-confirm="' + (u.status === 'active'
          ? 'It will no longer be offered for new reports. Its reports and history stay on record, and it can be reactivated at any time.'
          : 'It will be offered for new reports again.') + '"><div data-form-error></div><button type="submit" class="btn ' + (u.status === 'active' ? 'danger' : '') + '">' + (u.status === 'active' ? 'Deactivate' : 'Reactivate') + '</button></form></div>'
        + (level === 'region' || level === 'division' ? '<a class="btn" href="' + esc(href('/heads', { level: level, id: u.id })) + '">Sectional heads</a>' : '')
        + (CHILD[u.level || level] ? '<a class="btn" href="' + esc(href('/org/' + CHILD[level], { parent: u.id })) + '">' + num(u.children) + ' ' + esc(Z.lc(PLURAL[CHILD[level]])) + ' inside</a>' : '') + '</div>';
    }
    h += '</div>';
    main.innerHTML = h;
    var pick = $('#parentPick');
    if (pick) {
      var chain = editing ? u.chain : {};
      if (!editing && q.parent) { chain = {}; chain[p + '_id'] = Number(q.parent); }
      if (!editing && q.parent) {
        Z.call('org.get', { level: p, id: q.parent }).then(function (pu) { var c = pu.chain; Z.picker(pick, { target: p, name: 'parent_id', chain: c }); }).catch(function () { Z.picker(pick, { target: p, name: 'parent_id', chain: {} }); });
      } else Z.picker(pick, { target: p, name: 'parent_id', chain: chain });
    }
    if (editing && pick) pick.addEventListener('change', function () {
      var v = pick.value ? pick.value() : null;
      var moving = v && v.level === p && String(v.id) !== String(u.chain[p + '_id']);
      if (moving) $('#uf').dataset.confirm = 'Move ' + u.name + ', with all its units and reports, to the ' + Z.lc(Z.LABEL[p]) + ' you chose?';
      else delete $('#uf').dataset.confirm;
    });
    Z.bindForm($('#uf'), editing ? 'org.update' : 'org.create', function () { return editing ? { level: level, id: u.id, stamp: u.stamp } : { level: level }; }, function (d) {
      Z.toast(editing ? 'Changes saved.' : Z.LABEL[level] + ' added.');
      if (editing) Z.route(); else Z.go('/org/' + level + '/' + d.id);
    });
    if (editing) Z.bindForm($('#sf'), 'org.status', { level: level, id: u.id, active: u.status !== 'active' }, function () { Z.toast(u.status === 'active' ? 'Deactivated.' : 'Reactivated.'); Z.route(); });
  }

  function search(main, r) {
    var q = r.q.q || '';
    var draw = function (rows) {
      var h = '<div class="page-head"><h1>Search</h1></div><form class="filters" id="sf"><div class="wide"><label for="s_q">A name, pastor or phone number at any level</label><input type="search" id="s_q" name="q" value="' + esc(q) + '" autofocus></div><div><button class="btn primary" type="submit" style="width:100%">Search</button></div></form>';
      if (rows) h += rows.length ? '<div class="card"><ul class="list">' + rows.map(function (x) {
        return '<li><span class="grow"><b>' + (x.manage ? '<a href="#/org/' + x.level + '/' + x.id + '">' + esc(x.name) + '</a>' : esc(x.name)) + '</b><span class="small muted">' + esc(Z.LABEL[x.level]) + ', ' + esc(x.path) + '<br>' + esc(x.leader || '–') + (x.phone ? ', <a href="tel:' + esc(String(x.phone).replace(/[^\d+]/g, '')) + '">' + esc(x.phone) + '</a>' : '') + '</span></span>' + (x.status !== 'active' ? '<span class="badge off">Inactive</span>' : '') + '</li>';
      }).join('') + '</ul></div>' : '<div class="card empty">Nothing matches “' + esc(q) + '”.</div>';
      main.innerHTML = h;
      $('#sf').addEventListener('submit', function (e) { e.preventDefault(); Z.go('/search', Z.formData($('#sf'))); });
    };
    if (q.length < 2) { draw(null); return; }
    return Z.call('org.search', { q: q }).then(draw);
  }

  // ------------------------------------------------------------------ DLSO and DLCF
  var FS_PEOPLE = [['students_male', 'Students male'], ['students_female', 'Students female']];
  // DLCF only: families living on the campus (staff and their households) who attend.
  var FS_FAMILY = [['adults_male', 'Adults male'], ['adults_female', 'Adults female'], ['youth_male', 'Youth boys'], ['youth_female', 'Youth girls'], ['children_male', 'Children boys'], ['children_female', 'Children girls']];
  var FS_MORE = [['newcomers_male', 'Newcomers male'], ['newcomers_female', 'Newcomers female'], ['converts_male', 'Converts male'], ['converts_female', 'Converts female']];
  function armOf(r) { return Z.state.me.arm || (r.parts[0] === 'campuses' || r.q.arm === 'dlcf' ? 'dlcf' : 'dlso'); }
  function placesPath(arm) { return arm === 'dlso' ? '/schools' : '/campuses'; }

  function fsHome(main, r) {
    return Z.call('fs.home', { month: r.q.month }).then(function (d) {
      var A = d.label;
      var h = '<div class="page-head"><div><h1>' + esc(A.code) + '</h1><p class="small muted">' + esc(A.name) + ', ' + esc(d.node.label) + '</p></div>'
        + '<a class="btn primary" href="#/fs/entry/new">Enter a report</a></div>'
        + '<form class="filters" id="hm"><div><label for="hm_m">Month</label><input type="month" id="hm_m" name="month" value="' + esc(d.month) + '" max="' + esc(thisMonth()) + '"></div><div><button class="btn" type="submit" style="width:100%">Show</button></div></form>'
        + '<h2 class="sr">Each meeting</h2><div class="grid g2 g4" style="margin-bottom:.75rem">' + d.meetings.map(function (mt, i) {
          return figure(mt.code + ' attendance', num(mt.total), num(mt.newcomers) + ' newcomers, ' + num(mt.converts) + ' converts. ' + d.lastLabel + ': ' + num(mt.last), href('/reports/' + d.arm, { month: d.month, type: mt.code }), i === 0 ? 'lead' : '');
        }).join('') + '</div><p class="small muted">Each meeting is worked out on its own: the sum of the fellowships\' averages for that meeting. Meetings are never added together.</p>';
      h += '<div class="page-head" style="margin-top:1rem"><div><h2>' + (Z.state.me.visitor ? 'Your ' : '') + esc(A.places.toLowerCase()) + '</h2><p class="small muted">Reports this month, of ' + d.weeksSoFar + ' week' + (d.weeksSoFar === 1 ? '' : 's') + ' so far.</p></div>'
        + (d.canManage ? '<a class="small" href="#' + placesPath(d.arm) + '">Manage ' + esc(A.places.toLowerCase()) + '</a>' : '') + '</div>';
      h += d.fellowships.length ? '<div class="card"><ul class="list">' + d.fellowships.map(function (f) {
        return '<li><span class="grow"><b>' + esc(f.name) + '</b><span class="small muted">' + esc(f.division) + '</span><span class="sec-levels">' + d.meetings.map(function (mt) {
            var n = f.reports[mt.code] || 0, cls = n >= d.weeksSoFar ? 'ok' : n ? 'part' : 'no';
            return '<span class="badge ' + cls + '" title="' + esc(mt.code + ' reports this month') + '">' + esc(mt.code) + ' ' + n + '/' + d.weeksSoFar + '</span>';
          }).join('') + '</span></span><a class="btn small" href="' + esc(href('/fs/entry/new', { inst: f.id })) + '">Report</a></li>';
      }).join('') + '</ul></div>' : '<div class="card empty">' + (Z.state.me.visitor ? 'No ' + esc(A.places.toLowerCase()) + ' have been given to you yet. Ask your Divisional ' + esc(A.head) + '.' : 'No ' + esc(A.places.toLowerCase()) + ' yet. <a href="#' + placesPath(d.arm) + '/new">Add the first one</a>.') + '</div>';
      main.innerHTML = h;
      $('#hm').addEventListener('submit', function (e) { e.preventDefault(); Z.go('/', Z.formData($('#hm'))); });
    });
  }

  function fsEntry(main, r) {
    var arm = armOf(r);
    if (!Z.state.me.arm) throw { code: 'FORBIDDEN', message: 'Fellowship reports are entered by the DLSO and DLCF coordinators.' };
    if (r.parts[1] === 'entry' && r.parts[2] === 'new') return fsForm(main, arm, null, r.q);
    if (r.parts[1] === 'entry' && r.parts[2] && r.parts[3] === 'edit') return Z.call('fs.get', { id: r.parts[2], p: r.q.p }).then(function (x) { return fsForm(main, arm, x, r.q); });
    if (r.parts[1] === 'entry' && r.parts[2]) return fsShow(main, arm, r.parts[2], r.q.p);
    var q = r.q;
    return Z.call('fs.list', { month: q.month || thisMonth(), status: q.status, type: q.type }).then(function (d) {
      var h = '<div class="page-head"><div><h1>' + esc(d.label.code) + ' reports</h1><p class="small muted">' + num(d.total) + ' report' + (d.total === 1 ? '' : 's') + ' in ' + esc(monthLabel(d.month)) + '. Open a report to correct' + (Z.state.me.visitor ? '' : ', void or delete') + ' it.</p></div><a class="btn primary" href="#/fs/entry/new">Enter a report</a></div>'
        + '<form class="filters" id="fe"><div><label for="fe_m">Month</label><input type="month" id="fe_m" name="month" value="' + esc(d.month) + '" max="' + esc(thisMonth()) + '"></div>'
        + '<div><label for="fe_t">Meeting</label><select id="fe_t" name="type"><option value="">All meetings</option>' + Z.state.me.fsTypes.map(function (t) { return '<option value="' + t.id + '"' + (Number(q.type) === t.id ? ' selected' : '') + '>' + esc(t.code) + '</option>'; }).join('') + '</select></div>'
        + '<div><label for="fe_s">Showing</label><select id="fe_s" name="status"><option value="">Active reports</option><option value="voided"' + (q.status === 'voided' ? ' selected' : '') + '>Voided reports</option></select></div>'
        + '<div><button class="btn" type="submit" style="width:100%">Show</button></div></form>';
      h += d.rows.length ? '<div class="card"><ul class="list">' + d.rows.map(function (x) {
        return '<li><span class="grow"><b><a href="' + esc(href('/fs/entry/' + x.id, { p: x.p })) + '">' + esc(x.institution) + '</a></b><span class="small muted">' + esc(Z.date(x.report_date)) + ', week ' + x.week + ', ' + esc(x.division) + '</span></span>'
          + '<span class="badge type">' + esc(x.type) + '</span>' + (x.status === 'voided' ? '<span class="badge off">Voided</span>' : '') + '<b class="nowrap">' + num(x.total) + '</b></li>';
      }).join('') + '</ul></div>' : '<div class="card empty">No reports for this month. <a href="#/fs/entry/new">Enter one</a>.</div>';
      main.innerHTML = h;
      $('#fe').addEventListener('submit', function (e) { e.preventDefault(); Z.go('/fs/entry', Z.formData($('#fe'))); });
    });
  }

  function fsForm(main, arm, x, q) {
    var editing = !!x;
    return Z.call('fs.setup').then(function (s) {
      var A = s.label;
      var h = '<div class="page-head"><div><h1>' + (editing ? 'Correct ' : 'Enter ') + esc(A.code) + ' report</h1>' + (editing ? '<p class="small muted">' + esc(x.institution) + ', ' + esc(x.path) + '</p>' : '') + '</div>'
        + Z.closeBtn(editing ? href('/fs/entry/' + x.id, { p: x.p }) : '#/fs/entry') + '</div>';
      if (!editing && !s.institutions.length) {
        main.innerHTML = h + '<div class="notice warn">' + (Z.state.me.visitor ? 'No ' + esc(A.places.toLowerCase()) + ' have been given to you yet. Ask your Divisional ' + esc(A.head) + '.' : 'Add the ' + esc(A.places.toLowerCase()) + ' first, under ' + esc(A.places) + '.') + '</div>';
        return;
      }
      h += '<form id="fsf" class="card pad" novalidate style="max-width:760px" data-clash="/fs/entry/"><div data-form-error></div><fieldset><legend>Fellowship and date</legend><div class="grid md-g2">';
      if (!editing) h += Z.field('institution_id', A.place === 'school' ? 'School' : 'Campus', '<select id="f_institution_id" name="institution_id"><option value="">Choose</option>' + s.institutions.map(function (i) {
        return '<option value="' + i.id + '"' + (Number(q.inst) === i.id || s.institutions.length === 1 ? ' selected' : '') + '>' + esc(i.name + (Z.state.me.visitor ? '' : ', ' + i.division)) + '</option>'; }).join('') + '</select>');
      h += Z.field('type_id', 'Meeting', '<select id="f_type_id" name="type_id"><option value="">Choose</option>' + s.types.map(function (t) {
        return '<option value="' + t.id + '"' + ((editing ? x.type_id === t.id : q.type === t.code) ? ' selected' : '') + '>' + esc(t.code + ', ' + t.name) + '</option>'; }).join('') + '</select>');
      h += Z.field('report_date', 'Date of the meeting', '<input type="date" id="f_report_date" name="report_date" value="' + esc(editing ? x.report_date : s.today) + '" max="' + esc(s.today) + '"' + (s.backdate && !editing ? ' min="' + esc(addDays(s.today, -s.backdate)) + '"' : '') + '>', '<span id="weekHint"></span>');
      var summed = function (list) { return numInputs(list, x).replace(/ data-sum/g, '').replace(/ name="/g, ' data-sum name="'); };
      var family = s.arm === 'dlcf';
      h += '</div></fieldset><fieldset data-sum-group><legend>Attendance</legend>' + (family ? '<h3 class="fs-sub">Students</h3>' : '') + summed(FS_PEOPLE)
        + (family ? '<h3 class="fs-sub">Families living on the campus</h3><p class="small muted">Staff and their households who attend the fellowship. Leave empty when none came.</p>' + summed(FS_FAMILY) : '')
        + '<div class="total-line"><span>Total attendance</span><b data-sum-total>0</b></div></fieldset>'
        + '<fieldset><legend>Newcomers and converts</legend>' + numInputs(FS_MORE, x) + '</fieldset>'
        + '<fieldset><legend>Giving</legend><div class="num-grid">' + Z.field('offering', 'Tithes and offering (' + esc(s.currency) + ')',
          '<input type="text" inputmode="decimal" id="f_offering" name="offering" value="' + esc(editing ? x.offering : '') + '" placeholder="0.00">') + '</div></fieldset>';
      if (editing) h += Z.field('reason', 'What was wrong (optional)', '<input type="text" id="f_reason" name="reason" maxlength="250">', 'Shown in the report\'s history.');
      h += '<div class="btn-row"><button type="submit" class="btn primary">' + (editing ? 'Save correction' : 'Save report') + '</button></div></form>';
      main.innerHTML = h;
      var form = $('#fsf');
      wireSum(form); wireWeek(form);
      if (!editing) {
        form.dataset.offline = '1';
        form.offlineLabel = function (pl) { return reportLabel(form, A.code + ' report', pl); };
      }
      Z.bindForm(form, editing ? 'fs.update' : 'fs.create', editing ? { id: x.id, p: x.p, version: x.version } : null, function (d) {
        if (editing) { Z.toast('Correction saved.'); Z.go('/fs/entry/' + d.id, { p: d.p }); return; }
        if (d && d.queued) { heldOnDevice(form); return; }
        Z.toast('Report saved.');
        $$('[data-field] input[inputmode]', form).forEach(function (i) { i.value = ''; });
        wireSum(form);
        var box = $('[data-form-error]', form);
        box.innerHTML = '<div class="notice ok" role="status">Saved. <a href="' + esc(href('/fs/entry/' + d.id, { p: d.p })) + '">Open it</a>, or enter the next one below (choose the meeting).</div>';
        box.scrollIntoView({ block: 'center' });
      });
    });
  }

  function fsShow(main, arm, id, p) {
    return Z.call('fs.get', { id: id, p: p }).then(function (x) {
      var rows = [['Fellowship', x.institution], ['Division', x.path], ['Meeting', x.type + ', ' + x.type_name], ['Date', Z.date(x.report_date) + ', week ' + x.week + ' of ' + monthLabel(x.year + '-' + (x.month < 10 ? '0' : '') + x.month)]];
      FS_PEOPLE.concat(x.family ? FS_FAMILY : []).forEach(function (f) { rows.push([f[1], num(x[f[0]])]); });
      rows.push(['Total attendance', num(x.total)]);
      FS_MORE.forEach(function (f) { rows.push([f[1], num(x[f[0]])]); });
      rows.push(['Tithes and offering', Z.state.me.settings.currency + ' ' + Z.money(x.offering)]);
      rows.push(['Entered', Z.when(x.created_at) + (x.created_by_name ? ' by ' + x.created_by_name : '')]);
      var h = '<div class="page-head"><div><h1>' + esc(x.institution) + '</h1><p class="small muted">' + esc(arm.toUpperCase()) + ' report</p></div><div class="btn-row">'
        + (x.can_edit ? '<a class="btn primary" href="' + esc(href('/fs/entry/' + x.id + '/edit', { p: x.p })) + '">Correct</a>' : '') + Z.closeBtn('#/fs/entry') + '</div></div>';
      if (x.status === 'voided') h += '<div class="notice bad">This report was voided and no longer counts. Reason: ' + esc(x.void_reason) + '</div>';
      h += '<div class="grid split"><div class="card"><dl class="meta" style="padding:1rem">' + rows.map(function (r2) { return '<dt>' + esc(r2[0]) + '</dt><dd><b>' + esc(r2[1]) + '</b></dd>'; }).join('') + '</dl></div><div class="stack">';
      if (x.can_void) h += '<form id="void" class="card pad" data-confirm-title="Void this report?" data-confirm-ok="Void report" data-confirm-tone="danger" data-confirm="The report stays on record with the reason you gave, but it will stop counting in every report."><h2>Void this report</h2><div data-form-error></div>'
        + Z.text('reason', 'Reason', '', 'maxlength="250" data-required="Say why the report is being voided."') + '<button type="submit" class="btn danger">Void report</button></form>';
      if (x.can_delete) h += '<form id="del" class="card pad" data-confirm-title="Delete this report?" data-confirm-ok="Delete report" data-confirm-tone="danger" data-confirm="The report will be removed and will stop counting at once. A copy is kept in the history and the audit log."><h2>Delete this report</h2><p class="small muted">For a report entered by mistake. To keep it on record, void it instead.</p><div data-form-error></div>'
        + Z.field('reason', 'Reason', '<input type="text" id="f_del_reason" name="reason" maxlength="250" data-required="Say why the report is being deleted.">') + '<button type="submit" class="btn danger">Delete report</button></form>';
      if (!x.can_edit && x.status === 'active') h += '<div class="notice info small">' + (x.archived ? 'This report is in an archived year.' : 'The time for correcting this report has passed. Your Divisional Coordinator can still correct it.') + '</div>';
      h += '<div class="card pad"><h2>History</h2>' + (x.history.length ? '<ul class="list" style="margin:0 -1rem">' + x.history.map(function (hh) {
        var changes = Object.keys(hh.new_values).map(function (k) { return fieldName(k) + ': ' + show(hh.old_values[k]) + ' → ' + show(hh.new_values[k]); }).join('; ');
        return '<li><span class="grow"><b>' + (hh.action === 'voided' ? 'Voided' : 'Corrected') + (hh.by ? ' by ' + esc(hh.by) : '') + '</b><span class="small muted">' + esc(Z.when(hh.at)) + (hh.reason ? '. ' + esc(hh.reason) : '') + (changes ? '<br>' + esc(changes) : '') + '</span></span></li>';
      }).join('') + '</ul>' : '<p class="small muted">No changes since it was entered.</p>') + '</div></div></div>';
      main.innerHTML = h;
      if (x.can_void) Z.bindForm($('#void'), 'fs.void', { id: x.id, p: x.p }, function () { Z.toast('Report voided.'); Z.route(); });
      if (x.can_delete) Z.bindForm($('#del'), 'fs.delete', { id: x.id, p: x.p }, function () { Z.toast('Report deleted.'); Z.go('/fs/entry', { month: x.p }); });
    });
  }

  function institutions(main, r) {
    var arm = armOf(r), path = placesPath(arm);
    if (r.parts[1] === 'new') return instForm(main, arm, null);
    if (r.parts[1]) return Z.call('fs.institution', { id: r.parts[1] }).then(function (i) { return instForm(main, i.arm, i); });
    var q = r.q;
    return Z.call('fs.institutions', { arm: arm, q: q.q, status: q.status }).then(function (d) {
      var A = d.label;
      var h = '<div class="page-head"><div><h1>' + esc(A.code) + ' ' + esc(A.places.toLowerCase()) + '</h1><p class="small muted">' + esc(A.name) + '. Each fellowship belongs to a division and is visited by a ' + esc(A.visitor) + '.</p></div>'
        + (d.canAdd ? '<a class="btn primary" href="#' + path + '/new">Add a ' + esc(A.place) + '</a>' : '') + '</div>'
        + '<form class="filters" id="if"><div><label for="i_q">Search</label><input type="search" id="i_q" name="q" value="' + esc(q.q || '') + '" placeholder="Name, town or phone"></div>'
        + '<div><label for="i_s">Showing</label><select id="i_s" name="status"><option value="">Active</option><option value="inactive"' + (q.status === 'inactive' ? ' selected' : '') + '>Switched off</option><option value="all"' + (q.status === 'all' ? ' selected' : '') + '>All</option></select></div>'
        + '<div><button class="btn" type="submit" style="width:100%">Show</button></div></form>';
      h += d.rows.length ? '<div class="card"><ul class="list">' + d.rows.map(function (i) {
        return '<li><span class="grow"><b><a href="#' + path + '/' + i.id + '">' + esc(i.name) + '</a></b><span class="small muted">' + esc(i.path) + (i.place ? ', ' + esc(i.place) : '')
          + '<br>' + esc(A.visitor) + ': ' + esc(i.visitor || 'not given yet') + '</span></span>' + (i.status !== 'active' ? '<span class="badge off">Switched off</span>' : '') + '</li>';
      }).join('') + '</ul></div>' : '<div class="card empty">None yet.' + (d.canAdd ? ' <a href="#' + path + '/new">Add the first one</a>.' : '') + '</div>';
      main.innerHTML = h;
      $('#if').addEventListener('submit', function (e) { e.preventDefault(); Z.go(path, Z.formData($('#if'))); });
    });
  }

  function instForm(main, arm, i) {
    var editing = !!i, path = placesPath(arm);
    var A = { dlso: { code: 'DLSO', place: 'school', visitor: 'School Visitor' }, dlcf: { code: 'DLCF', place: 'campus', visitor: 'Associate Coordinator' } }[arm];
    var can = editing ? i.can_edit : true;
    var ro = can ? '' : ' readonly';
    var h = '<div class="page-head"><div><h1>' + (editing ? esc(i.name) : 'Add a ' + A.code + ' ' + A.place) + '</h1>' + (editing ? '<p class="small muted">' + esc(i.path) + '</p>' : '') + '</div>' + Z.closeBtn('#' + path) + '</div>'
      + '<form id="inf" class="card pad" novalidate style="max-width:760px"><div data-form-error></div>'
      + '<fieldset><legend>Division</legend><div data-field="division_id"><div id="iDiv"></div></div></fieldset>'
      + Z.text('name', A.place === 'school' ? 'Name of the school' : 'Name of the institution', editing ? i.name : '', 'maxlength="120"' + ro)
      + Z.text('place', 'Town (optional)', editing ? i.place : '', 'maxlength="80"' + ro)
      + Z.text('leader_name', 'Fellowship leader (optional)', editing ? i.leader_name : '', 'maxlength="120" autocomplete="off"' + ro)
      + Z.field('leader_phone', 'Leader\'s phone (optional)', '<input type="tel" id="f_leader_phone" name="leader_phone" value="' + esc(editing ? i.leader_phone : '') + '" maxlength="20" inputmode="tel"' + ro + '>')
      + Z.field('visitor_id', A.visitor, '<select id="f_visitor_id" name="visitor_id"' + (can ? '' : ' disabled') + '><option value="">Not given yet</option></select>', 'The ' + A.visitor + ' who visits and reports for it. Their account is made under Users.')
      + (editing && can ? Z.field('status', 'Status', '<select id="f_status" name="status"><option value="active">Active</option><option value="inactive"' + (i.status !== 'active' ? ' selected' : '') + '>Switched off</option></select>') : '')
      + (can ? '<button class="btn primary" type="submit">' + (editing ? 'Save changes' : 'Add ' + A.place) + '</button>' : '') + '</form>';
    main.innerHTML = h;
    var pk = $('#iDiv'), divId = editing ? i.division_id : null;
    var loadVisitors = function () {
      var sel = $('#f_visitor_id');
      if (!divId) { sel.innerHTML = '<option value="">Choose the division first</option>'; return; }
      Z.call('fs.visitors', { arm: arm, division: divId }).then(function (list) {
        sel.innerHTML = '<option value="">Not given yet</option>' + list.map(function (v) { return '<option value="' + v.id + '"' + (editing && i.visitor_id === v.id ? ' selected' : '') + '>' + esc(v.name) + '</option>'; }).join('');
      });
    };
    Z.picker(pk, { target: 'division', name: 'division_id', chain: editing ? i.chain : {}, onChange: function (d) { divId = d && d.level === 'division' ? d.id : null; loadVisitors(); } });
    var hidden = $('input[type=hidden][name=division_id]', pk);
    if (hidden) { divId = Number(hidden.value) || divId; loadVisitors(); }
    else if (pk.ready) pk.ready.then(function () { var v = pk.value && pk.value(); if (v && v.level === 'division') divId = v.id; loadVisitors(); });
    if (can) Z.bindForm($('#inf'), 'fs.saveInst', function () { return editing ? { arm: arm, id: i.id, stamp: i.stamp } : { arm: arm }; }, function (d) {
      Z.toast(editing ? 'Saved.' : 'Added.'); if (editing) Z.route(); else Z.go(path + '/' + d.id);
    });
  }

  // ------------------------------------------------------------------ the leader of the zone
  function zoneLeader(main) {
    if (Z.state.me.role !== 'zonal') throw { code: 'FORBIDDEN', message: 'The Zonal Admin keeps the Zonal Coordinating Overseer\'s details.' };
    return Z.call('zone.leader').then(function (z) {
      main.innerHTML = '<div class="page-head"><div><h1>Zonal Coordinating Overseer</h1><p class="small muted">Zone: ' + esc(z.zone) + '. Shown first in the Pastors list.</p></div>' + Z.closeBtn('#/reports/pastors') + '</div>'
        + '<form id="zl" class="card pad" novalidate style="max-width:640px"><div data-form-error></div>'
        + Z.text('name', 'Name', z.name, 'maxlength="120" autocomplete="off" data-required="Enter the name."')
        + Z.text('rank', 'Title', z.rank, 'maxlength="60"', 'Usually Zonal Coordinating Overseer.')
        + Z.field('phone', 'Phone number', '<input type="tel" id="f_phone" name="phone" value="' + esc(z.phone) + '" maxlength="20" inputmode="tel">', 'A Ghana number, for example 0241234567.')
        + '<button class="btn primary" type="submit">Save</button></form>';
      Z.bindForm($('#zl'), 'zone.saveLeader', null, function () { Z.toast('Saved.'); });
    });
  }

  // ------------------------------------------------------------------ groups of districts
  function groups(main, r) {
    if (r.parts[1] === 'new') return groupForm(main, null, r.q);
    if (r.parts[1]) return Z.call('groups.get', { id: r.parts[1] }).then(function (g) { return groupForm(main, g, r.q); });
    var q = r.q;
    return Z.call('groups.list', { status: q.status, q: q.q }).then(function (d) {
      var h = '<div class="page-head"><div><h1>Groups</h1><p class="small muted">Districts of a division joined under a Group Coordinator. Districts in no group come directly under their division.</p></div>'
        + (d.canAdd ? '<a class="btn primary" href="#/groups/new">Add a group</a>' : '') + '</div>'
        + '<form class="filters" id="gf"><div><label for="g_q">Search</label><input type="search" id="g_q" name="q" value="' + esc(q.q || '') + '" placeholder="Group, coordinator or phone"></div>'
        + '<div><label for="g_s">Showing</label><select id="g_s" name="status"><option value="">Active</option><option value="inactive"' + (q.status === 'inactive' ? ' selected' : '') + '>Switched off</option><option value="all"' + (q.status === 'all' ? ' selected' : '') + '>All</option></select></div>'
        + '<div><button class="btn" type="submit" style="width:100%">Show</button></div></form>';
      h += d.rows.length ? '<div class="card"><ul class="list">' + d.rows.map(function (g) {
        return '<li><span class="grow"><b><a href="#/groups/' + g.id + '">' + esc(g.name) + '</a></b><span class="small muted">Group Coordinator: ' + esc(g.leader_name || '–')
          + (g.leader_phone ? ', <a href="tel:' + esc(g.leader_phone) + '">' + esc(g.leader_phone) + '</a>' : '') + '<br>' + esc(g.path) + ': ' + esc(g.districts.map(function (x) { return x.name; }).join(', ') || 'no districts') + '</span></span>'
          + (g.status !== 'active' ? '<span class="badge off">Switched off</span>' : '<span class="badge type">' + g.districts.length + ' district' + (g.districts.length === 1 ? '' : 's') + '</span>') + '</li>';
      }).join('') + '</ul></div>' : '<div class="card empty">No groups yet.' + (d.canAdd ? ' <a href="#/groups/new">Add the first one</a>.' : '') + '</div>';
      main.innerHTML = h;
      $('#gf').addEventListener('submit', function (e) { e.preventDefault(); Z.go('/groups', Z.formData($('#gf'))); });
    });
  }

  function groupForm(main, g, q) {
    var editing = !!g;
    var can = editing ? g.can_edit : Z.state.me.rank <= 2 && !sysAdmin();
    if (!can && !editing) throw { code: 'FORBIDDEN', message: 'Groups are added by the Divisional Admin and the admins above.' };
    var ro = can ? '' : ' readonly';
    var h = '<div class="page-head"><div><h1>' + (editing ? esc(g.name) : 'Add a group') + '</h1>' + (editing ? '<p class="small muted">' + esc(g.path) + '</p>' : '') + '</div>' + Z.closeBtn('#/groups') + '</div>';
    if (editing && g.status !== 'active') h += '<div class="notice warn">This group is switched off. Its districts come directly under the division.</div>';
    h += '<div class="grid split"><form id="grf" class="card pad" novalidate><div data-form-error></div>';
    h += editing ? '<p class="small muted">Division: <b>' + esc(g.division) + '</b></p>' : '<fieldset><legend>Division</legend><div data-field="division_id"><div id="gDiv"></div></div></fieldset>';
    h += Z.text('name', 'Group name', editing ? g.name : '', 'maxlength="120" placeholder="For example, Tamale Central Group"' + ro)
      + Z.text('leader_name', 'Group Coordinator', editing ? g.leader_name : '', 'maxlength="120" autocomplete="off"' + ro)
      + Z.text('leader_rank', 'Rank (optional)', editing ? g.leader_rank : '', 'maxlength="60"' + ro, 'Leave empty to show "Group Coordinator".')
      + Z.field('leader_phone', 'Phone number', '<input type="tel" id="f_leader_phone" name="leader_phone" value="' + esc(editing ? g.leader_phone : '') + '" maxlength="20" inputmode="tel"' + ro + '>')
      + '<fieldset><legend>Districts in the group</legend><div data-field="districts"><div id="gDist"><p class="small muted">' + (editing ? 'Loading…' : 'Choose the division first.') + '</p></div></div></fieldset>'
      + (can ? '<button class="btn primary" type="submit">' + (editing ? 'Save changes' : 'Add group') + '</button>' : '') + '</form>';
    if (editing && can) {
      h += '<div class="stack"><div class="card pad"><h2>' + (g.status === 'active' ? 'Switch off' : 'Switch back on') + '</h2><p class="small muted">' + (g.status === 'active'
        ? 'Its districts go back directly under the division. Reports and pastors are not changed.' : 'Then tick its districts again.') + '</p>'
        + '<form id="gsf" data-confirm-tone="' + (g.status === 'active' ? 'danger' : 'plain') + '" data-confirm-ok="' + (g.status === 'active' ? 'Switch off' : 'Switch back on') + '" data-confirm-title="' + (g.status === 'active' ? 'Switch off ' : 'Switch back on ') + esc(g.name) + '?" data-confirm="' + (g.status === 'active'
          ? 'Its districts will go back directly under the division. The group can be switched back on later.'
          : 'Its districts will be shown under the group again.') + '"><div data-form-error></div><button type="submit" class="btn ' + (g.status === 'active' ? 'danger' : '') + '">' + (g.status === 'active' ? 'Switch off' : 'Switch back on') + '</button></form></div></div>';
    }
    h += '</div>';
    main.innerHTML = h;
    var divId = editing ? g.division_id : null;
    var drawDistricts = function () {
      var box = $('#gDist');
      if (!divId) { box.innerHTML = '<p class="small muted">Choose the division first.</p>'; return; }
      box.innerHTML = '<p class="small muted">Loading…</p>';
      Z.call('groups.districts', { division: divId }).then(function (list) {
        if (!list.length) { box.innerHTML = '<p class="small muted">This division has no active districts.</p>'; return; }
        box.innerHTML = list.map(function (x) {
          var mine = editing && x.group_id === g.id;
          return '<label class="check"><input type="checkbox" value="' + x.id + '"' + (mine ? ' checked' : '') + (can ? '' : ' disabled') + '> ' + esc(x.name)
            + (x.group && !mine ? ' <span class="small muted">(now in ' + esc(x.group) + ')</span>' : '') + '</label>';
        }).join('');
      });
    };
    if (!editing) {
      var pk = $('#gDiv');
      Z.picker(pk, { target: 'division', name: 'division_id', onChange: function (d) { divId = d && d.level === 'division' ? d.id : null; drawDistricts(); } });
      var hidden = $('input[type=hidden][name=division_id]', pk);
      if (hidden) { divId = Number(hidden.value) || null; drawDistricts(); }
      else if (pk.ready) pk.ready.then(function () { var v = pk.value && pk.value(); divId = v && v.level === 'division' ? v.id : null; drawDistricts(); });
    } else drawDistricts();
    if (can) Z.bindForm($('#grf'), 'groups.save', function () {
      var ids = $$('#gDist input[type=checkbox]').filter(function (c) { return c.checked; }).map(function (c) { return c.value; }).join(',');
      return editing ? { id: g.id, stamp: g.stamp, districts: ids } : { districts: ids };
    }, function (d) { Z.toast(editing ? 'Group saved.' : 'Group added.'); if (editing) Z.route(); else Z.go('/groups/' + d.id); });
    if (editing && can) Z.bindForm($('#gsf'), 'groups.status', { id: g.id, active: g.status !== 'active' }, function () { Z.toast('Saved.'); Z.route(); });
  }

  // ------------------------------------------------------------------ sectional heads
  var secSeq = 0;
  function secRow(d) {
    var k = 'sec' + (++secSeq);
    return '<li><label class="sr" for="' + k + '">Section name</label><input type="text" id="' + k + '" value="' + esc(d.name) + '" maxlength="60" placeholder="For example, Youth Coordinator">'
      + '<div class="sec-levels" role="group" aria-label="Levels that have ' + esc(d.name || 'this section') + '">'
      + [['z', 'Zone'], ['r', 'Regions'], ['d', 'Divisions']].map(function (l) {
        return '<label class="check"><input type="checkbox" value="' + l[0] + '"' + (d.levels.indexOf(l[0]) >= 0 ? ' checked' : '') + '> ' + l[1] + '</label>';
      }).join('') + '<button type="button" class="btn small" data-sec-remove aria-label="Remove ' + esc(d.name || 'this section') + '">Remove</button></div></li>';
  }
  function heads(main, r) {
    var q = r.q;
    return Z.call('heads.units').then(function (d) {
      var units = d.units;
      // ?level=region without an id: the first region (or division) this user keeps heads for.
      var first = function (lv) { return units.filter(function (u) { return u.level === lv; })[0]; };
      var pick = q.level && (q.level === 'zone' || q.id) ? { level: q.level, id: Number(q.id || 0) }
        : q.level && first(q.level) ? { level: q.level, id: first(q.level).id }
        : units[0] ? { level: units[0].level, id: units[0].id } : { level: 'zone', id: 0 };
      return Z.call('heads.get', pick).then(function (x) {
        var WORD = { zone: 'Zonal', region: 'Regional', division: 'Divisional' };
        var h = '<div class="page-head"><div><h1>' + WORD[x.level] + ' sectional heads</h1><p class="small muted">' + esc(x.level === 'zone' ? 'Zone: ' + x.name : x.path) + '</p></div>'
          + '<div class="btn-row"><a class="btn" href="#/reports/heads">List of all heads</a>' + Z.closeBtn('#/reports/heads') + '</div></div>';
        // One tab per level, in order: Zonal, Regional, Divisional (only the levels this user keeps).
        var levels = ['zone', 'region', 'division'].filter(function (lv) { return first(lv); });
        if (levels.length > 1 || (levels.length === 1 && levels[0] !== x.level)) {
          h += '<nav class="tabs" aria-label="Level">' + levels.map(function (lv) {
            return '<a href="' + esc(href('/heads', { level: lv, id: lv === 'zone' ? 0 : '' })) + '"' + (lv === x.level ? ' class="on" aria-current="page"' : '') + '>' + WORD[lv] + '</a>';
          }).join('') + '</nav>';
        }
        var same = units.filter(function (u) { return u.level === x.level; });
        if (x.level !== 'zone' && same.length > 1) {
          h += '<form class="filters" id="hu"><div class="wide"><label for="h_unit">' + (x.level === 'region' ? 'Region' : 'Division') + '</label><select id="h_unit" name="unit">' + same.map(function (u) {
            return '<option value="' + esc(u.level + ':' + u.id) + '"' + (u.id === x.id ? ' selected' : '') + '>' + esc(u.level === 'division' ? u.path : u.name) + '</option>';
          }).join('') + '</select></div></form>';
        }
        h += '<div class="grid split"><form id="hf" class="card pad" novalidate><div data-form-error></div>';
        if (!x.heads.length) h += '<p class="muted">No sections have been set up yet.</p>';
        x.heads.forEach(function (p, i) {
          h += '<fieldset><legend>' + esc(p.title) + '</legend><div class="grid md-g2">'
            + Z.field('name_' + i, 'Name', '<input type="text" id="f_name_' + i + '" name="name_' + i + '" value="' + esc(p.name) + '" maxlength="120" autocomplete="off"' + (x.can_edit ? '' : ' readonly') + '>')
            + Z.field('phone_' + i, 'Phone', '<input type="tel" id="f_phone_' + i + '" name="phone_' + i + '" value="' + esc(p.phone) + '" maxlength="20" inputmode="tel"' + (x.can_edit ? '' : ' readonly') + '>')
            + '</div></fieldset>';
        });
        h += x.can_edit ? '<button class="btn primary" type="submit">Save sectional heads</button>' : '<p class="small muted">You can read these heads; the admin of this unit keeps them up to date.</p>';
        h += '</form><div class="stack">';
        if (x.can_sections) {
          h += '<form id="hs" class="card pad" novalidate><h2>Sections</h2><p class="small muted">The posts kept, and the levels that have each one. The level\'s word is added in front: Youth Coordinator becomes Zonal, Regional or Divisional Youth Coordinator.</p><div data-form-error></div>'
            + '<div data-field="sections"><ul class="sec-list" id="secList">' + d.defs.map(secRow).join('') + '</ul></div>'
            + '<div class="btn-row" style="margin:.4rem 0 .8rem"><button type="button" class="btn small" id="secAdd">Add a section</button></div>'
            + '<p class="hint">Renaming a section starts it empty; the old entries stay in the sheet.</p>'
            + '<button class="btn" type="submit">Save sections</button></form>';
        }
        h += '<div class="card pad"><h2>Where else they show</h2><p class="small">Every head entered here appears in <a href="#/reports/heads">Sectional heads</a> under Organisation, which can be printed or saved as PDF and CSV.</p></div></div></div>';
        main.innerHTML = h;
        var hu = $('#h_unit');
        if (hu) hu.addEventListener('change', function () { var v = hu.value.split(':'); Z.go('/heads', { level: v[0], id: v[1] }); });
        if (x.can_edit) Z.bindForm($('#hf'), 'heads.save', { level: x.level, id: x.id }, function () { Z.toast('Sectional heads saved.'); });
        if (x.can_sections) {
          $('#secAdd').addEventListener('click', function () { $('#secList').insertAdjacentHTML('beforeend', secRow({ name: '', levels: 'zrd' })); var n = $$('#secList input[type=text]'); n[n.length - 1].focus(); });
          $('#secList').addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-sec-remove]'); if (b) b.closest('li').remove(); });
          Z.bindForm($('#hs'), 'heads.sections', function () {
            return { sections: JSON.stringify($$('#secList li').map(function (li) {
              return { name: $('input[type=text]', li).value, levels: $$('input[type=checkbox]', li).filter(function (c) { return c.checked; }).map(function (c) { return c.value; }).join('') };
            })) };
          }, function () { Z.toast('Sections saved.'); Z.route(); });
        }
      });
    });
  }

  // ------------------------------------------------------------------ users
  function users(main, r) {
    if (r.parts[1] === 'new') return userForm(main, null);
    if (r.parts[1]) return Z.call('users.get', { id: r.parts[1] }).then(function (u) { return userForm(main, u); });
    var q = r.q;
    return Z.call('users.list', { q: q.q, status: q.status, role: q.role }).then(function (d) {
      var h = '<div class="page-head"><h1>' + (sysAdmin() ? 'Zonal Admins' : 'Users') + '</h1><a class="btn primary" href="#/users/new">' + (sysAdmin() ? 'Add a Zonal Admin' : 'Add a user') + '</a></div>'
        + '<form class="filters" id="uf2"><div><label for="u_q">Search</label><input type="search" id="u_q" name="q" value="' + esc(q.q || '') + '"></div>'
        + '<div><label for="u_r">Role</label><select id="u_r" name="role"><option value="">All roles</option>' + d.roles.map(function (x) { return '<option value="' + x.role + '"' + (q.role === x.role ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '</select></div>'
        + '<div><label for="u_s">Showing</label><select id="u_s" name="status"><option value="">Active</option><option value="inactive"' + (q.status === 'inactive' ? ' selected' : '') + '>Inactive</option><option value="all"' + (q.status === 'all' ? ' selected' : '') + '>All</option></select></div>'
        + '<div><button class="btn" type="submit" style="width:100%">Show</button></div></form>';
      h += d.rows.length ? '<div class="card"><ul class="list">' + d.rows.map(function (u) {
        return '<li><span class="grow"><b><a href="#/users/' + u.id + '">' + esc(u.full_name) + '</a></b><span class="small muted">' + (u.username ? esc(u.username) : '<i>username not chosen yet</i>') + ', ' + esc(u.role_label) + ', ' + esc(u.unit.path) + '<br>' + (u.last_login ? 'Last signed in ' + esc(Z.when(u.last_login)) : 'Has not signed in yet') + '</span></span>'
          + (!u.has_password ? '<span class="badge no">No password yet</span>' : '') + (u.status !== 'active' ? '<span class="badge off">Inactive</span>' : '') + '</li>';
      }).join('') + '</ul></div>' : '<div class="card empty">No accounts here yet. <a href="#/users/new">Add one</a>.</div>';
      main.innerHTML = h;
      $('#uf2').addEventListener('submit', function (e) { e.preventDefault(); Z.go('/users', Z.formData($('#uf2'))); });
    });
  }

  function linkBox(d, intro) {
    return '<div class="card pad" id="linkCard"><h2>Pass this link on</h2><p class="small muted">' + esc(intro) + ' It works once and expires in ' + d.hours + ' hour' + (d.hours === 1 ? '' : 's') + '. Send it by phone or message; anyone with the link can set the password.</p>'
      + '<label class="sr" for="theLink">Sign-in link</label><input type="text" readonly id="theLink" value="' + esc(d.link) + '"><div class="btn-row" style="margin-top:.6rem"><button type="button" class="btn primary" id="copyLink">Copy link</button></div></div>';
  }
  function wireCopy() {
    var b = $('#copyLink'); if (!b) return;
    $('#theLink').addEventListener('focus', function () { this.select(); });
    b.addEventListener('click', function () {
      var i = $('#theLink'); i.focus(); i.select();
      var done = function () { b.textContent = 'Copied'; };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(i.value).then(done, function () { document.execCommand('copy'); done(); });
      else { try { document.execCommand('copy'); done(); } catch (e) { b.textContent = 'Select the link and copy it'; } }
    });
  }

  function userForm(main, u) {
    var editing = !!u;
    return Z.call('users.list', { status: 'none' }).then(function (meta) {
      var roles = meta.roles;
      var h = '<div class="page-head"><div><h1>' + (editing ? esc(u.full_name) : sysAdmin() ? 'Add a Zonal Admin' : 'Add a user') + '</h1>' + (editing ? '<p class="small muted">' + esc(u.username || 'No username yet') + ', ' + esc(u.role_label) + '. ' + (u.last_login ? 'Last signed in ' + esc(Z.when(u.last_login)) : 'Has not signed in yet') + '.</p>' : '') + '</div>' + Z.closeBtn('#/users') + '</div>';
      h += '<div class="grid split"><form id="uf" class="card pad" novalidate><div data-form-error></div>';
      h += editing ? '<p class="small muted">Username: ' + (u.username ? '<b>' + esc(u.username) + '</b> (cannot be changed)' : '<b>not chosen yet</b>. They choose it when they open their sign-in link.') + '</p>'
        : '<p class="small muted">You do not choose a username. The person chooses their own when they open the sign-in link you send them.</p>';
      h += Z.text('full_name', 'Full name', editing ? u.full_name : '', 'maxlength="120"') + Z.field('phone', 'Phone number (optional)', '<input type="tel" id="f_phone" name="phone" value="' + esc(editing ? u.phone : '') + '" inputmode="tel">')
        + Z.field('role', 'Role', '<select id="f_role" name="role"><option value="">Choose</option>' + roles.map(function (x) { return '<option value="' + x.role + '"' + (editing && u.role === x.role ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '</select>')
        + '<fieldset><legend>Responsible for</legend><div data-field="unit_id"><div id="unitPick"></div><p class="hint" id="unitHint">Choose a role first.</p></div></fieldset>'
        + '<button type="submit" class="btn primary">' + (editing ? 'Save changes' : 'Add user and make a sign-in link') + '</button></form><div class="stack" id="side2">';
      if (editing) {
        h += '<div class="card pad"><h2>Password</h2><p class="small muted">' + (u.has_password ? 'Make a new one-time link if they have forgotten their password.' : 'They have not set a password yet.') + '</p><form id="lf"><div data-form-error></div><button type="submit" class="btn">Make a sign-in link</button></form></div>'
          + '<div class="card pad"><h2>' + (u.status === 'active' ? 'Switch off' : 'Switch back on') + '</h2><form id="sf" data-confirm-tone="' + (u.status === 'active' ? 'danger' : 'plain') + '" data-confirm-ok="' + (u.status === 'active' ? 'Deactivate account' : 'Reactivate account') + '" data-confirm-title="' + (u.status === 'active' ? 'Deactivate' : 'Reactivate') + ' this account?" data-confirm="' + (u.status === 'active'
          ? esc(u.full_name || u.username) + ' will be signed out and will not be able to sign in. Their reports stay on record.'
          : esc(u.full_name || u.username) + ' will be able to sign in again.') + '"><div data-form-error></div><button class="btn ' + (u.status === 'active' ? 'danger' : '') + '" type="submit">' + (u.status === 'active' ? 'Deactivate' : 'Reactivate') + '</button></form></div>';
      }
      h += '</div></div>';
      main.innerHTML = h;
      var roleLevel = {}; roles.forEach(function (x) { roleLevel[x.role] = x.level; });
      var drawPicker = function (chain) {
        var lvl = roleLevel[$('#f_role').value];
        var box = $('#unitPick'), hint = $('#unitHint');
        if (!lvl) { box.innerHTML = ''; hint.textContent = $('#f_role').value ? 'Responsible for the whole zone.' : 'Choose a role first.'; hint.classList.remove('hidden'); return; }
        hint.classList.add('hidden');
        Z.picker(box, { target: lvl, name: 'unit_id', chain: chain || {} });
      };
      $('#f_role').addEventListener('change', function () { drawPicker({}); });
      drawPicker(editing ? u.unit.chain : {});
      Z.bindForm($('#uf'), editing ? 'users.update' : 'users.create', function () { return editing ? { id: u.id, stamp: u.stamp } : {}; }, function (d) {
        if (editing) { Z.toast('Changes saved.'); Z.route(); return; }
        main.innerHTML = '<div class="page-head"><h1>Account created</h1>' + Z.closeBtn('#/users') + '</div><div style="max-width:640px">' + linkBox(d, 'Send this link to the new user. They open it to choose their own username and password.') + '</div>';
        wireCopy();
      });
      if (editing) {
        Z.bindForm($('#lf'), 'users.link', { id: u.id }, function (d) {
          var old = $('#linkCard'); if (old) old.remove();
          $('#side2').insertAdjacentHTML('afterbegin', linkBox(d, 'Give this to ' + u.full_name + '. Any earlier link for this account no longer works.'));
          wireCopy();
          $('#linkCard').scrollIntoView({ block: 'center' }); $('#theLink').focus();
        });
        Z.bindForm($('#sf'), 'users.status', { id: u.id, active: u.status !== 'active' }, function () { Z.toast('Saved.'); Z.route(); });
      }
    });
  }

  // ------------------------------------------------------------------ account and administration
  function account(main) {
    main.innerHTML = '<div class="page-head"><h1>Change password</h1></div><form id="pf" class="card pad" style="max-width:520px" novalidate><div data-form-error></div>'
      + Z.field('current', 'Current password', '<div class="pw"><input type="password" id="f_current" name="current" autocomplete="current-password"><button type="button" class="pw-toggle" data-pw-toggle aria-label="Show the password" aria-pressed="false">Show</button></div>')
      + Z.field('password', 'New password', '<div class="pw"><input type="password" id="f_password" name="password" autocomplete="new-password"><button type="button" class="pw-toggle" data-pw-toggle aria-label="Show the password" aria-pressed="false">Show</button></div>', 'At least 10 characters, not containing your username.')
      + Z.field('confirm', 'Type the new password again', '<div class="pw"><input type="password" id="f_confirm" name="confirm" autocomplete="new-password"><button type="button" class="pw-toggle" data-pw-toggle aria-label="Show the password" aria-pressed="false">Show</button></div>')
      + '<button class="btn primary" type="submit">Change password</button></form>';
    Z.bindForm($('#pf'), 'password', null, function () { Z.toast('Your password has been changed.'); $('#pf').reset(); });
  }

  function admin(main, r) {
    var page = r.parts[1];
    if (page === 'settings') return settings(main);
    if (page === 'crusades') return crusades(main);
    if (page === 'types') return meetingTypes(main);
    if (page === 'backups') return backups(main);
    if (page === 'diagnostics') return diagnostics(main);
    if (page === 'audit') return auditLog(main, r);
    if (page === 'maintenance') return maintenance(main);
    throw { message: 'Unknown page.' };
  }

  function settings(main) {
    return Z.call('admin.settings').then(function (d) {
      var s = d.settings;
      var h = '<div class="page-head"><h1>Settings</h1></div><div class="grid md-g2"><form id="sf" class="card pad" novalidate><h2 style="margin-bottom:.8rem">General</h2><div data-form-error></div>'
        + Z.text('app_name', 'Name of the system', s.app_name, 'maxlength="80"') + Z.text('church_name', 'Church name', s.church_name, 'maxlength="120"') + Z.text('zone_name', 'Zone name', s.zone_name, 'maxlength="80"')
        + Z.text('currency', 'Currency label', s.currency, 'maxlength="8"')
        + Z.field('edit_window_days', 'Days a Location Admin may correct a report', '<input type="text" inputmode="numeric" id="f_edit_window_days" name="edit_window_days" value="' + esc(s.edit_window_days) + '">', 'District Admin and above can correct at any time.')
        + Z.field('backdate_limit_days', 'How many days back a Location Admin may date a report', '<input type="text" inputmode="numeric" id="f_backdate_limit_days" name="backdate_limit_days" value="' + esc(s.backdate_limit_days) + '">')
        + Z.field('web_url', 'Address on GitHub Pages (optional)', '<input type="url" id="f_web_url" name="web_url" value="' + esc(s.web_url || '') + '" maxlength="200" placeholder="https://dclm-northern.github.io/attendance/" autocapitalize="none" spellcheck="false">',
          'Once the screens are on GitHub Pages, enter their address here. New sign-in links then open there, and this address shows people the way. Leave it empty until the GitHub address works.')
        + '<button class="btn primary" type="submit">Save settings</button></form>'
        + '<div class="stack"><div class="card pad"><h2>Logo</h2><p class="small muted">A PNG, JPG or WebP image under 100 KB. Shown on the sign-in page and in the top bar.</p>'
        + (d.logo ? '<p><img src="' + esc(Z.state.logo || '') + '" alt="Current logo" style="max-width:96px;max-height:96px;border:1px solid var(--line);border-radius:8px;background:#fff"></p>' : '')
        + '<div data-form-error id="logoErr"></div><label for="logoFile">Choose a logo</label><input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp"><div class="btn-row" style="margin-top:.6rem">' + (d.logo ? '<button type="button" class="btn danger small" id="logoRemove">Remove logo</button>' : '') + '</div></div>'
        + '</div></div>';
      main.innerHTML = h;
      Z.bindForm($('#sf'), 'admin.saveSettings', null, function (st) { Z.state.me.settings.app_name = st.app_name; Z.state.me.settings.church = st.church_name; Z.state.me.settings.zone = st.zone_name; Z.state.me.settings.currency = st.currency; Z.toast('Settings saved.'); });
      $('#logoFile').addEventListener('change', function (e) {
        var file = e.target.files[0]; if (!file) return;
        if (file.size > 100 * 1024) { $('#logoErr').innerHTML = '<div class="notice bad">The image is too large. Use one under 100 KB.</div>'; return; }
        var rd = new FileReader();
        rd.onload = function () { Z.call('admin.saveLogo', { data: rd.result }).then(function () { Z.state.logo = rd.result; Z.toast('Logo saved.'); $('.top .logo').innerHTML = '<img src="' + esc(rd.result) + '" alt="">'; Z.route(); })
          .catch(function (err) { $('#logoErr').innerHTML = '<div class="notice bad">' + esc(err.message) + '</div>'; }); };
        rd.readAsDataURL(file);
      });
      var rm = $('#logoRemove');
      if (rm) rm.addEventListener('click', function () { Z.ask({ title: 'Remove the logo?', message: 'The first letter of the zone\'s name will be shown in its place. You can upload a logo again at any time.', ok: 'Remove logo', tone: 'danger' }).then(function (yes) { if (yes) Z.call('admin.removeLogo').then(function () { Z.state.logo = null; $('.top .logo').textContent = Z.state.me.settings.zone.charAt(0); Z.route(); }); }); });
    });
  }

  function meetingTypes(main) {
    return Z.call('admin.types').then(function (types) {
      var h = '<div class="page-head"><div><h1>Meeting types</h1><p class="small muted">The usual day decides when a report is due. HCF always stays HCF.</p></div></div><div class="card" style="max-width:760px"><ul class="list">' + types.map(function (t) {
          var k = 't' + t.id + '_';
          return '<li><form class="grow" data-type="' + t.id + '" aria-label="' + esc(t.code) + '"><div class="grid g2"><div data-field="code"><label for="' + k + 'code">Code</label><input type="text" id="' + k + 'code" name="code" value="' + esc(t.code) + '" maxlength="8"></div><div data-field="weekday"><label for="' + k + 'day">Usual day</label><select id="' + k + 'day" name="weekday">'
            + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(function (w, i) { return '<option value="' + i + '"' + (t.weekday === i ? ' selected' : '') + '>' + w + '</option>'; }).join('') + '</select></div></div>'
            + '<div data-field="name" style="margin-top:.4rem"><label for="' + k + 'name">Name</label><input type="text" id="' + k + 'name" name="name" value="' + esc(t.name) + '" maxlength="80"></div>'
            + (t.is_hcf ? '<input type="hidden" name="status" value="active">' : '<div style="margin-top:.4rem"><label for="' + k + 'st">Status</label><select id="' + k + 'st" name="status"><option value="active">In use</option><option value="inactive"' + (t.status !== 'active' ? ' selected' : '') + '>Not in use</option></select></div>')
            + '<div data-form-error></div><button class="btn small" type="submit" style="margin-top:.5rem">Save ' + esc(t.code) + '</button></form></li>';
        }).join('') + '<li><form class="grow" data-type="" aria-label="Add a meeting type"><h3>Add a meeting type</h3><div class="grid g2"><div data-field="code"><label for="tn_code">Code</label><input type="text" id="tn_code" name="code" maxlength="8"></div><div data-field="weekday"><label for="tn_day">Usual day</label><select id="tn_day" name="weekday">'
          + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(function (w, i) { return '<option value="' + i + '">' + w + '</option>'; }).join('') + '</select></div></div><div data-field="name" style="margin-top:.4rem"><label for="tn_name">Name</label><input type="text" id="tn_name" name="name" maxlength="80"></div><div data-form-error></div><button class="btn small" type="submit" style="margin-top:.5rem">Add meeting type</button></form></li></ul></div>';
      main.innerHTML = h;
      $$('form[data-type]').forEach(function (f) { Z.bindForm(f, 'admin.saveType', { id: f.getAttribute('data-type') }, function () { Z.toast('Meeting type saved.'); Z.call('me').then(function (me) { Z.state.me = me; Z.route(); }); }); });
    });
  }

  function crusades(main) {
    return Z.call('admin.crusades').then(function (list) {
      var h = '<div class="page-head"><h1>Crusade periods</h1></div><p class="small muted">GCK reports are entered against an open crusade period. A period can cross a month end, up to 32 days.</p><div class="grid split"><div class="stack">';
      h += list.length ? list.map(function (c) {
        var k = 'c' + c.id + '_';
        return '<form class="card pad" data-c="' + c.id + '" aria-label="' + esc(c.name) + '"><div data-form-error></div><div class="grid md-g2">' + '<div data-field="name"><label for="' + k + 'name">Name</label><input type="text" id="' + k + 'name" name="name" value="' + esc(c.name) + '" maxlength="100"></div>'
          + '<div><label for="' + k + 'st">Status</label><select id="' + k + 'st" name="status"><option value="open">Open for reports</option><option value="closed"' + (c.status === 'closed' ? ' selected' : '') + '>Closed</option></select></div>'
          + '<div data-field="start_date"><label for="' + k + 'from">First day</label><input type="date" id="' + k + 'from" name="start_date" value="' + esc(c.start_date) + '"></div><div data-field="end_date"><label for="' + k + 'to">Last day</label><input type="date" id="' + k + 'to" name="end_date" value="' + esc(c.end_date) + '"></div></div>'
          + '<p class="small muted">' + num(c.reports) + ' GCK report' + (c.reports === 1 ? '' : 's') + '</p><button class="btn small" type="submit">Save ' + esc(c.name) + '</button></form>';
      }).join('') : '<div class="card empty">No crusade periods yet.</div>';
      h += '</div><form id="nc" class="card pad" novalidate><h2 style="margin-bottom:.7rem">Open a new crusade period</h2><div data-form-error></div>' + Z.text('name', 'Name', '', 'maxlength="100" placeholder="For example, Harvest Crusade 2026"')
        + Z.field('start_date', 'First day', '<input type="date" id="f_start_date" name="start_date">') + Z.field('end_date', 'Last day', '<input type="date" id="f_end_date" name="end_date">') + '<button class="btn primary" type="submit">Open crusade period</button></form></div>';
      main.innerHTML = h;
      Z.bindForm($('#nc'), 'admin.saveCrusade', null, function () { Z.toast('Crusade period opened.'); Z.route(); });
      $$('form[data-c]').forEach(function (f) { Z.bindForm(f, 'admin.saveCrusade', { id: f.getAttribute('data-c') }, function () { Z.toast('Saved.'); Z.route(); }); });
    });
  }

  function backups(main) {
    return Z.call('admin.backups').then(function (d) {
      var list = d.list;
      var h = '<div class="page-head"><h1>Backups</h1></div>' + scheduleNotice(d.schedule, 'backup') + '<div class="grid split"><div class="card">' + (list.length ? '<ul class="list">' + list.map(function (b) {
        return '<li><span class="grow"><b>' + esc(Z.when(b.at)) + '</b><span class="small muted">Made by ' + esc(b.by) + '</span></span>' + (b.url ? '<a class="btn small" href="' + esc(b.url) + '" target="_blank" rel="noopener">Open copy</a>' : '') + '</li>';
      }).join('') + '</ul>' : '<div class="empty">No backups yet.</div>') + '</div><div class="stack"><form id="bf" class="card pad"><h2>Make a backup now</h2><p class="small muted">A full copy of the data spreadsheet is saved in the owner\'s Google Drive. The newest 30 are kept; older copies go to the Drive bin.</p><div data-form-error></div><button class="btn primary" type="submit">Make a backup</button></form>'
        + '<div class="card pad"><h2>Restoring</h2><p class="small">The script owner, in the Apps Script editor, opens Project Settings, Script properties, and sets <b>spreadsheet_id</b> to the ID of the backup copy (the long code in its address). The system then reads from the copy. Everyone signs in again.</p></div></div></div>';
      main.innerHTML = h;
      Z.bindForm($('#bf'), 'admin.backup', null, function () { Z.toast('Backup made.'); Z.route(); });
    });
  }

  function diagnostics(main) {
    return Z.call('admin.diagnostics').then(function (d) {
      var h = '<div class="page-head"><h1>Data checks</h1>' + (d.spreadsheetUrl ? '<a class="btn small" href="' + esc(d.spreadsheetUrl) + '" target="_blank" rel="noopener">Open the data spreadsheet</a>' : '') + '</div><div class="card"><ul class="list">' + d.checks.map(function (c) {
        return '<li><span class="grow"><b>' + esc(c.label) + '</b>' + (c.problems ? '<span class="small muted">' + esc(c.examples.join(', ')) + (c.problems > 5 ? ' and ' + (c.problems - 5) + ' more' : '') + '. ' + esc(c.hint) + '</span>' : '') + '</span>'
          + (c.problems ? '<span class="badge off">' + num(c.problems) + ' to fix</span>' : '<span class="badge ok">All good</span>') + '</li>';
      }).join('') + '</ul></div><h2 style="margin:1.2rem 0 .6rem">Size</h2><div class="card"><ul class="list">' + Object.keys(d.sizes).map(function (k) { return '<li><span class="grow">' + esc(k) + '</span><b>' + num(d.sizes[k]) + ' rows</b></li>'; }).join('')
        + '<li><span class="grow">Cells in the spreadsheet <span class="small muted">(' + Z.pct(d.percent) + ' of the 10 million a Google Sheet holds; see <a href="#/admin/maintenance">Maintenance</a>)</span></span><b>' + num(d.cells) + '</b></li></ul></div>';
      main.innerHTML = h;
    });
  }

  function maintenance(main) {
    return Z.call('maint.status').then(function (o) { drawMaintenance(main, o); });
  }

  /** A warning when the daily backup or weekly maintenance has no trigger yet. */
  function scheduleNotice(sc, which) {
    if (!sc) return '';
    var missing = [];
    if ((!which || which === 'backup') && !sc.backup) missing.push('<b>dailyBackup</b> (time-driven, day timer)');
    if ((!which || which === 'maintenance') && !sc.maintenance) missing.push('<b>weeklyMaintenance</b> (time-driven, week timer)');
    if (!missing.length) return '<div class="notice ok small" role="status">' + (which === 'backup' ? 'A backup is made automatically every day.' : 'The daily backup and weekly maintenance run automatically.') + '</div>';
    return '<div class="notice warn" role="status"><b>Not automatic yet.</b> The script owner should add a trigger in the Apps Script editor (Triggers, the clock): ' + missing.join(' and ') + '.</div>';
  }

  function drawMaintenance(main, o) {
    var bar = function (p, mark) {
      return '<div style="position:relative;height:14px;border-radius:7px;background:var(--surface-2);border:1px solid var(--line);overflow:hidden">'
        + '<div style="height:100%;width:' + Math.min(100, p) + '%;background:' + (p >= o.threshold ? 'var(--bad)' : p >= o.threshold * .8 ? 'var(--gold)' : 'var(--brand)') + '"></div>'
        + '<div title="Archive threshold" style="position:absolute;top:-2px;bottom:-2px;left:' + mark + '%;width:2px;background:var(--ink)"></div></div>';
    };
    var spare = o.sheets.reduce(function (s, x) { return s + x.spareRows * x.cols + x.spareCols * x.rows; }, 0);
    var h = '<div class="page-head"><div><h1>Maintenance</h1><p class="small muted">A Google Sheet holds at most ' + num(o.limit) + ' cells, and empty rows and columns count too.</p></div></div>' + scheduleNotice(o.schedule)
      + '<div class="grid split"><div class="stack"><div class="card pad"><h2>How full the data spreadsheet is</h2>'
      + '<div class="value" style="font-size:2rem;font-weight:600;margin:.4rem 0">' + Z.pct(o.percent) + '</div>' + bar(o.percent, o.threshold)
      + '<p class="small muted" style="margin-top:.5rem">' + num(o.grid) + ' cells in the sheets, of which ' + num(o.used) + ' hold data. The line marks the archive threshold (' + o.threshold + '%).</p>'
      + (spare ? '<div class="notice info small">' + num(spare) + ' cells are empty rows and columns that trimming would free.</div>' : '')
      + '<div class="btn-row"><button type="button" class="btn primary" id="mTrim">Trim empty rows and columns</button><button type="button" class="btn" id="mAuto">Run full maintenance now</button><button type="button" class="btn" id="mRebuild">Rebuild summaries</button></div>'
      + '<p class="hint">Full maintenance trims, then archives the oldest years while the spreadsheet is above the threshold, always keeping the newest ' + o.keepYears + ' year' + (o.keepYears === 1 ? '' : 's') + '.</p>'
      + (o.last ? '<p class="small muted">Last full run: ' + esc(Z.when(o.last.at)) + (o.last.archived && o.last.archived.length ? ', archived ' + esc(o.last.archived.join(', ')) : ', nothing archived') + (o.last.note ? '. ' + esc(o.last.note) : '') + '</p>' : '')
      + '<div id="mMsg"></div></div>'
      + (o.oldCopies.length ? '<div class="card pad"><h2>Copies left from the upgrade</h2><p class="small muted">When the reports moved into month sheets, the old sheets were kept so they could be checked: '
        + esc(o.oldCopies.map(function (x) { return x.name + ' (' + num(x.records) + ')'; }).join(', ')) + '. They take space and are no longer used.</p>'
        + '<button type="button" class="btn" id="mOld">Check and remove them</button><p class="hint">Every row is checked against the month sheets first; nothing is removed if any row is missing.</p></div>' : '')
      + '<div class="card"><h2 style="padding:1rem 1rem .2rem">Records by year</h2><p class="small muted" style="padding:0 1rem">Each year\'s reports, summaries, history and audit entries are kept in their own sheets, which you can open here. A year that has ended can be moved to its own archive spreadsheet; its figures still appear in every report and its sheets can still be opened, but nothing more can be entered for it.</p><ul class="list">'
      + (o.years.length ? o.years.map(function (y) {
        return '<li style="display:block"><div style="display:flex;justify-content:space-between;align-items:center;gap:.75rem"><span class="grow"><b>' + y.year + '</b><span class="small muted">' + num(y.rows) + ' records in ' + y.sheets.length + ' sheet' + (y.sheets.length === 1 ? '' : 's') + '</span></span>'
          + (y.archivable ? '<button type="button" class="btn small" data-archive="' + y.year + '">Archive ' + y.year + '</button>' : '<span class="badge type">This year</span>') + '</div>'
          + (Z.state.me.system_admin ? '<details style="margin-top:.4rem"><summary class="small">Open a sheet of ' + y.year + '</summary><div class="btn-row" style="margin-top:.4rem">' + y.sheets.map(function (sh) {
            return '<a class="btn small" href="' + esc(sh.url) + '" target="_blank" rel="noopener">' + esc(sh.name) + ' <span class="muted">(' + num(sh.records) + ')</span></a>';
          }).join('') + '</div></details>' : '') + '</li>';
      }).join('') : '<li class="muted">No records yet.</li>') + '</ul></div>'
      + '<div class="card"><h2 style="padding:1rem 1rem .2rem">Archived years</h2><ul class="list">' + (o.archives.length ? o.archives.map(function (a) {
        var n = Object.keys(a.rows || {}).reduce(function (s, k) { return s + a.rows[k]; }, 0);
        return '<li><span class="grow"><b>' + a.year + '</b><span class="small muted">' + num(n) + ' records, archived ' + esc(Z.when(a.at)) + ' by ' + esc(a.by) + '</span></span>' + (a.url ? '<a class="btn small" href="' + esc(a.url) + '" target="_blank" rel="noopener">Open archive</a>' : '') + '</li>';
      }).join('') : '<li class="muted">Nothing archived yet.</li>') + '</ul></div></div>'
      + '<div class="stack"><form id="mSet" class="card pad" novalidate><h2 style="margin-bottom:.7rem">Automatic archiving</h2><div data-form-error></div>'
      + Z.field('archive_threshold', 'Archive when the spreadsheet is fuller than (%)', '<input type="text" inputmode="numeric" id="f_archive_threshold" name="archive_threshold" value="' + o.threshold + '">', '30 to 95. 70 leaves plenty of room.')
      + Z.field('keep_years', 'Always keep this many newest years live', '<input type="text" inputmode="numeric" id="f_keep_years" name="keep_years" value="' + o.keepYears + '">', '2 keeps this year and last year.')
      + '<button class="btn primary" type="submit">Save</button></form>'
      + '<div class="card pad"><h2>Who can open the spreadsheet</h2><p class="small">The data spreadsheet, its archives and backups are private to the Google account that owns the system. '
      + (Z.state.me.system_admin ? 'Only System Admins reach the pages that link to them. Zonal Admins and the admins below never see these links.</p>'
        + '<div data-form-error id="lockMsg"></div><button type="button" class="btn" id="mLock">Lock the files again</button><p class="hint">Removes anyone the files were shared with in Google Drive and switches off link sharing. It also runs every week.</p>'
        : 'Only the system administrator can open them.</p>') + '</div>'
      + '<div class="card pad"><h2>Running it every week</h2><p class="small">In the Apps Script editor open <b>Triggers</b> (the clock), choose <b>Add trigger</b>, function <b>weeklyMaintenance</b>, time-driven, week timer. It trims every week and archives only when the threshold is passed.</p><p class="small muted">Make a backup before archiving by hand.</p></div>'
      + '<div class="card"><h2 style="padding:1rem 1rem .2rem">Sheets</h2><ul class="list">' + o.sheets.map(function (x) {
        return '<li><span class="grow"><b>' + esc(x.name) + '</b><span class="small muted">' + num(x.records) + (x.records === 1 ? ' record; ' : ' records; ') + num(x.rows) + ' rows by ' + x.cols + ' columns</span></span><b class="nowrap">' + num(x.grid) + '</b></li>';
      }).join('') + '</ul></div></div></div>';
    main.innerHTML = h;
    var busy = function (btn, label, action, payload, done) {
      btn.setAttribute('aria-busy', 'true'); var old = btn.textContent; btn.textContent = label;
      Z.call(action, payload).then(function (d) { Z.state.cache = {}; drawMaintenance(main, d.status || d); done(d); })
        .catch(function (e) { btn.removeAttribute('aria-busy'); btn.textContent = old; $('#mMsg').innerHTML = '<div class="notice bad">' + esc(e.message) + '</div>'; });
    };
    if ($('#mLock')) $('#mLock').addEventListener('click', function () {
      busy(this, 'Locking…', 'maint.lock', {}, function (d) {
        var removed = d.result.reduce(function (n, x) { return n + (x.removed ? x.removed.length : 0); }, 0);
        var failed = d.result.filter(function (x) { return !x.ok; });
        Z.toast(removed ? 'Locked. ' + removed + ' other account' + (removed === 1 ? ' was' : 's were') + ' removed.' : 'All files were already private.');
        if (failed.length) $('#mMsg').innerHTML = '<div class="notice warn">Could not check: ' + esc(failed.map(function (x) { return x.what + ' (' + x.error + ')'; }).join('; ')) + '</div>';
      });
    });
    $('#mTrim').addEventListener('click', function () { busy(this, 'Trimming…', 'maint.trim', {}, function (d) { Z.toast(d.freed ? num(d.freed) + ' empty cells removed.' : 'Nothing to trim.'); }); });
    if ($('#mOld')) $('#mOld').addEventListener('click', function () { var b = this; Z.ask({ title: 'Remove the old copied sheets?', message: 'Sheets left behind by an earlier version will be deleted from the data spreadsheet. Make a backup first.', ok: 'Remove sheets', tone: 'danger' }).then(function (yes) { if (yes) busy(b, 'Checking…', 'maint.removeOld', {}, function (d) { Z.toast('Removed ' + d.result.length + ' old sheet' + (d.result.length === 1 ? '' : 's') + '.'); }); }); });
    $('#mRebuild').addEventListener('click', function () { busy(this, 'Rebuilding…', 'maint.rebuild', {}, function (d) { Z.toast('Summaries rebuilt: ' + num(d.result.lines) + ' lines.'); }); });
    $('#mAuto').addEventListener('click', function () { var b = this; Z.ask({ title: 'Run full maintenance now?', message: 'Empty rows and columns will be trimmed. If the spreadsheet is more than ' + o.threshold + '% full, the oldest years will be moved to archive spreadsheets. Make a backup first.', ok: 'Run maintenance', tone: 'warn' }).then(function (yes) { if (yes) busy(b, 'Working…', 'maint.auto', {}, function (d) { Z.toast(d.result.archived.length ? 'Archived ' + d.result.archived.join(', ') + '.' : 'Trimmed. Below the threshold, so nothing was archived.'); }); }); });
    $$('[data-archive]').forEach(function (b) {
      b.addEventListener('click', function () {
        var y = b.getAttribute('data-archive');
        Z.ask({ title: 'Archive ' + y + '?', message: 'Every ' + y + ' report, history and audit entry will be moved into an archive spreadsheet. They will still show in reports, but nothing more can be entered or corrected for ' + y + '. Make a backup first.', ok: 'Archive ' + y, tone: 'danger' })
          .then(function (yes) { if (yes) busy(b, 'Archiving…', 'maint.archive', { year: y }, function () { Z.toast(y + ' archived.'); }); });
      });
    });
    Z.bindForm($('#mSet'), 'maint.settings', null, function (d) { Z.toast('Saved.'); drawMaintenance(main, d); });
  }

  var ACTIONS = {
    login: 'Signed in', logout: 'Signed out', login_failed: 'Sign-in failed', login_locked: 'Sign-in blocked after too many tries',
    password_changed: 'Password changed', password_change_failed: 'Password change refused', password_set: 'Password set from a link', account_set_up: 'Account set up (username and password chosen)', password_link: 'Sign-in link made',
    report_created: 'Report entered', report_corrected: 'Report corrected', report_voided: 'Report voided',
    unit_created: 'Unit added', unit_updated: 'Unit changed', unit_moved: 'Unit moved', unit_deactivated: 'Unit deactivated', unit_reactivated: 'Unit reactivated',
    user_created: 'User added', user_updated: 'User changed', user_deactivated: 'User deactivated', user_reactivated: 'User reactivated',
    settings_changed: 'Settings changed', meeting_type_added: 'Meeting type added', meeting_type_changed: 'Meeting type changed',
    crusade_added: 'Crusade period opened', crusade_changed: 'Crusade period changed', backup_made: 'Backup made',
    logo_changed: 'Logo changed', logo_removed: 'Logo removed', login_picture_changed: 'Sign-in picture changed', login_picture_removed: 'Sign-in picture removed', login_banner_changed: 'Scrolling line changed',
    maintenance_run: 'Full maintenance run', maintenance_settings: 'Archiving settings changed', sheets_trimmed: 'Sheets trimmed', summaries_rebuilt: 'Summaries rebuilt',
    old_copies_removed: 'Old copied sheets removed', year_archived: 'Year archived', year_archive_finished: 'Unfinished archive completed',
    system_set_up: 'System set up', zone_leader_changed: 'Zonal Coordinating Overseer changed', fellowship_added: 'Fellowship added', fellowship_changed: 'Fellowship changed', fellowship_report_created: 'Fellowship report entered',
    fellowship_report_corrected: 'Fellowship report corrected', fellowship_report_voided: 'Fellowship report voided', fellowship_report_deleted: 'Fellowship report deleted', report_deleted: 'Report deleted', group_created: 'Group added', group_changed: 'Group changed', group_deactivated: 'Group switched off', group_reactivated: 'Group switched back on', sectional_heads_changed: 'Sectional heads changed', sections_changed: 'List of sections changed', spreadsheet_access_locked: 'Spreadsheet made private', setup_code_failed: 'Wrong set-up code'
  };
  function actionName(a) { return ACTIONS[a] || (String(a).charAt(0).toUpperCase() + String(a).slice(1)).replace(/_/g, ' '); }

  /** The details of an audit entry as readable lines ("name: old → new"). */
  function auditDetails(raw) {
    var d;
    try { d = JSON.parse(raw); } catch (e) { return raw ? esc(raw) : ''; }
    if (!d || typeof d !== 'object') return '';
    var line = function (k, v) { return '<li><b>' + esc(fieldName(k)) + ':</b> ' + esc(typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)) + '</li>'; };
    if (d.before && d.after) return '<ul class="notes">' + Object.keys(d.after).filter(function (k) { return JSON.stringify(d.before[k]) !== JSON.stringify(d.after[k]); })
      .map(function (k) { return '<li><b>' + esc(fieldName(k)) + ':</b> ' + esc(show(d.before[k])) + ' → ' + esc(show(d.after[k])) + '</li>'; }).join('') + '</ul>';
    return '<ul class="notes">' + Object.keys(d).map(function (k) { return line(k, d[k]); }).join('') + '</ul>';
  }

  function auditLog(main, r) {
    var q = r.q;
    return Z.call('admin.audit', { q: q.q, from: q.from, to: q.to }).then(function (rows) {
      var h = '<div class="page-head"><h1>Audit log</h1></div><form class="filters" id="af"><div class="wide"><label for="a_q">Search</label><input type="search" id="a_q" name="q" value="' + esc(q.q || '') + '" placeholder="Name, action or detail"></div>'
        + '<div><label for="a_f">From</label><input type="date" id="a_f" name="from" value="' + esc(q.from || '') + '"></div><div><label for="a_t">To</label><input type="date" id="a_t" name="to" value="' + esc(q.to || '') + '"></div>'
        + '<div><button class="btn" type="submit" style="width:100%">Show</button></div></form>';
      h += rows.length ? '<div class="card"><ul class="list">' + rows.map(function (a) {
        var det = auditDetails(a.details);
        return '<li style="display:block"><span class="grow"><b>' + esc(actionName(a.action)) + '</b><span class="small muted">' + esc(Z.when(a.at)) + ', ' + esc(a.username || 'someone not signed in') + (a.entity ? ', ' + esc(a.entity) + (a.entity_id ? ' #' + esc(a.entity_id) : '') : '') + '</span></span>'
          + (det && det !== '<ul class="notes"></ul>' ? '<details class="small" style="margin-top:.3rem"><summary>Details</summary>' + det + '</details>' : '') + '</li>';
      }).join('') + '</ul></div><p class="small muted">The newest 300 entries are shown. The full log is the Audit sheet of the data spreadsheet.</p>' : '<div class="card empty">Nothing found.</div>';
      main.innerHTML = h;
      $('#af').addEventListener('submit', function (e) { e.preventDefault(); Z.go('/admin/audit', Z.formData($('#af'))); });
    });
  }

  var Views = {
    find: function (r) {
      var p = r.parts;
      if (Z.state.me && Z.state.me.arm) {
        // DLSO and DLCF coordinators: their own pages only.
        if (!p.length) return fsHome;
        var mine = { fs: fsEntry, account: account, reports: report };
        mine[Z.state.me.arm === 'dlso' ? 'schools' : 'campuses'] = institutions;
        if (p[0] === 'reports' && p[1] !== Z.state.me.arm) return function () { throw { code: 'FORBIDDEN', message: 'This page is not part of ' + Z.state.me.armLabel.code + '.' }; };
        return mine[p[0]] || function (main) { main.innerHTML = '<h1>Page not found</h1><div class="card empty">That page does not exist. <a href="#/">Go to the home page</a>.</div>'; };
      }
      if (!p.length) return dashboard;
      return { entry: entry, reports: report, org: org, search: search, users: users, account: account, admin: admin, heads: heads, groups: groups,
        schools: institutions, campuses: institutions, fs: fsEntry, zone: zoneLeader, outbox: outbox }[p[0]]
        || function (main) { main.innerHTML = '<h1>Page not found</h1><div class="card empty">That page does not exist. <a href="#/">Go to the dashboard</a>.</div>'; };
    }
  };
  window.Views = Views;

  return { start: start, login: login };
})();
App.start();
