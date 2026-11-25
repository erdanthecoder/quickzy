// router.js — clean URLs (/join/123456, /quiz/abc) on the History API.
//
// Firebase Hosting rewrites every path to index.html, and so does the
// any other host would need the same, so a link opened straight into /join/123456
// lands here and is routed like any other.

const routes = [];
let current = null;
let onRender = () => {};

/** route('/quiz/:id', loader, { chrome: true }) — loader returns a page module. */
export function route(pattern, loader, opts = {}) {
  const keys = [];
  // '*' is the catch-all, used when nothing else matches
  const re = pattern === '*' ? /^$^/ : new RegExp(`^${pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; })}/?$`);
  routes.push({ pattern, re, keys, loader, opts });
}

export function onRoute(fn) { onRender = fn; }

export function navigate(path, { replace = false } = {}) {
  const [base, hash = ''] = String(path).split('#');
  const here = location.pathname + location.search;
  // same page, another #part: just move there (the page listens for it)
  if (hash && base === here) {
    if (location.hash !== `#${hash}`) { history[replace ? 'replaceState' : 'pushState'](history.state, '', `#${hash}`); window.dispatchEvent(new HashChangeEvent('hashchange')); }
    jumpTo(hash);
    return Promise.resolve();
  }
  if (path === here) return render();
  history[replace ? 'replaceState' : 'pushState'](null, '', path);
  return render().then(() => { if (hash) setTimeout(() => jumpTo(hash), 60); });
}

/** Scroll to the part of the page a #link names, once it is there. */
function jumpTo(hash) {
  const el = document.getElementById(decodeURIComponent(hash));
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function back(fallback = '/') {
  if (history.length > 1 && document.referrer.startsWith(location.origin)) history.back();
  else navigate(fallback, { replace: true });
}

let seq = 0;

let drawn = '';
export async function render() {
  const mine = ++seq;
  const path = location.pathname;
  drawn = location.pathname + location.search;
  let match = null;
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      match = { ...r, params };
      break;
    }
  }
  if (!match) match = { ...routes.find((r) => r.pattern === '*'), params: {} };

  if (current && current.destroy) {
    try { current.destroy(); } catch (e) { console.error(e); }
  }
  current = null;

  const mod = await match.loader();
  if (mine !== seq) return;            // a newer navigation won the race
  const query = Object.fromEntries(new URLSearchParams(location.search));
  await onRender(match, mod, query, (page) => { if (mine === seq) current = page; return mine === seq; });
}

// links: any same-origin <a> without a target navigates in-app
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a');
  if (!a || a.target || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/__dev')) return;
  e.preventDefault();
  navigate(url.pathname + url.search + url.hash);
});

// Back and Forward: a new page draws again; only a new #part does not
window.addEventListener('popstate', () => { if (location.pathname + location.search !== drawn) render(); });
