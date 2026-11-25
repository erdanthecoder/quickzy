// profile.js — a creator's channel: banner, name, badges, followers, a
// Follow button, and every quiz they have published.

import { nameBadges } from '../ui/badges.js';
import { h, fill, plural } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { blook } from '../ui/blooks.js';
import { empty, toast } from '../ui/kit.js';
import { net, explain } from '../net/index.js';
import { me, signedIn } from '../services/session.js';
import { quizzesBy, badgeOf } from '../services/quizzes.js';
import * as channels from '../services/channels.js';
import { sfx } from '../game/sound.js';
import { confetti } from '../ui/confetti.js';
import { quizCard, pageTitle, COVER_BG } from './parts.js';
import { navigate } from '../router.js';
import NotFound from './notfound.js';
import { profileBanner } from '../ui/banner.js';
import { ACHIEVEMENTS, statsFor, earned } from '../services/achievements.js';
import { isPro } from '../services/plan.js';
import { levelOf, levelInfo } from '../services/progress.js';
import { rarityOf, blookName } from '../ui/blooks.js';
import { OWNER_UID } from '../config.js';
import { logo } from '../ui/icons.js';

const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

/** The Follow button; keeps the follower count next to it up to date. */
export function followButton(uid, countEl) {
  const btn = h('button', { class: 'btn btn-main follow-btn' }, icon('plus', { size: 18 }), 'Follow');
  let on = false;
  let count = Number(countEl?.dataset.n || 0);
  const draw = () => {
    fill(btn, ...(on ? [icon('check', { size: 18 }), 'Following'] : [icon('plus', { size: 18 }), 'Follow']));
    btn.classList.toggle('btn-main', !on);
    btn.classList.toggle('is-following', on);
    if (countEl) { countEl.dataset.n = String(count); countEl.textContent = fmt(count); }
  };
  channels.isFollowing(uid).then((v) => { on = v; draw(); });
  btn.addEventListener('click', async () => {
    if (!signedIn()) { navigate(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      if (on) { await channels.unfollow(uid); on = false; count = Math.max(0, count - 1); }
      else {
        await channels.follow(uid); on = true; count += 1;
        sfx('coin');
        const r = btn.getBoundingClientRect();
        confetti({ x: (r.left + r.width / 2) / innerWidth, y: r.top / innerHeight, count: 40, power: 500 });
      }
    } catch (err) { toast(err.code ? explain(err) : err.message, 'bad'); }
    btn.disabled = false;
    draw();
  });
  draw();
  return btn;
}

export default async function Profile({ params }) {
  const name = String(params.username || '').toLowerCase();
  const claim = /^[a-z0-9_]{3,20}$/.test(name) ? await net.store.get('usernames', name).catch(() => null) : null;
  const user = claim ? await net.store.get('users', claim.uid).catch(() => null) : null;
  if (!user) return NotFound();
  pageTitle(user.displayName);
  const owner = claim.uid === OWNER_UID;
  const [quizzes, badge, followers, pro] = await Promise.all([quizzesBy(claim.uid).catch(() => []), badgeOf(claim.uid), channels.followerCount(claim.uid), isPro(claim.uid).catch(() => false)]);
  const mine = me() && me().uid === claim.uid;
  const hasChannel = user.channel !== false;
  const plays = quizzes.reduce((n, q) => n + (q.plays || 0), 0);
  const stats = statsFor(user, { quizzes, followers, pro, owner });
  const ach = earned(stats);
  const countEl = h('b', { 'data-n': String(followers) }, fmt(followers));
  const kind = owner ? 'owner' : badge === 'official' ? 'official' : pro ? 'pro' : null;

  let sort = 'top';
  let tab = 'content';
  const body = h('div', { class: 'stack' });
  const drawBody = () => {
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b.dataset.t === tab));
    if (tab === 'content') {
      const list = [...quizzes].sort(sort === 'top' ? (a, b) => (b.plays || 0) - (a.plays || 0) : (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const star = quizzes.length > 2 ? [...quizzes].sort((a, b) => (b.plays || 0) - (a.plays || 0))[0] : null;
      fill(body,
        mine ? checklist() : null,
        star && (star.plays || 0) > 0 ? h('a', { class: 'pf-star', href: `/quiz/${star.id}` },
          h('span', { class: 'pf-star-tag' }, icon('trophy', { size: 14 }), 'Most played'),
          h('b', {}, star.title),
          h('small', {}, `${fmt(star.plays || 0)} plays · ${plural((star.questions || []).length || star.count || 0, 'question')}`)) : null,
        quizzes.length > 1 ? h('div', { class: 'row', style: { gap: '6px' } },
          ...[['top', 'Most played'], ['new', 'Newest']].map(([id, label]) => h('button', { class: `chip${sort === id ? ' is-on' : ''}`, onclick: () => { sort = id; drawBody(); } }, label))) : null,
        quizzes.length ? h('div', { class: 'grid' }, ...list.map((q) => quizCard(q)))
          : h('div', { class: 'card flat' }, empty('No published quizzes yet', mine ? 'Publish a quiz and it shows up on your profile.' : `When ${user.displayName} publishes a quiz, it shows up here.`,
            mine ? h('a', { class: 'btn btn-main', href: '/create' }, 'Make a quiz') : null)));
    } else if (tab === 'ach') {
      const got = ach.filter((a) => a.done).length;
      fill(body, h('p', { class: 'muted', style: { margin: 0 } }, `${got} of ${ach.length} achievements`),
        h('div', { class: 'ach-grid' }, ...ach.map((a, i) => h('div', { class: `ach${a.done ? ' is-done' : ''}`, style: { '--c': a.col, animationDelay: `${i * 0.04}s` } },
          h('span', { class: 'ach-medal' }, icon(a.done ? 'trophy' : 'lock', { size: 22 })), h('b', {}, a.title), h('small', {}, a.how)))));
    } else {
      fill(body, h('div', { class: 'card stack about-card' },
        user.bio ? h('p', { class: 'about-bio' }, user.bio) : h('p', { class: 'muted' }, mine ? 'Add a few words about yourself in Settings.' : 'No bio yet.'),
        h('div', { class: 'about-facts' },
          h('div', {}, icon('star', { size: 18 }), h('span', {}, `Level ${levelOf(user.xp || 0)}`)),
          h('div', {}, icon('users', { size: 18 }), h('span', {}, `${plural(followers, 'follower')}`)),
          user.createdAt ? h('div', {}, icon('clock', { size: 18 }), h('span', {}, `Joined ${new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`)) : null,
          h('div', {}, blook(user.blook, 22), h('span', {}, `${stats.blooks} blooks collected`)))),
        collection());
    }
  };
  // the rarest blooks this person owns, best first
  const collection = () => {
    const known = (id) => !['Blook', 'Custom'].includes(blookName(id));
    const ids = Object.keys(user.owned || {}).filter((id) => known(id) && id !== user.blook);
    const top = [user.blook, ...ids.sort((a, b) => rarityOf(a).chance - rarityOf(b).chance)].slice(0, 12);
    return h('div', { class: 'card stack pf-collect' },
      h('b', {}, 'Blook collection'),
      h('div', { class: 'pf-collect-row' }, ...top.map((id) => h('span', { class: 'pf-collect-item', title: blookName(id), style: { '--rc': rarityOf(id).colour } }, blook(id, 48)))));
  };
  // only on your own profile: what would make it look finished
  const checklist = () => {
    const steps = [
      [Boolean(user.bio), 'Write a bio', '/settings#profile'],
      [Boolean(user.banner && user.banner !== 'sky'), 'Pick a banner', '/settings#profile'],
      [quizzes.length > 0, 'Publish a quiz', '/new'],
      [followers > 0, 'Get your first follower', null],
    ];
    const done = steps.filter(([ok]) => ok).length;
    if (done === steps.length) return null;
    return h('div', { class: 'pf-todo' },
      h('div', { class: 'pf-todo-head' }, h('b', {}, 'Finish your profile'), h('small', {}, `${done} of ${steps.length} done`)),
      h('div', { class: 'pf-todo-bar' }, h('i', { style: { width: `${(done / steps.length) * 100}%` } })),
      h('div', { class: 'pf-todo-list' }, ...steps.map(([ok, label, href]) => (href && !ok
        ? h('a', { href, class: 'pf-todo-item' }, icon('plus', { size: 14 }), label)
        : h('span', { class: `pf-todo-item${ok ? ' is-done' : ''}` }, icon(ok ? 'check' : 'clock', { size: 14 }), label)))));
  };
  const tabs = h('div', { class: 'profile-tabs' },
    ...[['content', 'Content'], ['ach', 'Achievements'], ['about', 'About']].map(([t, label]) => h('button', { 'data-t': t, onclick: () => { tab = t; drawBody(); } }, label)));
  drawBody();

  const earnedBadges = ach.filter((a) => a.done && ['met-owner', 'pro', 'famous', 'level-25', 'friend'].includes(a.id));
  const role = owner ? 'Founder of Quickzy' : kind === 'official' ? 'Official Quickzy account' : kind === 'pro' ? 'Quickzy Pro' : null;
  const joined = user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;
  const share = async () => {
    const url = `${location.origin}/u/${user.username}`;
    try { if (navigator.share) await navigator.share({ title: user.displayName, url }); else { await navigator.clipboard.writeText(url); toast('Profile link copied', 'ok'); } } catch { /* closed */ }
  };
  return h('div', { class: 'page stack', style: { gap: '18px' } },
    h('section', { class: 'pf' },
      h('div', { class: 'pf-cover' }, profileBanner(user.banner, { owner }), owner ? h('span', { class: 'pf-credit' }, 'Photo: Unsplash') : null),
      h('div', { class: 'pf-head' },
        h('div', { class: 'pf-avatar' }, blook(user.blook, 132)),
        h('div', { class: 'pf-actions' },
          h('button', { class: 'btn', title: 'Share profile', 'aria-label': 'Share profile', onclick: share }, icon('up', { size: 18 })),
          mine ? h('a', { class: 'btn', href: '/settings#profile' }, icon('edit', { size: 16 }), 'Edit profile') : hasChannel ? followButton(claim.uid, countEl) : null)),
      h('div', { class: 'pf-id' },
        h('h1', { class: 'pf-name' }, user.displayName, badge ? nameBadges(badge) : null),
        h('div', { class: 'pf-handle' }, h('span', {}, `@${user.username}`),
          role ? h('span', { class: 'pf-role' }, kind === 'pro' ? null : logo(), role) : null),
        user.bio ? h('p', { class: 'pf-bio' }, user.bio) : null,
        h('div', { class: 'pf-meta' },
          owner ? h('span', {}, icon('globe', { size: 15 }), 'Kyrgyzstan') : null,
          joined ? h('span', {}, icon('clock', { size: 15 }), `Joined ${joined}`) : null),
        h('div', { class: 'pf-counts' },
          hasChannel ? h('span', {}, countEl, followers === 1 ? 'follower' : 'followers') : null,
          h('span', {}, h('b', {}, fmt(quizzes.length)), quizzes.length === 1 ? 'quiz' : 'quizzes'),
          h('span', {}, h('b', {}, fmt(plays)), plays === 1 ? 'play' : 'plays')),
        (() => { const li = levelInfo(user.xp || 0); return h('div', { class: 'pf-level', title: `${li.into} / ${li.need} XP to level ${li.level + 1}` },
          h('span', {}, `Level ${li.level}`), h('div', { class: 'pf-level-bar' }, h('i', { style: { width: `${Math.round(li.frac * 100)}%` } })), h('small', {}, li.need ? `${Math.round(li.frac * 100)}%` : 'Max')); })(),
        earnedBadges.length ? h('div', { class: 'pf-earned' }, ...earnedBadges.map((a) => h('span', { style: { '--c': a.col } }, icon('trophy', { size: 12 }), a.title))) : null),
      tabs),
    body);
}

/* --------------------------------------------------------- all channels */

export async function ChannelsPage() {
  pageTitle('Channels');
  const [top, mineFollow, newest] = await Promise.all([channels.topChannels(), channels.following(), channels.feed(12)]);
  const card = (c) => h('a', { class: 'channel-card', href: `/u/${c.username}` },
    h('div', { class: 'channel-card-top', style: { background: COVER_BG[(Number(c.covers[0]?.cover) || 0) % COVER_BG.length] } }, blook(c.blook || 'dog', 72)),
    h('b', { class: 'row', style: { gap: '6px', justifyContent: 'center' } }, c.name || c.username, badgeSlot(c.uid)),
    h('small', { class: 'muted' }, `${plural(c.quizzes, 'quiz', 'quizzes')} · ${fmt(c.plays)} plays`),
    mineFollow.includes(c.uid) ? h('span', { class: 'pill pill-ok' }, icon('check', { size: 12 }), 'Following') : null);
  return h('div', { class: 'page stack', style: { gap: '22px' } },
    h('section', { class: 'channels-hero' },
      h('h1', {}, 'Channels'),
      h('p', {}, 'Every quiz maker has a channel. Follow the ones you like and their new quizzes show up for you.')),
    signedIn() && newest.length ? h('div', { class: 'stack' },
      h('div', { class: 'section-head' }, h('h2', {}, 'New from channels you follow')),
      h('div', { class: 'grid' }, ...newest.map((q) => quizCard(q)))) : null,
    h('div', { class: 'section-head' }, h('h2', {}, 'Top channels')),
    top.length ? h('div', { class: 'channel-grid' }, ...top.map(card)) : h('div', { class: 'card flat' }, empty('No channels yet', 'Publish a quiz to start yours.')));
}

function badgeSlot(uid) {
  const s = h('span', { style: { display: 'inline-flex' } });
  badgeOf(uid).then((k) => { if (k) s.append(nameBadges(k)); }).catch(() => {});
  return s;
}
