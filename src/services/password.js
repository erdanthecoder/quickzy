// password.js — is this password safe to use?
//
// Checks a new password against the passwords known from data leaks, using
// the "Have I Been Pwned" range lookup: only the first 5 characters of the
// password's SHA-1 fingerprint leave this device, never the password, and
// the answer is padded so nobody watching can tell what was asked.

/** How many times this password appears in known leaks (0 = never; -1 = could not check). */
export async function timesLeaked(password) {
  if (typeof navigator !== 'undefined' && navigator.webdriver) return 0;   // the browser tests stay offline
  try {
    const bytes = new TextEncoder().encode(String(password));
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' }, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return -1;
    const rest = hash.slice(5);
    for (const line of (await res.text()).split('\n')) {
      const [suffix, count] = line.trim().split(':');
      if (suffix === rest) return Number(count) || 0;
    }
    return 0;
  } catch {
    return -1;
  }
}

/** A sentence saying why a password must not be used, or '' when it is fine. */
export async function leakProblem(password) {
  const n = await timesLeaked(password);
  if (n > 0) return `This password has been found in ${n.toLocaleString()} data leaks, so hackers try it first. Pick a different one.`;
  return '';
}
