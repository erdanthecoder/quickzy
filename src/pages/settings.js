// settings.js — profile, account and this device's preferences.

import { h, fill, debounce } from '../ui/dom.js';
import { icon, verifiedBadge } from '../ui/icons.js';
import { blook, blookName, rarityOf } from '../ui/blooks.js';
import { usableBlooks, me as wallet, levelInfo } from '../services/progress.js';
import { field, input, passwordInput, toggle, busy, toast, confirm, modal, segmented } from '../ui/kit.js';
import { net, explain } from '../net/index.js';
import { navigate } from '../router.js';
import * as session from '../services/session.js';
import { myQuizzes, deleteQuiz, myReports, deleteReport, verifiedProgress, syncAuthor } from '../services/quizzes.js';
import { strength } from './auth.js';
import { pageTitle } from './parts.js';
import { LIMITS, BADGES, VERSION, OWNER_UID, OFFICIAL_UID, PRO_FREE, released14 } from '../config.js';
import { sfx } from '../game/sound.js';
import { nameBadges } from '../ui/badges.js';
import * as siteSvc from '../services/site.js';
import { unfollowAll } from '../services/channels.js';
import { myPlan, membership, manageUrl, PRO_PERKS, PLANS, PRICE } from '../services/plan.js';
import { BANNERS, BANNER_IDS, bannerThumb, validBanner } from '../ui/banner.js';
import { isClean } from '../services/names.js';
import { withTwoStep } from '../ui/twostep.js';
import { leakProblem } from '../services/password.js';
import { qrSVG } from '../ui/qr.js';

export function blookPicker(current, onPick) {
  const grid = h('div', { class: 'blook-grid', role: 'radiogroup', 'aria-label': 'Blook' });
  // only blooks this person owns; the rest come from boxes on the Blooks page
  const draw = () => fill(grid, ...usableBlooks().map((id) => h('button', {
    type: 'button', class: `blook-pick${id === current ? ' is-on' : ''}`, role: 'radio', 'aria-checked': String(id === current),
    'aria-label': blookName(id), style: { '--rc': rarityOf(id).colour },
    onclick: () => { current = id; draw(); onPick(id); },
  }, blook(id), h('small', {}, blookName(id)))));
  draw();
  const el = h('div', { class: 'stack', style: { gap: '8px' } }, grid,
    h('a', { href: '/blooks', class: 'small' }, 'Get more blooks from boxes'));
  el.set = (id) => { current = id; draw(); };
  return el;
}

function section(title, ...rows) {
  const ic = { 'Account type': 'users', Profile: 'user', Account: 'key', 'Account & password': 'key', 'Display & games': 'eye', 'Your data': 'download', About: 'info', Security: 'shield', 'Quickzy Pro': 'star', 'More settings': 'gear', 'Sound & screen': 'volume', 'Trusted quiz maker': 'check', 'Your badge': 'shield', 'Your badges': 'shield' }[title] || 'gear';
  const id = `set-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return h('section', { class: 'card stack set-card', id },
    h('h2', { class: 'set-title' }, h('span', { class: 'set-ic' }, icon(ic, { size: 18 })), title), ...rows);
}

/** The header: who is signed in. */
function hero() {
  const p = session.myProfile();
  const u = session.me();
  const m = wallet();
  const info = levelInfo(m.xp);
  const special = BADGES[u.uid];
  return h('section', { class: 'set-head' },
    h('div', { class: 'set-head-avatar' }, blook(p.blook, 64)),
    h('div', { class: 'grow', style: { minWidth: 0 } },
      h('h1', { class: 'row', style: { gap: '8px', margin: 0 } }, p.displayName, special ? nameBadges(special) : null),
      h('div', { class: 'set-head-sub' }, `@${p.username}`, u.email ? ` · ${u.email}` : '')),
    h('div', { class: 'set-head-stats' },
      h('div', {}, h('b', {}, String(info.level)), h('small', {}, 'Level')),
      h('div', {}, h('b', {}, m.coins.toLocaleString()), h('small', {}, 'Coins')),
      h('div', {}, h('b', {}, String(usableBlooks().length)), h('small', {}, 'Blooks'))),
    h('a', { class: 'btn btn-sm set-head-view', href: `/u/${p.username}` }, icon('user', { size: 16 }), 'View profile'));
}

const slug = (label) => `set-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;

/**
 * The settings menu: one pane at a time, so nothing is a long scroll.
 * The pane is kept in the address (#security), so Back and links work.
 * Typing in the search box shows every matching setting from every pane.
 */
function settingsShell(panes) {
  const ids = panes.map((p) => p.key);
  const pick = () => { const k = location.hash.slice(1).split('/')[0]; return ids.includes(k) ? k : ids[0]; };
  const sub = () => location.hash.slice(1).split('/')[1] || '';
  let on = pick();
  const tabs = panes.map((p) => h('a', {
    href: `#${p.key}`, class: 'set-tab', 'data-for': p.key,
    onclick: (e) => { e.preventDefault(); history.replaceState(history.state, '', `#${p.key}`); show(p.key); },
  }, icon(p.icon, { size: 17 }), h('span', {}, p.label)));
  const search = h('input', { class: 'input set-search', type: 'search', placeholder: 'Search settings', 'aria-label': 'Search settings' });
  const none = h('p', { class: 'muted set-none', hidden: true }, 'No setting matches that.');
  const bodies = panes.map((p) => h('div', { class: 'set-pane stack', 'data-pane': p.key, style: { gap: '18px' } }, ...p.body));
  const show = (key, part = '') => {
    on = key;
    search.value = '';
    filter();
    const pane = panes.find((p) => p.key === key);
    if (pane && pane.open) pane.open(part);
    tabs.forEach((t) => t.classList.toggle('is-on', t.dataset.for === key));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const filter = () => {
    const q = search.value.trim().toLowerCase();
    let hits = 0;
    bodies.forEach((b) => b.classList.toggle('is-searching', Boolean(q)));
    bodies.forEach((b) => {
      if (!q) {
        b.hidden = b.dataset.pane !== on;
        b.querySelectorAll('.set-row, .set-card').forEach((el) => { el.hidden = false; });
        return;
      }
      b.hidden = false;
      b.querySelectorAll('.set-card').forEach((card) => {
        const rows = [...card.querySelectorAll('.set-row')];
        let any = card.querySelector('.set-title').textContent.toLowerCase().includes(q);
        rows.forEach((r) => { const m = any || r.textContent.toLowerCase().includes(q); r.hidden = !m; if (m) hits += 1; });
        if (!rows.length && any) hits += 1;
        card.hidden = !any && !rows.some((r) => !r.hidden);
      });
    });
    none.hidden = !q || hits > 0;
    tabs.forEach((t) => t.classList.toggle('is-on', !q && t.dataset.for === on));
  };
  search.addEventListener('input', filter);
  const onHash = () => { if (!search.isConnected) { window.removeEventListener('hashchange', onHash); return; } show(pick(), sub()); };
  window.addEventListener('hashchange', onHash);
  show(on, sub());
  return h('div', { class: 'set-layout' },
    h('nav', { class: 'set-nav', 'aria-label': 'Settings sections' }, search, ...tabs),
    h('div', { class: 'set-main' }, none, ...bodies));
}

function row(title, text, control) {
  return h('div', { class: 'set-row' },
    h('div', { class: 'grow' }, h('b', {}, title), text ? h('p', { class: 'muted small' }, text) : null),
    control);
}

function profileSection() {
  const p = session.myProfile();
  let chosen = p.blook;
  const preview = h('div', { class: 'set-avatar' }, blook(chosen, 96));
  const name = input({ value: p.displayName, maxlength: 30 });
  const user = input({ value: p.username, maxlength: LIMITS.usernameMax, autocapitalize: 'off', spellcheck: 'false' });
  const userHint = h('small', { class: 'hint' }, `quickzy.web.app/u/${p.username}`);
  const errorBox = h('p', { class: 'error-text', role: 'alert' });
  const save = h('button', { class: 'btn btn-main' }, 'Save profile');
  const undo = h('button', { class: 'btn btn-ghost', type: 'button' }, 'Undo');
  const status = h('span', { class: 'set-save-note' }, 'All changes saved');
  const bar = h('div', { class: 'set-savebar' }, status, h('div', { class: 'row' }, undo, save));
  const extra = bannerAndBio(p, () => dirty());

  const dirty = () => {
    const now = session.myProfile() || p;
    const changed = name.value.trim() !== now.displayName || user.value.trim() !== now.username || chosen !== now.blook || extra.changed(now);
    bar.classList.toggle('is-dirty', changed);
    status.textContent = changed ? 'You have unsaved changes' : 'All changes saved';
    return changed;
  };
  const checkName = debounce(async () => {
    const v = user.value.trim().toLowerCase();
    const bad = session.validUsername(v);
    if (bad) { fill(userHint, bad); userHint.className = 'error-text'; return; }
    if (v === (session.myProfile() || {}).username) { fill(userHint, `quickzy.web.app/u/${v}`); userHint.className = 'hint'; return; }
    const taken = await net.store.get('usernames', v).catch(() => null);
    if (user.value.trim().toLowerCase() !== v) return;
    fill(userHint, taken ? 'That username is taken.' : `Available: quickzy.web.app/u/${v}`);
    userHint.className = taken ? 'error-text' : 'hint';
  }, 350);
  user.addEventListener('input', () => { user.value = user.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); checkName(); dirty(); });
  name.addEventListener('input', dirty);
  undo.addEventListener('click', () => {
    const now = session.myProfile() || p;
    name.value = now.displayName; user.value = now.username; chosen = now.blook;
    fill(preview, blook(chosen, 96)); extra.reset(now); picker.set(chosen);
    fill(userHint, `quickzy.web.app/u/${now.username}`); userHint.className = 'hint'; fill(errorBox);
    dirty();
  });

  save.addEventListener('click', busy(save, async () => {
    fill(errorBox);
    const more = extra.value();
    if (more.error) { fill(errorBox, more.error); return; }
    try {
      const before = session.myProfile();
      await session.updateProfile({ displayName: name.value, blook: chosen });
      if (more.banner !== (before.banner || 'sky') || more.bio !== (before.bio || '')) await session.patchProfile({ banner: more.banner, bio: more.bio });
      if (user.value.trim() !== before.username) await session.changeUsername(user.value.trim());
      const after = session.myProfile();
      if (after.displayName !== before.displayName || after.username !== before.username || after.blook !== before.blook) {
        syncAuthor().catch(() => {});
      }
      net.auth.setDisplayName(after.displayName).catch(() => {});
      toast('Profile saved', 'ok');
      sfx('coin');
      fill(userHint, `quickzy.web.app/u/${after.username}`); userHint.className = 'hint';
      dirty();
    } catch (err) {
      fill(errorBox, err.message && !err.code ? err.message : explain(err));
    }
  }));

  const picker = blookPicker(chosen, (id) => { chosen = id; fill(preview, blook(id, 96)); sfx('pick'); dirty(); });
  return section('Profile',
    h('div', { class: 'profile-head' }, preview,
      h('div', { class: 'grow stack', style: { minWidth: '220px' } },
        field('Display name', name, 'Shown on your quizzes and profile.'),
        h('label', { class: 'field' }, h('span', {}, 'Username'), user, userHint))),
    extra.el,
    h('h3', { style: { margin: '6px 0 0' } }, 'Your blook'),
    picker,
    row('Have a channel', 'On: people can follow you and see your channel in Channels. Off: just a plain profile.',
      toggle(p.channel !== false, async (on) => {
        try { await session.patchProfile({ channel: on }); toast(on ? 'Your channel is on' : 'Your channel is off', 'ok'); } catch (err) { toast(explain(err), 'bad'); }
      })),
    errorBox,
    bar);
}

/** The owner picks which badges to wear next to their name. */
function ownerBadgeSection() {
  const info = {
    owner: ['Owner', 'Green: the Quickzy owner. Only you have it.'],
    kg: ['Kyrgyzstan', 'The Kyrgyz flag.'],
    official: ['Official Quickzy', 'Black: made by Quickzy itself.'],
    verified: ['Trusted quiz maker', 'Blue: for trusted quiz makers.'],
  };
  const preview = h('span', { class: 'badge-set', style: { transform: 'scale(1.5)', transformOrigin: 'left center', marginLeft: '6px' } });
  const box = h('div', { class: 'stack', style: { gap: '0' } });
  let wear = ['owner'];
  const save = debounce(async () => {
    try { wear = await siteSvc.setOwnerWear(wear); toast('Badges saved', 'ok'); draw(); } catch (err) { toast(explain(err), 'bad'); }
  }, 500);
  const draw = () => {
    fill(preview, ...wear.map((k) => verifiedBadge(null, k)));
    fill(box, ...siteSvc.OWNER_BADGES.map((k) => row(h('span', { class: 'row', style: { gap: '8px' } }, verifiedBadge(null, k), info[k][0]), info[k][1],
      toggle(wear.includes(k), (on) => {
        const next = on ? [...wear, k] : wear.filter((x) => x !== k);
        if (!next.length) { toast('Wear at least one badge', 'bad'); draw(); return; }
        wear = siteSvc.OWNER_BADGES.filter((x) => next.includes(x));
        fill(preview, ...wear.map((x) => verifiedBadge(null, x)));
        sfx('pick');
        save();
      }))));
  };
  siteSvc.ownerWear().then((w) => { wear = w; draw(); });
  draw();
  return section('Your badges',
    h('div', { class: 'row', style: { gap: '10px' } }, h('b', {}, session.myProfile().displayName), preview),
    h('p', { class: 'small muted', style: { margin: 0 } }, 'Choose which badges show next to your name everywhere. Wear all of them or just some.'),
    box);
}

function verifiedSection() {
  const p = session.myProfile();
  const special = BADGES[session.me().uid];
  if (special === 'owner') return ownerBadgeSection();
  if (special) {
    return section('Your badge', h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
      h('span', { style: { transform: 'scale(1.6)', margin: '0 8px 0 4px' } }, verifiedBadge(null, special)),
      h('div', {}, h('b', {}, special === 'owner' ? 'Quickzy owner' : 'Official Quickzy'),
        h('p', { class: 'small muted', style: { margin: '2px 0 0' } }, special === 'owner'
          ? 'The green check shows next to your name everywhere. Only the owner has it.'
          : 'The black check marks quizzes made by Quickzy itself.'))));
  }
  const body = h('div', { class: 'muted' }, 'Checking…');
  verifiedProgress(session.me().uid).then(({ have, need, minQuestions }) => {
    const done = have >= need;
    fill(body, h('div', { class: 'row', style: { alignItems: 'flex-start', flexWrap: 'nowrap' } },
      h('span', { style: { transform: 'scale(1.6)', margin: '6px 8px 0 4px' } }, verifiedBadge()),
      h('div', { class: 'grow' },
        h('b', { style: { color: 'var(--ink)' } }, done ? `${p.displayName} is a trusted quiz maker` : 'Get the blue badge: trusted quiz maker'),
        h('p', { class: 'small', style: { margin: '4px 0 8px' } }, done
          ? 'The blue check shows next to your name on every quiz and on your profile.'
          : `Publish ${need} quizzes with at least ${minQuestions} questions each. You have ${have} of ${need}.`),
        h('div', { class: 'strength', style: { height: '10px' } }, h('i', { style: { width: `${Math.min(100, (have / need) * 100)}%`, background: 'var(--a1)' } })))));
  });
  return section('Trusted quiz maker', body);
}

function accountSection() {
  const u = session.me();
  const hasPassword = (u.providers || []).includes('password');
  const hasGoogle = (u.providers || []).includes('google.com');
  const verifyRow = h('div');
  const drawVerify = () => {
    const me = session.me();
    fill(verifyRow, row('Email address', me.email || 'No email on this account',
      me.emailVerified
        ? h('span', { class: 'pill pill-ok' }, icon('check', { size: 14 }), 'Confirmed')
        : (() => {
          const send = h('button', { class: 'btn btn-sm' }, 'Send confirmation');
          send.addEventListener('click', busy(send, async () => {
            try { await net.auth.sendVerify(); toast(`Email sent to ${me.email}. Open the link, then come back.`, 'ok'); } catch (err) { toast(explain(err), 'bad'); }
          }));
          const check = h('button', { class: 'btn btn-sm btn-ghost' }, 'I confirmed it');
          check.addEventListener('click', busy(check, async () => {
            await session.refresh();
            if (session.me().emailVerified) toast('Email confirmed', 'ok'); else toast('Not confirmed yet. Open the link in the email first.', 'bad');
            drawVerify();
          }));
          return h('div', { class: 'row' }, send, check);
        })()));
  };
  drawVerify();

  const resetBtn = h('button', { class: 'btn btn-sm' }, icon('mail', { size: 16 }), 'Email me a link');
  resetBtn.addEventListener('click', busy(resetBtn, async () => {
    try { await net.auth.sendReset(u.email); toast(`Reset link sent to ${u.email}. Check spam too.`, 'ok'); } catch (err) { toast(explain(err), 'bad'); }
  }));
  const passRow = hasPassword
    ? h('div', {},
      row('Password', 'Change the password you sign in with.', h('button', { class: 'btn btn-sm', onclick: changePassword }, icon('key', { size: 16 }), 'Change')),
      row('Forgot your password?', 'We email you a link to choose a new one.', resetBtn))
    : row('Password', hasGoogle ? 'You sign in with Google, so there is no password to manage here.' : '', null);

  const out = h('button', { class: 'btn btn-sm' }, icon('logout', { size: 16 }), 'Sign out');
  out.addEventListener('click', busy(out, async () => { await net.auth.signOut(); toast('Signed out'); navigate('/', { replace: true }); }));

  return section('Account & password',
    verifyRow,
    row('Signed in with', [hasGoogle && 'Google', hasPassword && 'email and password'].filter(Boolean).join(' and ') || 'email', null),
    passRow,
    row('Sign out', 'Sign out on this device.', out),
    row('Delete account', 'Removes your profile, quizzes and reports for good.', h('button', { class: 'btn btn-sm btn-bad', onclick: deleteAccount }, icon('trash', { size: 16 }), 'Delete')));
}

function changePassword() {
  return modal((close) => {
    const current = passwordInput({ autocomplete: 'current-password' });
    const next = passwordInput({ autocomplete: 'new-password' });
    const errorBox = h('p', { class: 'error-text', role: 'alert' });
    const go = h('button', { class: 'btn btn-main' }, 'Change password');
    go.addEventListener('click', busy(go, async () => {
      fill(errorBox);
      if (strength(next.input.value) < 1) { fill(errorBox, 'Pick a longer, less common password: at least 8 characters.'); return; }
      if (next.input.value === current.input.value) { fill(errorBox, 'Pick a new password, not the one you have now.'); return; }
      const leaked = await leakProblem(next.input.value);
      if (leaked) { fill(errorBox, leaked); return; }
      try {
        await withTwoStep(() => net.auth.changePassword(current.input.value, next.input.value));
        toast('Password changed', 'ok');
        close(true);
      } catch (err) { fill(errorBox, explain(err)); }
    }));
    return [h('h2', {}, 'Change password'), field('Current password', current), field('New password', next), errorBox,
      h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => close(false) }, 'Cancel'), go)];
  });
}

async function deleteAccount() {
  const u = session.me();
  const hasPassword = (u.providers || []).includes('password');
  const ok = await modal((close) => {
    const pw = hasPassword ? passwordInput({ autocomplete: 'current-password' }) : null;
    const typed = input({ placeholder: 'DELETE' });
    const errorBox = h('p', { class: 'error-text', role: 'alert' });
    const go = h('button', { class: 'btn btn-bad' }, 'Delete everything');
    go.addEventListener('click', busy(go, async () => {
      fill(errorBox);
      if (typed.value.trim() !== 'DELETE') { fill(errorBox, 'Type DELETE in capitals to confirm.'); return; }
      try {
        // prove it is really them first, so nothing is removed if this fails
        await withTwoStep(() => net.auth.reauth(hasPassword ? pw.input.value : undefined));
        const p = session.myProfile();
        for (const q of await myQuizzes()) await deleteQuiz(q.id);
        for (const r of await myReports()) await deleteReport(r.id);
        await unfollowAll();
        // leave every class, and forget the sign-up answers
        const classes = await import('../services/classes.js');
        for (const k of await classes.myClasses()) {
          if (k.owner === u.uid) await classes.deleteClass(k).catch(() => {});
          else if ((k.members || []).includes(u.uid)) await classes.leave(k).catch(() => {});
        }
        await net.store.del('about', u.uid).catch(() => {});
        const steps = [{ op: 'del', col: 'users', id: u.uid }];
        if (p && p.username) steps.unshift({ op: 'del', col: 'usernames', id: p.username });
        await net.store.batch(steps);
        await net.auth.deleteAccount();
        close(true);
      } catch (err) { fill(errorBox, explain(err)); }
    }));
    return [h('h2', {}, 'Delete your account?'),
      h('p', { class: 'muted' }, 'Your profile, every quiz you made and all your game reports are removed. This cannot be undone.'),
      pw ? field('Your password', pw) : h('p', { class: 'small muted' }, 'Google will ask you to confirm it is you.'),
      field('Type DELETE to confirm', typed), errorBox,
      h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => close(false) }, 'Keep my account'), go)];
  });
  if (ok) { toast('Your account was deleted'); navigate('/', { replace: true }); }
}

/* ------------------------------------------------------------ security */

/** Prove it is really them (password, or Google), with the code if 2-step is on. */
function proveItsYou(why) {
  const u = session.me();
  const hasPassword = (u.providers || []).includes('password');
  return modal((close) => {
    const pw = hasPassword ? passwordInput({ autocomplete: 'current-password' }) : null;
    const errorBox = h('p', { class: 'error-text', role: 'alert' });
    const go = h('button', { class: 'btn btn-main' }, hasPassword ? 'Continue' : 'Continue with Google');
    go.addEventListener('click', busy(go, async () => {
      fill(errorBox);
      if (pw && !pw.input.value) { fill(errorBox, 'Type your password.'); return; }
      try { await withTwoStep(() => net.auth.reauth(pw ? pw.input.value : undefined)); close(true); } catch (err) { if (err.code !== 'auth/cancelled') fill(errorBox, explain(err)); }
    }));
    if (pw) pw.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
    return [h('h2', {}, 'Check it is you'), h('p', { class: 'muted', style: { margin: 0 } }, why),
      pw ? field('Your password', pw) : null, errorBox,
      h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => close(false) }, 'Cancel'), go)];
  });
}

/** Turn on 2-step verification: scan the QR code, type a code to prove it works. */
async function turnOnTwoStep(redraw) {
  const u = session.me();
  if (!u.emailVerified) { toast('Confirm your email address first (More settings → Account & password).', 'bad'); return; }
  let setup;
  try { setup = await net.auth.mfa.start(); } catch (err) {
    if (err.code !== 'auth/requires-recent-login') { toast(explain(err), 'bad'); return; }
    if (!(await proveItsYou('Before turning on 2-step verification, sign in again.'))) return;
    try { setup = await net.auth.mfa.start(); } catch (e2) { toast(explain(e2), 'bad'); return; }
  }
  const done = await modal((close) => {
    const qr = h('div', { class: 'tfa-qr' });
    qrSVG(setup.uri, { margin: 1 }).then((el) => { el.setAttribute('aria-label', 'QR code for your authenticator app'); qr.replaceChildren(el); }).catch(() => {});
    const key = h('code', { class: 'tfa-key' }, setup.key.replace(/(.{4})/g, '$1 ').trim());
    const copy = h('button', { class: 'btn btn-sm btn-ghost', onclick: () => navigator.clipboard?.writeText(setup.key).then(() => toast('Key copied', 'ok')) }, icon('copy', { size: 14 }), 'Copy');
    const code = input({ inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 7, placeholder: '123 456', class: 'input code-input' });
    const errorBox = h('p', { class: 'error-text', role: 'alert' });
    const go = h('button', { class: 'btn btn-main' }, 'Turn on');
    go.addEventListener('click', busy(go, async () => {
      fill(errorBox);
      const v = code.value.replace(/\D/g, '');
      if (v.length !== 6) { fill(errorBox, 'Type the 6-digit code your app shows.'); return; }
      try { await setup.finish(v, 'Authenticator app'); close(true); } catch (err) { fill(errorBox, explain(err)); }
    }));
    return [h('div', { class: 'stack', style: { gap: '12px' } },
      h('h2', {}, 'Turn on 2-step verification'),
      h('ol', { class: 'tfa-steps' },
        h('li', {}, 'Install an authenticator app on your phone: ', h('b', {}, 'Google Authenticator'), ', ', h('b', {}, 'Microsoft Authenticator'), ' or ', h('b', {}, 'Authy'), '.'),
        h('li', {}, 'In the app, add an account and scan this code:'),
        h('li', { class: 'tfa-scan' }, qr, h('div', { class: 'stack', style: { gap: '6px' } }, h('small', { class: 'muted' }, 'Can\'t scan? Type this key:'), key, copy)),
        h('li', {}, 'Type the 6-digit code the app shows:', code)),
      errorBox,
      h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => close(false) }, 'Cancel'), go))];
  }, { wide: true });
  if (done) { await session.refresh(); sfx('checkpoint'); toast('2-step verification is on. You will need your app to sign in.', 'ok'); redraw(); }
}

async function turnOffTwoStep(redraw) {
  if (!(await confirm({ title: 'Turn off 2-step verification?', text: 'Anyone who learns your password could then sign in as you.', yes: 'Turn off', danger: true }))) return;
  if (!(await proveItsYou('Before turning off 2-step verification, check it is you.'))) return;
  try {
    await net.auth.mfa.remove('totp');
    await session.refresh(); toast('2-step verification is off'); redraw();
  } catch (err) { toast(explain(err), 'bad'); }
}

/** Sign out every other phone and computer: they must sign in again (with the code, if 2-step is on). */
async function signOutEverywhere() {
  if (!(await confirm({ title: 'Sign out everywhere else?', text: 'Every other phone, tablet and computer signed in to your account is signed out. This one stays signed in.', yes: 'Sign them out', danger: true }))) return;
  if (!(await proveItsYou('To sign out your other devices, check it is you.'))) return;
  try {
    const before = await net.auth.authTime();
    await net.store.set('signouts', session.me().uid, { before });
    toast('Done. Every other device is signed out.', 'ok');
  } catch (err) { toast(explain(err), 'bad'); }
}

/** Add a passkey for this device (after checking it is you, if needed). */
async function addPasskey(redraw) {
  const name = /iphone|ipad/i.test(navigator.userAgent) ? 'iPhone or iPad' : /android/i.test(navigator.userAgent) ? 'Android phone' : /mac/i.test(navigator.userAgent) ? 'Mac' : /windows/i.test(navigator.userAgent) ? 'Windows computer' : 'This device';
  const go = async () => net.auth.passkeys.add(name);
  try { await go(); } catch (err) {
    if (err && err.code === 'auth/requires-recent-login') {
      if (!(await proveItsYou('Before adding a passkey, check it is you.'))) return;
      try { await go(); } catch (e2) { if (e2 && e2.name !== 'NotAllowedError') toast(explain(e2), 'bad'); return; }
    } else { if (!err || err.name !== 'NotAllowedError') toast(explain(err), 'bad'); return; }
  }
  sfx('checkpoint'); toast('Passkey added. Next time, sign in with your fingerprint, face or screen lock.', 'ok'); redraw();
}


function securitySection() {
  const box = h('div', { class: 'stack', style: { gap: 0 } });
  // what the sign-in guard knows: is it set up, is 2-step on, which passkeys
  let guard = { ready: false, totp: false, passkeys: [] };
  const load = async () => {
    try {
      const [ready, st] = await Promise.all([net.auth.mfa.ready(), net.auth.mfa.status().catch(() => null)]);
      guard = { ready, totp: Boolean(st && st.totp), passkeys: (st && st.passkeys) || [] };
    } catch { /* keep */ }
    draw();
  };
  const draw = () => {
    const u = session.me();
    const hasPassword = (u.providers || []).includes('password');
    const twoStep = guard.totp || (u.mfa || []).length > 0;
    const canPasskey = guard.ready && net.auth.passkeys && net.auth.passkeys.supported();
    const p = session.prefs();
    const checks = [
      [u.emailVerified, 'Email confirmed'],
      [hasPassword || (u.providers || []).includes('google.com'), hasPassword ? 'Password set' : 'Google sign-in'],
      [twoStep, '2-step verification'],
    ];
    const score = checks.filter(([ok]) => ok).length;
    const when = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not known');
    fill(box,
      h('div', { class: `sec-check is-${score >= checks.length ? 'good' : score >= 2 ? 'ok' : 'low'}` },
        h('div', { class: 'sec-score' }, h('b', {}, `${score}/${checks.length}`), h('small', {}, score >= checks.length ? 'Well protected' : score >= 2 ? 'Could be safer' : 'Needs attention')),
        h('ul', {}, ...checks.map(([ok, label]) => h('li', { class: ok ? 'is-on' : '' }, icon(ok ? 'check' : 'close', { size: 14, stroke: 3 }), label)))),
      row('2-step verification', 'When you sign in, Quickzy also asks for a 6-digit code from an app on your phone. Even someone with your password cannot get in.',
        twoStep
          ? h('div', { class: 'row' }, h('span', { class: 'pill pill-ok' }, icon('shield', { size: 14 }), 'On'), h('button', { class: 'btn btn-sm btn-ghost', onclick: () => turnOffTwoStep(load) }, 'Turn off'))
          : guard.ready ? h('button', { class: 'btn btn-sm btn-main', onclick: () => turnOnTwoStep(load) }, icon('shield', { size: 16 }), 'Turn on') : h('span', { class: 'pill' }, 'Getting ready…')),
      row('Passkeys', 'Sign in with your fingerprint, face or screen lock instead of a password. Passkeys cannot be guessed or stolen by fake websites.',
        canPasskey ? h('button', { class: 'btn btn-sm', onclick: () => addPasskey(load) }, icon('plus', { size: 16 }), 'Add a passkey')
          : h('span', { class: 'pill' }, guard.ready ? 'Not on this browser' : 'Getting ready…')),
      ...guard.passkeys.map((k) => h('div', { class: 'set-sub' },
        icon('key', { size: 16 }), h('div', { class: 'grow' }, h('b', {}, k.name || 'Passkey'), h('small', { class: 'muted' }, `Added ${when(k.created)}${k.used ? ` · last used ${when(k.used)}` : ''}`)),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => {
          if (!(await confirm({ title: 'Remove this passkey?', text: 'You will not be able to sign in with it any more.', yes: 'Remove', danger: true }))) return;
          try { await net.auth.passkeys.remove(k.id); toast('Passkey removed'); load(); } catch (err) { toast(explain(err), 'bad'); }
        } }, 'Remove'))),
      row('Sign out everywhere else', 'Lost a phone, or signed in on a school computer? Sign out every other device at once.',
        h('button', { class: 'btn btn-sm', onclick: signOutEverywhere }, icon('logout', { size: 16 }), 'Sign out others')),
      row('Auto sign-out on this device', 'Signs you out after 30 minutes without using Quickzy. Turn on for shared computers.',
        toggle(Boolean(p.autoLock), (v) => { session.setPrefs({ autoLock: v }); try { localStorage.setItem('quickzy.lastActive', String(Date.now())); } catch { /* ignore */ } draw(); })),
      row('Last sign-in', `${when(u.lastSignIn)} · account made ${when(u.created)}`, null),
      h('details', { class: 'sec-tips' },
        h('summary', {}, 'How Quickzy keeps your account safe'),
        h('ul', {},
          h('li', {}, 'New passwords are checked against passwords from known data leaks. Only a short scrambled piece ever leaves your device.'),
          h('li', {}, 'Quickzy never asks for your password in a chat, an email or a game. Only on the Quickzy sign-in page.'),
          h('li', {}, 'Answers to quizzes are kept apart: players can never read them.'),
          h('li', {}, 'Every change to your account is checked on Quickzy\'s servers, not only in the app, so nobody can give themselves coins or Pro.'),
          h('li', {}, 'Use a password you use nowhere else, and turn on 2-step verification.'))));
  };
  draw();
  load();
  return section('Security', box);
}

/* ----------------------------------------------------------- Quickzy Pro */

function proSection() {
  const u = session.me();
  const box = h('div', { class: 'stack', style: { gap: 0 } }, h('p', { class: 'muted small', style: { margin: 0 } }, 'Checking your plan…'));
  const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  Promise.all([myPlan(), membership(u.uid).catch(() => null), myQuizzes().catch(() => [])]).then(([plan, m, quizzes]) => {
    const always = u.uid === OWNER_UID || u.uid === OFFICIAL_UID || PRO_FREE.includes(u.uid);
    const used = quizzes.length;
    const limits = h('div', { class: 'pro-limits' },
      h('div', {}, h('small', {}, 'Quizzes'), h('b', {}, `${used} / ${plan.quizzes}`), h('i', { style: { '--w': `${Math.min(100, Math.round((used / plan.quizzes) * 100))}%` } })),
      h('div', {}, h('small', {}, 'Players per game'), h('b', {}, `Up to ${plan.players}`)),
      h('div', {}, h('small', {}, 'Game modes'), h('b', {}, `${plan.modes.length} of ${PLANS.pro.modes.length}`)),
      h('div', {}, h('small', {}, 'Longest game'), h('b', {}, `${Math.max(...plan.minutes)} minutes`)));
    if (plan.pro) {
      const until = m && m.until ? Number(m.until) : 0;
      const days = until ? Math.max(0, Math.ceil((until - Date.now()) / 86400000)) : 0;
      const status = always ? 'Included with your account' : m && m.paid ? `Paid · active until ${fmtDate(until)}` : until ? `Gift from Quickzy · until ${fmtDate(until)}` : 'Active';
      fill(box,
        h('div', { class: 'pro-card is-pro' },
          h('div', { class: 'pro-card-top' }, verifiedBadge(null, 'pro'), h('div', { class: 'grow' }, h('b', {}, 'You have Quickzy Pro'), h('small', {}, status)),
            !always && until ? h('div', { class: 'pro-days' }, h('b', {}, String(days)), h('small', {}, days === 1 ? 'day left' : 'days left')) : null),
          !always && until ? h('div', { class: 'pro-bar' }, h('i', { style: { width: `${Math.max(3, Math.min(100, Math.round((days / 365) * 100)))}%` } })) : null),
        limits,
        m && m.paid ? row('Subscription', 'Change your card, see receipts, or cancel. Pro stays on until the end of the time you paid for.',
          h('a', { class: 'btn btn-sm', href: manageUrl(), target: '_blank', rel: 'noopener' }, 'Manage subscription')) : null,
        row('What Pro gives you', PRO_PERKS.map((x) => x[1]).join(' · '), h('a', { class: 'btn btn-sm btn-ghost', href: '/pro' }, 'See Pro page')));
    } else {
      fill(box,
        h('div', { class: 'pro-card' },
          h('div', { class: 'pro-card-top' }, h('span', { class: 'pro-free-dot' }), h('div', { class: 'grow' }, h('b', {}, 'You are on the Free plan'), h('small', {}, `Quickzy Pro is ${PRICE} a year: more players, every game, instant publishing.`)),
            h('a', { class: 'btn btn-main btn-sm', href: '/pro' }, 'Get Quickzy Pro'))),
        limits);
    }
  }).catch(() => fill(box, h('p', { class: 'muted small', style: { margin: 0 } }, 'Your plan could not be loaded right now.')));
  return section('Quickzy Pro', box);
}

/* --------------------------------------------------------- More settings */

/** Everything in your account, as a file you can keep. */
async function downloadMyData() {
  const u = session.me();
  const data = {
    exported: new Date().toISOString(),
    account: { uid: u.uid, email: u.email, emailVerified: u.emailVerified, signInWith: u.providers },
    profile: session.myProfile(),
    quizzes: await myQuizzes().catch(() => []),
    reports: await myReports().catch(() => []),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = h('a', { href: url, download: `quickzy-${session.myProfile().username || 'account'}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Your data was downloaded', 'ok');
}

function moreSection() {
  const p = session.prefs();
  const update = h('button', { class: 'btn btn-sm' }, icon('download', { size: 16 }), 'Check for updates');
  update.addEventListener('click', busy(update, async () => {
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) await reg.update();
      toast('Getting the newest Quickzy…', 'ok');
      setTimeout(() => location.reload(), 600);
    } catch { location.reload(); }
  }));
  const dl = h('button', { class: 'btn btn-sm' }, icon('download', { size: 16 }), 'Download');
  dl.addEventListener('click', busy(dl, downloadMyData));
  const clear = h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => {
    if (!(await confirm({ title: 'Clear this device?', text: 'Removes offline quizzes, best scores and settings saved on this device. Your account is not touched.', yes: 'Clear', danger: true }))) return;
    try { ['quickzy.offline', 'quickzy.best', 'quickzy.prefs', 'quickzy.claimed'].forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
    toast('This device was cleared'); setTimeout(() => location.reload(), 600);
  } }, 'Clear');
  const copyLink = h('button', { class: 'btn btn-sm', onclick: () => import('../services/invite.js').then((m) => navigator.clipboard.writeText(m.inviteLink())).then(() => toast('Invite link copied', 'ok')).catch(() => {}) }, icon('copy', { size: 16 }), 'Copy link');
  return [
    ['display', 'Display & games', 'eye', 'Text size, lite games, loading tips', section('Display & games',
      row('Text size', 'Make words bigger across Quickzy.', segmented([['normal', 'Normal'], ['large', 'Large'], ['larger', 'Larger']], p.textSize || 'normal', (v) => session.setPrefs({ textSize: v }))),
      row('Lite games', 'Use the simpler 2D look in Laser Tag, Robot Run and Train Travel. Better on old or slow devices.', toggle(Boolean(p.lite), (v) => session.setPrefs({ lite: v }))),
      row('Loading tips', 'Show a "Did you know?" tip while Quickzy loads.', toggle(p.tips !== false, (v) => session.setPrefs({ tips: v }))),
      row('Ask before leaving a game', 'Stops you leaving a live game by accident.', toggle(p.confirmLeave !== false, (v) => session.setPrefs({ confirmLeave: v }))))],
    ['data', 'Your data', 'download', 'Invite link, download your data, clear this device', section('Your data',
      row('Invite link', 'Your personal link. Friends who join with it give you coins.', copyLink),
      row('Download your data', 'Your profile, quizzes and game reports in one file.', dl),
      row('Clear this device', 'Offline quizzes, best scores and settings saved in this browser.', clear))],
    ['about', 'About', 'info', `Quickzy ${VERSION}, updates, legal`, section('About',
      row(`Quickzy ${VERSION}`, h('span', {}, 'Get the newest version straight away. ', h('a', { href: '/#whats-new' }, "See what's new")), update),
      row('Legal', h('span', {}, h('a', { href: '/terms' }, 'Terms of use'), ' · ', h('a', { href: '/privacy' }, 'Privacy notice')), null))],
  ];
}

/** Account type: from the sign-up questions. Grown-ups switch between personal
 *  and teaching; an under-18 account stays one. */
function accountTypeSection() {
  const p = session.myProfile() || {};
  const use = p.use || '';
  const box = h('div', { class: 'stack', style: { gap: '12px' } });
  const label = { kid: 'Under 18', personal: 'For me', teacher: 'For teaching' }[use] || (session.me().uid === OWNER_UID ? 'Creator' : 'Not chosen yet');
  if (use === 'kid' || session.me().uid === OWNER_UID) {
    fill(box, row('Your account', use === 'kid' ? 'Blooks, boxes, games and classes. Ask your teacher for a class code.' : 'You can do everything, including classes.', h('span', { class: 'pill' }, label)));
  } else if (!use) {
    fill(box, row('Your account', 'Answer a few quick questions to set up Quickzy for you.', h('a', { class: 'btn btn-sm btn-main', href: '/welcome?next=/settings%23more/type' }, 'Start')));
  } else {
    const school = input({ value: p.school || '', maxlength: 80, placeholder: 'Your school' });
    const saveSchool = h('button', { class: 'btn btn-sm' }, 'Save');
    saveSchool.addEventListener('click', busy(saveSchool, async () => {
      if (school.input ? !school.input.value.trim() : !school.value.trim()) { toast('Type your school', 'bad'); return; }
      try { await session.patchProfile({ school: (school.input || school).value.trim().slice(0, 80) }); toast('School saved', 'ok'); } catch (e) { toast(explain(e), 'bad'); }
    }));
    fill(box,
      row('Used for', 'Teaching adds Classes: announcements, homework, class codes and game PINs for your students.',
        segmented([['personal', 'For me'], ['teacher', 'For teaching']], use, async (v) => {
          try { await session.patchProfile({ use: v }); toast(v === 'teacher' ? 'Teacher tools are on. Find them in Classes.' : 'Switched to personal use', 'ok'); } catch (e) { toast(explain(e), 'bad'); }
        })),
      use === 'teacher' ? row('School', 'Shown on your classes.', h('div', { class: 'row' }, school, saveSchool)) : null);
  }
  return section('Account type', box);
}

/** More settings: a list of buttons; each one opens its own page, with Back. */
function morePane(parts) {
  const views = parts.map(([key, label, , , card]) => h('div', { class: 'set-view stack', 'data-view': key, hidden: true },
    h('button', { class: 'set-back', type: 'button', onclick: () => go('') }, icon('arrowLeft', { size: 16 }), 'More settings'),
    card));
  const menu = h('div', { class: 'card set-menu' },
    h('h2', { class: 'set-title' }, h('span', { class: 'set-ic' }, icon('gear', { size: 18 })), 'More settings'),
    ...parts.map(([key, label, ic, text]) => h('button', { class: 'set-link', type: 'button', onclick: () => go(key) },
      h('span', { class: 'set-link-ic' }, icon(ic, { size: 18 })),
      h('span', { class: 'grow' }, h('b', {}, label), h('small', {}, text)),
      icon('arrowRight', { size: 18 }))));
  const open = (key) => {
    const known = parts.some(([k]) => k === key);
    menu.hidden = known;
    views.forEach((v) => { v.hidden = v.dataset.view !== key; });
  };
  const go = (key) => {
    history.replaceState(history.state, '', key ? `#more/${key}` : '#more');
    open(key);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return { key: 'more', label: 'More settings', icon: 'gear', body: [menu, ...views], open };
}

function deviceSection() {
  const p = session.prefs();
  const intro = h('button', { class: 'btn btn-sm', onclick: () => import('../ui/cutscene.js').then((m) => m.playIntro()) }, icon('play', { size: 16 }), 'Play');
  return section('Sound & screen',
    row('Quickzy intro', 'Watch the intro cutscene again.', intro),
    row('Sound effects', 'Clicks, chimes and game sounds.', toggle(p.sound, (v) => { session.setPrefs({ sound: v }); if (v) sfx('pick'); })),
    row('Music', 'Background music in the lobby and in games.', toggle(p.music, (v) => session.setPrefs({ music: v }))),
    row('Animations', 'Turn off for calmer screens with less movement.', toggle(p.motion, (v) => session.setPrefs({ motion: v }))),
    row('Vibration', 'A little buzz on your phone for right and wrong answers.', toggle(p.vibrate !== false, (v) => { session.setPrefs({ vibrate: v }); if (v && navigator.vibrate) navigator.vibrate(40); })),
    row('Theme', 'Light, dark, or the same as your device.', segmented([['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']], p.theme || 'light', (v) => session.setPrefs({ theme: v }))),
    installRow());
}

function installRow() {
  const r = h('div');
  import('../ui/install.js').then((m) => {
    const draw = () => fill(r, m.installed() ? row('Quickzy app', 'You are using the Quickzy app. Nice!', h('span', { class: 'pill pill-ok' }, icon('check', { size: 14 }), 'Installed'))
      : m.canInstall() ? row('Quickzy app', 'Play quizzes anywhere, even with no internet.', h('a', { class: 'btn btn-sm btn-main', href: '/app' }, icon('download', { size: 16 }), 'Get it')) : null);
    draw(); m.onInstallChange(draw);
  }).catch(() => {});
  return r;
}

export default async function Settings({ query }) {
  pageTitle('Settings');
  if (!session.signedIn()) {
    return h('div', { class: 'page mid stack', style: { gap: '18px' } },
      h('section', { class: 'set-hero' },
        h('div', { class: 'set-hero-blook' }, blook('dog', 112)),
        h('div', { class: 'grow stack', style: { gap: '8px', minWidth: '200px' } },
          h('h1', { style: { margin: 0 } }, 'Settings'),
          h('p', { style: { margin: 0, opacity: 0.85 } }, 'Sign in to keep your coins, blooks and quizzes.'),
          h('div', { class: 'row' }, h('a', { class: 'btn btn-main', href: '/login' }, 'Sign in'), h('a', { class: 'btn', href: '/signup' }, 'Create account'),
            h('a', { class: 'btn btn-ghost set-ghost', href: '/reset' }, 'Forgot password?')))),
      deviceSection());
  }
  await session.whenProfile();
  await myPlan();
  if (!session.myProfile()) {
    return h('div', { class: 'page narrow' }, h('div', { class: 'card center stack' },
      h('h2', {}, 'Your profile did not load'),
      h('p', { class: 'muted' }, 'Check your connection and try again.'),
      h('button', { class: 'btn btn-main', onclick: () => location.reload() }, 'Try again')));
  }
  const welcome = query.welcome ? h('div', { class: 'card', style: { background: 'var(--night)', color: '#fff' } },
    h('h2', { style: { color: '#fff' } }, 'Welcome to Quickzy'),
    h('p', { style: { margin: '6px 0 14px', opacity: 0.9 } }, 'Pick a name and a blook, then make your first quiz.'),
    h('a', { class: 'btn btn-main', href: '/create' }, icon('plus'), 'Make a quiz')) : null;
  const signedUp = !session.me().isAnonymous;
  const panes = [
    { key: 'profile', label: 'Profile', icon: 'user', body: [profileSection(), verifiedSection()] },
    signedUp && { key: 'security', label: 'Security', icon: 'shield', body: [securitySection()] },
    signedUp && { key: 'pro', label: 'Quickzy Pro', icon: 'star', body: [proSection()] },
    { key: 'sound', label: 'Sound & screen', icon: 'volume', body: [deviceSection()] },
    morePane([['account', 'Account & password', 'key', 'Email, password, sign out, delete account', accountSection()],
      ...(released14() || session.me().uid === OWNER_UID ? [['type', 'Account type', 'users', 'For me, for teaching, or under 18; your school', accountTypeSection()]] : []),
      ...moreSection()]),
  ].filter(Boolean);
  return h('div', { class: 'page set-page' },
    h('div', { class: 'set-titlebar' }, h('h1', {}, 'Settings')),
    hero(),
    welcome,
    settingsShell(panes));
}

/** Profile banner (a scene or your own picture) and a short bio; saved with the profile. */
function bannerAndBio(p, onChange) {
  let pick = validBanner(p.banner) || 'sky';
  const grid = h('div', { class: 'banner-pick' });
  const url = input({ value: pick.startsWith('https://') ? pick : '', placeholder: 'https://… (a picture link)', maxlength: 290 });
  const draw = () => fill(grid, ...BANNER_IDS.map((id) => h('button', { type: 'button', class: id === pick ? 'is-on' : '', 'aria-label': BANNERS[id].name, onclick: () => { pick = id; url.value = ''; draw(); onChange(); } },
    bannerThumb(id), h('span', {}, BANNERS[id].name))));
  draw();
  const bio = h('textarea', { class: 'input', rows: 2, maxlength: 160, placeholder: 'A few words about you (shown on your profile)' }, p.bio || '');
  const left = h('small', { class: 'hint' });
  const count = () => { left.textContent = `${160 - bio.value.length} letters left`; };
  count();
  bio.addEventListener('input', () => { count(); onChange(); });
  url.addEventListener('input', onChange);
  const value = () => {
    const link = url.value.trim();
    const banner = link ? validBanner(link) : pick;
    if (link && !banner) return { error: 'Use a picture link that starts with https://' };
    const text = bio.value.trim().slice(0, 160);
    if (text && !isClean(text)) return { error: 'Please write something kinder in your bio.' };
    return { banner, bio: text };
  };
  return {
    el: h('div', { class: 'stack', style: { gap: '10px' } },
      h('label', { class: 'field' }, h('span', {}, 'Bio'), bio, left),
      h('h3', { style: { margin: '6px 0 0' } }, 'Profile banner'),
      grid,
      field('Or use your own picture', url, 'Paste a link to a picture (https). Keep it friendly: everyone can see it.')),
    value,
    changed: (now) => { const v = value(); return Boolean(v.error) || v.banner !== (validBanner(now.banner) || 'sky') || v.bio !== (now.bio || ''); },
    reset: (now) => { pick = validBanner(now.banner) || 'sky'; url.value = pick.startsWith('https://') ? pick : ''; bio.value = now.bio || ''; count(); draw(); },
  };
}
