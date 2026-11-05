// Start-up for the GitHub Pages version: what doGet() gives the Apps Script version.
(function () {
  var t = null;
  try { t = localStorage.getItem('zas-theme'); } catch (e) {}
  if (t !== 'light' && t !== 'dark') t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);

  // A sign-in link carries ?reset=<64 hex characters>; a link cut short gets its own message.
  var m = /[?&]reset=([^&#]*)/.exec(location.search);
  var reset = m ? (/^[a-f0-9]{64}$/.test(m[1]) ? m[1] : 'invalid') : '';
  window.BOOT = { reset: reset, appName: '', church: '', url: location.pathname, web: '' };

  // The fonts load without holding up the page: on a weak signal it shows at once in the
  // device's own fonts, and switches when (if) they arrive.
  var fonts = document.createElement('link');
  fonts.rel = 'stylesheet'; fonts.media = 'print';
  fonts.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap';
  fonts.onload = function () { fonts.media = 'all'; };
  document.head.appendChild(fonts);

  window.ZAS_ERRORS = [];
  window.addEventListener('error', function (e) {
    if (e && e.message) ZAS_ERRORS.push(e.message + (e.lineno ? ' (line ' + e.lineno + ')' : ''));
  });
  window.zasStuck = function (title, detail) {
    var box = document.getElementById('bootLoading');
    if (!box) return;
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var div = document.createElement('div');
    div.className = 'boot-error'; div.setAttribute('role', 'alert');
    div.innerHTML = '<h1>' + esc(title) + '</h1><p>' + esc(detail) + '</p>'
      + (ZAS_ERRORS.length ? '<p><b>Error reported by the browser:</b><br><code>' + esc(ZAS_ERRORS.slice(0, 3).join(' | ')) + '</code></p>' : '')
      + '<p><button type="button">Try again</button></p>';
    div.querySelector('button').addEventListener('click', function () { location.reload(); });
    box.parentNode.replaceChild(div, box);
  };
  document.addEventListener('DOMContentLoaded', function () {
    if (!window.ZAS_API || /PASTE/.test(window.ZAS_API)) {
      zasStuck('The system is not connected yet', 'Open config.js in the GitHub repository and paste the address of the Apps Script web app (it ends in /exec).');
      return;
    }
    if (!window.Z || !window.App) {
      zasStuck('The page could not start', 'Part of the program did not load. Reload the page. If it keeps happening, upload the whole web folder to GitHub again.');
      return;
    }
    setTimeout(function () {
      zasStuck('No answer from the server', 'The server has not answered for 30 seconds. Check the internet connection and try again.');
    }, 30000);
  });

  // Keep a copy of the screens on this device, so the system opens at once next time.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
