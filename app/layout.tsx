import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Breadlet',
  description: 'Breadlet collectible game architecture and landing foundation',
  icons: {
    icon: '/assets/breadlet-logo.svg',
    shortcut: '/assets/breadlet-logo.svg',
    apple: '/assets/breadlet-logo.svg',
  },
};

// Render the page fresh on every request so no browser or CDN keeps an old copy: after an
// update, an old page points at script files the new build deleted, which left players on a
// blank blue screen until the cached copy expired.
export const dynamic = 'force-dynamic';

// Runs before React. When one of the game's script files fails to load, it asks the server for
// that file again: a 404 means an update just went out and deleted it, so it shows the
// "quick maintenance" card and reloads (backing off if that keeps happening). Any other failure
// (a network blip, an ad blocker) is not an update: before the game has started it retries once
// quietly, and once the game is running it leaves the page alone.
// The page sets window.__breadletReady once React is running.
const updateRecovery = `(function () {
  var shown = false;
  var checking = false;
  function showMaintenance() {
    if (shown) return;
    shown = true;
    var key = 'breadlet-update-reloads';
    var now = Date.now();
    var log = [];
    try { log = JSON.parse(sessionStorage.getItem(key) || '[]').filter(function (t) { return now - t < 120000; }); } catch (e) {}
    log.push(now);
    try { sessionStorage.setItem(key, JSON.stringify(log)); } catch (e) {}
    var wait = log.length > 4 ? 20000 : 2500;
    function show() {
      var box = document.createElement('div');
      box.setAttribute('role', 'status');
      box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#E77D22;padding:20px;font-family:system-ui,sans-serif';
      box.innerHTML = '<div style="max-width:360px;width:100%;border:4px solid #13120F;border-radius:22px;background:#27251F;padding:28px;text-align:center;color:#fff;box-shadow:0 8px 0 #13120F">'
        + '<div style="font-size:52px;line-height:1">🔨</div>'
        + '<h1 style="margin:12px 0 6px;font-size:24px;font-weight:900">Quick maintenance</h1>'
        + '<p style="margin:0;font-size:15px;opacity:.85">Breadlet is updating. This page will reload by itself in a few seconds.</p>'
        + '<button type="button" style="margin-top:18px;width:100%;border:0;border-radius:14px;background:#ED7117;padding:12px;font-size:16px;font-weight:900;color:#fff;cursor:pointer">Reload now</button></div>';
      box.querySelector('button').onclick = function () { location.reload(); };
      document.body.appendChild(box);
    }
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
    setTimeout(function () { location.reload(); }, wait);
  }
  function quietRetry() {
    if (window.__breadletReady) return;
    var key = 'breadlet-quiet-retry';
    var last = 0;
    try { last = Number(sessionStorage.getItem(key)) || 0; } catch (e) {}
    if (Date.now() - last < 60000) return;
    try { sessionStorage.setItem(key, String(Date.now())); } catch (e) {}
    location.reload();
  }
  function scriptFailed(url) {
    if (shown || checking) return;
    if (!url) return quietRetry();
    checking = true;
    fetch(url, { method: 'HEAD', cache: 'no-store' })
      .then(function (response) { checking = false; if (response.status === 404) showMaintenance(); else quietRetry(); })
      .catch(function () { checking = false; quietRetry(); });
  }
  window.addEventListener('error', function (event) {
    var target = event.target;
    var url = target && (target.src || target.href);
    if (url && String(url).indexOf('/_next/') !== -1) scriptFailed(String(url));
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var text = String((reason && (reason.name + ' ' + reason.message)) || reason);
    if (!/ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module/i.test(text)) return;
    var match = text.match(/(https?:[^\\s)]+|\\/_next\\/[^\\s)]+)/);
    scriptFailed(match ? match[1] : '');
  });
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: updateRecovery }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
