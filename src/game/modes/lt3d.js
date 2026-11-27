// lt3d.js — the Laser Tag arena in 3D: a dark hall with a glowing grid,
// neon walls, players standing on light rings, and laser beams that flash
// across the room. The game itself (moving, tagging, the host's checks)
// lives in lasertag.js; this only draws it.

import { drawBlook } from '../arcade/engine.js';
import { autoQuality } from '../arcade/quality.js';
import { preloadBlooks } from '../../ui/blooks.js';

const S = 1 / 20;                    // world units per arena pixel

function canvasTex(T, w, hh, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  draw(c.getContext('2d'), w, hh);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const glowTex = (T) => canvasTex(T, 64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});

export function createArena(T, canvas, { W, H, walls, spawns, pickups, tv = false }) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene();
  scene.background = new T.Color(0x05041a);
  scene.fog = new T.Fog(0x05041a, 60, 160);
  const cam = new T.PerspectiveCamera(tv ? 40 : 50, 1, 0.5, 400);
  const AW = W * S; const AH = H * S;
  const glow = glowTex(T);

  scene.add(new T.AmbientLight(0x6a5cff, 0.55));
  scene.add(new T.HemisphereLight(0x59f0ff, 0x1a0b3a, 0.6));
  for (const [x, z, c] of [[0, 0, 0xff4772], [AW, 0, 0x59f0ff], [0, AH, 0x59f0ff], [AW, AH, 0xff4772], [AW / 2, AH / 2, 0xa560ff]]) {
    const l = new T.PointLight(c, 60, 70, 1.6); l.position.set(x, 9, z); scene.add(l);
  }

  // the floor: dark panels with a glowing grid
  const floorTex = canvasTex(T, 2048, 1280, (g, w, hh) => {
    g.fillStyle = '#0b0a26'; g.fillRect(0, 0, w, hh);
    const sx = w / W; const sy = hh / H;
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(107,76,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * hh, 80 * sx, 80 * sy); }
    g.strokeStyle = 'rgba(89,240,255,.32)'; g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= W; x += 80) { g.moveTo(x * sx, 0); g.lineTo(x * sx, hh); }
    for (let y = 0; y <= H; y += 80) { g.moveTo(0, y * sy); g.lineTo(w, y * sy); }
    g.stroke();
    g.strokeStyle = 'rgba(255,71,114,.5)'; g.lineWidth = 6;
    g.beginPath(); g.arc(w / 2, hh / 2, 120 * sx, 0, Math.PI * 2); g.stroke();
  });
  const floor = new T.Mesh(new T.PlaneGeometry(AW, AH), new T.MeshStandardMaterial({ map: floorTex, emissive: 0xffffff, emissiveMap: floorTex, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.4 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(AW / 2, 0, AH / 2); scene.add(floor);
  const plane = new T.Plane(new T.Vector3(0, 1, 0), 0);

  // neon walls: solid blocks with bright edges and a light strip on top
  const wallMat = new T.MeshStandardMaterial({ color: 0x0c1036, emissive: 0x0a1250, roughness: 0.25, metalness: 0.7 });
  const edgeMat = new T.LineBasicMaterial({ color: 0x59f0ff });
  const stripMat = new T.MeshBasicMaterial({ color: 0x59f0ff });
  const wall = (x, y, w, hh, height, mat = wallMat, edge = edgeMat, strip = stripMat) => {
    const geo = new T.BoxGeometry(w * S, height, hh * S);
    const m = new T.Mesh(geo, mat); m.position.set((x + w / 2) * S, height / 2, (y + hh / 2) * S); scene.add(m);
    const e = new T.LineSegments(new T.EdgesGeometry(geo), edge); e.position.copy(m.position); scene.add(e);
    // glowing bars along the top edges and down the corners
    const bw = w * S; const bd = hh * S; const k = 0.11;
    for (const [sx, sz, lx, lz] of [[0, -bd / 2, bw, k], [0, bd / 2, bw, k], [-bw / 2, 0, k, bd], [bw / 2, 0, k, bd]]) {
      const bar = new T.Mesh(new T.BoxGeometry(lx + k, k, lz + k), strip); bar.position.set(m.position.x + sx, height, m.position.z + sz); scene.add(bar);
    }
    for (const [sx, sz] of [[-bw / 2, -bd / 2], [bw / 2, -bd / 2], [-bw / 2, bd / 2], [bw / 2, bd / 2]]) {
      const post = new T.Mesh(new T.BoxGeometry(k, height, k), strip); post.position.set(m.position.x + sx, height / 2, m.position.z + sz); scene.add(post);
    }
    const halo = new T.Mesh(new T.PlaneGeometry(bw + 2.2, bd + 2.2), new T.MeshBasicMaterial({ map: glow, color: strip.color, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.set(m.position.x, 0.03, m.position.z); scene.add(halo);
  };
  for (const [x, y, w, hh] of walls) wall(x, y, w, hh, 2.6);
  const borderMat = new T.MeshStandardMaterial({ color: 0x3a0f2a, emissive: 0x2a0518, roughness: 0.4 });
  const pink = new T.LineBasicMaterial({ color: 0xff4772 }); const pinkStrip = new T.MeshBasicMaterial({ color: 0xff4772 });
  for (const [x, y, w, hh] of [[-20, -20, W + 40, 20], [-20, H, W + 40, 20], [-20, 0, 20, H], [W, 0, 20, H]]) wall(x, y, w, hh, 3.4, borderMat, pink, pinkStrip);

  // spawn pads
  for (const [x, y] of spawns) {
    const r = new T.Mesh(new T.RingGeometry(1.3, 1.6, 40), new T.MeshBasicMaterial({ color: 0x6b4cff, transparent: true, opacity: 0.6, side: T.DoubleSide }));
    r.rotation.x = -Math.PI / 2; r.position.set(x * S, 0.02, y * S); scene.add(r);
  }
  // power-ups: spinning crystals
  const gems = pickups.map(([x, y, kind]) => {
    const c = kind === 'speed' ? 0x12c9a6 : 0xff8a2a;
    const g = new T.Mesh(new T.OctahedronGeometry(0.7), new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.4 }));
    g.position.set(x * S, 1.2, y * S); scene.add(g);
    const halo = new T.Sprite(new T.SpriteMaterial({ map: glow, color: c, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    halo.scale.set(4, 4, 1); g.add(halo);
    return g;
  });

  /* players */
  const players = new Map();
  const labelTex = (text, bg, fg) => canvasTex(T, 512, 96, (g2, w) => {
    g2.font = '900 44px Figtree, system-ui'; const tw = Math.min(w - 10, g2.measureText(text).width + 40);
    g2.fillStyle = bg; g2.beginPath(); g2.roundRect((w - tw) / 2, 14, tw, 68, 34); g2.fill();
    g2.fillStyle = fg; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(text, w / 2, 50);
  });
  function playerFor(id, st) {
    let p = players.get(id);
    if (p) return p;
    const col = new T.Color(st.colour);
    const g = new T.Group(); scene.add(g);
    const ring = new T.Mesh(new T.RingGeometry(1.05, 1.35, 40), new T.MeshBasicMaterial({ color: col, side: T.DoubleSide, transparent: true }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
    const pool = new T.Sprite(new T.SpriteMaterial({ map: glow, color: col, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false }));
    pool.scale.set(4.2, 4.2, 1); pool.position.y = 0.1; g.add(pool);
    const light = new T.PointLight(col, 8, 8, 2); light.position.y = 1.2; g.add(light);
    const bc = document.createElement('canvas'); bc.width = bc.height = 160;
    const btex = new T.CanvasTexture(bc); btex.colorSpace = T.SRGBColorSpace;
    const drawB = () => { const c2 = bc.getContext('2d'); c2.clearRect(0, 0, 160, 160); drawBlook(c2, st.blook, 80, 80, 150); btex.needsUpdate = true; };
    drawB(); preloadBlooks([st.blook]).then(drawB);
    const big = tv ? 1.6 : 1.25;
    const body = new T.Sprite(new T.SpriteMaterial({ map: btex, transparent: true })); body.scale.set(2.4 * big, 2.4 * big, 1); body.position.y = 1.4 * big; g.add(body);
    // the laser blaster, pointing where they aim
    const gun = new T.Group(); gun.position.y = 1.0; g.add(gun);
    const barrel = new T.Mesh(new T.BoxGeometry(1.3, 0.22, 0.22), new T.MeshStandardMaterial({ color: 0x22223a, emissive: col, emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.3 }));
    barrel.position.x = 1.25; gun.add(barrel);
    const tip = new T.Mesh(new T.SphereGeometry(0.13, 10, 8), new T.MeshBasicMaterial({ color: col })); tip.position.x = 1.95; gun.add(tip);
    const shield = new T.Mesh(new T.SphereGeometry(1.7, 24, 16), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, wireframe: true }));
    shield.position.y = 1.4; g.add(shield);
    const label = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthTest: false }));
    label.scale.set(6 * big, 1.1 * big, 1); label.position.y = 3.0 * big + 0.4; label.renderOrder = 5; g.add(label);
    p = { g, ring, body, gun, shield, label, light, text: '', x: st.x, y: st.y };
    players.set(id, p);
    return p;
  }
  function setPlayer(id, st) {
    const p = playerFor(id, st);
    p.g.position.set(st.x * S, 0, st.y * S);
    p.gun.rotation.y = -st.a;
    p.g.visible = true;
    p.body.material.opacity = st.dead ? 0.25 : 1;
    p.body.material.rotation = st.dead ? 0.6 : 0;
    p.gun.visible = !st.dead;
    p.shield.visible = Boolean(st.shield) && !st.dead;
    p.shield.rotation.y += 0.03;
    p.light.intensity = st.dead ? 0 : 8;
    const want = `${st.me ? '★ ' : ''}${st.name || ''}`;
    if (want !== p.text) {
      p.text = want;
      p.label.material.map?.dispose();
      p.label.material.map = labelTex(want, st.me ? '#ffcd1f' : 'rgba(23,19,63,.85)', st.me ? '#17133f' : '#fff');
      p.label.material.needsUpdate = true;
    }
  }
  function prune(keep) { for (const [id, p] of players) if (!keep.has(id)) { scene.remove(p.g); players.delete(id); } }

  /* beams and sparks */
  const beams = [];
  const beamGeo = new T.CylinderGeometry(1, 1, 1, 8, 1, true); beamGeo.rotateZ(Math.PI / 2);
  function addBeam(x1, y1, x2, y2, colour) {
    const len = Math.hypot(x2 - x1, y2 - y1) * S;
    const g = new T.Group();
    const core = new T.Mesh(beamGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    core.scale.set(len, 0.06, 0.06); g.add(core);
    const outer = new T.Mesh(beamGeo, new T.MeshBasicMaterial({ color: new T.Color(colour), transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false }));
    outer.scale.set(len, 0.22, 0.22); g.add(outer);
    g.position.set(((x1 + x2) / 2) * S, 1.0, ((y1 + y2) / 2) * S);
    g.rotation.y = -Math.atan2(y2 - y1, x2 - x1);
    scene.add(g); beams.push({ g, core, outer, life: 0.38 });
    burst(x2, y2, colour, 10);
  }
  const sparks = [];
  function burst(x, y, colour, n = 18) {
    for (let i = 0; i < n; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: glow, color: new T.Color(colour), transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      s.position.set(x * S, 1 + Math.random(), y * S); s.scale.set(0.6, 0.6, 1);
      const a = Math.random() * Math.PI * 2; const v = 4 + Math.random() * 8;
      s.userData = { vx: Math.cos(a) * v, vy: 2 + Math.random() * 6, vz: Math.sin(a) * v, life: 0.6 };
      scene.add(s); sparks.push(s);
    }
  }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(1, r.width); const hh = Math.max(1, r.height);
    renderer.setSize(w, hh, false); cam.aspect = w / hh; cam.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement);
  const quality = autoQuality(renderer, { sun: null, scene, onResize: resize });
  const ray = new T.Raycaster(); const ndc = new T.Vector2(); const hit = new T.Vector3();
  const camPos = new T.Vector3(); let camInit = false; let t = 0;

  return {
    setPlayer, prune, addBeam, burst,
    setPickups(visible) { gems.forEach((g, i) => { g.visible = visible[i]; }); },
    /** Screen point -> arena point, for aiming with the mouse or a tap. */
    toArena(px, py) {
      const r = canvas.getBoundingClientRect();
      ndc.set((px / r.width) * 2 - 1, -(py / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      return ray.ray.intersectPlane(plane, hit) ? { x: hit.x / S, y: hit.z / S } : null;
    },
    render(dt, focus) {
      t += dt;
      for (const g of gems) { g.rotation.y += dt * 2; g.position.y = 1.2 + Math.sin(t * 3 + g.position.x) * 0.2; }
      for (let i = beams.length - 1; i >= 0; i--) {
        const b = beams[i]; b.life -= dt;
        if (b.life <= 0) { scene.remove(b.g); b.core.material.dispose(); b.outer.material.dispose(); beams.splice(i, 1); continue; }
        const k = b.life / 0.38; b.core.material.opacity = k; b.outer.material.opacity = 0.55 * k;
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]; const u = s.userData; u.life -= dt;
        if (u.life <= 0) { scene.remove(s); s.material.dispose(); sparks.splice(i, 1); continue; }
        u.vy -= 18 * dt; s.position.x += u.vx * dt; s.position.y = Math.max(0.1, s.position.y + u.vy * dt); s.position.z += u.vz * dt;
        s.material.opacity = u.life / 0.6;
      }
      if (tv) {
        const sway = Math.sin(t * 0.15) * 10;
        cam.position.set(AW / 2 + sway, 54, AH + 16); cam.lookAt(AW / 2, 0, AH / 2 + 3);
      } else {
        camPos.set(Math.max(14, Math.min(AW - 14, focus.x * S)), 21, Math.max(8, Math.min(AH - 2, focus.y * S)) + 11);
        if (!camInit) { cam.position.copy(camPos); camInit = true; } else cam.position.lerp(camPos, Math.min(1, dt * 6));
        cam.lookAt(cam.position.x, 0, cam.position.z - 10);
      }
      quality.frame();
      renderer.render(scene, cam);
    },
    destroy() { ro.disconnect(); renderer.dispose(); },
  };
}
