// gp3d.js — the 3D world for Grand Prix (three.js): a sunny race circuit
// with asphalt, red and white kerbs, run-off, tyre walls with Quickzy
// boards, grandstands full of fans, the pit building, the start gantry,
// trees, and open-wheel race cars with turning wheels. One unit = one metre.

import { TRACK, LAP, TRACK_WIDTH, trackAt } from './grandprix.js';

const HALF = TRACK_WIDTH / 2;

function canvasTex(T, w, hh, draw, { repeat = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  draw(c.getContext('2d'), w, hh);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

const asphaltTex = (T) => canvasTex(T, 256, 256, (g, w, hh) => {
  g.fillStyle = '#4a4c51'; g.fillRect(0, 0, w, hh);
  for (let i = 0; i < 9000; i++) { const v = 50 + Math.random() * 60; g.fillStyle = `rgba(${v},${v},${v + 4},.55)`; g.fillRect(Math.random() * w, Math.random() * hh, 1.5, 1.5); }
  // rubber laid down on the racing line
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0.25, 'rgba(20,20,22,0)'); gr.addColorStop(0.5, 'rgba(20,20,22,.28)'); gr.addColorStop(0.75, 'rgba(20,20,22,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, hh);
  // white edge lines
  g.fillStyle = '#f2f2f2'; g.fillRect(4, 0, 6, hh); g.fillRect(w - 10, 0, 6, hh);
}, { repeat: [1, 1] });
const kerbTex = (T) => canvasTex(T, 64, 64, (g, w, hh) => {
  g.fillStyle = '#e10600'; g.fillRect(0, 0, w, hh / 2);
  g.fillStyle = '#f4f4f4'; g.fillRect(0, hh / 2, w, hh / 2);
}, { repeat: [1, 1] });
const runoffTex = (T) => canvasTex(T, 128, 128, (g, w, hh) => {
  g.fillStyle = '#8f8b84'; g.fillRect(0, 0, w, hh);
  for (let i = 0; i < 2600; i++) { const v = 120 + Math.random() * 60; g.fillStyle = `rgba(${v},${v - 4},${v - 10},.5)`; g.fillRect(Math.random() * w, Math.random() * hh, 1.5, 1.5); }
}, { repeat: [1, 1] });
const grassTex = (T) => canvasTex(T, 256, 256, (g, w, hh) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#4f9a3f' : '#468e38'; g.fillRect(0, (i * hh) / 8, w, hh / 8); }
  for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(${30 + Math.random() * 40},${90 + Math.random() * 60},${30 + Math.random() * 30},.35)`; g.fillRect(Math.random() * w, Math.random() * hh, 1, 2); }
}, { repeat: [60, 60] });
const boardTex = (T) => canvasTex(T, 1024, 64, (g, w, hh) => {
  const ads = [['#6b4cff', '#fff', 'QUICKZY'], ['#17133f', '#ffcd1f', 'QUICKZY PRO'], ['#ffcd1f', '#17133f', 'ANSWER FAST'], ['#ff4772', '#fff', 'QUICKZY GP']];
  ads.forEach(([bg, fg, text], i) => {
    g.fillStyle = bg; g.fillRect((i * w) / 4, 0, w / 4, hh);
    g.fillStyle = fg; g.font = '900 38px Figtree, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, (i * w) / 4 + w / 8, hh / 2 + 2);
  });
}, { repeat: [1, 1] });
const crowdTex = (T) => canvasTex(T, 512, 256, (g, w, hh) => {
  g.fillStyle = '#2b2f3a'; g.fillRect(0, 0, w, hh);
  const cols = ['#e10600', '#ffd400', '#1e41ff', '#ffffff', '#ff8000', '#00a19c', '#ff4fa3', '#6b4cff', '#f0c9a0', '#8a5a3c'];
  for (let row = 0; row < 16; row++) {
    for (let k = 0; k < 64; k++) {
      const x = k * 8 + (row % 2) * 4 + Math.random() * 2; const y = row * 16 + 6;
      g.fillStyle = cols[Math.floor(Math.random() * cols.length)]; g.fillRect(x, y + 4, 6, 7);
      g.fillStyle = '#f0c9a0'; g.beginPath(); g.arc(x + 3, y + 1, 2.6, 0, Math.PI * 2); g.fill();
    }
  }
}, { repeat: [6, 1] });
const glowTex = (T) => canvasTex(T, 64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,200,160,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
function labelTex(T, text, bg = 'rgba(23,19,63,.85)') {
  return canvasTex(T, 256, 64, (g, w, hh) => {
    g.font = '800 30px Figtree, system-ui, sans-serif';
    const tw = Math.min(w - 8, g.measureText(text).width + 28);
    g.fillStyle = bg; g.beginPath(); g.roundRect((w - tw) / 2, 8, tw, hh - 16, 16); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, hh / 2 + 1);
  });
}

/** A ribbon along the lap, between two lateral offsets, at a height. */
function ribbon(T, from, to, y, mat, { every = 1, vPerM = 1 / 8, only = null } = {}) {
  const pos = []; const uv = []; const idx = [];
  const { N } = TRACK;
  let vi = 0; let prevOn = false;
  for (let k = 0; k <= N; k += every) {
    const i = k % N;
    const on = !only || only(i);
    if (on) {
      const m = k * (LAP / N);
      const a = trackAt(m, from); const b = trackAt(m, to);
      pos.push(a.x, y, a.z, b.x, y, b.z);
      uv.push(0, m * vPerM, 1, m * vPerM);
      if (prevOn) { const s = vi - 2; idx.push(s, s + 1, s + 2, s + 1, s + 3, s + 2); }
      vi += 2;
    }
    prevOn = on;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  mat.side = T.DoubleSide;
  const mesh = new T.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** A vertical wall along the lap, at one lateral offset. */
function wall(T, lateral, height, mat, { every = 2, vPerM = 1 / 40, flip = false } = {}) {
  const pos = []; const uv = []; const idx = [];
  const { N } = TRACK;
  let vi = 0;
  for (let k = 0; k <= N; k += every) {
    const m = (k % N) * (LAP / N) + (k >= N ? LAP : 0);
    const a = trackAt(m, lateral);
    pos.push(a.x, 0, a.z, a.x, height, a.z);
    const u = (flip ? -m : m) * vPerM;
    uv.push(u, 0, u, 1);
    if (vi) { const s = vi - 2; idx.push(s, s + 2, s + 1, s + 1, s + 2, s + 3); }
    vi += 2;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new T.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

/* ------------------------------------------------------------- the car */

function buildCar(T, mats, colour) {
  const g = new T.Group();
  const body = new T.MeshStandardMaterial({ color: colour, metalness: 0.45, roughness: 0.32 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m;
  };
  // the car points along +z; the floor, tub, nose, sidepods, engine cover
  add(new T.BoxGeometry(1.5, 0.08, 4.6), mats.carbon, 0, 0.12, -0.1);
  const tub = new T.CylinderGeometry(0.42, 0.5, 2.6, 12); tub.rotateX(Math.PI / 2); tub.scale(1.05, 0.72, 1);
  add(tub, body, 0, 0.45, 0.2);
  const nose = new T.CylinderGeometry(0.12, 0.38, 1.7, 12); nose.rotateX(Math.PI / 2); nose.scale(1.2, 0.6, 1);
  add(nose, body, 0, 0.36, 2.25);
  for (const s of [-1, 1]) {
    add(new T.BoxGeometry(0.55, 0.42, 1.7), body, s * 0.68, 0.36, -0.25);
    add(new T.BoxGeometry(0.5, 0.36, 0.06), mats.carbon, s * 0.68, 0.42, 0.62);
  }
  const cover = new T.CylinderGeometry(0.16, 0.42, 1.9, 12); cover.rotateX(-Math.PI / 2); cover.scale(1, 1.25, 1);
  add(cover, body, 0, 0.62, -1.5);
  add(new T.BoxGeometry(0.04, 0.42, 1.2), body, 0, 0.92, -1.7);
  // airbox, cockpit, halo, driver
  add(new T.BoxGeometry(0.32, 0.3, 0.3), mats.carbon, 0, 0.95, -0.55);
  add(new T.SphereGeometry(0.2, 16, 12), mats.helmet, 0, 0.82, -0.05);
  add(new T.BoxGeometry(0.3, 0.06, 0.2), mats.visor, 0, 0.84, 0.12);
  const halo = new T.TorusGeometry(0.32, 0.035, 8, 20, Math.PI); halo.rotateX(-Math.PI / 2);
  add(halo, mats.carbon, 0, 0.92, 0.05);
  add(new T.CylinderGeometry(0.03, 0.03, 0.3, 6), mats.carbon, 0, 0.78, 0.38);
  // wings
  add(new T.BoxGeometry(1.9, 0.04, 0.42), mats.carbon, 0, 0.12, 2.95);
  add(new T.BoxGeometry(1.9, 0.03, 0.22), body, 0, 0.2, 2.88, -0.25);
  for (const s of [-1, 1]) add(new T.BoxGeometry(0.03, 0.26, 0.55), body, s * 0.95, 0.2, 2.92);
  add(new T.BoxGeometry(1.15, 0.05, 0.42), mats.carbon, 0, 1.0, -2.35);
  add(new T.BoxGeometry(1.15, 0.04, 0.24), body, 0, 1.12, -2.3, -0.3);
  for (const s of [-1, 1]) add(new T.BoxGeometry(0.04, 0.55, 0.7), body, s * 0.6, 0.85, -2.3);
  add(new T.BoxGeometry(0.06, 0.45, 0.08), mats.carbon, 0, 0.7, -2.15);
  // the rain light, red
  const rain = add(new T.BoxGeometry(0.16, 0.08, 0.04), mats.redLight, 0, 0.38, -2.5);
  void rain;
  // wheels: rubber, rims, a turning spoke pattern
  const wheels = [];
  const tyre = new T.CylinderGeometry(0.36, 0.36, 0.38, 24); tyre.rotateZ(Math.PI / 2);
  const tyreR = new T.CylinderGeometry(0.36, 0.36, 0.42, 24); tyreR.rotateZ(Math.PI / 2);
  const rim = new T.CylinderGeometry(0.22, 0.22, 0.4, 10); rim.rotateZ(Math.PI / 2);
  for (const [x, z, geo] of [[-0.85, 1.75, tyre], [0.85, 1.75, tyre], [-0.86, -1.55, tyreR], [0.86, -1.55, tyreR]]) {
    const w = new T.Group(); w.position.set(x, 0.36, z);
    const t = new T.Mesh(geo, mats.tyre); t.castShadow = true; w.add(t);
    const r = new T.Mesh(rim, mats.rim); w.add(r);
    const sp = new T.Mesh(new T.BoxGeometry(0.42, 0.06, 0.34), mats.rimDark); w.add(sp);
    g.add(w); wheels.push(w);
    // suspension arms
    add(new T.BoxGeometry(Math.abs(x) - 0.3, 0.03, 0.05), mats.carbon, x / 2, 0.42, z);
  }
  // the exhaust glow when boosting
  const flame = new T.Sprite(new T.SpriteMaterial({ map: mats.glow, color: 0x6fd6ff, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
  flame.position.set(0, 0.55, -2.55); flame.scale.set(1.4, 1.4, 1); flame.visible = false; g.add(flame);
  return { g, wheels, flame };
}

/* ------------------------------------------------------------- the world */

export function createCircuit(T, canvas, { tv = false } = {}) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.fog = new T.Fog(0xcfe0ee, 300, 1800);
  const cam = new T.PerspectiveCamera(tv ? 40 : 62, 1, 0.1, 6000);

  // a clear summer sky
  const sunDir = new T.Vector3(0.45, 0.55, -0.7).normalize();
  const sky = new T.Mesh(new T.SphereGeometry(4000, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false, uniforms: { sun: { value: sunDir } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 sun;
      void main(){
        float y = vDir.y;
        vec3 c = mix(vec3(0.86,0.91,0.96), vec3(0.42,0.64,0.92), smoothstep(0.0, 0.35, y));
        c = mix(c, vec3(0.18,0.38,0.78), smoothstep(0.35, 0.95, y));
        float s = max(dot(vDir, sun), 0.0);
        c += vec3(1.0,0.9,0.7) * pow(s, 8.0) * 0.25 + vec3(1.0,0.98,0.9) * pow(s, 1200.0) * 4.0;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  scene.add(sky);
  scene.add(new T.HemisphereLight(0xcfe3ff, 0x5a6b3a, 1.1));
  const sun = new T.DirectionalLight(0xfff1dc, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 });
  sun.shadow.bias = -0.0005;
  scene.add(sun); scene.add(sun.target);

  const mats = {
    carbon: new T.MeshStandardMaterial({ color: 0x15161a, metalness: 0.4, roughness: 0.45 }),
    tyre: new T.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 }),
    rim: new T.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.9, roughness: 0.3 }),
    rimDark: new T.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.6, roughness: 0.4 }),
    helmet: new T.MeshStandardMaterial({ color: 0xffd400, metalness: 0.2, roughness: 0.25 }),
    visor: new T.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.1 }),
    redLight: new T.MeshBasicMaterial({ color: 0xff2a2a }),
    glow: glowTex(T),
    white: new T.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }),
    steel: new T.MeshStandardMaterial({ color: 0xb9bec7, metalness: 0.85, roughness: 0.3 }),
    glass: new T.MeshStandardMaterial({ color: 0x8fb6d8, metalness: 0.6, roughness: 0.15 }),
  };
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  // the ground
  const ground = new T.Mesh(new T.PlaneGeometry(6000, 6000), keep(new T.MeshStandardMaterial({ map: grassTex(T), roughness: 1 })));
  ground.rotation.x = -Math.PI / 2; ground.position.set(400, -0.05, 400); ground.receiveShadow = true;
  scene.add(ground);

  // run-off, the track, kerbs in the corners, the walls
  const corner = (i) => Math.abs(TRACK.K[i]) > 0.007 || Math.abs(TRACK.K[(i + 3) % TRACK.N]) > 0.007 || Math.abs(TRACK.K[(i - 3 + TRACK.N) % TRACK.N]) > 0.007;
  scene.add(ribbon(T, -HALF - 11, HALF + 11, 0.0, keep(new T.MeshStandardMaterial({ map: runoffTex(T), roughness: 0.95 })), { vPerM: 1 / 10 }));
  scene.add(ribbon(T, -HALF, HALF, 0.02, keep(new T.MeshStandardMaterial({ map: asphaltTex(T), roughness: 0.85, metalness: 0.05 })), { vPerM: 1 / 14 }));
  const kerbMat = keep(new T.MeshStandardMaterial({ map: kerbTex(T), roughness: 0.6 }));
  scene.add(ribbon(T, HALF, HALF + 1.6, 0.06, kerbMat, { vPerM: 1 / 3, only: corner }));
  scene.add(ribbon(T, -HALF - 1.6, -HALF, 0.06, kerbMat, { vPerM: 1 / 3, only: corner }));
  const boards = keep(new T.MeshStandardMaterial({ map: boardTex(T), roughness: 0.7, side: T.DoubleSide }));
  boards.map.wrapS = T.RepeatWrapping;
  scene.add(wall(T, HALF + 12, 1.1, boards, { vPerM: 1 / 48, flip: true }));
  scene.add(wall(T, -HALF - 12, 1.1, boards, { vPerM: 1 / 48 }));
  // fences above the walls
  const fence = keep(new T.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.6, roughness: 0.5, transparent: true, opacity: 0.35, side: T.DoubleSide }));
  const f1 = wall(T, HALF + 12.2, 3.2, fence); f1.position.y = 1.1; f1.castShadow = false; scene.add(f1);
  const f2 = wall(T, -HALF - 12.2, 3.2, fence); f2.position.y = 1.1; f2.castShadow = false; scene.add(f2);

  // the start line, chequered
  const s0 = trackAt(0);
  const chk = canvasTex(T, 128, 16, (g, w, hh) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#fff' : '#111'; g.fillRect(i * 8, j * 8, 8, 8); } });
  // flat paint on the road, across the track
  const paint = (geo, mat, m, lateral) => {
    const p = trackAt(m, lateral);
    const g = new T.Group(); g.position.set(p.x, 0.05, p.z); g.rotation.y = Math.atan2(p.hx, p.hz);
    const mesh = new T.Mesh(geo, mat); mesh.rotation.x = -Math.PI / 2; mesh.receiveShadow = true; g.add(mesh);
    scene.add(g);
  };
  paint(new T.PlaneGeometry(TRACK_WIDTH, 1.6), keep(new T.MeshStandardMaterial({ map: chk, roughness: 0.7 })), 0, 0);
  // grid boxes
  for (let k = 0; k < 12; k++) paint(new T.PlaneGeometry(2.4, 0.18), mats.white, -8 * Math.floor(k / 2) - 4 * (k % 2) + 3.2, k % 2 ? -2.6 : 2.6);

  // things placed beside the track, facing it
  const place = (obj, m, lateral, y = 0) => {
    const p = trackAt(m, lateral);
    obj.position.set(p.x, y, p.z);
    obj.rotation.y = Math.atan2(p.hx, p.hz);
    scene.add(obj);
    return obj;
  };

  // the start gantry with its five lights
  const gantry = new T.Group();
  for (const s of [-1, 1]) { const post = new T.Mesh(new T.BoxGeometry(0.6, 8, 0.6), mats.steel); post.position.set(s * (HALF + 3), 4, 0); post.castShadow = true; gantry.add(post); }
  const beam = new T.Mesh(new T.BoxGeometry(TRACK_WIDTH + 7, 1.6, 0.7), keep(new T.MeshStandardMaterial({ color: 0x17133f, roughness: 0.5 })));
  beam.position.set(0, 7.4, 0); beam.castShadow = true; gantry.add(beam);
  const banner = new T.Mesh(new T.PlaneGeometry(TRACK_WIDTH + 6, 1.3), keep(new T.MeshBasicMaterial({ map: canvasTex(T, 1024, 96, (g, w, hh) => {
    g.fillStyle = '#17133f'; g.fillRect(0, 0, w, hh); g.fillStyle = '#ffcd1f'; g.font = '900 64px Figtree, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('QUICKZY GRAND PRIX', w / 2, hh / 2 + 3);
  }) })));
  banner.position.set(0, 7.4, -0.37); banner.rotation.y = Math.PI; gantry.add(banner);
  const lights = [];
  for (let i = 0; i < 5; i++) {
    const l = new T.Mesh(new T.SphereGeometry(0.28, 12, 8), keep(new T.MeshBasicMaterial({ color: 0x330000 })));
    l.position.set(-2.4 + i * 1.2, 6.1, -0.3); gantry.add(l); lights.push(l);
  }
  place(gantry, 2, 0);

  // grandstands along the main straight and at turn one
  const crowd = keep(new T.MeshStandardMaterial({ map: crowdTex(T), roughness: 0.9 }));
  const stand = (len) => {
    const g = new T.Group();
    for (let r = 0; r < 8; r++) {
      const step = new T.Mesh(new T.BoxGeometry(len, 0.9, 1.6), r % 2 ? crowd : crowd);
      step.position.set(0, 0.45 + r * 0.9, r * 1.6); step.castShadow = true; step.receiveShadow = true; g.add(step);
    }
    const roof = new T.Mesh(new T.BoxGeometry(len + 2, 0.3, 15), keep(new T.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 })));
    roof.position.set(0, 12, 6); roof.rotation.x = -0.08; roof.castShadow = true; g.add(roof);
    for (const x of [-len / 2, 0, len / 2]) { const p = new T.Mesh(new T.BoxGeometry(0.4, 12, 0.4), mats.steel); p.position.set(x, 6, 13); g.add(p); }
    return g;
  };
  for (const m of [160, 320, 480]) place(stand(140), m, HALF + 16, 0).rotateY(-Math.PI / 2);
  place(stand(90), 830, -HALF - 16, 0).rotateY(Math.PI / 2);
  place(stand(110), 2350, HALF + 16, 0).rotateY(-Math.PI / 2);

  // the pit building and garages on the other side of the straight
  const pits = new T.Group();
  const building = new T.Mesh(new T.BoxGeometry(320, 9, 18), keep(new T.MeshStandardMaterial({ color: 0xe9ecf1, roughness: 0.6 })));
  building.position.set(0, 4.5, 9); building.castShadow = true; building.receiveShadow = true; pits.add(building);
  const glass = new T.Mesh(new T.BoxGeometry(320, 3, 0.3), mats.glass); glass.position.set(0, 7, -0.1); pits.add(glass);
  const garageCols = [0xe10600, 0x1e41ff, 0x00a19c, 0xff8000, 0x2b2d42, 0x006f62, 0xffd400, 0x9b59ff, 0xff4fa3, 0x6b4cff];
  for (let i = 0; i < 20; i++) {
    const door = new T.Mesh(new T.BoxGeometry(12, 4.4, 0.2), keep(new T.MeshStandardMaterial({ color: garageCols[i % garageCols.length], roughness: 0.5 })));
    door.position.set(-150 + i * 15.8, 2.3, -0.12); pits.add(door);
  }
  place(pits, 300, -HALF - 26, 0).rotateY(Math.PI / 2);
  const pitWall = new T.Mesh(new T.BoxGeometry(330, 1.2, 0.6), boards);
  place(pitWall, 300, -HALF - 13.5, 0.6).rotateY(Math.PI / 2);

  // trees, away from the track
  const far = (x, z) => {
    for (let i = 0; i < TRACK.N; i += 5) { const dx = TRACK.X[i] - x; const dz = TRACK.Z[i] - z; if (dx * dx + dz * dz < 55 * 55) return false; }
    return true;
  };
  const spots = [];
  let tries = 0;
  const minX = Math.min(...TRACK.X) - 400; const maxX = Math.max(...TRACK.X) + 400;
  const minZ = Math.min(...TRACK.Z) - 400; const maxZ = Math.max(...TRACK.Z) + 400;
  while (spots.length < 700 && tries < 6000) {
    tries += 1;
    const x = minX + Math.random() * (maxX - minX); const z = minZ + Math.random() * (maxZ - minZ);
    if (far(x, z)) spots.push([x, z, 0.7 + Math.random() * 0.8]);
  }
  const trunks = new T.InstancedMesh(new T.CylinderGeometry(0.35, 0.5, 4, 6), keep(new T.MeshStandardMaterial({ color: 0x5a3b22, roughness: 1 })), spots.length);
  const crowns = new T.InstancedMesh(new T.IcosahedronGeometry(3.4, 1), keep(new T.MeshStandardMaterial({ color: 0x3d7a33, roughness: 0.95, flatShading: true })), spots.length);
  const pines = new T.InstancedMesh(new T.ConeGeometry(3, 9, 7), keep(new T.MeshStandardMaterial({ color: 0x2c5e2e, roughness: 0.95, flatShading: true })), spots.length);
  const mtx = new T.Matrix4(); const q = new T.Quaternion(); const sc = new T.Vector3(); const ps = new T.Vector3(); const hide = new T.Matrix4().makeScale(0, 0, 0);
  spots.forEach(([x, z, s], i) => {
    sc.set(s, s, s); q.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.random() * 6);
    mtx.compose(ps.set(x, 2 * s, z), q, sc); trunks.setMatrixAt(i, mtx);
    if (i % 3) { mtx.compose(ps.set(x, 6 * s, z), q, sc); crowns.setMatrixAt(i, mtx); pines.setMatrixAt(i, hide); } else { mtx.compose(ps.set(x, 7 * s, z), q, sc); pines.setMatrixAt(i, mtx); crowns.setMatrixAt(i, hide); }
  });
  for (const im of [trunks, crowns, pines]) { im.castShadow = true; scene.add(im); }

  // far hills all around
  const hills = new T.Group();
  const hillMat = keep(new T.MeshStandardMaterial({ color: 0x5f8a58, roughness: 1, flatShading: true }));
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2; const r = 1700 + Math.random() * 500;
    const hill = new T.Mesh(new T.SphereGeometry(260 + Math.random() * 200, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    hill.scale.y = 0.35 + Math.random() * 0.25;
    hill.position.set(350 + Math.cos(a) * r, -10, 350 + Math.sin(a) * r);
    hills.add(hill);
  }
  scene.add(hills);

  /* --------------------------------------------------------------- cars */
  const cars = new Map();
  function carFor(id, colour, label) {
    let c = cars.get(id);
    if (!c) {
      c = buildCar(T, mats, new T.Color(colour));
      c.spin = 0; c.label = null; c.text = '';
      scene.add(c.g);
      cars.set(id, c);
    }
    if (label !== c.text) {
      c.text = label;
      if (c.label) { c.g.remove(c.label); c.label.material.map.dispose(); c.label.material.dispose(); c.label = null; }
      if (label) {
        c.label = new T.Sprite(new T.SpriteMaterial({ map: labelTex(T, label), depthTest: false, transparent: true }));
        c.label.scale.set(6, 1.5, 1); c.label.position.set(0, 2.6, 0); c.label.renderOrder = 10; c.g.add(c.label);
      }
    }
    return c;
  }
  function removeCar(id) {
    const c = cars.get(id);
    if (!c) return;
    scene.remove(c.g);
    c.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    if (c.label) { c.label.material.map.dispose(); c.label.material.dispose(); }
    cars.delete(id);
  }
  function placeCar(c, m, lateral, v, dt, { boost = false } = {}) {
    const p = trackAt(m, lateral);
    c.g.position.set(p.x, 0, p.z);
    c.g.rotation.set(0, Math.atan2(p.hx, p.hz), 0);
    // leaning on the springs in the corners, nose dipping under braking
    c.g.rotateZ(Math.max(-0.05, Math.min(0.05, p.k * v * 0.25)));
    c.spin += (v / 0.36) * dt;
    for (const w of c.wheels) w.rotation.x = c.spin;
    for (const w of c.wheels.slice(0, 2)) w.rotation.y = Math.max(-0.3, Math.min(0.3, p.k * 18));
    c.flame.visible = boost;
    if (boost) { const s = 1.1 + Math.random() * 0.6; c.flame.scale.set(s, s, 1); }
    c.pos = p; c.m = m;
  }

  /* ------------------------------------------------------------- camera */
  const camPos = new T.Vector3(); const look = new T.Vector3(); const smooth = new T.Vector3(); const smoothLook = new T.Vector3();
  let first = true;
  let tvSpot = null;
  function camera(kind, car, v, t, dt) {
    if (!car) {
      const p = trackAt(-30, 0);
      camPos.set(p.x - p.hz * 20, 6, p.z + p.hx * 20); look.set(s0.x, 2, s0.z);
      cam.fov = 45;
    } else {
      const p = car.pos || trackAt(0);
      const fx = p.hx; const fz = p.hz; const lx = -fz; const lz = fx;
      const at = car.g.position;
      if (kind === 'chase') {
        camPos.set(at.x - fx * 8.2, 2.7, at.z - fz * 8.2); look.set(at.x + fx * 12, 0.9, at.z + fz * 12);
        cam.fov = 60 + Math.min(14, v * 0.15);
      } else if (kind === 'tcam') {
        camPos.set(at.x - fx * 0.2, 1.35, at.z - fz * 0.2); look.set(at.x + fx * 20, 0.8, at.z + fz * 20);
        cam.fov = 68 + Math.min(10, v * 0.1);
      } else if (kind === 'far') {
        camPos.set(at.x - fx * 22 + lx * 6, 9, at.z - fz * 22 + lz * 6); look.set(at.x + fx * 10, 0.5, at.z + fz * 10);
        cam.fov = 55;
      } else if (kind === 'heli') {
        camPos.set(at.x - fx * 40 + lx * 30, 45, at.z - fz * 40 + lz * 30); look.set(at.x + fx * 15, 0, at.z + fz * 15);
        cam.fov = 40;
      } else if (kind === 'front') {
        camPos.set(at.x + fx * 14 + lx * 3, 1.2, at.z + fz * 14 + lz * 3); look.set(at.x, 0.7, at.z);
        cam.fov = 40;
      } else {
        // trackside: a fixed camera ahead, panning as the car goes by
        if (!tvSpot || Math.hypot(tvSpot.x - at.x, tvSpot.z - at.z) > 140) {
          const ahead = trackAt((car.m ?? 0) + 90, 0);
          const side = Math.random() < 0.5 ? 1 : -1;
          tvSpot = { x: ahead.x - ahead.hz * (HALF + 8) * side, z: ahead.z + ahead.hx * (HALF + 8) * side };
          first = true;
        }
        camPos.set(tvSpot.x, 3.2, tvSpot.z); look.set(at.x, 0.8, at.z);
        cam.fov = 30;
      }
      if (kind !== 'tv') tvSpot = null;
    }
    if (first) { smooth.copy(camPos); smoothLook.copy(look); first = false; }
    else {
      const k = kind === 'tcam' ? 1 : Math.min(1, dt * (kind === 'chase' ? 9 : 4));
      smooth.lerp(camPos, k); smoothLook.lerp(look, Math.min(1, dt * 12));
    }
    // a little shake at top speed
    const shake = kind === 'chase' || kind === 'tcam' ? Math.min(1, v / 90) * 0.025 : 0;
    cam.position.copy(smooth); cam.position.y += Math.sin(t * 47) * shake;
    cam.lookAt(smoothLook);
    cam.updateProjectionMatrix();
  }

  /* -------------------------------------------------------------- render */
  let t0 = 0;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)); const hh = Math.max(1, Math.round(r.height));
    renderer.setSize(w, hh, false);
    cam.aspect = w / hh; cam.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  function render(dt, focus) {
    t0 += dt;
    // the start lights: on one by one, then out
    const on = Math.min(5, Math.floor(t0 * 2.2));
    lights.forEach((l, i) => l.material.color.setHex(t0 < 2.6 && i < on ? 0xff1a1a : 0x330000));
    sun.position.set(focus.x + sunDir.x * 200, sunDir.y * 200, focus.z + sunDir.z * 200);
    sun.target.position.set(focus.x, 0, focus.z);
    sky.position.set(focus.x, 0, focus.z);
    renderer.render(scene, cam);
  }
  function cut() { first = true; tvSpot = null; }
  function destroy() {
    ro.disconnect();
    for (const id of [...cars.keys()]) removeCar(id);
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of disposables) { if (m.map) m.map.dispose(); m.dispose(); }
    renderer.dispose();
  }
  return { cam, cars, carFor, removeCar, placeCar, camera, render, cut, destroy };
}
