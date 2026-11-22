// three.js — loads three.js (the 3D library) from the web, once, for the
// games that have a 3D look. In the browser tests the 2D look is used unless
// a test asks for 3D.

export const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
let loading = null;
export const loadThree = () => (loading ||= import(/* @vite-ignore */ THREE_URL));
export function want3D() {
  if (!navigator.webdriver) return true;
  try { return localStorage.getItem('quickzy.test.3d') === '1'; } catch { return false; }
}
