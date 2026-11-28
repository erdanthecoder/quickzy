// create.js — one "Create" button, three things to make: a quiz, a video
// quiz (YouTube clips before questions) or a Presentation+ deck.

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { me } from '../services/session.js';
import { isPro, proOpen, PRO_COMING } from '../services/plan.js';
import { pageTitle } from './parts.js';

const KINDS = [
  ['/create', 'Quiz', 'Questions with answers. Host it live, play it as a game or set it as homework.', 'list', '#6b4cff', false],
  ['/video', 'Video quiz', 'One YouTube video. Add questions and facts anywhere in it: the video pauses there for everyone.', 'play', '#ff4772', true],
  ['/present', 'Presentation+', 'Slides with live polls, guess-the-graph and quiz slides. Import from PowerPoint.', 'chart', '#12c9a6', true],
];

export default async function Create() {
  pageTitle('Create');
  const pro = await isPro(me().uid).catch(() => false);
  return h('div', { class: 'page narrow stack', style: { gap: '18px' } },
    h('h1', {}, 'What do you want to make?'),
    h('div', { class: 'create-kinds' }, ...KINDS.map(([href, name, text, ic, col, needsPro]) => {
      const locked = needsPro && !pro;
      return h('a', { class: `create-kind${locked ? ' is-locked' : ''}`, href: locked ? (proOpen() ? '/pro' : null) : href, style: { '--c': col } },
        h('span', { class: 'create-kind-ic' }, icon(ic, { size: 28 })),
        h('b', {}, name, needsPro ? h('span', { class: 'side-tag' }, 'PRO') : null),
        h('small', {}, locked ? (proOpen() ? 'Get Quickzy Pro to unlock this.' : PRO_COMING) : text));
    })));
}
