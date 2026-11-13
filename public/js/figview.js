// SLQ Game Lobby — one figure in three dimensions on a small canvas: for the wardrobe, where one builds one's figure
// and wants to see it from all sides. It is the same figure as in the saloon and the shooter (shooter/figure.js),
// standing still and breathing; drag it to turn it round. three.js is fetched when this is first used.
//
// The canvas and what draws on it are made once and kept for as long as the page lives: a browser gives a page only
// a handful of drawing contexts and takes the oldest one away when there are too many — and the oldest is the saloon.

let shared = null, failed = false;      // failed: this browser cannot draw in three dimensions; it is not asked again

export async function makeFigView(holder, look) {
  if (failed) throw new Error('no 3D here');
  const THREE = await import('../shooter/vendor/three.module.min.js'), { makePeople } = await import('./saloon/people.js');
  if (!shared) {
    const canvas = document.createElement('canvas'); canvas.className = 'three';
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { failed = true; throw e; }
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    scene.add(new THREE.HemisphereLight(0xfff2e0, 0x4a3a5a, 1.3), new THREE.AmbientLight(0xffffff, 0.3));
    const sun = new THREE.DirectionalLight(0xfff4e4, 1.6); sun.position.set(2.5, 4, 5); scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32), new THREE.MeshBasicMaterial({ color: 0x1c1728, transparent: true, opacity: 0.45 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const s = shared = { canvas, renderer, scene, camera, people: makePeople(THREE), owner: null, who: null, turn: 0.35, down: null, auto: true, raf: 0, w: 0, h: 0 };
    canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', e => { s.down = { x: e.clientX, turn: s.turn }; s.auto = false; try { canvas.setPointerCapture(e.pointerId); } catch {} });
    canvas.addEventListener('pointermove', e => { if (s.down) s.turn = s.down.turn + (e.clientX - s.down.x) * 0.012; });
    for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => { s.down = null; });
  }
  const s = shared, me = {}, t0 = performance.now();
  cancelAnimationFrame(s.raf);
  s.owner = me; s.turn = 0.35; s.down = null; s.auto = true; s.w = s.h = 0;
  holder.prepend(s.canvas);
  const fit = () => {
    const r = s.canvas.getBoundingClientRect(), nw = Math.max(40, Math.round(r.width)), nh = Math.max(40, Math.round(r.height));
    if (nw === s.w && nh === s.h) return;
    s.w = nw; s.h = nh; s.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); s.renderer.setSize(nw, nh, false);
    // the whole figure with a hat on, whatever the shape of the canvas
    s.camera.aspect = nw / nh; s.camera.position.set(0, 1.45, Math.max(5.5, 3.9 / (nw / nh))); s.camera.lookAt(0, 1.26, 0); s.camera.updateProjectionMatrix();
  };
  function set(l) {
    if (s.owner !== me) return;
    if (s.who) { s.scene.remove(s.who.group); s.who.dispose(); }
    s.who = s.people.person(l); s.scene.add(s.who.group);
  }
  function frame() {
    if (s.owner !== me) return;
    s.raf = requestAnimationFrame(frame);
    fit();
    const T = (performance.now() - t0) / 1000;
    if (s.auto && !s.down) s.turn += 0.004;
    s.who.group.rotation.y = s.turn;
    s.who.pose({ phase: 0, walk: 0, seed: 1, emote: '', drink: null, talk: false }, { T, seat: '', seatY: 0, fill: 1, sip: 0, buzz: 0, fx: {}, et: 0, hen: false, first: false });
    s.renderer.render(s.scene, s.camera);
  }
  set(look); frame();
  return {
    set,
    dispose() {
      if (s.owner !== me) return;
      s.owner = null; cancelAnimationFrame(s.raf); s.canvas.remove();
      if (s.who) { s.scene.remove(s.who.group); s.who.dispose(); s.who = null; }
    },
  };
}
