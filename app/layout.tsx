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

// Runs before React. If the game's scripts fail to load (an update just went out) or the app
// never starts, show a "quick maintenance" screen and reload, backing off if it keeps failing.
// The page sets window.__breadletReady once React is running.
const updateRecovery = `(function () {
  var shown = false;
  function recover() {
    if (shown || window.__breadletReady) return;
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
  window.__breadletRecover = recover;
  window.addEventListener('error', function (event) {
    var target = event.target;
    var url = target && (target.src || target.href);
    if (url && String(url).indexOf('/_next/') !== -1) recover();
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var text = String((reason && (reason.name + ' ' + reason.message)) || reason);
    if (/ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module/i.test(text)) recover();
  });
  setTimeout(recover, 15000);
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
