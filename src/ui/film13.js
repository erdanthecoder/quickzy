// film13.js — the Quickzy 1.3 launch film: "Questions in. Games out."
//
// One continuous 3D shot through a mountain valley at sunrise, showing what
// is really new in 1.3, in order:
//   1. A steam train comes up the valley (Train Travel). No signal out here.
//   2. A phone floats over the rails: the Quickzy app, playing offline.
//      A right answer lights up.
//   3. A laptop on the rocks: Quickzy for Windows.
//   4. Three slides hang in the air and flip through the new themes:
//      Presentation+, rebuilt like PowerPoint.
//   5. The Quickzy logo flies in over the mountains.
//   6. The update card.
// If 3D can't start (old device, no WebGL, offline), the update card shows.

import { h } from './dom.js';
import { logo, icon, logoSVG } from './icons.js';
import { celebrate } from './confetti.js';
import { sfx, playMusic, stopMusic } from '../game/sound.js';
import { NEWS_13 } from './whatsnew.js';

const SEEN = 'quickzy.film13.seen';
export const film13Seen = () => { try { return localStorage.getItem(SEEN) === '1'; } catch { return true; } };

const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const seg = (t, a, b) => ease((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;

/** A screen picture, drawn with the 2D canvas, for the phone, laptop and slides. */
function screenTex(T, w, hh, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  const g = c.getContext('2d');
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
  const redraw = (...a) => { g.clearRect(0, 0, w, hh); draw(g, w, hh, ...a); tex.needsUpdate = true; };
  redraw();
  return { tex, redraw };
}
const FONT = 'Figtree, system-ui, sans-serif';

// the real logo, as a picture the canvases can draw (loaded before the film starts)
let logoImg = null;
function loadLogo() {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => { logoImg = img; ok(); };
    img.onerror = () => ok();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">${logoSVG('f13')}</svg>`)}`;
  });
}
function drawLogo(g, x, y, s) {
  if (logoImg) { g.drawImage(logoImg, x, y, s, s); return; }
  g.fillStyle = '#3a24a8'; g.beginPath(); g.roundRect(x, y, s, s, s * 0.27); g.fill();
}

/** The phone's screen: the Quickzy app, offline, with a question. */
function drawPhone(g, w, hh, picked = -1) {
  g.fillStyle = '#0f0b2e'; g.fillRect(0, 0, w, hh);
  const bg = g.createRadialGradient(w, 0, 10, w, 0, hh); bg.addColorStop(0, 'rgba(107,76,255,.55)'); bg.addColorStop(1, 'rgba(107,76,255,0)');
  g.fillStyle = bg; g.fillRect(0, 0, w, hh);
  drawLogo(g, 28, 40, 54);
  g.fillStyle = '#fff'; g.font = `900 34px ${FONT}`; g.fillText('Quickzy', 94, 78);
  g.fillStyle = 'rgba(255,205,31,.16)'; g.beginPath(); g.roundRect(w - 200, 46, 172, 44, 22); g.fill();
  g.fillStyle = '#ffd85c'; g.font = `800 20px ${FONT}`; g.fillText('● Offline', w - 178, 75);
  g.fillStyle = '#fff'; g.font = `900 40px ${FONT}`;
  g.fillText('What is the capital', 32, 190); g.fillText('of Kyrgyzstan?', 32, 238);
  const cols = ['#e2334f', '#1f7ae0', '#d89a00', '#138a56']; const ans = ['Osh', 'Karakol', 'Bishkek', 'Naryn'];
  for (let i = 0; i < 4; i++) {
    const x = 28 + (i % 2) * ((w - 70) / 2 + 14); const y = 300 + Math.floor(i / 2) * 190;
    g.globalAlpha = picked >= 0 && i !== 2 ? 0.25 : 1;
    g.fillStyle = cols[i]; g.beginPath(); g.roundRect(x, y, (w - 70) / 2, 170, 22); g.fill();
    g.fillStyle = '#fff'; g.font = `900 34px ${FONT}`; g.fillText(ans[i], x + 22, y + 100);
    if (picked >= 0 && i === 2) { g.lineWidth = 8; g.strokeStyle = '#fff'; g.beginPath(); g.roundRect(x - 4, y - 4, (w - 70) / 2 + 8, 178, 26); g.stroke(); }
    g.globalAlpha = 1;
  }
  if (picked >= 0) {
    g.fillStyle = '#12c9a6'; g.beginPath(); g.roundRect(28, 720, w - 56, 110, 24); g.fill();
    g.fillStyle = '#fff'; g.font = `900 44px ${FONT}`; g.fillText('Correct!  +950', 60, 790);
  }
}

/** The laptop's screen: Quickzy in a Windows window. */
function drawLaptop(g, w, hh) {
  const sky = g.createLinearGradient(0, 0, 0, hh); sky.addColorStop(0, '#0a3a7a'); sky.addColorStop(1, '#2b8cff');
  g.fillStyle = sky; g.fillRect(0, 0, w, hh);
  g.fillStyle = 'rgba(10,10,30,.75)'; g.fillRect(0, hh - 44, w, 44);
  // the start button and Quickzy in the taskbar
  g.fillStyle = '#7cc4ff'; [0, 1, 2, 3].forEach((i) => g.fillRect(w / 2 - 70 + (i % 2) * 12, hh - 34 + Math.floor(i / 2) * 12, 10, 10));
  drawLogo(g, w / 2 - 40, hh - 40, 34);
  // the window
  g.fillStyle = '#fff'; g.beginPath(); g.roundRect(60, 40, w - 120, hh - 110, 10); g.fill();
  g.fillStyle = '#f0eef8'; g.fillRect(60, 40, w - 120, 36);
  drawLogo(g, 70, 46, 24); g.fillStyle = '#333'; g.font = `700 16px ${FONT}`; g.fillText('Quickzy', 102, 64);
  g.fillStyle = '#666'; g.fillText('—   ▢   ✕', w - 160, 64);
  const hero = g.createLinearGradient(80, 90, w - 80, hh - 90); hero.addColorStop(0, '#120d33'); hero.addColorStop(1, '#3a2399');
  g.fillStyle = hero; g.beginPath(); g.roundRect(80, 92, w - 160, hh - 182, 14); g.fill();
  g.fillStyle = '#fff'; g.font = `900 46px ${FONT}`; g.fillText('Questions in.', 110, 170);
  const t = g.createLinearGradient(110, 0, 420, 0); t.addColorStop(0, '#ffcd1f'); t.addColorStop(1, '#ff4772');
  g.fillStyle = t; g.fillText('Games out.', 110, 222);
  g.fillStyle = '#ffcd1f'; g.beginPath(); g.roundRect(110, 252, 170, 46, 12); g.fill();
  g.fillStyle = '#17133f'; g.font = `800 20px ${FONT}`; g.fillText('Create a quiz', 130, 282);
}

/** A slide in one of the new Presentation+ themes. */
const THEMES = [
  { bg: '#ffffff', ink: '#1c1b29', acc: '#6b4cff', title: 'Volcanoes', sub: 'Clean', serif: false },
  { bg: '#10142c', ink: '#eef1ff', acc: '#7cc4ff', title: 'The Solar System', sub: 'Midnight', serif: false },
  { bg: '#f6f0e4', ink: '#2b2118', acc: '#b4532a', title: 'Ancient Rome', sub: 'Paper', serif: true },
  { bg: '#c8102e', ink: '#ffffff', acc: '#ffd100', title: 'Kyrgyzstan', sub: 'Tunduk', serif: false },
];
function drawSlide(g, w, hh, k = 0) {
  const th = THEMES[k % THEMES.length];
  g.fillStyle = th.bg; g.fillRect(0, 0, w, hh);
  if (k % 4 === 3) { g.strokeStyle = 'rgba(255,209,0,.9)'; g.lineWidth = 10; g.beginPath(); g.arc(w, hh, hh * 0.42, Math.PI, Math.PI * 1.5); g.stroke(); }
  g.fillStyle = th.acc; g.fillRect(60, 120, 90, 12);
  g.fillStyle = th.ink; g.font = `${th.serif ? '800' : '900'} 78px ${th.serif ? 'Georgia, serif' : FONT}`; g.fillText(th.title, 60, 230);
  g.globalAlpha = 0.7; g.font = `700 34px ${FONT}`; g.fillText(`Presentation+ · ${th.sub}`, 60, 290); g.globalAlpha = 1;
  const cols = ['#ff4772', '#2f9bff', '#ffb21f', '#12c9a6'];
  [0.6, 0.9, 0.35, 0.75].forEach((v, i) => { g.fillStyle = cols[i]; g.fillRect(60 + i * 130, hh - 50 - 150 * v, 100, 150 * v); });
}

export function playFilm13() {
  try { localStorage.setItem(SEEN, '1'); } catch { /* private mode */ }
  return new Promise((resolve) => {
    const canvas = h('canvas', { class: 'f12-canvas' });
    const caption = h('div', { class: 'f12-caption' });
    const title = h('div', { class: 'f12-title' });
    const signal = h('div', { class: 'f13-signal', hidden: true }, h('i'), h('i'), h('i'), h('i'), h('b', {}, 'No signal'));
    const skip = h('button', { class: 'btn btn-sm f12-skip' }, 'Skip');
    const root = h('div', { class: 'f12-root is-loading', role: 'dialog', 'aria-label': 'Quickzy 1.3' },
      canvas, h('div', { class: 'f12-bars' }), signal, caption, title, skip,
      h('div', { class: 'f12-load' }, logo(), h('span', {}, 'Loading the film…')));
    document.body.append(root);
    let done = false;
    let stopAll = () => {};
    const close = () => {
      if (done) return;
      done = true;
      stopAll(); stopMusic();
      root.classList.add('f12-out');
      setTimeout(() => { root.remove(); resolve(); }, 400);
    };
    const showCard = () => {
      stopAll(); stopAll = () => {};
      root.classList.remove('is-loading');
      signal.hidden = true; caption.textContent = '';
      skip.textContent = 'Close';
      skip.onclick = close;
      root.append(h('div', { class: 'fl-card f12-card' },
        h('div', { class: 'fl-card-head' }, logo(), h('div', {}, h('small', {}, 'Questions in. Games out.'), h('h1', {}, 'Quickzy 1.3'))),
        h('ul', { class: 'wn-list' }, ...NEWS_13.map(([ic, col, t, text], i) => h('li', { style: { animationDelay: `${0.2 + i * 0.1}s` } },
          h('span', { class: 'wn-ic', style: { background: col } }, icon(ic, { size: 18 })), h('div', {}, h('b', {}, t), h('small', {}, text))))),
        h('button', { class: 'btn btn-main btn-lg btn-block', onclick: close }, "Let's play")));
    };
    skip.onclick = () => showCard();
    if (document.documentElement.dataset.motion === 'calm') { showCard(); return; }

    Promise.all([import('../game/arcade/three.js').then((m) => m.loadThree()), import('../game/modes/train3d.js'), loadLogo()])
      .then(([T, W]) => { if (!done) stopAll = run(T, W); })
      .catch(() => showCard());

    function run(T, W) {
      let world;
      try { world = W.createWorld(T, canvas, { tv: true }); } catch { showCard(); return () => {}; }
      const { scene, cam } = world;
      root.classList.remove('is-loading');
      stopMusic();

      // where things are along the valley (z goes negative up the valley)
      const at = (z, side = 0, y = 0) => new T.Vector3(W.curveX(z) + side, y, z);
      const train = world.trainFor('film', 0x6b4cff);

      // the phone, floating over the rails
      const phoneScreen = screenTex(T, 540, 960, drawPhone);
      const phone = new T.Group();
      const body = new T.Mesh(new T.BoxGeometry(5.6, 10.6, 0.5), new T.MeshStandardMaterial({ color: 0x1b1840, metalness: 0.6, roughness: 0.3 }));
      const glass = new T.Mesh(new T.PlaneGeometry(5.1, 9.9), new T.MeshBasicMaterial({ map: phoneScreen.tex, toneMapped: false }));
      glass.position.z = 0.26; phone.add(body, glass);
      phone.position.copy(at(-260, 0, 12)); scene.add(phone);

      // the laptop, on a rock beside the line
      const lapScreen = screenTex(T, 1024, 640, drawLaptop);
      const laptop = new T.Group();
      const alu = new T.MeshStandardMaterial({ color: 0xc9ccd6, metalness: 0.8, roughness: 0.35 });
      const base = new T.Mesh(new T.BoxGeometry(14, 0.6, 9), alu);
      const lid = new T.Group();
      const back = new T.Mesh(new T.BoxGeometry(14, 9, 0.4), alu); back.position.y = 4.5;
      const disp = new T.Mesh(new T.PlaneGeometry(13.2, 8.25), new T.MeshBasicMaterial({ map: lapScreen.tex, toneMapped: false })); disp.position.set(0, 4.5, 0.21);
      lid.add(back, disp); lid.position.z = -4.4; lid.rotation.x = -0.18;
      const rock = new T.Mesh(new T.DodecahedronGeometry(9, 1), new T.MeshStandardMaterial({ color: 0x7d7468, roughness: 0.95, flatShading: true }));
      rock.scale.set(1.4, 0.6, 1.1); rock.position.y = -3;
      laptop.add(rock, base, lid); base.position.y = 2.6; lid.position.y = 2.9;
      laptop.position.copy(at(-420, -26, 0)); laptop.rotation.y = 0.5; scene.add(laptop);

      // three slides in the sky
      const slides = [0, 1, 2].map((i) => {
        const st = screenTex(T, 1024, 576, drawSlide);
        st.redraw(i);
        const m = new T.Mesh(new T.PlaneGeometry(16, 9), new T.MeshBasicMaterial({ map: st.tex, side: T.DoubleSide, toneMapped: false }));
        const frame = new T.Mesh(new T.PlaneGeometry(16.8, 9.8), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }));
        frame.position.z = -0.05;
        const g = new T.Group(); g.add(frame, m);
        g.position.copy(at(-600, (i - 1) * 19, 26 + (i === 1 ? 4 : 0)));
        g.rotation.y = (1 - i) * 0.25;
        g.userData = { st, k: i };
        scene.add(g);
        return g;
      });

      // the logo: a thick tile with the real logo on its face, flying in from pieces of light
      const logoG = new T.Group();
      const faceTex = screenTex(T, 512, 512, (g, w) => drawLogo(g, 0, 0, w));
      const sh = new T.Shape(); const r = 8.5; const e = 15;
      sh.moveTo(-e + r, -e); sh.lineTo(e - r, -e); sh.quadraticCurveTo(e, -e, e, -e + r); sh.lineTo(e, e - r); sh.quadraticCurveTo(e, e, e - r, e);
      sh.lineTo(-e + r, e); sh.quadraticCurveTo(-e, e, -e, e - r); sh.lineTo(-e, -e + r); sh.quadraticCurveTo(-e, -e, -e + r, -e);
      const tileGeo = new T.ExtrudeGeometry(sh, { depth: 2.4, bevelEnabled: true, bevelSize: 0.6, bevelThickness: 0.6, bevelSegments: 3 });
      tileGeo.translate(0, 0, -3.4);
      const tile = new T.Mesh(tileGeo, new T.MeshStandardMaterial({ color: 0x241a6b, roughness: 0.35, metalness: 0.3 }));
      const face = new T.Mesh(new T.PlaneGeometry(31, 31), new T.MeshBasicMaterial({ map: faceTex.tex, transparent: true, toneMapped: false }));
      face.position.z = 0.02;
      logoG.add(tile, face);
      const parts = [tile, face].map((m) => ({ m, home: m.position.clone(), from: new T.Vector3(0, -40, -120) }));
      const logoAt = at(-820, 0, 46);
      logoG.position.copy(logoAt);
      logoG.visible = false;
      const glow = new T.PointLight(0xffe8a0, 0, 120); glow.position.set(0, 0, 18); logoG.add(glow);
      scene.add(logoG);

      // the camera's path: [time, position, look-at]
      const P = (z, side, y) => at(z, side, y);
      const shots = [
        [0, P(-60, 10, 3.2), P(-160, 0, 3)],
        [5.5, P(-150, 12, 9), P(-250, 0, 10)],
        [8, P(-228, 2, 13), P(-260, 0, 12)],
        [12.5, P(-243, 0.5, 12.2), P(-260, 0, 12)],
        [14.5, P(-390, -8, 9), P(-420, -26, 3)],
        [18.5, P(-404, -20, 7), P(-420, -26, 4)],
        [20.5, P(-540, 0, 24), P(-600, 0, 27)],
        [26.5, P(-560, 0, 27), P(-600, 0, 27)],
        [28.5, P(-725, 0, 44), P(-820, 0, 42)],
        [36, P(-745, 0, 45), P(-820, 0, 41)],
      ];
      const camAt = (t) => {
        let i = 0; while (i < shots.length - 2 && t > shots[i + 1][0]) i++;
        const [t0, p0, l0] = shots[i]; const [t1, p1, l1] = shots[i + 1];
        const k = ease((t - t0) / (t1 - t0));
        return [p0.clone().lerp(p1, k), l0.clone().lerp(l1, k)];
      };

      const say = (text, sub = '') => { caption.replaceChildren(h('b', {}, text), sub ? h('small', {}, sub) : ''); caption.classList.remove('is-in'); void caption.offsetWidth; caption.classList.add('is-in'); };
      const cues = [
        [0.6, () => say('Somewhere in the mountains…')],
        [2.6, () => { signal.hidden = false; sfx('whistle'); }],
        [3.2, () => say('No Wi-Fi. No signal.', 'Usually, that means no game.')],
        [8.6, () => say('Quickzy still plays.', 'The new Quickzy app works offline.')],
        [10.8, () => { phoneScreen.redraw(2); sfx('right'); }],
        [13.2, () => { signal.hidden = true; }],
        [14.8, () => say('Now on Windows.', 'Install Quickzy on your computer.')],
        [20.8, () => say('Presentation+, rebuilt.', 'Themes, layouts and transitions, like PowerPoint.')],
        [22.2, () => flip(0)], [23.4, () => flip(1)], [24.6, () => flip(2)], [25.8, () => flip(1)],
        [28.4, () => { caption.textContent = ''; logoG.visible = true; sfx('boost'); }],
        [32.6, () => { sfx('win'); celebrate(); title.replaceChildren(h('small', {}, 'Questions in. Games out.'), h('h1', {}, 'Quickzy 1.3')); title.classList.add('is-on', 'f13-title'); playMusic('victory'); }],
        [38.5, () => showCard()],
      ];
      let flipping = [];
      const flip = (i) => { const g = slides[i]; flipping.push({ g, t0: clock, swapped: false }); sfx('tap'); };

      let clock = 0;
      let last = performance.now();
      let raf = 0;
      let cue = 0;
      const tick = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        clock += dt;
        while (cue < cues.length && clock >= cues[cue][0]) { cues[cue][1](); cue += 1; }
        if (done) return;
        // the train climbs the valley
        const tz = 20 + clock * 26;
        world.placeTrain(train, tz, 0, true, dt, { showLabel: false });
        // the phone bobs and turns towards us
        phone.position.y = 12 + Math.sin(clock * 1.6) * 0.5;
        phone.rotation.y = Math.sin(clock * 0.7) * 0.25; phone.rotation.z = Math.sin(clock * 0.9) * 0.05;
        slides.forEach((g, i) => { g.position.y = 26 + (i === 1 ? 4 : 0) + Math.sin(clock * 1.1 + i) * 0.6; });
        flipping = flipping.filter((f) => {
          const k = (clock - f.t0) / 0.8;
          f.g.rotation.x = Math.sin(Math.min(1, k) * Math.PI) * 0.0 + Math.min(1, k) * Math.PI * 2;
          if (!f.swapped && k > 0.5) { f.swapped = true; f.g.userData.k += 1; f.g.userData.st.redraw(f.g.userData.k); }
          if (k >= 1) { f.g.rotation.x = 0; return false; }
          return true;
        });
        // the logo flies together, then breathes
        if (logoG.visible) {
          const k = seg(clock, 28.4, 32.4);
          parts.forEach(({ m, home, from }, i) => { const kk = ease(Math.min(1, k * 1.25 - i * 0.05)); m.position.lerpVectors(from, home, kk); });
          logoG.rotation.y = lerp(-1.2, 0, k) + (k >= 1 ? Math.sin(clock * 0.8) * 0.12 : 0);
          glow.intensity = k >= 1 ? 900 + Math.sin(clock * 3) * 120 : k * 600;
        }
        const [p, l] = camAt(clock);
        cam.position.copy(p); cam.lookAt(l);
        world.render(dt, { x: p.x, z: p.z });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      // for checking single moments of the film (tests and screenshots)
      root.seek = (t) => { clock = t; while (cue < cues.length && cues[cue][0] < t - 0.5) { if (cues[cue][0] < 38) cues[cue][1](); cue += 1; } };
      return () => { cancelAnimationFrame(raf); try { world.destroy(); } catch { /* gone */ } };
    }
  });
}
