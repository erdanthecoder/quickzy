// train3d.js — the 3D world for Train Travel (three.js): golden-hour hills,
// forests and mountains, five parallel tracks, steam trains with turning
// wheels and real smoke. Used from the cab (players) and by the camera car
// on the big screen.

export const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
export const M_PER_UNIT = 4;                // metres in one world unit
export const LANE = 7;                      // units between tracks
const CHUNK = 100;

/* ------------------------------------------------------------- helpers */

function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function noise2(x, z) {
  const xi = Math.floor(x); const zi = Math.floor(z); const xf = x - xi; const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf); const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi); const b = hash2(xi + 1, zi); const c = hash2(xi, zi + 1); const d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => noise2(x, z) * 0.55 + noise2(x * 2.1, z * 2.1) * 0.28 + noise2(x * 4.3, z * 4.3) * 0.17;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The line the tracks follow: gentle curves. */
export const curveX = (z) => 22 * Math.sin(z * 0.0042) + 38 * Math.sin(z * 0.0011 + 1.3);
const curveDX = (z) => 22 * 0.0042 * Math.cos(z * 0.0042) + 38 * 0.0011 * Math.cos(z * 0.0011 + 1.3);
/** Ground height: flat by the tracks, rolling hills, then mountains. */
function groundY(x, z) {
  const d = Math.abs(x - curveX(z));
  const hills = smooth(30, 80, d) * (fbm(x * 0.012, z * 0.012) * 42 + fbm(x * 0.05, z * 0.05) * 6);
  const mountains = smooth(160, 420, d) * (fbm(x * 0.004 + 9, z * 0.004) * 260 + 40);
  return hills + mountains - 0.1;
}

function canvasTex(T, w, hh, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  draw(c.getContext('2d'), w, hh);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const puffTex = (T) => canvasTex(T, 128, 128, (g, w) => {
  for (let i = 0; i < 18; i++) {
    const x = w / 2 + (Math.random() - 0.5) * w * 0.4; const y = w / 2 + (Math.random() - 0.5) * w * 0.4; const r = w * (0.14 + Math.random() * 0.2);
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }
});
const glowTex = (T, inner = 'rgba(255,248,220,1)', mid = 'rgba(255,200,120,.35)') => canvasTex(T, 64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, inner); gr.addColorStop(0.3, mid); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const wheelTex = (T) => canvasTex(T, 128, 128, (g, w) => {
  g.fillStyle = '#16171a'; g.fillRect(0, 0, w, w);
  g.strokeStyle = '#c9a24a'; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, w / 2, w * 0.44, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#8b8f99'; g.lineWidth = 6;
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; g.beginPath(); g.moveTo(w / 2, w / 2); g.lineTo(w / 2 + Math.cos(a) * w * 0.42, w / 2 + Math.sin(a) * w * 0.42); g.stroke(); }
  g.fillStyle = '#c9a24a'; g.beginPath(); g.arc(w / 2, w / 2, w * 0.1, 0, Math.PI * 2); g.fill();
});
const gravelTex = (T) => {
  const t = canvasTex(T, 128, 128, (g, w) => {
    g.fillStyle = '#7d7064'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 1400; i++) { const v = 70 + Math.random() * 90; g.fillStyle = `rgb(${v},${v * 0.92},${v * 0.84})`; g.fillRect(Math.random() * w, Math.random() * w, 2, 2); }
  });
  t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1, 30);
  return t;
};

/* ----------------------------------------------------------- the train */

function buildTrain(T, mats, body) {
  const g = new T.Group();
  const bodyMat = new T.MeshStandardMaterial({ color: body, metalness: 0.35, roughness: 0.45 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  };
  const cyl = (r1, r2, len, seg = 28) => { const c = new T.CylinderGeometry(r1, r2, len, seg); c.rotateX(Math.PI / 2); return c; };
  // frame and running boards
  add(new T.BoxGeometry(2.7, 0.35, 11), bodyMat, 0, 1.15, -1.6);
  add(new T.BoxGeometry(3.3, 0.08, 7.4), mats.dark, 0, 1.75, -3.2);
  // boiler with brass bands, smokebox, chimney, domes
  add(cyl(1.15, 1.15, 7), mats.metal, 0, 2.5, -3.2);
  for (const z of [-1.2, -3.2, -5.2]) add(cyl(1.18, 1.18, 0.14), mats.brass, 0, 2.5, z);
  add(cyl(1.22, 1.22, 1.1), mats.dark, 0, 2.5, -7.1);
  add(new T.CircleGeometry(1.0, 28), mats.metal, 0, 2.5, -7.66, 0, Math.PI, 0);
  add(new T.CylinderGeometry(0.42, 0.34, 1.5, 20), mats.dark, 0, 4.2, -6.6);
  add(new T.CylinderGeometry(0.55, 0.45, 0.25, 20), mats.dark, 0, 5.0, -6.6);
  add(new T.SphereGeometry(0.55, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.brass, 0, 3.55, -3.4);
  add(new T.SphereGeometry(0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.metal, 0, 3.55, -5.0);
  // headlamp
  add(new T.CylinderGeometry(0.28, 0.28, 0.45, 16), mats.dark, 0, 3.75, -7.45, Math.PI / 2);
  const lamp = add(new T.CircleGeometry(0.22, 16), mats.lamp, 0, 3.75, -7.69, 0, Math.PI, 0);
  const glow = new T.Sprite(mats.glow); glow.scale.set(3, 3, 1); glow.position.set(0, 3.75, -7.9); g.add(glow);
  // cowcatcher
  const cc = new T.ConeGeometry(1.5, 1.2, 4, 1); cc.rotateY(Math.PI / 4); cc.scale(1, 1, 0.45);
  add(cc, mats.dark, 0, 0.75, -8.0, Math.PI, 0, 0);
  // the cab: walls around windows, so the cab view looks out over the boiler
  const cz = 1.55;
  add(new T.BoxGeometry(3.0, 1.0, 0.12), bodyMat, 0, 1.85, cz - 1.2);           // front, under the windows
  add(new T.BoxGeometry(3.0, 0.3, 0.12), mats.wood, 0, 4.25, cz - 1.2);           // front, above
  for (const x of [-1.45, -0.32, 0.32, 1.45]) add(new T.BoxGeometry(0.07, 1.9, 0.07), mats.dark, x, 3.3, cz - 1.2);
  for (const sx of [-1, 1]) {
    add(new T.BoxGeometry(0.12, 1.35, 2.4), bodyMat, sx * 1.5, 2.0, cz);
    add(new T.BoxGeometry(0.12, 0.4, 2.4), bodyMat, sx * 1.5, 4.2, cz);
    add(new T.BoxGeometry(0.12, 1.6, 0.25), bodyMat, sx * 1.5, 3.3, cz + 1.05);
  }
  add(new T.BoxGeometry(3.5, 0.14, 3.0), mats.dark, 0, 4.47, cz);
  add(new T.BoxGeometry(2.9, 0.1, 2.4), mats.wood, 0, 1.35, cz);
  // firebox door, glowing
  const door = add(new T.PlaneGeometry(0.8, 0.55), mats.fire, 0, 2.05, cz - 1.13);
  // tender with a heap of coal
  add(new T.BoxGeometry(2.9, 2.2, 4.4), mats.dark, 0, 2.3, 5.4);
  add(new T.BoxGeometry(2.92, 0.22, 4.42), bodyMat, 0, 2.6, 5.4);
  const coal = new T.SphereGeometry(1.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); coal.scale(1, 0.45, 1.5);
  add(coal, mats.coal, 0, 3.4, 5.4);
  // a coach behind
  add(new T.BoxGeometry(2.9, 2.5, 10), bodyMat, 0, 2.5, 13.2);
  add(new T.BoxGeometry(3.2, 0.25, 10.4), mats.dark, 0, 3.85, 13.2);
  add(new T.BoxGeometry(2.95, 0.7, 9), mats.windows, 0, 2.9, 13.2);
  // wheels: big drivers, small leading and tender wheels
  const wheels = [];
  const wheel = (r, x, z) => {
    const geo = new T.CylinderGeometry(r, r, 0.24, 28); geo.rotateZ(Math.PI / 2);
    const m = add(geo, [mats.metal, mats.wheel, mats.wheel], x, r, z);
    m.userData.r = r; wheels.push(m); return m;
  };
  for (const sx of [-1, 1]) {
    for (const z of [-1.4, -3.2, -5.0]) wheel(0.95, sx * 1.25, z);
    wheel(0.5, sx * 1.25, -6.9);
    for (const z of [4.0, 6.8]) wheel(0.55, sx * 1.25, z);
    for (const z of [10.5, 16]) wheel(0.55, sx * 1.25, z);
  }
  // side rods, which go round with the wheels
  const rods = [];
  for (const sx of [-1, 1]) {
    const rod = add(new T.BoxGeometry(0.1, 0.16, 3.9), mats.steel, sx * 1.42, 0.95, -3.2);
    rods.push(rod);
  }
  // a light in the cab, from the fire
  const fireLight = new T.PointLight(0xff7a2a, 0, 6, 1.6);
  fireLight.position.set(0, 2.2, cz - 0.6); g.add(fireLight);
  g.userData = { wheels, rods, chimney: new T.Vector3(0, 5.2, -6.6), door, fireLight, lamp };
  return g;
}

/* --------------------------------------------------------------- world */

export function createWorld(T, canvas, { tv = false } = {}) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const fogCol = new T.Color(0xeccba4);
  scene.fog = new T.Fog(fogCol, 140, 820);
  const cam = new T.PerspectiveCamera(tv ? 42 : 62, 1, 0.08, 4000);

  const sunDir = new T.Vector3(-0.55, 0.22, -1).normalize();
  const sky = new T.Mesh(new T.SphereGeometry(3000, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false, uniforms: { sun: { value: sunDir } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 sun;
      void main(){
        float y = vDir.y;
        vec3 c = mix(vec3(0.95,0.80,0.64), vec3(0.55,0.72,0.93), smoothstep(-0.02, 0.2, y));
        c = mix(c, vec3(0.16,0.34,0.70), smoothstep(0.2, 0.8, y));
        float s = max(dot(vDir, sun), 0.0);
        c += vec3(1.0,0.72,0.40) * pow(s, 6.0) * 0.5 + vec3(1.0,0.96,0.85) * pow(s, 900.0) * 4.0;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  scene.add(sky);
  scene.add(new T.HemisphereLight(0xc4dcff, 0x6b5a3a, 1.0));
  const sun = new T.DirectionalLight(0xffd6a0, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 });
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);
  // clouds high up, drifting
  const puff = puffTex(T);
  const clouds = [];
  for (let i = 0; i < 70; i++) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: puff, transparent: true, opacity: 0.75, depthWrite: false, fog: false }));
    const size = 120 + Math.random() * 200; s.scale.set(size, size * 0.4, 1);
    s.userData = { ox: (Math.random() - 0.5) * 2400, y: 160 + Math.random() * 180, oz: -Math.random() * 2400 };
    scene.add(s); clouds.push(s);
  }

  const mats = {
    metal: new T.MeshStandardMaterial({ color: 0x2b2e35, metalness: 0.75, roughness: 0.35 }),
    dark: new T.MeshStandardMaterial({ color: 0x17181c, metalness: 0.5, roughness: 0.55 }),
    steel: new T.MeshStandardMaterial({ color: 0xd8dbe2, metalness: 0.9, roughness: 0.25 }),
    brass: new T.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.3 }),
    wood: new T.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.9 }),
    coal: new T.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 1, flatShading: true }),
    wheel: new T.MeshStandardMaterial({ map: wheelTex(T), metalness: 0.6, roughness: 0.4 }),
    lamp: new T.MeshBasicMaterial({ color: 0xfff1c4 }),
    glow: new T.SpriteMaterial({ map: glowTex(T), transparent: true, blending: T.AdditiveBlending, depthWrite: false }),
    fire: new T.MeshBasicMaterial({ color: 0xff7a1a }),
    windows: new T.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0x4a3010, roughness: 0.3 }),
    ballast: new T.MeshStandardMaterial({ map: gravelTex(T), roughness: 1 }),
    sleeper: new T.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.95 }),
    rail: new T.MeshStandardMaterial({ color: 0xb8bcc6, metalness: 0.95, roughness: 0.22 }),
    ground: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    trunk: new T.MeshStandardMaterial({ color: 0x4a3322, roughness: 1 }),
    leaf: new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
    pole: new T.MeshStandardMaterial({ color: 0x5b4330, roughness: 1 }),
  };

  /* chunks of land and track, made as the trains travel */
  const chunks = new Map();
  const lanes = [-2, -1, 0, 1, 2];
  const sleeperGeo = new T.BoxGeometry(3.0, 0.2, 0.4);
  const trunkGeo = new T.CylinderGeometry(0.25, 0.4, 3, 6);
  const leafGeo = new T.ConeGeometry(2.2, 6.5, 7);
  const poleGeo = new T.CylinderGeometry(0.14, 0.18, 8, 6);
  const ribbon = (z0, z1, xoff, half, y, steps = 20) => {
    const pos = []; const uv = []; const idx = [];
    for (let i = 0; i <= steps; i++) {
      const z = z0 + ((z1 - z0) * i) / steps; const cx = curveX(z) + xoff;
      pos.push(cx - half, y, z, cx + half, y, z); uv.push(0, i / steps, 1, i / steps);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  };
  const leafCol = new T.Color();
  function makeChunk(k) {
    const g = new T.Group();
    const z0 = -k * CHUNK; const z1 = z0 - CHUNK;
    // land
    const W = 1400; const nx = 70; const nz = 10;
    const geo = new T.PlaneGeometry(W, CHUNK, nx, nz); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position; const col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i); const z = p.getZ(i) + (z0 + z1) / 2;
      const y = groundY(x, z); p.setXYZ(i, x, y, z);
      const n = fbm(x * 0.03, z * 0.03); const d = Math.abs(x - curveX(z));
      let c = [0.33 + n * 0.12, 0.42 + n * 0.14, 0.18 + n * 0.06];       // grass
      if (d < 26) c = [0.45 + n * 0.08, 0.42 + n * 0.08, 0.30];           // dry earth by the line
      if (y > 70) c = [0.42 + n * 0.1, 0.40 + n * 0.1, 0.38 + n * 0.1];   // rock
      if (y > 190) c = [0.92, 0.93, 0.96];                                // snow
      col.push(...c);
    }
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const land = new T.Mesh(geo, mats.ground); land.receiveShadow = true; g.add(land);
    // track: ballast, sleepers and two rails on every line
    const sl = new T.InstancedMesh(sleeperGeo, mats.sleeper, lanes.length * 100);
    const m4 = new T.Matrix4(); const q = new T.Quaternion(); const e = new T.Euler(); let si = 0;
    for (const l of lanes) {
      const xo = l * LANE;
      const b = new T.Mesh(ribbon(z0, z1, xo, 2.2, 0.12), mats.ballast); b.receiveShadow = true; g.add(b);
      for (const r of [-0.75, 0.75]) {
        const rail = new T.Mesh(ribbon(z0, z1, xo + r, 0.08, 0.42), mats.rail); g.add(rail);
        const side = new T.Mesh(ribbon(z0, z1, xo + r, 0.04, 0.32), mats.dark); g.add(side);
      }
      for (let i = 0; i < 100; i++) {
        const z = z0 - i; e.set(0, -Math.atan(curveDX(z)), 0); q.setFromEuler(e);
        m4.compose(new T.Vector3(curveX(z) + xo, 0.25, z), q, new T.Vector3(1, 1, 1));
        sl.setMatrixAt(si++, m4);
      }
    }
    sl.receiveShadow = true; g.add(sl);
    // forests on the hills
    const trees = 150;
    const tr = new T.InstancedMesh(trunkGeo, mats.trunk, trees); const lf = new T.InstancedMesh(leafGeo, mats.leaf, trees);
    let ti = 0;
    for (let i = 0; i < trees * 3 && ti < trees; i++) {
      const z = z0 - hash2(k, i) * CHUNK; const side = hash2(i, k) < 0.5 ? -1 : 1;
      const x = curveX(z) + side * (24 + hash2(k * 3 + i, 7) * 300);
      const y = groundY(x, z); if (y > 150) continue;
      const s = 0.7 + hash2(i, k * 5) * 0.9;
      m4.compose(new T.Vector3(x, y + 1.5 * s, z), q.identity(), new T.Vector3(s, s, s)); tr.setMatrixAt(ti, m4);
      m4.compose(new T.Vector3(x, y + 5.5 * s, z), q, new T.Vector3(s, s, s)); lf.setMatrixAt(ti, m4);
      leafCol.setHSL(0.27 + hash2(i, 3) * 0.08, 0.45, 0.16 + hash2(i, 9) * 0.1); lf.setColorAt(ti, leafCol);
      ti++;
    }
    tr.count = ti; lf.count = ti; tr.castShadow = lf.castShadow = true; g.add(tr, lf);
    // telegraph poles beside the line
    for (let i = 0; i < 3; i++) {
      const z = z0 - i * 34 - 5; const pole = new T.Mesh(poleGeo, mats.pole);
      pole.position.set(curveX(z) - 2.8 * LANE - 4, 4, z); pole.castShadow = true; g.add(pole);
      const arm = new T.Mesh(new T.BoxGeometry(2.4, 0.15, 0.15), mats.pole); arm.position.set(pole.position.x, 7.6, z); g.add(arm);
    }
    scene.add(g);
    return g;
  }
  function updateChunks(focusZ) {
    const k0 = Math.floor(-focusZ / CHUNK);
    const want = new Set(); for (let k = k0 - 2; k <= k0 + 8; k++) want.add(k);
    for (const k of want) if (!chunks.has(k)) chunks.set(k, makeChunk(k));
    for (const [k, g] of chunks) {
      if (want.has(k)) continue;
      g.traverse((o) => { if (o.geometry && o.geometry !== sleeperGeo && o.geometry !== trunkGeo && o.geometry !== leafGeo && o.geometry !== poleGeo) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
      scene.remove(g); chunks.delete(k);
    }
  }

  /* trains */
  const trains = new Map();          // id -> { g, label, ... }
  const smokeMat = new T.SpriteMaterial({ map: puff, color: 0xe9e9ee, transparent: true, opacity: 0.6, depthWrite: false });
  const puffs = [];
  const labelTex = (text, colour) => canvasTex(T, 512, 96, (g2, w, hh) => {
    g2.font = '900 46px Figtree, system-ui'; const tw = Math.min(w - 10, g2.measureText(text).width + 40);
    g2.fillStyle = colour; const x = (w - tw) / 2;
    g2.beginPath(); g2.roundRect(x, 12, tw, 72, 36); g2.fill();
    g2.fillStyle = colour === '#ffcd1f' ? '#17133f' : '#fff'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(text, w / 2, 50);
  });
  function trainFor(id, body) {
    let tr = trains.get(id);
    if (tr) return tr;
    const g = buildTrain(T, mats, body);
    scene.add(g);
    const label = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
    label.scale.set(10, 1.9, 1); label.position.set(0, 8.2, -2); label.renderOrder = 10; g.add(label);
    tr = { g, label, text: '', colour: '', puffAt: 0, dist: 0 };
    trains.set(id, tr);
    return tr;
  }
  function placeTrain(tr, units, lane, moving, dt, { text = '', colour = 'rgba(23,19,63,.85)', showLabel = true } = {}) {
    const z = -units; const x = curveX(z) + lane * LANE;
    tr.g.position.set(x, 0, z);
    tr.g.rotation.y = Math.atan(curveDX(z));
    const moved = Math.max(0, units - tr.dist); tr.dist = units;
    for (const w of tr.g.userData.wheels) w.rotation.x -= moved / w.userData.r;
    const a = tr.g.userData.wheels[0].rotation.x;
    tr.g.userData.rods.forEach((r) => { r.position.y = 0.95 + Math.sin(a) * 0.38; r.position.z = -3.2 + Math.cos(a) * 0.38; });
    const fl = tr.g.userData.fireLight; fl.intensity = moving ? 6 + Math.sin(performance.now() / 50) * 1.5 + Math.random() : 0.4;
    tr.g.userData.door.material.color.setHSL(0.07, 1, moving ? 0.5 + Math.random() * 0.08 : 0.18);
    tr.label.visible = showLabel && Boolean(text);
    if (tr.label.visible && (text !== tr.text || colour !== tr.colour)) {
      tr.text = text; tr.colour = colour;
      if (tr.label.material.map) tr.label.material.map.dispose();
      tr.label.material.map = labelTex(text, colour); tr.label.material.needsUpdate = true;
    }
    // smoke from the chimney stays where it is let out, so it trails behind
    tr.puffAt -= dt;
    if (moving && tr.puffAt <= 0 && puffs.length < 260) {
      tr.puffAt = 0.035;
      const s = new T.Sprite(smokeMat.clone());
      s.position.copy(tr.g.userData.chimney).applyMatrix4(tr.g.matrixWorld);
      s.userData = { life: 3.2, max: 3.2, vx: (Math.random() - 0.5) * 1.5, vy: 3 + Math.random() * 2.5 };
      s.scale.set(1.6, 1.6, 1); scene.add(s); puffs.push(s);
    }
  }
  function removeTrain(id) {
    const tr = trains.get(id); if (!tr) return;
    scene.remove(tr.g); trains.delete(id);
  }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(1, r.width); const hh = Math.max(1, r.height);
    renderer.setSize(w, hh, false); cam.aspect = w / hh; cam.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement);

  return {
    T, scene, cam, trainFor, placeTrain, removeTrain, trains,
    render(dt, focus) {
      updateChunks(focus.z);
      sun.position.set(focus.x - sunDir.x * 120, sunDir.y * 120 + 40, focus.z - sunDir.z * 120);
      sun.target.position.set(focus.x, 0, focus.z);
      sky.position.copy(cam.position);
      for (const c of clouds) { c.position.set(cam.position.x + c.userData.ox, c.userData.y, cam.position.z + ((c.userData.oz - cam.position.z * 0.02) % 2400) - 600); }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const s = puffs[i]; const u = s.userData; u.life -= dt;
        if (u.life <= 0) { scene.remove(s); s.material.dispose(); puffs.splice(i, 1); continue; }
        s.position.x += u.vx * dt; s.position.y += u.vy * dt; u.vy *= 0.985;
        const k = 1 - u.life / u.max; const size = 2.4 + k * 11;
        s.scale.set(size, size, 1); s.material.opacity = 0.62 * (1 - k) ** 1.4;
      }
      renderer.render(scene, cam);
    },
    destroy() {
      ro.disconnect();
      for (const k of [...chunks.keys()]) { const g = chunks.get(k); scene.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      renderer.dispose();
    },
  };
}
