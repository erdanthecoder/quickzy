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
import { LIMITS, BADGES, VERSION, OWNER_UID, OFFICIAL_UID, PRO_FREE } from '../config.js';
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
  return h('div', { class: 'stack', style: { gap: '8px' } }, grid,
    h('a', { href: '/blooks', class: 'small' }, 'Get more blooks from boxes'));
}

function section(title, ...rows) {
  const ic = { Profile: 'user', Account: 'key', Security: 'shield', 'Quickzy Pro': 'star', 'More settings': 'gear', 'Sound & screen': 'volume', 'Trusted quiz maker': 'check', 'Your badge': 'shield', 'Your badges': 'shield' }[title] || 'gear';
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
      h('div', {}, h('b', {}, String(usableBlooks().length)), h('small', {}, 'Blooks'))));
}

const slug = (label) => `set-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
/** The settings menu on the left (a row of tabs on phones); it follows the scroll. */
function jumpTabs(list) {
  const nav = h('nav', { class: 'set-nav', 'aria-label': 'Settings sections' }, ...list.map(([label, ic]) => h('a', {
    href: `#${slug(label)}`, class: 'set-tab', 'data-for': slug(label),
    onclick: (e) => { e.preventDefault(); document.getElementById(slug(label))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  }, icon(ic, { size: 17 }), h('span', {}, label))));
  setTimeout(() => {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      nav.querySelectorAll('.set-tab').forEach((t) => t.classList.toggle('is-on', t.dataset.for === e.target.id));
    }), { rootMargin: '-20% 0px -70% 0px' });
    list.forEach(([label]) => { const el = document.getElementById(slug(label)); if (el) io.observe(el); });
  }, 50);
  return nav;
}

function row(title, text, control) {
  return h('div', { class: 'set-row' },
    h('div', { class: 'grow' }, h('b', {}, title), text ? h('p', { class: 'muted small' }, text) : null),
    control);
}

function profileSection() {
  const p = session.myProfile();
  let chosen = p.blook;
  const preview = h('div', {}, blook(chosen));
  preview.firstChild.style.width = '96px'; preview.firstChild.style.height = '96px';
  const name = input({ value: p.displayName, maxlength: 30 });
  const user = input({ value: p.username, maxlength: LIMITS.usernameMax, autocapitalize: 'off', spellcheck: 'false' });
  const userHint = h('small', { class: 'hint' }, `quickzy.web.app/u/${p.username}`);
  const errorBox = h('p', { class: 'error-text', role: 'alert' });
  const save = h('button', { class: 'btn btn-main' }, 'Save profile');

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
  user.addEventListener('input', () => { user.value = user.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); checkName(); });

  save.addEventListener('click', busy(save, async () => {
    fill(errorBox);
    try {
      const before = session.myProfile();
      await session.updateProfile({ displayName: name.value, blook: chosen });
      if (user.value.trim() !== before.username) await session.changeUsername(user.value.trim());
      const after = session.myProfile();
      if (after.displayName !== before.displayName || after.username !== before.username || after.blook !== before.blook) {
        syncAuthor().catch(() => {});
      }
      net.auth.setDisplayName(after.displayName).catch(() => {});
      toast('Profile saved', 'ok');
      fill(userHint, `quickzy.web.app/u/${after.username}`); userHint.className = 'hint';
    } catch (err) {
      fill(errorBox, err.message && !err.code ? err.message : explain(err));
    }
  }));

  return section('Profile',
    h('div', { class: 'profile-head' }, preview,
      h('div', { class: 'grow stack', style: { minWidth: '220px' } },
        field('Display name', name, 'Shown on your quizzes and profile.'),
        h('label', { class: 'field' }, h('span', {}, 'Username'), user, userHint))),
    row('Have a channel', 'On: people can follow you and see your channel in Channels. Off: just a plain profile.',
      toggle(p.channel !== false, async (on) => {
        try { await session.patchProfile({ channel: on }); toast(on ? 'Your channel is on' : 'Your channel is off', 'ok'); } catch (err) { toast(explain(err), 'bad'); }
      })),
    bannerAndBio(p),
    h('h3', {}, 'Your blook'),
    blookPicker(chosen, (id) => { chosen = id; fill(preview, blook(id)); preview.firstChild.style.width = '96px'; preview.firstChild.style.height = '96px'; sfx('pick'); }),
    errorBox,
    h('div', { class: 'row end' }, save));
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

  return section('Account',
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
  if (!u.emailVerified) { toast('Confirm your email address first (in Account, just above).', 'bad'); return; }
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
    for (const f of session.me().mfa || []) await net.auth.mfa.remove(f.uid);
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

const TWO_STEP_READY = () => net.kind === 'dev';

function securitySection() {
  const box = h('div', { class: 'stack', style: { gap: 0 } });
  const draw = () => {
    const u = session.me();
    const hasPassword = (u.providers || []).includes('password');
    const twoStep = (u.mfa || []).length > 0;
    const p = session.prefs();
    const checks = [
      [u.emailVerified, 'Email confirmed'],
      [hasPassword || (u.providers || []).includes('google.com'), hasPassword ? 'Password set' : 'Google sign-in'],
    ];
    const score = checks.filter(([ok]) => ok).length;
    const when = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not known');
    fill(box,
      h('div', { class: `sec-check is-${score >= checks.length ? 'good' : score >= 2 ? 'ok' : 'low'}` },
        h('div', { class: 'sec-score' }, h('b', {}, `${score}/${checks.length}`), h('small', {}, score >= checks.length ? 'Well protected' : score >= 2 ? 'Could be safer' : 'Needs attention')),
        h('ul', {}, ...checks.map(([ok, label]) => h('li', { class: ok ? 'is-on' : '' }, icon(ok ? 'check' : 'close', { size: 14, stroke: 3 }), label)))),
      row('2-step verification', 'When you sign in, Quickzy also asks for a 6-digit code from an app on your phone. Even someone with your password cannot get in.',
        twoStep
          ? h('div', { class: 'row' }, h('span', { class: 'pill pill-ok' }, icon('shield', { size: 14 }), 'On'), h('button', { class: 'btn btn-sm btn-ghost', onclick: () => turnOffTwoStep(draw) }, 'Turn off'))
          // the live servers cannot do it yet (it needs Firebase's paid plan); the local test server can
          : TWO_STEP_READY() ? h('button', { class: 'btn btn-sm btn-main', onclick: () => turnOnTwoStep(draw) }, icon('shield', { size: 16 }), 'Turn on') : h('span', { class: 'pill' }, 'Coming soon')),
      row('Passkeys', 'Sign in with your fingerprint, face or screen lock instead of a password. Passkeys cannot be guessed or stolen by fake websites.',
        h('span', { class: 'pill' }, 'Coming soon')),
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
  return section('More settings',
    row('Text size', 'Make words bigger across Quickzy.', segmented([['normal', 'Normal'], ['large', 'Large'], ['larger', 'Larger']], p.textSize || 'normal', (v) => session.setPrefs({ textSize: v }))),
    row('Lite games', 'Use the simpler 2D look in Laser Tag, Robot Run and Train Travel. Better on old or slow devices.', toggle(Boolean(p.lite), (v) => session.setPrefs({ lite: v }))),
    row('Loading tips', 'Show a "Did you know?" tip while Quickzy loads.', toggle(p.tips !== false, (v) => session.setPrefs({ tips: v }))),
    row('Ask before leaving a game', 'Stops you leaving a live game by accident.', toggle(p.confirmLeave !== false, (v) => session.setPrefs({ confirmLeave: v }))),
    row('Download your data', 'Your profile, quizzes and game reports in one file.', dl),
    row('Clear this device', 'Offline quizzes, best scores and settings saved in this browser.', clear),
    row(`Quickzy ${VERSION}`, 'Get the newest version straight away.', update),
    row('Legal', h('span', {}, h('a', { href: '/terms' }, 'Terms of use'), ' · ', h('a', { href: '/privacy' }, 'Privacy notice')), null));
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
  const menu = [['Profile', 'user'], ['Account', 'key'], signedUp && ['Security', 'shield'], signedUp && ['Quickzy Pro', 'star'], ['Sound & screen', 'volume'], ['More settings', 'gear']].filter(Boolean);
  return h('div', { class: 'page set-page' },
    h('div', { class: 'set-titlebar' }, h('h1', {}, 'Settings')),
    hero(),
    welcome,
    h('div', { class: 'set-layout' },
      jumpTabs(menu),
      h('div', { class: 'set-main stack', style: { gap: '18px' } },
        profileSection(),
        verifiedSection(),
        accountSection(),
        signedUp ? securitySection() : null,
        signedUp ? proSection() : null,
        deviceSection(),
        moreSection())));
}

/** Profile banner (a scene or your own picture) and a short bio. */
function bannerAndBio(p) {
  let pick = validBanner(p.banner) || 'sky';
  const grid = h('div', { class: 'banner-pick' });
  const url = input({ value: pick.startsWith('https://') ? pick : '', placeholder: 'https://… (a picture link)', maxlength: 290 });
  const draw = () => fill(grid, ...BANNER_IDS.map((id) => h('button', { type: 'button', class: id === pick ? 'is-on' : '', 'aria-label': BANNERS[id].name, onclick: () => { pick = id; url.value = ''; draw(); } },
    bannerThumb(id), h('span', {}, BANNERS[id].name))));
  draw();
  const bio = h('textarea', { class: 'input', rows: 2, maxlength: 160, placeholder: 'A few words about you (shown on your profile)' }, p.bio || '');
  const save = h('button', { class: 'btn' }, 'Save banner and bio');
  save.addEventListener('click', busy(save, async () => {
    const link = url.value.trim();
    const banner = link ? validBanner(link) : pick;
    if (link && !banner) { toast('Use a picture link that starts with https://', 'bad'); return; }
    const text = bio.value.trim().slice(0, 160);
    if (text && !isClean(text)) { toast('Please write something kinder in your bio.', 'bad'); return; }
    try { await session.patchProfile({ banner, bio: text }); toast('Profile updated', 'ok'); sfx('coin'); } catch (err) { toast(explain(err), 'bad'); }
  }));
  return h('div', { class: 'stack', style: { gap: '10px' } },
    h('h3', { style: { margin: '6px 0 0' } }, 'Profile banner'),
    grid,
    field('Or use your own picture', url, 'Paste a link to a picture (https). Keep it friendly: everyone can see it.'),
    field('Bio', bio),
    h('div', { class: 'row end' }, save));
}
