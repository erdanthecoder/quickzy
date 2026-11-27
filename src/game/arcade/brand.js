// brand.js — the Quickzy logo and cheering crowds, for every game.
//
// 2D games draw the logo on boards, blimps and floors with drawLogo /
// drawLogoBoard; 3D games get a canvas texture with logoTexture and fans
// in the stands with crowd().

const LOGO_URL = '/assets/icon.svg';
let img = null;
const waiting = new Set();

/** The logo picture (loads once). */
export function logoImage() {
  if (!img && typeof Image !== 'undefined') {
    img = new Image();
    img.onload = () => { for (const fn of waiting) fn(); waiting.clear(); };
    img.src = LOGO_URL;
  }
  return img;
}
const ready = () => { const i = logoImage(); return Boolean(i && i.complete && i.naturalWidth); };
/** Run fn once the logo has loaded (now, if it already has). */
export function onLogo(fn) { if (ready()) fn(); else waiting.add(fn); }

/** The round Quickzy mark, centred on x, y. */
export function drawLogo(ctx, x, y, size, alpha = 1) {
  const i = logoImage();
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (ready()) ctx.drawImage(i, x - size / 2, y - size / 2, size, size);
  else { ctx.fillStyle = '#3a24a8'; ctx.beginPath(); ctx.roundRect(x - size / 2, y - size / 2, size, size, size * 0.27); ctx.fill(); }
  ctx.restore();
}

/** The word "Quickzy" in the brand look: white "Quick", yellow "zy". */
export function drawWordmark(ctx, x, y, size, { align = 'left', dark = false } = {}) {
  ctx.save();
  ctx.font = `800 ${size}px "Bricolage Grotesque", Figtree, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  const a = ctx.measureText('Quick').width; const b = ctx.measureText('zy').width;
  let sx = x;
  if (align === 'center') sx = x - (a + b) / 2;
  if (align === 'right') sx = x - a - b;
  ctx.textAlign = 'left';
  ctx.fillStyle = dark ? '#17133f' : '#ffffff';
  ctx.fillText('Quick', sx, y);
  ctx.fillStyle = dark ? '#6b4cff' : '#ffcd1f';
  ctx.fillText('zy', sx + a, y);
  ctx.restore();
  return a + b;
}

/** A sign: logo and word on a rounded board (x, y is the top left). */
export function drawLogoBoard(ctx, x, y, w, h, { bg = '#17133f', border = '#6b4cff', dark = false, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(h * 0.25, 14)); ctx.fill();
  if (border) { ctx.lineWidth = Math.max(2, h * 0.06); ctx.strokeStyle = border; ctx.stroke(); }
  const s = h * 0.7;
  drawLogo(ctx, x + h * 0.15 + s / 2, y + h / 2, s);
  drawWordmark(ctx, x + h * 0.3 + s, y + h / 2 + 1, Math.min(h * 0.5, (w - s - h * 0.45) / 3.6), { dark });
  ctx.restore();
}

/**
 * A canvas texture with the logo (three.js). kind: 'board' (logo + word on
 * a colour), 'mark' (just the round logo, transparent around it).
 */
export function logoTexture(T, { w = 512, h = 128, kind = 'board', bg = '#17133f', border = '#6b4cff', dark = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const paint = () => {
    g.clearRect(0, 0, w, h);
    if (kind === 'mark') drawLogo(g, w / 2, h / 2, Math.min(w, h) * 0.96);
    else drawLogoBoard(g, 0, 0, w, h, { bg, border, dark });
  };
  paint();
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  if (!ready()) waiting.add(() => { paint(); t.needsUpdate = true; });
  // the brand font may arrive a moment later too
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { paint(); t.needsUpdate = true; }).catch(() => {});
  return t;
}

/**
 * Fans: a little person (body and head) for each spot, in team colours,
 * jumping and waving. spots: [[x, y, z, facingY], ...]. Returns
 * { group, update(t, excite) } where excite 0…1 makes them jump higher.
 */
export function crowd(T, spots, { size = 1 } = {}) {
  const group = new T.Group();
  const n = spots.length;
  if (!n) return { group, update() {} };
  const shirts = [0xe10600, 0xffd400, 0x1e41ff, 0xffffff, 0xff8000, 0x00a19c, 0xff4fa3, 0x6b4cff, 0x19c37d, 0x17133f];
  const skins = [0xf3c9a0, 0xd9a273, 0xa8744c, 0x6e4a32, 0xffdcbc];
  const body = new T.InstancedMesh(new T.CapsuleGeometry(0.22 * size, 0.42 * size, 3, 6), new T.MeshStandardMaterial({ roughness: 0.8 }), n);
  const head = new T.InstancedMesh(new T.SphereGeometry(0.17 * size, 8, 6), new T.MeshStandardMaterial({ roughness: 0.7 }), n);
  // a raised arm (some fans wave a flag)
  const arm = new T.InstancedMesh(new T.BoxGeometry(0.08 * size, 0.5 * size, 0.08 * size), new T.MeshStandardMaterial({ roughness: 0.8 }), n);
  const col = new T.Color();
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    seed[i] = Math.random() * 100;
    col.setHex(shirts[i % shirts.length]); body.setColorAt(i, col); arm.setColorAt(i, col);
    col.setHex(skins[(i * 7) % skins.length]); head.setColorAt(i, col);
  }
  const m = new T.Matrix4(); const q = new T.Quaternion(); const p = new T.Vector3(); const one = new T.Vector3(1, 1, 1);
  const yAxis = new T.Vector3(0, 1, 0); const zAxis = new T.Vector3(0, 0, 1);
  const qa = new T.Quaternion(); const qq = new T.Quaternion(); const at = new T.Vector3();
  const place = (t, excite) => {
    for (let i = 0; i < n; i++) {
      const [x, y, z, face = 0] = spots[i];
      const hop = Math.max(0, Math.sin(t * (5 + (seed[i] % 3)) + seed[i])) * (0.08 + excite * 0.35) * size;
      q.setFromAxisAngle(yAxis, face);
      m.compose(p.set(x, y + 0.45 * size + hop, z), q, one); body.setMatrixAt(i, m);
      m.compose(p.set(x, y + 0.95 * size + hop, z), q, one); head.setMatrixAt(i, m);
      // the arm: up and waving when excited, down otherwise
      const wave = (excite > 0.2 || i % 4 === 0) ? Math.sin(t * 8 + seed[i]) * 0.5 : 2.6;
      const side = i % 2 ? 1 : -1;
      qa.setFromAxisAngle(zAxis, wave * side);
      qq.copy(q).multiply(qa);
      p.set(0.28 * size * side, 0.85 * size + hop, 0).applyQuaternion(q).add(at.set(x, y, z));
      m.compose(p, qq, one); arm.setMatrixAt(i, m);
    }
    body.instanceMatrix.needsUpdate = true; head.instanceMatrix.needsUpdate = true; arm.instanceMatrix.needsUpdate = true;
  };
  place(0, 0);
  for (const im of [body, head, arm]) { im.castShadow = false; im.receiveShadow = false; group.add(im); }
  let last = -1;
  return {
    group,
    // cheap: moves the fans 15 times a second, not every frame
    update(t, excite = 0) { if (t - last < 0.066 && t >= last) return; last = t; place(t, excite); },
  };
}

/** The Quickzy blimp, floating across the sky (x, y is its middle; s = length). */
export function drawBlimp(ctx, x, y, s, t = 0) {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 0.8) * s * 0.03);
  const hgt = s * 0.32;
  // fins and gondola
  ctx.fillStyle = '#4a2fd6';
  ctx.beginPath(); ctx.moveTo(s * 0.32, 0); ctx.lineTo(s * 0.56, -hgt * 0.75); ctx.lineTo(s * 0.56, hgt * 0.75); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#17133f';
  ctx.beginPath(); ctx.roundRect(-s * 0.1, hgt * 0.42, s * 0.2, hgt * 0.24, 4); ctx.fill();
  // the envelope, with a shine
  const g = ctx.createLinearGradient(0, -hgt / 2, 0, hgt / 2);
  g.addColorStop(0, '#a58bff'); g.addColorStop(0.5, '#6b4cff'); g.addColorStop(1, '#3a24a8');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, s / 2, hgt / 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.beginPath(); ctx.ellipse(-s * 0.08, -hgt * 0.22, s * 0.3, hgt * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  // the logo and name on its side
  drawLogo(ctx, -s * 0.27, 0, hgt * 0.62);
  drawWordmark(ctx, -s * 0.16, 1, hgt * 0.4);
  ctx.restore();
}
