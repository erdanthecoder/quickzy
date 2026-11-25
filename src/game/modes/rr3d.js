// rr3d.js — Robot Run in 3D: a sunset city street, neon road lines, crates,
// spikes, glowing bolts, and your robot racing with the others in the lanes
// beside you. The running and jumping happen in robotrun.js; this draws it.

import { drawBlook } from '../arcade/engine.js';
import { preloadBlooks } from '../../ui/blooks.js';

const U = 2;                       // world units per metre
const LANE = 3.4;

function canvasTex(T, w, hh, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  draw(c.getContext('2d'), w, hh);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const glowTex = (T) => canvasTex(T, 64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const windowsTex = (T, seed) => canvasTex(T, 128, 256, (g, w, hh) => {
  g.fillStyle = '#1b1240'; g.fillRect(0, 0, w, hh);
  for (let y = 8; y < hh - 8; y += 16) for (let x = 8; x < w - 8; x += 18) {
    const r = Math.sin(x * 12.9 + y * 78.2 + seed) * 43758.5; const on = r - Math.floor(r);
    g.fillStyle = on > 0.55 ? (on > 0.85 ? '#ffd27a' : '#ff9ad5') : '#2a1f5a'; g.fillRect(x, y, 10, 9);
  }
});
const crateTex = (T) => canvasTex(T, 128, 128, (g, w) => {
  g.fillStyle = '#d98b3a'; g.fillRect(0, 0, w, w);
  g.strokeStyle = '#8a4f1a'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, w - 12);
  g.beginPath(); g.moveTo(12, 12); g.lineTo(w - 12, w - 12); g.moveTo(w - 12, 12); g.lineTo(12, w - 12); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = 2;
  for (let y = 20; y < w; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
});

export function createRun(T, canvas, { tv = false } = {}) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  scene.fog = new T.Fog(0xff8a6a, 40, 230);
  const cam = new T.PerspectiveCamera(tv ? 45 : 58, 1, 0.1, 1200);
  const glow = glowTex(T);

  // a sunset sky with a big sun
  const sky = new T.Mesh(new T.SphereGeometry(900, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vDir;
      void main(){
        float y = vDir.y;
        vec3 c = mix(vec3(1.0,0.55,0.35), vec3(0.95,0.28,0.45), smoothstep(0.0, 0.25, y));
        c = mix(c, vec3(0.20,0.10,0.42), smoothstep(0.25, 0.8, y));
        vec3 sunDir = normalize(vec3(0.0, 0.12, -1.0));
        float s = max(dot(vDir, sunDir), 0.0);
        c += vec3(1.0,0.85,0.5) * smoothstep(0.985, 0.992, s) + vec3(1.0,0.6,0.3) * pow(s, 18.0) * 0.6;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  scene.add(sky);
  scene.add(new T.HemisphereLight(0xffc0d0, 0x2a1650, 1.1));
  const sun = new T.DirectionalLight(0xffb27a, 2.2);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 120 });
  scene.add(sun); scene.add(sun.target);

  // the road: dark tarmac, yellow edges, dashes, which scroll by
  const roadTex = canvasTex(T, 256, 512, (g, w, hh) => {
    g.fillStyle = '#2a2140'; g.fillRect(0, 0, w, hh);
    for (let i = 0; i < 900; i++) { const v = 40 + Math.random() * 30; g.fillStyle = `rgb(${v},${v * 0.85},${v * 1.3})`; g.fillRect(Math.random() * w, Math.random() * hh, 2, 2); }
    g.fillStyle = '#ffcd1f'; g.fillRect(6, 0, 8, hh); g.fillRect(w - 14, 0, 8, hh);
    g.fillStyle = 'rgba(255,255,255,.75)';
    for (const x of [w * 0.33, w * 0.66]) for (let y = 0; y < hh; y += 128) g.fillRect(x - 3, y, 6, 64);
  });
  roadTex.wrapS = roadTex.wrapT = T.RepeatWrapping; roadTex.repeat.set(1, 40);
  const road = new T.Mesh(new T.PlaneGeometry(LANE * 3 + 2, 800), new T.MeshStandardMaterial({ map: roadTex, roughness: 0.6, metalness: 0.2 }));
  road.rotation.x = -Math.PI / 2; road.receiveShadow = true; scene.add(road);
  const pave = new T.Mesh(new T.PlaneGeometry(120, 800), new T.MeshStandardMaterial({ color: 0x3a2a5a, roughness: 0.9 }));
  pave.rotation.x = -Math.PI / 2; pave.position.y = -0.02; scene.add(pave);
  // glowing curbs
  const curbMat = new T.MeshBasicMaterial({ color: 0x59f0ff });
  const curbs = [-1, 1].map((sx) => { const m = new T.Mesh(new T.BoxGeometry(0.25, 0.25, 800), curbMat); m.position.set(sx * (LANE * 1.5 + 1), 0.12, 0); scene.add(m); return m; });

  // the city: rows of towers on both sides, recycled as you run
  const towerMats = [0, 1, 2, 3].map((i) => new T.MeshStandardMaterial({ map: windowsTex(T, i * 7), emissive: 0xffffff, emissiveMap: windowsTex(T, i * 7), emissiveIntensity: 0.5, roughness: 0.6 }));
  const towers = [];
  for (let i = 0; i < 60; i++) {
    const side = i % 2 ? 1 : -1; const hgt = 14 + ((i * 37) % 40);
    const w = 8 + (i * 13) % 8;
    const m = new T.Mesh(new T.BoxGeometry(w, hgt, 9), towerMats[i % 4]);
    m.userData = { side, slot: Math.floor(i / 2), hgt, off: 14 + ((i * 29) % 14) };
    scene.add(m); towers.push(m);
  }
  // street lamps
  const lampMat = new T.MeshStandardMaterial({ color: 0x22223a, metalness: 0.7 });
  const lamps = [];
  for (let i = 0; i < 16; i++) {
    const g = new T.Group(); const side = i % 2 ? 1 : -1;
    const pole = new T.Mesh(new T.CylinderGeometry(0.12, 0.15, 6, 8), lampMat); pole.position.y = 3; g.add(pole);
    const head = new T.Mesh(new T.SphereGeometry(0.35, 10, 8), new T.MeshBasicMaterial({ color: 0xffe9b0 })); head.position.set(-side * 0.6, 6, 0); g.add(head);
    const halo = new T.Sprite(new T.SpriteMaterial({ map: glow, color: 0xffd27a, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); halo.scale.set(3.5, 3.5, 1); halo.position.copy(head.position); g.add(halo);
    g.userData = { side, slot: Math.floor(i / 2) }; scene.add(g); lamps.push(g);
  }

  /* runners: a little robot cart with the blook riding it */
  const runners = new Map();
  const labelTex = (text, bg, fg) => canvasTex(T, 512, 96, (g2, w) => {
    g2.font = '900 44px Figtree, system-ui'; const tw = Math.min(w - 10, g2.measureText(text).width + 40);
    g2.fillStyle = bg; g2.beginPath(); g2.roundRect((w - tw) / 2, 14, tw, 68, 34); g2.fill();
    g2.fillStyle = fg; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(text, w / 2, 50);
  });
  function runnerFor(id, { blook, name, me = false, ghost = false }) {
    let r = runners.get(id);
    if (r) return r;
    const g = new T.Group(); scene.add(g);
    const op = ghost ? 0.55 : 1;
    const bodyMat = new T.MeshStandardMaterial({ color: 0xe8ecff, roughness: 0.3, metalness: 0.4, transparent: ghost, opacity: op });
    const body = new T.Mesh(new T.BoxGeometry(1.7, 0.7, 2.2), bodyMat); body.position.y = 0.75; body.castShadow = !ghost; g.add(body);
    const visor = new T.Mesh(new T.BoxGeometry(1.4, 0.2, 0.05), new T.MeshBasicMaterial({ color: 0x59f0ff, transparent: ghost, opacity: op })); visor.position.set(0, 0.85, -1.12); g.add(visor);
    const wheels = [];
    for (const [x, z] of [[-0.85, -0.7], [0.85, -0.7], [-0.85, 0.7], [0.85, 0.7]]) {
      const w = new T.Mesh(new T.CylinderGeometry(0.38, 0.38, 0.3, 16), new T.MeshStandardMaterial({ color: 0x17133f, roughness: 0.8, transparent: ghost, opacity: op }));
      w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); g.add(w); wheels.push(w);
    }
    const flame = new T.Sprite(new T.SpriteMaterial({ map: glow, color: 0x59f0ff, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    flame.position.set(0, 0.75, 1.6); flame.scale.set(2, 2, 1); g.add(flame);
    const bc = document.createElement('canvas'); bc.width = bc.height = 160;
    const btex = new T.CanvasTexture(bc); btex.colorSpace = T.SRGBColorSpace;
    const drawB = () => { const c2 = bc.getContext('2d'); c2.clearRect(0, 0, 160, 160); drawBlook(c2, blook, 80, 80, 150); btex.needsUpdate = true; };
    drawB(); preloadBlooks([blook]).then(drawB);
    const rider = new T.Sprite(new T.SpriteMaterial({ map: btex, transparent: true, opacity: op })); rider.scale.set(2.1, 2.1, 1); rider.position.y = 2.1; g.add(rider);
    const shield = new T.Mesh(new T.SphereGeometry(1.9, 20, 14), new T.MeshBasicMaterial({ color: 0x59f0ff, transparent: true, opacity: 0.18, wireframe: true })); shield.position.y = 1.4; g.add(shield);
    const label = new T.Sprite(new T.SpriteMaterial({ map: labelTex(name || '', me ? '#ffcd1f' : 'rgba(23,19,63,.85)', me ? '#17133f' : '#fff'), transparent: true, depthTest: false }));
    label.scale.set(5, 0.95, 1); label.position.y = 3.6; label.visible = !me || tv; label.renderOrder = 5; g.add(label);
    r = { g, wheels, flame, rider, shield, label, name, me };
    runners.set(id, r);
    return r;
  }
  function setRunner(id, st) {
    const r = runnerFor(id, st);
    if (st.name !== r.name) {
      r.name = st.name; r.label.material.map?.dispose();
      r.label.material.map = labelTex(st.name || '', r.me ? '#ffcd1f' : 'rgba(23,19,63,.85)', r.me ? '#17133f' : '#fff'); r.label.material.needsUpdate = true;
    }
    r.g.position.set(st.lane * LANE, st.y * U, -st.d * U);
    for (const w of r.wheels) w.rotation.x -= (st.speed || 8) * 0.05;
    r.rider.scale.set(2.1 / (st.squash || 1), 2.1 * (st.squash || 1), 1);
    r.rider.position.y = 2.1 + Math.sin(performance.now() / 45) * (st.y > 0 ? 0 : 0.04);
    r.flame.visible = Boolean(st.boost); r.flame.scale.setScalar(1.6 + Math.random() * 0.8);
    r.shield.visible = Boolean(st.shield); r.shield.rotation.y += 0.04;
    r.rider.material.opacity = st.blink ? 0.45 : (st.ghost ? 0.55 : 1);
  }
  function prune(keep) { for (const [id, r] of runners) if (!keep.has(id)) { scene.remove(r.g); runners.delete(id); } }

  /* the course: crates, spikes, bolts, power-ups */
  const crateMat = new T.MeshStandardMaterial({ map: crateTex(T), roughness: 0.8 });
  const spikeMat = new T.MeshStandardMaterial({ color: 0xe8ecff, metalness: 0.9, roughness: 0.2 });
  const boltMat = new T.MeshStandardMaterial({ color: 0xffcd1f, emissive: 0xffaa00, emissiveIntensity: 1.2 });
  const boltShape = new T.Shape(); [[0.15, -0.5], [-0.25, 0.05], [0, 0.05], [-0.15, 0.5], [0.25, -0.05], [0, -0.05]].forEach(([x, y], i) => (i ? boltShape.lineTo(x, y) : boltShape.moveTo(x, y)));
  const boltGeo = new T.ExtrudeGeometry(boltShape, { depth: 0.12, bevelEnabled: false }); boltGeo.scale(1.6, 1.6, 1.6);
  const items = new Map();
  function itemFor(o) {
    let m = items.get(o);
    if (m) return m;
    if (o.kind === 'crate') {
      m = new T.Group();
      for (let k = 0; k < o.h; k++) { const b = new T.Mesh(new T.BoxGeometry(o.w * U, U * 0.98, o.w * U * 1.2), crateMat); b.position.y = U * (k + 0.5); b.castShadow = true; m.add(b); }
    } else if (o.kind === 'spike') {
      m = new T.Group();
      for (let k = 0; k < 3; k++) { const c = new T.Mesh(new T.ConeGeometry(0.45, 1.4, 8), spikeMat); c.position.set((k - 1) * 0.9, 0.7, 0); c.castShadow = true; m.add(c); }
    } else if (o.kind === 'bolt') {
      m = new T.Group(); const b = new T.Mesh(boltGeo, boltMat); m.add(b);
      const h2 = new T.Sprite(new T.SpriteMaterial({ map: glow, color: 0xffcd1f, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); h2.scale.set(2.4, 2.4, 1); m.add(h2);
    } else {
      const c = o.kind === 'shield' ? 0x59f0ff : 0xff4772;
      m = new T.Group(); m.add(new T.Mesh(new T.IcosahedronGeometry(0.6, 1), new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2, flatShading: true })));
      const h2 = new T.Sprite(new T.SpriteMaterial({ map: glow, color: c, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); h2.scale.set(3, 3, 1); m.add(h2);
    }
    scene.add(m); items.set(o, m);
    return m;
  }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(1, r.width); const hh = Math.max(1, r.height);
    renderer.setSize(w, hh, false); cam.aspect = w / hh; cam.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement);
  let t = 0;
  const camPos = new T.Vector3(); let camInit = false;

  return {
    setRunner, prune,
    render(dt, { d, y = 0, obstacles = [], boost = false, lane = 0 }) {
      t += dt;
      const z = -d * U;
      // everything that scrolls follows the runner
      road.position.z = z - 300; roadTex.offset.y = (d * U) / 20; pave.position.z = z - 300;
      curbs.forEach((c) => { c.position.z = z - 300; });
      const seg = 22;
      for (const m of towers) {
        const u = m.userData; const base = Math.floor(-z / seg);
        const slot = base + ((u.slot - base) % 30 + 30) % 30 - 3;
        m.position.set(u.side * (LANE * 1.5 + 1 + u.off), u.hgt / 2, -slot * seg);
      }
      for (const g of lamps) {
        const u = g.userData; const base = Math.floor(-z / 26);
        const slot = base + ((u.slot - base) % 8 + 8) % 8 - 1;
        g.position.set(u.side * (LANE * 1.5 + 1.6), 0, -slot * 26);
      }
      // course items near the camera
      const keep = new Set();
      for (const o of obstacles) {
        if (o.got) continue;
        keep.add(o);
        const m = itemFor(o);
        const oz = -(o.x + (o.w || 0) / 2) * U;
        if (o.kind === 'crate' || o.kind === 'spike') m.position.set(lane * LANE, 0, oz);
        else { m.position.set(lane * LANE, o.y * U + Math.sin(t * 3 + o.x) * 0.2, oz); m.rotation.y += dt * 3; }
        if (o.hit && o.kind === 'crate') m.rotation.z = Math.min(0.5, m.rotation.z + dt * 3);
      }
      for (const [o, m] of items) if (!keep.has(o)) { scene.remove(m); items.delete(o); }
      sun.position.set(6, 30, z + 10); sun.target.position.set(0, 0, z - 10);
      if (tv) {
        camPos.set(4.8, 6.2, z + 11);
        if (!camInit) { cam.position.copy(camPos); camInit = true; } else cam.position.lerp(camPos, Math.min(1, dt * 3));
        cam.lookAt(-1.5, 1.4, z - 7);
      } else {
        camPos.set(lane * LANE + 2.2, 4.4 + y * U * 0.35, z + 9.5);
        if (!camInit) { cam.position.copy(camPos); camInit = true; } else cam.position.lerp(camPos, Math.min(1, dt * 8));
        cam.lookAt(lane * LANE, 1.4 + y * U * 0.3, z - 8);
        const fov = boost ? 70 : 58; cam.fov += (fov - cam.fov) * 0.08; cam.updateProjectionMatrix();
      }
      sky.position.copy(cam.position);
      renderer.render(scene, cam);
    },
    destroy() { ro.disconnect(); renderer.dispose(); },
  };
}
