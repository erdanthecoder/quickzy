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
