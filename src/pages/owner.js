// owner.js — the owner's control room. Only the owner's account sees it,
// and the security rules refuse these actions from anyone else.

import { nameBadges } from '../ui/badges.js';
import { h, fill, ago, debounce } from '../ui/dom.js';
import { icon, verifiedBadge } from '../ui/icons.js';
import { blook, BLOOKS, blookName, rarityOf } from '../ui/blooks.js';
import { busy, toast, confirm, modal, segmented } from '../ui/kit.js';
import { net, explain } from '../net/index.js';
import { popularQuizzes, deleteQuiz } from '../services/quizzes.js';
import { levelOf } from '../services/progress.js';
import * as siteSvc from '../services/site.js';
import { BADGES } from '../config.js';
import { pageTitle } from './parts.js';
import { reloadProfile } from '../services/session.js';
import { EFFECTS, GAME_EFFECTS, SURPRISES, send } from '../ui/abuse.js';
import { isPro, setPro, forget } from '../services/plan.js';
import NotFound from './notfound.js';

const fmt = (n) => Number(n || 0).toLocaleString();

function act(button, work, done) {
  button.addEventListener('click', busy(button, async () => {
    try { await work(); if (done) toast(done, 'ok'); } catch (err) { toast(err.message && !err.code ? err.message : explain(err), 'bad'); }
  }));
  return button;
}

/* ----------------------------------------------------------------- stats */

function stats() {
  const box = h('div', { class: 'owner-stats' });
  const tile = (label, value, ic) => h('div', { class: 'owner-stat' }, icon(ic, { size: 22 }), h('b', {}, value), h('small', {}, label));
  fill(box, tile('Accounts', '…', 'users'), tile('Published quizzes', '…', 'list'), tile('Live games', '…', 'play'));
  Promise.all([
    net.store.count('users').catch(() => '?'),
    net.store.count('quizzes', { where: [['public', '==', true]] }).catch(() => '?'),
    siteSvc.liveGames().then((g) => g.length).catch(() => '?'),
  ]).then(([u, q, g]) => fill(box, tile('Accounts', fmt(u), 'users'), tile('Published quizzes', fmt(q), 'list'), tile('Live games', fmt(g), 'play')));
  return box;
}

/* --------------------------------------------- sign-ups: how people found Quickzy */

async function signups() {
  const { allAbout, HEARD } = await import('../services/classes.js');
  const [rows, teachers, kids, personal] = await Promise.all([
    allAbout(),
    net.store.count('users', { where: [['use', '==', 'teacher']] }).catch(() => 0),
    net.store.count('users', { where: [['use', '==', 'kid']] }).catch(() => 0),
    net.store.count('users', { where: [['use', '==', 'personal']] }).catch(() => 0),
  ]);
  const total = rows.length || 1;
  const by = HEARD.map(([id, label]) => [label, rows.filter((r) => r.heard === id).length]).sort((a, b) => b[1] - a[1]);
  const ages = [['Under 13', (a) => a < 13], ['13 to 17', (a) => a >= 13 && a < 18], ['18 and over', (a) => a >= 18]].map(([l, f]) => [l, rows.filter((r) => f(r.age)).length]);
  const bars = (list) => h('div', { class: 'stack', style: { gap: '8px' } }, ...list.map(([label, n]) => h('div', { class: 'owner-bar' },
    h('span', {}, label), h('i', { style: { width: `${Math.round((n / total) * 100)}%` } }), h('b', {}, fmt(n)))));
  return h('div', { class: 'stack', style: { gap: '18px' } },
    h('div', { class: 'owner-stats' },
      h('div', { class: 'owner-stat' }, icon('book', { size: 22 }), h('b', {}, fmt(teachers)), h('small', {}, 'Teachers')),
      h('div', { class: 'owner-stat' }, icon('user', { size: 22 }), h('b', {}, fmt(personal)), h('small', {}, 'Personal')),
      h('div', { class: 'owner-stat' }, icon('star', { size: 22 }), h('b', {}, fmt(kids)), h('small', {}, 'Under 18'))),
    h('section', { class: 'card stack' }, h('h2', {}, 'How people found Quickzy'), h('p', { class: 'muted', style: { margin: 0 } }, `${fmt(rows.length)} answers`), bars(by)),
    h('section', { class: 'card stack' }, h('h2', {}, 'Ages'), bars(ages)));
}

/* ---------------------------------------------------------- announcement */

async function announcement() {
  const s = await siteSvc.site(true);
  const text = h('textarea', { class: 'textarea', maxlength: 200, placeholder: 'A message everyone sees at the top of every page. Leave empty for none.' });
  text.value = s.announce;
  const save = act(h('button', { class: 'btn btn-main' }, 'Show to everyone'), () => siteSvc.setAnnouncement(text.value), 'Announcement saved');
  const clear = act(h('button', { class: 'btn' }, 'Remove'), async () => { text.value = ''; await siteSvc.setAnnouncement(''); }, 'Announcement removed');
  // a countdown on every page: pick a title and a moment (in your own time zone)
  const title = h('input', { class: 'input', maxlength: 80, placeholder: 'e.g. Quickzy 1.2 lands in', value: s.countdown ? s.countdown.title : '' });
  const pad = (n) => String(n).padStart(2, '0');
  const local = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const when = h('input', { class: 'input', type: 'datetime-local', value: local(s.countdown ? s.countdown.to : Date.now() + 86400000), 'aria-label': 'When' });
  const start = act(h('button', { class: 'btn btn-main' }, icon('clock', { size: 16 }), 'Start countdown'), async () => {
    const to = new Date(when.value).getTime();
    if (!title.value.trim()) throw new Error('Give the countdown a title.');
    if (!(to > Date.now())) throw new Error('Pick a time in the future.');
    await siteSvc.setCountdown(title.value, to);
  }, 'Countdown started for everyone');
  const stopIt = act(h('button', { class: 'btn' }, 'Remove countdown'), () => siteSvc.setCountdown(null), 'Countdown removed');
  return h('div', { class: 'stack', style: { gap: '18px' } },
    h('section', { class: 'card stack' }, h('h2', {}, 'Announcement'), text, h('div', { class: 'row end' }, clear, save)),
    h('section', { class: 'card stack' }, h('h2', {}, 'Countdown'),
      h('p', { class: 'muted small', style: { margin: 0 } }, 'A live countdown at the top of every page. When it reaches zero, everyone gets a "It\'s here!" moment.'),
      title, when, h('div', { class: 'row end' }, stopIt, start)));
}

/* ------------------------------------------------- waiting for a check */

// every new public quiz (free and Pro) waits here; approve it to put it live
// now, or unpublish it. Your own quizzes never wait.
async function review() {
  const now = Date.now();
  const rows = await net.store.query('quizzes', { where: [['liveAt', '>', now]], limit: 200 }).catch(() => []);
  const list = rows.filter((q) => q.public).sort((a, b) => a.liveAt - b.liveAt);
  const box = h('div', { class: 'stack', style: { gap: '8px' } });
  const draw = () => fill(box, ...(list.length ? list.map((q) => {
    const row = h('div', { class: 'card row owner-row' },
      h('div', { class: 'grow' }, h('b', {}, q.title), h('small', { class: 'muted' }, ` · @${q.authorUsername || '?'} · ${q.questionCount || 0} questions · goes live ${new Date(q.liveAt).toLocaleDateString()} by itself`)),
      h('a', { class: 'btn btn-sm', href: `/quiz/${q.id}`, target: '_blank' }, icon('eye', { size: 14 }), 'Look'),
      act(h('button', { class: 'btn btn-sm btn-main' }, icon('check', { size: 14 }), 'Approve'), async () => {
        await net.store.update('quizzes', q.id, { liveAt: Date.now() - 1000 });
        list.splice(list.indexOf(q), 1); draw();
      }, 'Approved: it is live now'),
      act(h('button', { class: 'btn btn-sm' }, icon('lock', { size: 14 }), 'Reject'), async () => {
        if (!(await confirm({ title: `Reject "${q.title}"?`, text: 'It is unpublished. Its author can still see and edit it.', yes: 'Reject' }))) return;
        await siteSvc.unpublish(q.id);
        list.splice(list.indexOf(q), 1); draw();
      }, 'Rejected'));
    return row;
  }) : [h('p', { class: 'muted' }, 'Nothing is waiting for a check.')]));
  draw();
  return h('section', { class: 'stack', style: { gap: '10px' } },
    h('h2', {}, `Waiting for a check (${list.length})`),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'Free quizzes go live by themselves after 3-5 days, Pro ones after a day. Approve one to put it live now.'),
    box);
}

/* --------------------------------------------------------------- quizzes */

async function quizzes() {
  const box = h('div', { class: 'stack', style: { gap: '8px' } });
  let featured = (await siteSvc.site(true)).featured;
  const draw = async () => {
    const list = await popularQuizzes(150).catch(() => []);
    if (!list.length) { fill(box, h('p', { class: 'muted' }, 'No published quizzes.')); return; }
    fill(box, ...list.map((q) => {
      const on = featured.includes(q.id);
      const feat = act(h('button', { class: `btn btn-sm${on ? ' btn-main' : ''}` }, icon('star', { size: 14 }), on ? 'Featured' : 'Feature'), async () => {
        featured = on ? featured.filter((x) => x !== q.id) : [...featured, q.id];
        await siteSvc.setFeatured(featured);
        draw();
      });
      const unpub = act(h('button', { class: 'btn btn-sm' }, icon('lock', { size: 14 }), 'Unpublish'), async () => {
        if (!(await confirm({ title: `Unpublish "${q.title}"?`, text: 'It disappears from Discover. Its author can still see and edit it.', yes: 'Unpublish' }))) return;
        await siteSvc.unpublish(q.id);
        toast('Unpublished', 'ok');
        draw();
      });
      const del = act(h('button', { class: 'btn btn-sm btn-bad' }, icon('trash', { size: 14 })), async () => {
        if (!(await confirm({ title: `Delete "${q.title}"?`, text: 'Gone for good, for everyone, including its author.', yes: 'Delete', danger: true }))) return;
        await deleteQuiz(q.id);
        toast('Deleted', 'ok');
        draw();
      });
      return h('div', { class: 'owner-row' },
        h('a', { href: `/quiz/${q.id}`, class: 'grow owner-row-main' }, h('b', {}, q.title), h('small', { class: 'muted' }, `by ${q.authorName} · ${fmt(q.plays)} plays · ${q.questionCount} questions`)),
        feat, unpub, del);
    }));
  };
  draw();
  return h('section', { class: 'card stack' }, h('h2', {}, 'Quizzes'),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'Featured quizzes appear in a "Picked by the owner" row on Discover.'), box);
}

/* ----------------------------------------------------------------- users */

async function users() {
  const box = h('div', { class: 'stack', style: { gap: '8px' } });
  const find = h('input', { class: 'input', type: 'search', placeholder: 'Search by name or username' });
  let all = [];
  const row = (u) => {
    const special = BADGES[u.id];
    const badgeSlot = h('span', { style: { display: 'inline-flex' } });
    const verifyBtn = h('button', { class: 'btn btn-sm' });
    const banBtn = h('button', { class: 'btn btn-sm' });
    const proBtn = h('button', { class: 'btn btn-sm' });
    const refresh = async () => {
      const [given, banned] = await Promise.all([siteSvc.hasGrantedBadge(u.id), siteSvc.isBanned(u.id)]);
      fill(badgeSlot, special ? nameBadges(special) : given ? verifiedBadge() : null);
      fill(verifyBtn, icon('check', { size: 14 }), given ? 'Remove blue check' : 'Give blue check');
      verifyBtn.hidden = Boolean(special);
      // relabel only after the spinner has given the button back
      verifyBtn.onclick = async () => {
        await busy(verifyBtn, async () => { try { await siteSvc.setGrantedBadge(u.id, !given); } catch (e) { toast(explain(e), 'bad'); } })();
        refresh();
      };
      fill(banBtn, icon(banned ? 'check' : 'stop', { size: 14 }), banned ? 'Allow publishing' : 'Stop publishing');
      banBtn.className = `btn btn-sm${banned ? ' btn-ok' : ''}`;
      banBtn.hidden = Boolean(special);
      banBtn.onclick = async () => {
        if (!banned && !(await confirm({ title: `Stop ${u.displayName} publishing?`, text: 'They can still play and host, but cannot save or publish quizzes until you allow it again.', yes: 'Stop publishing', danger: true }))) return;
        await busy(banBtn, async () => { try { await siteSvc.setBanned(u.id, !banned); } catch (e) { toast(explain(e), 'bad'); } })();
        refresh();
      };
      const pro = await isPro(u.id);
      fill(proBtn, icon('star', { size: 14 }), pro ? 'Remove Pro' : 'Give Pro (1 year)');
      proBtn.className = `btn btn-sm${pro ? '' : ' btn-gold'}`;
      proBtn.hidden = Boolean(special);
      proBtn.onclick = async () => {
        await busy(proBtn, async () => { try { await setPro(u.id, !pro); forget(u.id); toast(pro ? 'Pro removed' : `${u.displayName} is Pro for a year`, 'ok'); } catch (e) { toast(explain(e), 'bad'); } })();
        refresh();
      };
    };
    refresh();
    const coins = h('button', { class: 'btn btn-sm btn-main' }, icon('star', { size: 14 }), 'Give coins');
    coins.addEventListener('click', async () => {
      const amount = await modal((close) => {
        const box = h('input', { class: 'input input-xl', type: 'number', min: 1, max: 100000, step: 1, value: 100, inputmode: 'numeric', 'aria-label': 'How many coins' });
        const err = h('p', { class: 'error-text' });
        const go = () => {
          const n = Math.floor(Number(box.value));
          if (!(n >= 1 && n <= 100000)) { fill(err, 'Choose between 1 and 100,000 coins.'); return; }
          close(n);
        };
        box.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        return [h('h2', {}, `Give ${u.displayName} coins`),
          h('div', { class: 'row' }, ...[50, 100, 500, 1000].map((n) => h('button', { class: 'btn btn-sm', onclick: () => { box.value = n; } }, String(n)))),
          box, err,
          h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => close() }, 'Cancel'), h('button', { class: 'btn btn-main', onclick: go }, 'Give'))];
      });
      if (!amount) return;
      try { u.coins = await siteSvc.giveCoins(u, amount); toast(`Gave ${u.displayName} ${fmt(amount)} coins`, 'ok'); reloadProfile(); } catch (e) { toast(explain(e), 'bad'); }
    });
    const gift = h('button', { class: 'btn btn-sm' }, icon('star', { size: 14 }), 'Give a blook');
    gift.addEventListener('click', async () => {
      const pick = await modal((close) => [h('h2', {}, `Give ${u.displayName} a blook`),
        h('div', { class: 'blook-grid' }, ...BLOOKS.map((b) => h('button', { class: 'blook-pick', style: { '--rc': rarityOf(b.id).colour }, onclick: () => close(b.id) }, blook(b.id), h('small', {}, b.name))))], { wide: true });
      if (!pick) return;
      try { await siteSvc.giveBlook(u, pick); u.owned = { ...(u.owned || {}), [pick]: 1 }; toast(`Gave ${u.displayName} ${blookName(pick)}`, 'ok'); reloadProfile(); } catch (e) { toast(explain(e), 'bad'); }
    });
    return h('div', { class: 'owner-row' },
      blook(u.blook || 'dog', 40),
      h('a', { href: `/u/${u.username}`, class: 'grow owner-row-main' },
        h('b', { class: 'row', style: { gap: '6px' } }, u.displayName, badgeSlot),
        h('small', { class: 'muted' }, `@${u.username} · level ${levelOf(u.xp || 0)} · ${fmt(u.coins)} coins${u.createdAt ? ` · joined ${ago(u.createdAt)}` : ''}`)),
      coins, gift, proBtn, verifyBtn, banBtn);
  };
  const draw = () => {
    const q = find.value.trim().toLowerCase();
    const list = all.filter((u) => !q || `${u.displayName} ${u.username}`.toLowerCase().includes(q));
    fill(box, list.length ? list.slice(0, 100).map(row) : h('p', { class: 'muted' }, 'No accounts found.'));
  };
  find.addEventListener('input', debounce(draw, 200));
  siteSvc.allUsers().then((u) => { all = u; draw(); }).catch((e) => fill(box, h('p', { class: 'error-text' }, explain(e))));
  return h('section', { class: 'card stack' }, h('h2', {}, 'Players'), find, box);
}

/* ----------------------------------------------------------------- games */

function games() {
  const box = h('div', { class: 'stack', style: { gap: '8px' } });
  const draw = async () => {
    const list = await siteSvc.liveGames().catch(() => []);
    fill(box, list.length ? list.map((g) => h('div', { class: 'owner-row' },
      h('div', { class: 'grow owner-row-main' }, h('b', {}, `Game ${g.pin}`), h('small', { class: 'muted' }, `started ${ago(g.at)}`)),
      h('button', { class: 'btn btn-sm btn-violet', onclick: () => abuseModal(g.pin) }, icon('bolt', { size: 14 }), 'Admin abuse'),
      act(h('button', { class: 'btn btn-sm btn-bad' }, icon('stop', { size: 14 }), 'End game'), async () => {
        if (!(await confirm({ title: `End game ${g.pin}?`, text: 'Everyone in it is sent home.', yes: 'End it', danger: true }))) return;
        await siteSvc.endGame(g.pin); toast('Game ended', 'ok'); draw();
      }))) : h('p', { class: 'muted' }, 'No games running right now.'));
  };
  draw();
  return h('section', { class: 'card stack' },
    h('div', { class: 'row spread' }, h('h2', {}, 'Live games'), h('button', { class: 'btn btn-sm', onclick: draw }, 'Refresh')), box);
}

/* ------------------------------------------------------------ admin abuse */

function abusePanel(list, { pin = null, onSent } = {}) {
  const text = h('input', { class: 'input', maxlength: 120, placeholder: 'Message (for Big message, or a caption)' });
  const coins = h('input', { class: 'input', type: 'number', min: 1, max: 150, value: 50, style: { maxWidth: '120px' }, 'aria-label': 'Coins each' });
  const points = h('input', { class: 'input', type: 'number', min: 1, max: 5000, value: 1000, style: { maxWidth: '120px' }, 'aria-label': 'Points each' });
  const grid = h('div', { class: 'abuse-grid' }, ...list.map(([kind, name, blurb]) => {
    const b = h('button', { class: `abuse-btn is-${kind}` }, h('b', {}, name), h('small', {}, blurb));
    b.addEventListener('click', async () => {
      if (kind === 'message' && !text.value.trim()) { toast('Type a message first', 'bad'); text.focus(); return; }
      b.disabled = true;
      try {
        await send(kind, { text: text.value.trim(), coins: kind === 'coins' ? Number(coins.value) : 0, points: kind === 'points' ? Number(points.value) : 0, pin });
        toast(pin ? `Sent to game ${pin}` : 'Sent to everyone online', 'ok');
        if (onSent) onSent();
      } catch (e) { toast(explain(e), 'bad'); }
      b.disabled = false;
    });
    return b;
  }));
  // one random effect, the same one for everybody
  const surprise = h('button', { class: 'abuse-btn is-surprise' }, h('b', {}, 'Surprise me!'), h('small', {}, 'A random effect lands on every screen'));
  surprise.addEventListener('click', async () => {
    const pick = SURPRISES[Math.floor(Math.random() * SURPRISES.length)];
    surprise.disabled = true;
    try {
      await send(pick, { text: text.value.trim(), pin });
      const name = (list.find(([k]) => k === pick) || [pick, pick])[1];
      toast(`Surprise: ${name}!`, 'ok');
      if (onSent) onSent();
    } catch (e) { toast(explain(e), 'bad'); }
    surprise.disabled = false;
  });
  grid.prepend(surprise);
  return h('div', { class: 'stack' }, text,
    h('div', { class: 'row', style: { gap: '14px' } },
      list.some(([k]) => k === 'coins') ? h('label', { class: 'row small', style: { gap: '6px' } }, 'Coin rain gives each account', coins, 'coins') : null,
      list.some(([k]) => k === 'points') ? h('label', { class: 'row small', style: { gap: '6px' } }, 'Bonus points each', points) : null),
    grid);
}

function abuseModal(pin) {
  return modal((close) => [h('h2', {}, `Admin abuse: game ${pin}`),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'Lands on the big screen and every player\'s screen in this game.'),
    abusePanel(GAME_EFFECTS, { pin }),
    h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => close() }, 'Done'))], { wide: true });
}

function abuse() {
  return h('section', { class: 'card stack' }, h('h2', {}, 'Admin abuse'),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'Hits every screen that has Quickzy open right now. Coin rain gives every signed-in player real coins (up to 150 each). To abuse one game, use Live games.'),
    abusePanel(EFFECTS));
}

/* --------------------------------------------------------- special events */

async function events() {
  const cur = await siteSvc.currentEvent().catch(() => null);
  let kind = cur ? cur.kind : 'coins';
  const title = h('input', { class: 'input', maxlength: 60, placeholder: 'Name (optional), e.g. Weekend Bonanza', value: cur ? cur.title : '' });
  const hours = h('select', { class: 'select', 'aria-label': 'How long' }, ...[[1, '1 hour'], [3, '3 hours'], [12, '12 hours'], [24, '1 day'], [48, '2 days'], [72, '3 days'], [168, '1 week']].map(([v, l]) => h('option', { value: v, selected: v === 24 }, l)));
  const picks = h('div', { class: 'abuse-grid' });
  const drawPicks = () => fill(picks, ...Object.entries(siteSvc.EVENTS).map(([k, e]) => h('button', {
    class: `abuse-btn event-pick${k === kind ? ' is-on' : ''}`, style: { background: e.colour }, onclick: () => { kind = k; drawPicks(); },
  }, h('b', {}, e.name), h('small', {}, e.blurb))));
  drawPicks();
  const status = cur
    ? h('div', { class: 'owner-row' }, h('div', { class: 'grow owner-row-main' }, h('b', {}, `Running: ${cur.title || siteSvc.EVENTS[cur.kind].name}`), h('small', { class: 'muted' }, `ends ${new Date(cur.ends).toLocaleString()}`)),
      act(h('button', { class: 'btn btn-sm btn-bad' }, icon('stop', { size: 14 }), 'Stop event'), async () => { await siteSvc.stopEvent(); toast('Event stopped', 'ok'); location.reload(); }))
    : h('p', { class: 'muted', style: { margin: 0 } }, 'No event running.');
  const go = act(h('button', { class: 'btn btn-main' }, icon('star', { size: 16 }), cur ? 'Replace event' : 'Start event'), async () => {
    await siteSvc.startEvent(kind, Number(hours.value), title.value.trim());
    toast('Event started for everyone', 'ok');
    location.reload();
  });
  return h('section', { class: 'card stack' }, h('h2', {}, 'Special events'),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'A bright bar with a countdown shows at the top of every page while it runs.'),
    status, picks, h('div', { class: 'row' }, title, hours), h('div', { class: 'row end' }, go));
}

/* ------------------------------------------------------------------ page */

export default async function Owner() {
  if (!siteSvc.isOwner()) return NotFound();
  pageTitle('Owner');
  let tab = 'quizzes';
  const body = h('div', { class: 'stack', style: { gap: '18px' } });
  const sections = { review, signups, quizzes, users, games: async () => games(), abuse: async () => abuse(), events, announcement };
  const draw = async () => { fill(body, h('div', { class: 'loading' }, h('div', { class: 'spinner' }))); fill(body, await sections[tab]()); };
  draw();
  return h('div', { class: 'page stack', style: { gap: '18px' } },
    h('div', { class: 'row', style: { gap: '10px' } }, h('h1', {}, 'Owner'), h('span', { style: { transform: 'scale(1.5)', display: 'inline-flex' } }, verifiedBadge(null, 'owner'))),
    h('p', { class: 'muted', style: { margin: 0 } }, 'Only your account can open this page, and the database refuses these actions from anyone else.'),
    stats(),
    segmented([['review', 'Check quizzes'], ['quizzes', 'Quizzes'], ['signups', 'Sign-ups'], ['users', 'Players'], ['games', 'Live games'], ['abuse', 'Admin abuse'], ['events', 'Events'], ['announcement', 'Announcement & countdown']], tab, (v) => { tab = v; draw(); }),
    body);
}
