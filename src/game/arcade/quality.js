// quality.js — keeps the 3D games smooth on every device.
//
// Phones and slow computers start lighter (fewer pixels, smaller shadows).
// While the game runs, the frame time is watched: if it stays slow, the
// picture steps down (pixels first, then shadows); if there is lots of room
// to spare, it steps back up a little. Smooth beats sharp.

export const lowEnd = () => {
  try {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    return coarse || cores <= 4 || mem <= 3;
  } catch { return false; }
};

/**
 * autoQuality(renderer, { sun, scene, onResize }) → { frame(dt), level }
 * Call frame() once per rendered frame.
 */
export function autoQuality(renderer, { sun = null, scene = null, onResize = null } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const steps = [Math.min(1.5, dpr), Math.min(1.25, dpr), 1, 0.85, 0.7];
  let level = lowEnd() ? 2 : 0;
  let shadows = true;
  let acc = 0; let frames = 0; let goodFor = 0; let settle = 2; let last = 0;
  const applyShadows = (on) => {
    if (on === shadows) return;
    shadows = on;
    renderer.shadowMap.enabled = on;
    if (sun) sun.castShadow = on;
    if (scene) scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
  };
  const apply = () => {
    renderer.setPixelRatio(steps[Math.min(level, steps.length - 1)]);
    if (onResize) onResize();
  };
  if (sun && lowEnd()) { sun.shadow.mapSize.set(1024, 1024); }
  apply();
  return {
    get level() { return level; },
    frame() {
      // timed here: some games pass a fixed step, not the real frame time
      const now = performance.now();
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      if (!(dt > 0) || dt > 0.5) return;
      acc += dt; frames += 1;
      if (acc < 1.5) return;
      const avg = acc / frames;
      acc = 0; frames = 0;
      // the first moments are loading: don't judge them
      if (settle > 0) { settle -= 1; return; }
      if (avg > 1 / 42) {
        goodFor = 0;
        if (level < steps.length - 1) { level += 1; apply(); } else applyShadows(false);
      } else if (avg < 1 / 58) {
        goodFor += 1;
        // plenty of room for a while: one step sharper again
        if (goodFor >= 4 && level > 0) { goodFor = 0; level -= 1; apply(); }
      } else goodFor = 0;
    },
  };
}
