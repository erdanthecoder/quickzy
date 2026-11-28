// video.js — the video quiz maker. One YouTube video; while it plays, add a
// stop at any moment: a question, true or false, type the answer, or a fact.
// Players watch the video, and it pauses at every stop.
//
// Saved as an ordinary quiz: each stop becomes a question whose clip runs
// from the stop before it to this one, so live games, solo play and homework
// all play it without anything new.

import { h, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { busy, toast, confirm } from '../ui/kit.js';
import { navigate } from '../router.js';
import { explain } from '../net/index.js';
import { youTubeId, fmtTime, parseTime, problem, cleanVideo } from '../game/questions.js';
import { ytPlayer } from '../ui/video.js';
import { myPlan, proOpen, PRO_COMING } from '../services/plan.js';
import { saveQuiz, loadForEditing, publishProblems, COVERS } from '../services/quizzes.js';
import { pageTitle } from './parts.js';

const KINDS = {
  mc: ['Question', '❓', 'Multiple choice: one right answer'],
  tf: ['True or false', '✅', 'Is it true?'],
  type: ['Type the answer', '⌨️', 'Players type it'],
  fact: ['Fact', '\u{1F4A1}', 'A fact or tip: no answer, no points'],
};
const uid = () => Math.random().toString(36).slice(2, 10);

function blankStop(type, at) {
  const base = { id: uid(), type, at: Math.floor(at), text: '' };
  if (type === 'mc') return { ...base, options: ['', '', '', ''], answer: 0 };
  if (type === 'tf') return { ...base, answer: true };
  if (type === 'type') return { ...base, answer: [''] };
  return base;
}

/** Stops → the quiz's questions (each one's clip runs from the stop before). */
export function stopsToQuestions(videoId, stops) {
  const sorted = [...stops].sort((a, b) => a.at - b.at);
  let prev = 0;
  return sorted.map((s) => {
    const end = Math.max(prev + 1, Math.floor(s.at));
    const q = {
      id: s.id, type: s.type, text: s.text, time: s.type === 'fact' ? 15 : s.type === 'type' ? 30 : 20,
      points: s.type === 'fact' ? 'none' : 'standard', video: { id: videoId, start: prev, end },
    };
    if (s.type === 'mc') { q.options = s.options.filter((o) => o.trim()); q.answer = Math.min(s.answer, Math.max(0, q.options.length - 1)); }
    if (s.type === 'tf') q.answer = s.answer;
    if (s.type === 'type') q.answer = s.answer;
    prev = end;
    return q;
  });
}

/** A quiz made here (every question one clip of the same video, back to back)? */
export function isVideoLesson(quiz) {
  const qs = (quiz && quiz.questions) || [];
  if (!qs.length) return false;
  const id = qs[0].video && qs[0].video.id;
  let prev = 0;
  return Boolean(id) && qs.every((q) => {
    const c = cleanVideo(q.video);
    const ok = c && c.id === id && c.start === prev && ['mc', 'tf', 'type', 'fact'].includes(q.type);
    if (c) prev = c.end;
    return ok;
  });
}

export default async function VideoMaker({ params = {} }) {
  pageTitle('Video quiz');
  const plan = await myPlan();
  if (!plan.pro) {
    return h('div', { class: 'page narrow' }, h('div', { class: 'card center stack' },
      h('h2', {}, 'Video quizzes are part of Quickzy Pro'),
      h('p', { class: 'muted' }, 'Pick a YouTube video and add questions and facts anywhere in it.'),
      proOpen() ? h('a', { class: 'btn btn-main', href: '/pro' }, 'See Quickzy Pro') : h('p', { class: 'pill' }, PRO_COMING)));
  }
  let quiz = { id: null, title: '', description: '', cover: Math.floor(Math.random() * COVERS), public: false };
  let videoId = '';
  let stops = [];
  if (params.id) {
    const q = await loadForEditing(params.id).catch(() => null);
    if (!q) { navigate('/library', { replace: true }); return h('div'); }
    quiz = q;
    videoId = (q.questions[0] && q.questions[0].video && q.questions[0].video.id) || '';
    stops = q.questions.map((x) => ({ ...x, at: (x.video && x.video.end) || 0, options: x.options ? [...x.options, '', '', '', ''].slice(0, Math.max(4, x.options.length)) : undefined }));
  }

  let player = null;
  let open = null;      // the stop being edited
  let dirty = false;
  const title = h('input', { class: 'input vq-title', placeholder: 'Name your video quiz', maxlength: 80, value: quiz.title || '' });
  title.addEventListener('input', () => { quiz.title = title.value; dirty = true; });
  const stage = h('div', { class: 'vq-stage' });
  const timeline = h('div', { class: 'vq-timeline' });
  const nowLabel = h('b', { class: 'vq-now' }, '0:00');
  const addRow = h('div', { class: 'vq-add' });
  const list = h('div', { class: 'vq-stops' });
  const status = h('span', { class: 'muted small' });

  /* ------------------------------------------------------------ the video */
  function loadVideo() {
    if (player) player.destroy();
    player = ytPlayer(videoId, {
      onTime: (t) => { nowLabel.textContent = fmtTime(t); drawPlayhead(); },
    });
    fill(stage, player.el);
    drawTimeline();
    drawAdd();
  }
  function pickVideo() {
    const link = h('input', { class: 'input input-lg', placeholder: 'Paste a YouTube link, e.g. https://youtu.be/…', autocomplete: 'off' });
    const go = h('button', { class: 'btn btn-main btn-lg' }, icon('play', { size: 18 }), 'Use this video');
    const use = () => {
      const id = youTubeId(link.value);
      if (!id) { toast('That is not a YouTube link', 'bad'); link.focus(); return; }
      videoId = id; dirty = true; loadVideo(); drawList();
    };
    go.addEventListener('click', use);
    link.addEventListener('keydown', (e) => { if (e.key === 'Enter') use(); });
    fill(stage, h('div', { class: 'vq-pick' },
      h('span', { class: 'vq-pick-ic' }, icon('play', { size: 34 })),
      h('h2', {}, 'Start with a YouTube video'),
      h('p', { class: 'muted' }, 'Then play it, and wherever you want, add a question or a fact. The video will pause there for everyone.'),
      h('div', { class: 'row vq-pick-row' }, link, go)));
    setTimeout(() => link.focus(), 50);
  }

  /* ------------------------------------------------------------- timeline */
  const playhead = h('i', { class: 'vq-head' });
  const length = () => Math.max(60, (player && player.duration()) || 0, ...stops.map((s) => s.at + 20));
  function drawPlayhead() {
    const t = player ? player.time() : 0;
    playhead.style.left = `${Math.min(100, (t / length()) * 100)}%`;
  }
  function drawTimeline() {
    const L = length();
    fill(timeline, h('div', { class: 'vq-track' },
      ...stops.map((s) => h('button', { type: 'button', class: `vq-mark is-${s.type}${open === s ? ' is-open' : ''}`, style: { left: `${(s.at / L) * 100}%` }, title: `${fmtTime(s.at)} · ${KINDS[s.type][0]}`,
        onclick: () => { if (player) player.seek(Math.max(0, s.at - 3)); open = s; drawList(); drawTimeline(); } }, KINDS[s.type][1])),
      playhead));
    drawPlayhead();
  }

  /* ------------------------------------------------------- add at the time */
  function drawAdd() {
    fill(addRow,
      h('div', { class: 'vq-now-box' }, h('small', {}, 'Add at'), nowLabel),
      ...Object.entries(KINDS).map(([type, [label, pic]]) => h('button', { type: 'button', class: `vq-add-btn is-${type}`, onclick: () => add(type) },
        h('span', {}, pic), label)));
  }
  function add(type) {
    if (stops.length >= 60) { toast('A video quiz has 60 stops at most', 'bad'); return; }
    const at = player ? Math.max(1, Math.floor(player.time())) : 1;
    if (player) player.pause();
    const s = blankStop(type, at);
    stops.push(s);
    stops.sort((a, b) => a.at - b.at);
    open = s; dirty = true;
    drawTimeline(); drawList();
    setTimeout(() => { const t = list.querySelector('.vq-stop.is-open textarea, .vq-stop.is-open input'); if (t) t.focus(); }, 60);
  }

  /* ------------------------------------------------------------ the stops */
  function stopCard(s, n) {
    const [label, pic] = KINDS[s.type];
    const isOpen = open === s;
    const time = h('input', { class: 'input vq-time', value: fmtTime(s.at), 'aria-label': 'Time in the video' });
    time.addEventListener('change', () => {
      const t = parseTime(time.value);
      if (!(t >= 1)) { toast('Write a time like 1:25', 'bad'); time.value = fmtTime(s.at); return; }
      s.at = Math.floor(t); stops.sort((a, b) => a.at - b.at); dirty = true; drawTimeline(); drawList();
    });
    const here = h('button', { type: 'button', class: 'btn btn-sm', title: 'Move this stop to where the video is now', onclick: () => {
      if (!player) return; s.at = Math.max(1, Math.floor(player.time())); stops.sort((a, b) => a.at - b.at); dirty = true; drawTimeline(); drawList();
    } }, icon('clock', { size: 14 }), 'Now');
    const del = h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-icon', 'aria-label': 'Remove this stop', onclick: () => {
      stops = stops.filter((x) => x !== s); if (open === s) open = null; dirty = true; drawTimeline(); drawList();
    } }, icon('trash', { size: 16 }));
    const head = h('div', { class: 'vq-stop-head', onclick: (e) => { if (e.target.closest('input, button')) return; open = isOpen ? null : s; drawList(); drawTimeline(); } },
      h('span', { class: `vq-stop-ic is-${s.type}` }, pic),
      h('div', { class: 'grow' }, h('b', {}, s.text.trim() || (s.type === 'fact' ? 'New fact' : 'New question')), h('small', { class: 'muted' }, `Stop ${n + 1} · ${label}`)),
      time, here, del);
    if (!isOpen) return h('div', { class: 'vq-stop' }, head);
    const text = h('textarea', { class: 'input', rows: 2, maxlength: 240, placeholder: s.type === 'fact' ? 'Write the fact, e.g. "A blue whale\'s heart is as big as a small car!"' : 'Write the question' });
    text.value = s.text;
    text.addEventListener('input', () => { s.text = text.value; dirty = true; head.querySelector('b').textContent = s.text.trim() || 'New'; });
    const body = [text];
    if (s.type === 'mc') {
      body.push(h('div', { class: 'vq-opts' }, ...s.options.map((o, i) => {
        const inp = h('input', { class: 'input', maxlength: 90, placeholder: `Answer ${i + 1}${i > 1 ? ' (optional)' : ''}`, value: o });
        inp.addEventListener('input', () => { s.options[i] = inp.value; dirty = true; });
        return h('div', { class: 'vq-opt' },
          h('button', { type: 'button', class: `cls-right${s.answer === i ? ' is-on' : ''}`, title: 'The right answer', 'aria-label': `Answer ${i + 1} is right`, onclick: () => { s.answer = i; dirty = true; drawList(); } }, icon('check', { size: 14 })),
          inp);
      })));
    }
    if (s.type === 'tf') {
      body.push(h('div', { class: 'row' }, ...[[true, 'True'], [false, 'False']].map(([v, l]) => h('button', { type: 'button', class: `chip${s.answer === v ? ' is-on' : ''}`, onclick: () => { s.answer = v; dirty = true; drawList(); } }, l))));
    }
    if (s.type === 'type') {
      const ans = h('input', { class: 'input', maxlength: 200, placeholder: 'The right answer (add other spellings after a comma)', value: s.answer.join(', ') });
      ans.addEventListener('input', () => { s.answer = ans.value.split(',').map((x) => x.trim()).filter(Boolean); if (!s.answer.length) s.answer = ['']; dirty = true; });
      body.push(ans);
    }
    return h('div', { class: 'vq-stop is-open' }, head, h('div', { class: 'vq-stop-body' }, ...body));
  }
  function drawList() {
    if (!videoId) { fill(list); return; }
    fill(list, ...(stops.length ? stops.map(stopCard) : [h('div', { class: 'vq-empty' },
      h('b', {}, 'No stops yet'), h('p', { class: 'muted' }, 'Play the video. When you reach a good moment, press Question, True or false, Type the answer or Fact above.'))]));
  }

  /* ----------------------------------------------------------------- save */
  const build = () => ({ ...quiz, title: title.value.trim(), questions: stopsToQuestions(videoId, stops) });
  const save = h('button', { class: 'btn' }, icon('check', { size: 16 }), 'Save');
  const publish = h('button', { class: 'btn btn-main' }, icon('globe', { size: 16 }), quiz.public ? 'Save' : 'Publish');
  async function doSave(pub) {
    if (!videoId) { toast('Pick a video first', 'bad'); return false; }
    if (!stops.length) { toast('Add at least one stop', 'bad'); return false; }
    const q = build();
    if (!q.title) { toast('Give your video quiz a name', 'bad'); title.focus(); return false; }
    const bad = q.questions.map((x, i) => [i, problem(x)]).find(([, p]) => p);
    if (bad) { open = stops.find((s) => s.id === q.questions[bad[0]].id) || null; drawList(); toast(`Stop ${bad[0] + 1}: ${bad[1]}`, 'bad'); return false; }
    if (pub) {
      const issues = publishProblems(q);
      if (issues.length) { toast(issues[0], 'bad'); return false; }
    }
    try {
      const id = await saveQuiz(q, { publish: pub || quiz.public });
      quiz.id = id; quiz.public = pub || quiz.public; dirty = false;
      if (!params.id) history.replaceState(null, '', `/video/${id}`);
      status.textContent = 'Saved';
      toast(pub ? 'Published! It goes live once Quickzy checks it.' : 'Saved', 'ok');
      return true;
    } catch (e) { toast(e.message && !e.code ? e.message : explain(e), 'bad'); return false; }
  }
  save.addEventListener('click', busy(save, () => doSave(false)));
  publish.addEventListener('click', busy(publish, () => doSave(true)));
  const host = h('a', { class: 'btn', href: '#', onclick: async (e) => { e.preventDefault(); if (await doSave(false)) navigate(`/host/${quiz.id}`); } }, icon('play', { size: 16 }), 'Host it');
  const change = h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => {
    if (stops.length && !(await confirm({ title: 'Use another video?', text: 'Your stops stay where they are in time.', yes: 'Pick another' }))) return;
    if (player) player.destroy(); player = null; pickVideo();
  } }, 'Change video');

  const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warn);
  const watchGone = setInterval(() => { if (!root.isConnected) { window.removeEventListener('beforeunload', warn); if (player) player.destroy(); clearInterval(watchGone); } }, 2000);

  const root = h('div', { class: 'page wide vq' },
    h('div', { class: 'card row vq-bar' }, h('span', { class: 'vq-badge' }, icon('play', { size: 16 }), 'Video quiz'), title, status, save, host, publish),
    h('div', { class: 'vq-grid' },
      h('div', { class: 'stack', style: { gap: '12px' } }, stage, timeline, addRow, videoId ? change : null),
      h('div', { class: 'stack vq-side' }, h('h2', { style: { margin: 0 } }, 'Stops'), list)));
  if (videoId) loadVideo(); else pickVideo();
  drawList();
  return root;
}
