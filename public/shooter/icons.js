// SLQ Game Lobby — pictures of the weapons for the display at the bottom of the screen: each of the arsenal's
// models (weapons.js) seen from its side, drawn once when the game starts. A small renderer of its own makes them,
// so that the picture has a clear background, and is thrown away again. The pictures are handed back as canvases
// (the page's rules allow no pictures from data addresses).
import { makeArsenal } from './weapons.js';

// ids: which weapons. Returns { id: canvas }; empty if the browser gives no second renderer (then the display
// shows the numbers alone).
export function weaponIcons(THREE, ids, w = 240, h = 120) {
  const out = {};
  let r;
  try { r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); } catch { return out; }
  r.setPixelRatio(1); r.setSize(w, h, false); r.setClearColor(0x000000, 0);
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.25;
  const arsenal = makeArsenal(THREE, r), scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0.1, 20);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(3, 3, 1.5);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0aa, 1.6), sun);
  const box = new THREE.Box3(), size = new THREE.Vector3(), mid = new THREE.Vector3();
  for (const id of ids) {
    const wpn = arsenal.build(id);
    wpn.group.rotation.set(0.16, -0.3, 0);          // the muzzle a little up and towards the eye, so that it has depth
    scene.add(wpn.group); wpn.group.updateMatrixWorld(true);
    box.setFromObject(wpn.group); box.getSize(size); box.getCenter(mid);
    // seen from the weapon's right: the muzzle points to the right of the picture. The whole of it must fit.
    const half = Math.max(size.z * 0.54, size.y * 0.56 * w / h);
    cam.left = -half; cam.right = half; cam.top = half * h / w; cam.bottom = -half * h / w; cam.updateProjectionMatrix();
    cam.position.set(mid.x + 5, mid.y, mid.z); cam.lookAt(mid);
    r.render(scene, cam);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(r.domElement, 0, 0);
    out[id] = c;
    scene.remove(wpn.group);
  }
  arsenal.dispose(); r.dispose();
  try { r.forceContextLoss(); } catch { /* already gone */ }
  return out;
}
