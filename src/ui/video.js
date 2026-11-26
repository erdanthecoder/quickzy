// video.js — a question's video clip, played from YouTube's privacy-friendly
// player. It starts at the clip's start and stops by itself at its end.

import { h } from './dom.js';
import { cleanVideo, fmtTime } from '../game/questions.js';

export function videoClip(v, { autoplay = true, cls = '' } = {}) {
  const c = cleanVideo(v);
  if (!c) return null;
  const params = new URLSearchParams({
    start: String(c.start), end: String(c.end), autoplay: autoplay ? '1' : '0',
    rel: '0', modestbranding: '1', playsinline: '1',
    // YouTube refuses to play embeds that do not say which site they are on
    origin: location.origin, widget_referrer: location.origin, enablejsapi: '1',
  });
  return h('div', { class: `q-video ${cls}` },
    h('iframe', {
      src: `https://www.youtube-nocookie.com/embed/${c.id}?${params}`,
      title: 'Video for this question', allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true,
      referrerpolicy: 'strict-origin-when-cross-origin', loading: 'lazy',
    }),
    h('small', { class: 'q-video-time' }, `${fmtTime(c.start)} – ${fmtTime(c.end)}`,
      // some videos are not allowed to play on other sites: this always works
      h('a', { href: `https://www.youtube.com/watch?v=${c.id}&t=${c.start}s`, target: '_blank', rel: 'noopener' }, ' · Open on YouTube')));
}

/**
 * A YouTube player we can talk to (without loading YouTube's script, which
 * the security policy keeps out): ytPlayer(id, { start, onTime, onEnd }).
 * Returns { el, time(), duration(), play(), pause(), seek(s), destroy() }.
 * The player tells us the time while it plays; we listen to its messages.
 */
export function ytPlayer(id, { start = 0, end = 0, autoplay = false, onTime, onEnd, onReady } = {}) {
  const params = new URLSearchParams({
    start: String(Math.floor(start)), autoplay: autoplay ? '1' : '0', rel: '0', modestbranding: '1', playsinline: '1',
    origin: location.origin, widget_referrer: location.origin, enablejsapi: '1',
    ...(end > start ? { end: String(Math.floor(end)) } : {}),
  });
  const frame = h('iframe', {
    src: `https://www.youtube-nocookie.com/embed/${id}?${params}`, title: 'Video',
    allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin',
  });
  const el = h('div', { class: 'q-video yt-player' }, frame);
  let now = start;
  let dur = 0;
  let ended = false;
  const post = (msg) => { try { frame.contentWindow.postMessage(JSON.stringify(msg), '*'); } catch { /* not ready */ } };
  const command = (func, args = []) => post({ event: 'command', func, args });
  const onMessage = (e) => {
    if (e.source !== frame.contentWindow || !/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return;
    let d = null;
    try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    if (!d) return;
    if (d.event === 'onReady' && onReady) onReady();
    const info = d.info || {};
    if (typeof info.currentTime === 'number') { now = info.currentTime; if (onTime) onTime(now); }
    if (typeof info.duration === 'number' && info.duration > 0) dur = info.duration;
    const state = d.event === 'onStateChange' ? d.info : info.playerState;
    if (state === 0 && !ended) { ended = true; if (onEnd) onEnd(); }
    if (state === 1) ended = false;
  };
  window.addEventListener('message', onMessage);
  // say hello once it has loaded, so it starts telling us the time
  frame.addEventListener('load', () => {
    post({ event: 'listening', id: 'quickzy' });
    command('addEventListener', ['onStateChange']);
  });
  return {
    el,
    time: () => now,
    duration: () => dur,
    play: () => command('playVideo'),
    pause: () => command('pauseVideo'),
    seek: (s) => { now = s; command('seekTo', [s, true]); },
    destroy: () => window.removeEventListener('message', onMessage),
  };
}
