// twostep.js — asking for the 6-digit code from an authenticator app, when an
// account has 2-step verification turned on.

import { h, fill } from './dom.js';
import { modal, toast } from './kit.js';
import { icon } from './icons.js';

/** Ask for the code. Resolves with the 6 digits, or null if they cancel. */
export function askCode({ title = 'Enter your code', text = 'Open your authenticator app and type the 6-digit code for Quickzy.' } = {}) {
  return modal((close) => {
    const box = h('input', {
      class: 'input input-xl code-input', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 7,
      placeholder: '123 456', 'aria-label': '6-digit code', pattern: '[0-9 ]*',
    });
    const err = h('p', { class: 'error-text', role: 'alert' });
    const go = () => {
      const v = box.value.replace(/\D/g, '');
      if (v.length !== 6) { fill(err, 'The code has 6 digits.'); box.focus(); return; }
      close(v);
    };
    box.addEventListener('input', () => {
      const v = box.value.replace(/\D/g, '').slice(0, 6);
      box.value = v.length > 3 ? `${v.slice(0, 3)} ${v.slice(3)}` : v;
      if (v.length === 6) go();
    });
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    setTimeout(() => box.focus(), 60);
    return [
      h('div', { class: 'stack center', style: { gap: '10px', textAlign: 'center' } },
        h('span', { class: 'code-ic' }, icon('shield', { size: 30 })),
        h('h2', {}, title),
        h('p', { class: 'muted', style: { margin: 0 } }, text),
        box, err,
        h('div', { class: 'row', style: { justifyContent: 'center' } },
          h('button', { class: 'btn', onclick: () => close(null) }, 'Cancel'),
          h('button', { class: 'btn btn-main', onclick: go }, 'Continue'))),
    ];
  });
}

/**
 * Run a sign-in (or a "prove it's you" step). If the account asks for a
 * 6-digit code, ask for it (again if it was wrong) and finish.
 */
export async function withTwoStep(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!err || err.code !== 'auth/multi-factor-auth-required' || !err.finish) throw err;
    for (;;) {
      const code = await askCode();
      if (!code) { const e = new Error('Cancelled'); e.code = 'auth/cancelled'; throw e; }
      try {
        return await err.finish(code);
      } catch (e2) {
        if (e2 && e2.code === 'auth/invalid-verification-code') { toast('That code is not right. Use the newest code in your app.', 'bad'); continue; }
        throw e2;
      }
    }
  }
}
