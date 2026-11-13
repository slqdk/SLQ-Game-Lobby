// SLQ Game Lobby — the shooter's weapons as shapes. One arsenal makes every weapon once (a few joined meshes per
// weapon) and hands out copies: for the player's own hands, for the hands of the others and for what lies ready
// in the arena. It also makes the arms and hands that hold a weapon in one's own view.
//
// A weapon is drawn the way it is held: the grip at the origin, the muzzle towards -z, up is +y. The parts that
// move (the slide of the pistol, a magazine, the bolt, the rocket) are groups of their own; `parts` names them.
// Everything is made of simple shapes (profiles pushed out to a thickness, tubes, turned shapes): no model files.
//
// THREE: three.js. renderer: when given, polished metal gets something to mirror (a small picture of a sky made
// here); without it (the self test) the weapons are built the same, just duller.

const DEG = Math.PI / 180;

export function makeArsenal(THREE, renderer) {
  // ---------- what metal mirrors: a soft sky, a warm horizon, dark ground, two bright windows ----------
  let env = null;
  if (renderer) {
    try {
      const sc = new THREE.Scene(), geo = new THREE.SphereGeometry(20, 24, 16), col = new Float32Array(geo.attributes.position.count * 3), c = new THREE.Color();
      for (let i = 0; i < geo.attributes.position.count; i++) {
        const y = geo.attributes.position.getY(i) / 20;
        if (y > 0.05) c.setRGB(0.55 + 0.25 * (1 - y), 0.72 + 0.12 * (1 - y), 0.95); else if (y > -0.08) c.setRGB(0.95, 0.9, 0.8); else c.setRGB(0.16, 0.15, 0.14);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      for (const [x, y, z, s] of [[8, 9, 6, 5], [-9, 5, -7, 3.5]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: 0xffffff })); m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m); }
      const pm = new THREE.PMREMGenerator(renderer);
      env = pm.fromScene(sc, 0.03).texture;
      pm.dispose(); geo.dispose();
    } catch { env = null; }
  }

  // ---------- materials (shared by every copy) ----------
  const M = {};
  const mat = (name, color, rough, metal, extra) => { M[name] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal, envMap: env, envMapIntensity: 1 }, extra)); };
  mat('blade', 0xdfe4e8, 0.2, 0.95); mat('steel', 0x8d949b, 0.34, 0.9); mat('gun', 0x4a5059, 0.4, 0.8); mat('dark', 0x1c1e22, 0.55, 0.45);
  mat('poly', 0x2d3035, 0.66, 0.08); mat('rubber', 0x121212, 0.9, 0); mat('wood', 0x7b4a25, 0.62, 0.02); mat('woodD', 0x55321a, 0.7, 0.02);
  mat('brass', 0xc59b45, 0.32, 0.92); mat('olive', 0x566029, 0.6, 0.3); mat('oliveD', 0x3a4119, 0.66, 0.3); mat('glass', 0x20405e, 0.08, 0.9, { emissive: 0x0a1d30, emissiveIntensity: 0.6 });
  mat('rust', 0x74492c, 0.85, 0.35); mat('tin', 0x7f8479, 0.6, 0.6); mat('tape', 0xbdb69c, 0.92, 0); mat('yellow', 0xe2b62a, 0.55, 0.1); mat('red', 0xc43b2b, 0.5, 0.1); mat('white', 0xf1efe9, 0.6, 0);

  // ---------- shapes ----------
  const V = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S1 = new THREE.Vector3(1, 1, 1), M4 = new THREE.Matrix4(), N3 = new THREE.Matrix3();
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  // a tube along the barrel: rf the radius at the front end, rb at the back
  const tube = (rf, rb, len, seg = 14, open = false) => new THREE.CylinderGeometry(rf, rb, len, seg, 1, open).rotateX(-Math.PI / 2);
  // a side view (points [forward, up]) pushed out to a thickness, with the edges cut a little (bevel)
  function prism(pts, thick, bevel = 0, holes) {
    const sh = new THREE.Shape();
    pts.forEach((p, i) => { if (i) sh.lineTo(p[0], p[1]); else sh.moveTo(p[0], p[1]); });
    sh.closePath();
    for (const h of holes || []) { const path = new THREE.Path(); h.forEach((p, i) => { if (i) path.lineTo(p[0], p[1]); else path.moveTo(p[0], p[1]); }); path.closePath(); sh.holes.push(path); }
    const g = new THREE.ExtrudeGeometry(sh, bevel ? { depth: thick - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1 } : { depth: thick, bevelEnabled: false });
    g.translate(0, 0, -(thick - (bevel ? 2 * bevel : 0)) / 2);
    return g.rotateY(Math.PI / 2);                       // forward becomes -z, the thickness lies along x
  }
  const rbox = (w, h, d, b) => prism([[-d / 2, -h / 2], [d / 2, -h / 2], [d / 2, h / 2], [-d / 2, h / 2]], w, b);
  // a turned shape: points [radius, forward]
  const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg).rotateX(-Math.PI / 2);
  // a blade: the side view pushed out, then ground thin towards the edge (below `mid`) and a little towards the back
  function blade(pts, thick, spine, edge, tipFrom, tipAt) {
    const g = prism(pts, thick, 0), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), u = -p.getZ(i);
      const k = (y < spine ? Math.max(0.04, (y - edge) / (spine - edge)) : 1) * (u > tipFrom ? Math.max(0.06, (tipAt - u) / (tipAt - tipFrom)) : 1);
      p.setX(i, p.getX(i) * k);
    }
    g.computeVertexNormals();
    return g;
  }

  // A weapon under construction: shapes are put in with a material and a place; done() joins them, one mesh per
  // material for the body and for every moving part.
  function builder() {
    const parts = new Map();
    let part = 'body';
    const api = {
      part(name) { part = name; return api; },
      // place: x, y, z and the turning rx, ry, rz
      add(geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
        const g = geo.index ? geo.toNonIndexed() : geo.clone();
        M4.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S1);
        g.applyMatrix4(M4);
        if (!parts.has(part)) parts.set(part, new Map());
        const bucket = parts.get(part);
        if (!bucket.has(m)) bucket.set(m, []);
        bucket.get(m).push(g);
        return api;
      },
      // a rod from one point to another (r1 at the first)
      rod(r1, r2, a, c, m, seg = 8) {
        const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]), g = new THREE.CylinderGeometry(r2, r1, len, seg);
        E.setFromQuaternion(Q.setFromUnitVectors(V.set(0, 1, 0), new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]).normalize()));
        return api.add(g, m, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2, E.x, E.y, E.z);
      },
      // the same shape on both sides
      both(geo, m, x, y, z, rx = 0, ry = 0, rz = 0) { api.add(geo, m, x, y, z, rx, ry, rz); return api.add(geo, m, -x, y, z, rx, -ry, -rz); },
      done() {
        const out = {};
        for (const [name, bucket] of parts) {
          out[name] = [];
          for (const [m, list] of bucket) {
            let n = 0;
            for (const g of list) n += g.attributes.position.count;
            const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
            let o = 0;
            for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
            out[name].push({ geo, mat: m });
          }
        }
        return out;
      },
    };
    return api;
  }

  // ---------- the five weapons ----------
  // Each gives: shapes (by part), where the parts sit (pivot), and marks: the muzzle, where empty shells fly out,
  // how the right hand holds it and where the left one supports it. A hand's place is [x, y, z, rx, ry, rz].
  const DEFS = {
    knife() {
      const b = builder();
      // the blade: back straight, a clipped point, a belly on the edge side
      b.add(blade([[0.012, -0.017], [0.02, -0.0185], [0.13, -0.019], [0.165, -0.014], [0.188, -0.002], [0.198, 0.0105], [0.176, 0.0125], [0.15, 0.0165], [0.012, 0.0165]], 0.0048, 0.004, -0.019, 0.15, 0.2), 'blade', 0, 0, 0);
      b.both(box(0.0006, 0.004, 0.105), 'steel', 0.00215, 0.0075, -0.075);                 // the groove along the back
      b.add(rbox(0.016, 0.062, 0.013, 0.0025), 'brass', 0, -0.001, -0.006);                // the guard
      b.add(tube(0.0125, 0.0135, 0.108, 10).scale(0.82, 1.18, 1), 'woodD', 0, 0, 0.054);     // the handle, oval
      for (let i = 0; i < 5; i++) b.add(tube(0.0139, 0.0139, 0.004, 10).scale(0.82, 1.18, 1), 'rubber', 0, 0, 0.018 + i * 0.019);
      b.add(tube(0.014, 0.0125, 0.014, 10).scale(0.85, 1.2, 1), 'brass', 0, 0, 0.115);       // the cap at the end
      b.add(tube(0.004, 0.004, 0.006, 8), 'steel', 0, 0, 0.125);
      return { shapes: b.done(), pivots: {}, muzzle: [0, 0, -0.2], hand: [0, 0, 0.055, -Math.PI / 2, 0, 0], support: null, len: [-0.2, 0.128] };
    },

    pistol() {
      const b = builder(), T = 0.027;
      // frame with the trigger guard and the grip, leaning back
      b.add(prism([[0.106, 0.052], [0.106, 0.036], [0.064, 0.031], [0.061, 0.006], [0.05, -0.007], [0.022, -0.008], [0.014, -0.014], [0.004, -0.064], [-0.036, -0.072], [-0.031, -0.03], [-0.025, 0.01], [-0.038, 0.035], [-0.032, 0.052]], T, 0.0025,
        [[[0.052, 0.025], [0.052, 0.006], [0.045, 0], [0.024, 0], [0.02, 0.025]]]), 'poly', 0, 0, 0);
      b.add(prism([[0.009, -0.006], [-0.001, -0.058], [-0.03, -0.064], [-0.026, -0.022], [-0.02, 0.012], [0.004, 0.012]], T + 0.0032, 0.0012), 'rubber', 0, 0, 0);      // the grip's rough sides
      b.add(box(0.004, 0.02, 0.005), 'steel', 0, 0.013, -0.037, 0.25);                      // trigger
      b.add(box(0.0022, 0.0045, 0.024), 'steel', -T / 2 - 0.0008, 0.047, -0.03);            // slide stop
      b.add(tube(0.0035, 0.0035, 0.004, 8), 'steel', -T / 2 - 0.001, 0.02, -0.021, 0, Math.PI / 2);      // magazine button
      b.add(box(0.008, 0.004, 0.03), 'dark', 0, 0.0335, -0.085);                            // rail under the muzzle
      // the slide: moves back when a shot is fired
      b.part('slide');
      b.add(prism([[-0.035, 0.0525], [0.108, 0.0525], [0.1105, 0.058], [0.1105, 0.078], [0.105, 0.0835], [-0.03, 0.0835], [-0.037, 0.077]], T + 0.001, 0.0028), 'gun', 0, 0, 0);
      for (let i = 0; i < 6; i++) b.both(box(0.0012, 0.022, 0.0024), 'dark', (T + 0.001) / 2 + 0.0002, 0.067, 0.027 - i * 0.0048, 0.18);       // grooves to pull it back by
      b.add(box(0.0105, 0.0035, 0.034), 'dark', 0.0052, 0.0822, -0.04);                      // where the shells fly out
      b.add(box(0.012, 0.0012, 0.03), 'steel', 0.004, 0.0808, -0.04);
      b.add(tube(0.0062, 0.0062, 0.01, 12), 'steel', 0, 0.071, -0.1085);                    // the end of the barrel
      b.add(tube(0.0042, 0.0042, 0.0008, 12), 'rubber', 0, 0.071, -0.1139);
      b.add(tube(0.0032, 0.0032, 0.004, 10), 'dark', 0, 0.0595, -0.109);
      b.add(box(0.0036, 0.0052, 0.007), 'dark', 0, 0.086, -0.1);                            // front sight, with a white dot
      b.add(box(0.0016, 0.0016, 0.0006), 'white', 0, 0.0868, -0.0962);
      b.both(box(0.0045, 0.0055, 0.008), 'dark', 0.0052, 0.086, 0.027);                     // rear sight
      // the magazine in the grip
      b.part('mag');
      b.add(box(0.019, 0.108, 0.021), 'steel', 0, -0.012, 0.009, -0.2);
      b.add(rbox(0.0275, 0.008, 0.044, 0.002), 'poly', 0, -0.0705, 0.0165, -0.21);
      b.add(tube(0.0048, 0.0048, 0.026, 8), 'brass', 0, 0.041, 0.0035, 0.1);              // the top round
      return { shapes: b.done(), pivots: {}, muzzle: [0, 0.071, -0.118], eject: [0.016, 0.083, -0.04], hand: [0.001, -0.024, 0.012, -0.2, 0, 0], support: null, magOut: [0, -0.16, 0.035], magHand: [-0.006, -0.06, 0.02, -0.2, 0, 0.25], len: [-0.118, 0.04] };
    },

    badgun() {
      const b = builder();
      // a box of sheet metal, a water pipe for a barrel, a block of wood wound with tape for a grip
      b.add(rbox(0.034, 0.042, 0.165, 0.002), 'rust', 0, 0.05, -0.03);
      b.add(box(0.0012, 0.01, 0.07), 'dark', 0.0176, 0.056, -0.01);                         // the slot the bolt runs in
      for (const z of [-0.1, -0.055, 0.035]) b.both(tube(0.0028, 0.0028, 0.002, 6), 'tin', 0.018, 0.038, z, 0, Math.PI / 2);      // rivets
      b.add(tube(0.0095, 0.0095, 0.115, 12), 'tin', 0.0015, 0.053, -0.165, 0, 0.025);        // the pipe, a little crooked
      b.add(tube(0.0045, 0.0045, 0.002, 10), 'rubber', 0.003, 0.053, -0.2235, 0, 0.025);
      b.add(tube(0.0118, 0.0118, 0.012, 12), 'steel', 0.0005, 0.053, -0.123);                 // a hose clamp
      b.add(box(0.008, 0.006, 0.007), 'steel', 0.0005, 0.067, -0.123);
      b.add(tube(0.0108, 0.0108, 0.024, 12), 'tape', 0.0024, 0.053, -0.195, 0, 0.025);
      b.add(prism([[0.012, 0.03], [0.002, -0.058], [-0.034, -0.064], [-0.028, 0.03]], 0.03, 0.003), 'wood', 0, 0, 0);
      for (const [y, z] of [[-0.012, 0.012], [-0.04, 0.017]]) b.add(rbox(0.033, 0.014, 0.046, 0.0015), 'tape', 0, y, z, -0.14);
      b.add(prism([[0.058, 0.03], [0.058, 0.008], [0.05, 0.001], [0.026, 0.001], [0.022, 0.03], [0.026, 0.03], [0.029, 0.006], [0.049, 0.006], [0.053, 0.012], [0.053, 0.03]], 0.008, 0), 'tin', 0, 0, 0);      // a bent strip for a trigger guard
      b.add(box(0.0035, 0.018, 0.004), 'tin', 0, 0.018, -0.039, 0.3);
      b.add(tube(0.0016, 0.0016, 0.02, 6), 'steel', 0, 0.079, -0.1, Math.PI / 2 - 0.25);      // a nail for a front sight
      b.add(box(0.014, 0.008, 0.0015), 'tin', 0, 0.075, 0.045);                              // a bent tab for a rear sight
      b.add(prism([[-0.05, 0.062], [-0.05, 0.036], [-0.105, 0.03], [-0.112, 0.058]], 0.022, 0.003), 'woodD', 0, 0, 0);       // a stub of a stock
      b.add(rbox(0.0245, 0.03, 0.016, 0.0015), 'tape', 0, 0.047, 0.075);
      b.part('bolt');
      b.add(tube(0.004, 0.004, 0.02, 8), 'steel', 0.027, 0.056, -0.03, 0, Math.PI / 2);
      b.add(tube(0.0075, 0.0075, 0.007, 6), 'tin', 0.04, 0.056, -0.03, 0, Math.PI / 2);         // a nut for a knob
      b.part('mag');
      b.add(rbox(0.021, 0.082, 0.03, 0.002), 'tin', 0, -0.012, -0.084, 0.18);
      b.add(box(0.0225, 0.004, 0.032), 'rust', 0, -0.05, -0.0915, 0.18);
      b.add(tube(0.0044, 0.0044, 0.022, 8), 'brass', 0, 0.03, -0.074, 0.1);
      return { shapes: b.done(), pivots: {}, muzzle: [0.003, 0.053, -0.228], eject: [0.019, 0.058, -0.02], hand: [0, -0.02, 0.014, -0.16, 0, 0], support: null, magOut: [0, -0.14, 0.02], magHand: [-0.004, -0.04, -0.086, 0.18, 0, 0.25], len: [-0.228, 0.112] };
    },

    sniper() {
      const b = builder(), AX = 0.066, SC = 0.119;      // how high the bore and the scope lie over the grip
      // the wooden stock: butt with a cheek rest, a grip, a long fore-end
      b.add(prism([[-0.335, 0.046], [-0.3, 0.06], [-0.15, 0.064], [-0.085, 0.05], [-0.04, 0.047], [0.305, 0.047], [0.315, 0.037], [0.305, 0.02], [0.1, 0.013], [0.078, 0.003], [0.03, 0.001], [0.018, -0.02], [0.003, -0.07], [-0.03, -0.075],
        [-0.03, -0.045], [-0.046, -0.012], [-0.085, -0.002], [-0.2, -0.03], [-0.335, -0.056]], 0.044, 0.005), 'wood', 0, 0, 0);
      b.add(prism([[-0.335, 0.047], [-0.335, -0.057], [-0.352, -0.054], [-0.352, 0.044]], 0.045, 0.004), 'rubber', 0, 0, 0);       // the butt pad
      b.both(box(0.0012, 0.02, 0.1), 'woodD', 0.0222, 0.03, -0.2);                           // grooves to hold the fore-end by
      // the action and the barrel
      b.add(tube(0.0172, 0.0172, 0.225, 14), 'gun', 0, AX, -0.05);
      b.add(tube(0.0092, 0.0128, 0.57, 12), 'gun', 0, AX, -0.447);
      b.add(lathe([[0.0092, 0], [0.0145, 0.004], [0.0145, 0.062], [0.0105, 0.066], [0.0062, 0.066]], 12), 'steel', 0, AX, -0.732);      // the brake at the muzzle
      for (let i = 0; i < 3; i++) b.add(tube(0.0149, 0.0149, 0.007, 12), 'dark', 0, AX, -0.75 - i * 0.016);
      b.add(prism([[0.076, 0.004], [0.076, -0.016], [0.066, -0.028], [0.034, -0.028], [0.026, -0.012], [0.03, -0.012], [0.037, -0.024], [0.064, -0.024], [0.072, -0.014], [0.072, 0.004]], 0.012, 0), 'gun', 0, 0, 0);      // trigger guard
      b.add(box(0.004, 0.02, 0.005), 'steel', 0, -0.008, -0.05, 0.3);
      // the scope: a tube with a bell at each end, two knobs, two rings to hold it
      b.add(tube(0.0128, 0.0128, 0.24, 14), 'dark', 0, SC, -0.07);
      b.add(lathe([[0.0128, 0], [0.0235, 0.05], [0.0245, 0.11], [0.0225, 0.112]], 16), 'dark', 0, SC, -0.19);
      b.add(lathe([[0.0128, 0], [0.019, 0.034], [0.02, 0.062], [0.0185, 0.064]], 16), 'dark', 0, SC, 0.05, Math.PI);
      b.add(tube(0.0215, 0.0215, 0.002, 16), 'glass', 0, SC, -0.297);
      b.add(tube(0.017, 0.017, 0.002, 16), 'glass', 0, SC, 0.111);
      b.add(rbox(0.03, 0.03, 0.032, 0.003), 'dark', 0, SC, -0.075);
      b.add(tube(0.0105, 0.0105, 0.018, 12), 'gun', 0, SC + 0.023, -0.075, Math.PI / 2);
      b.add(tube(0.0105, 0.0105, 0.018, 12), 'gun', 0.023, SC, -0.075, 0, Math.PI / 2);
      for (const z of [-0.02, -0.135]) { b.add(rbox(0.016, 0.03, 0.014, 0.002), 'gun', 0, AX + 0.03, z); b.add(tube(0.0152, 0.0152, 0.014, 14), 'gun', 0, SC, z); }
      // two legs folded forward under the barrel
      b.add(rbox(0.034, 0.014, 0.022, 0.002), 'gun', 0, 0.012, -0.275);
      b.both(tube(0.0045, 0.0045, 0.23, 8), 'gun', 0.014, 0.004, -0.39);
      b.both(tube(0.0062, 0.0062, 0.022, 8), 'rubber', 0.014, 0.004, -0.512);
      // the bolt: its handle sticks out to the right and down
      b.part('bolt');
      b.add(tube(0.0115, 0.0115, 0.03, 12), 'steel', 0, 0, 0.0755);
      b.rod(0.0048, 0.0042, [0.006, -0.002, 0.052], [0.054, -0.0235, 0.052], 'steel');
      b.add(new THREE.SphereGeometry(0.0115, 10, 8), 'dark', 0.054, -0.0235, 0.052);
      b.part('mag');
      b.add(rbox(0.03, 0.052, 0.072, 0.003), 'gun', 0, -0.01, -0.118);
      b.add(box(0.031, 0.004, 0.074), 'dark', 0, -0.036, -0.118);
      return { shapes: b.done(), pivots: { bolt: [0, AX, 0] }, muzzle: [0, AX, -0.8], eject: [0.02, AX + 0.01, -0.02], hand: [0, -0.03, 0.012, -0.2, 0, 0], support: [0, 0.004, -0.2, -Math.PI / 2, -Math.PI / 2, 0], boltHand: [0.082, AX - 0.074, 0.07, -0.15, 0.55, -0.15], magOut: [0, -0.17, 0], magHand: [-0.004, -0.032, -0.118, 0, 0, 0.25], len: [-0.8, 0.352] };
    },

    bazooka() {
      const b = builder(), AX = 0.094, R = 0.047;      // the tube lies this high over the grip
      b.add(tube(R, R, 0.93, 18), 'olive', 0, AX, -0.085);
      b.add(lathe([[R, 0], [0.0555, 0.035], [0.058, 0.045], [0.0545, 0.047], [0.043, 0.047]], 18), 'oliveD', 0, AX, -0.535);            // the mouth
      b.add(lathe([[R, 0], [0.05, 0.03], [0.079, 0.13], [0.074, 0.132], [0.046, 0.04]], 18), 'oliveD', 0, AX, 0.38, Math.PI);          // the flare at the back
      for (const z of [-0.4, -0.13, 0.24]) b.add(tube(0.0496, 0.0496, 0.02, 18), 'gun', 0, AX, z);
      // grip with trigger, a wooden handle in front, a pad for the shoulder
      b.add(prism([[0.02, 0.05], [0.014, -0.014], [0.004, -0.064], [-0.034, -0.07], [-0.03, -0.03], [-0.03, 0.05]], 0.028, 0.003), 'poly', 0, 0, 0);
      b.add(prism([[0.07, 0.05], [0.07, 0.012], [0.06, 0.002], [0.024, 0.002], [0.018, 0.012], [0.022, 0.014], [0.027, 0.006], [0.058, 0.006], [0.066, 0.014], [0.066, 0.05]], 0.012, 0), 'gun', 0, 0, 0);
      b.add(box(0.004, 0.02, 0.005), 'steel', 0, 0.022, -0.044, 0.3);
      b.add(tube(0.0165, 0.0185, 0.1, 10), 'wood', 0, -0.004, -0.245, Math.PI / 2 - 0.12);
      b.add(rbox(0.03, 0.012, 0.04, 0.002), 'gun', 0, 0.046, -0.245);
      b.add(prism([[-0.17, 0.05], [-0.17, 0.02], [-0.19, 0.005], [-0.27, 0.005], [-0.29, 0.02], [-0.29, 0.05]], 0.06, 0.006), 'rubber', 0, 0, 0);
      // a sight on the left: a post with a frame
      b.add(box(0.006, 0.05, 0.008), 'gun', -0.052, AX + 0.038, -0.2);
      b.add(rbox(0.03, 0.036, 0.06, 0.003), 'gun', -0.058, AX + 0.078, -0.2);
      b.add(box(0.022, 0.028, 0.0015), 'glass', -0.058, AX + 0.078, -0.2305);
      b.add(box(0.022, 0.028, 0.0015), 'glass', -0.058, AX + 0.078, -0.1695);
      // the rocket: its nose sticks out of the mouth until it is fired
      b.part('rocket');
      b.add(lathe([[0.0405, 0], [0.0395, 0.06], [0.03, 0.118], [0.012, 0.162], [0.0005, 0.17]], 16), 'gun', 0, 0, 0);
      b.add(tube(0.0408, 0.0408, 0.016, 16), 'yellow', 0, 0, -0.022);
      b.add(tube(0.0405, 0.0405, 0.24, 16), 'olive', 0, 0, 0.12);
      b.add(tube(0.02, 0.03, 0.1, 12), 'gun', 0, 0, 0.29);
      for (let i = 0; i < 4; i++) b.add(box(0.0018, 0.036, 0.07), 'tin', Math.sin(i * Math.PI / 2) * 0.03, Math.cos(i * Math.PI / 2) * 0.03, 0.31, 0, 0, -i * Math.PI / 2);
      return { shapes: b.done(), pivots: { rocket: [0, AX, -0.54] }, muzzle: [0, AX, -0.72], hand: [0, -0.024, 0.012, -0.2, 0, 0], support: [0, 0.0, -0.245, -0.1, 0, 0], magHand: [0.0, -0.058, 0.13, -Math.PI / 2, 0, 0], len: [-0.71, 0.512] };
    },
  };

  // ---------- copies ----------
  const made = {};
  function def(id) { return made[id] || (made[id] = (DEFS[id] || DEFS.knife)()); }
  // A copy of a weapon. { group, parts: { slide, mag, ... } (groups that can be moved), def }
  function build(id, opt = {}) {
    const d = def(id), group = new THREE.Group(), parts = {};
    for (const name of Object.keys(d.shapes)) {
      const holder = name === 'body' ? group : new THREE.Group();
      for (const s of d.shapes[name]) { const m = new THREE.Mesh(s.geo, M[s.mat]); m.castShadow = !!opt.shadow; holder.add(m); }
      if (name !== 'body') {
        const pv = d.pivots[name] || [0, 0, 0];
        holder.position.set(pv[0], pv[1], pv[2]); holder.userData.home = pv;
        group.add(holder); parts[name] = holder;
      }
    }
    return { group, parts, def: d, id };
  }

  // The whole weapon as ONE mesh, every shape painted in its material's colour: for where it is small in the
  // picture and nothing on it moves (in a dino's hand). One draw call instead of one for each material and part.
  const flats = {};
  let flatMat = null;
  function flat(id, opt = {}) {
    if (!flats[id]) {
      const d = def(id), P = [], N = [], C = [];
      for (const name of Object.keys(d.shapes)) {
        const pv = name === 'body' ? [0, 0, 0] : d.pivots[name] || [0, 0, 0];
        for (const s of d.shapes[name]) {
          const g = s.geo.index ? s.geo.toNonIndexed() : s.geo, p = g.attributes.position, n = g.attributes.normal, c = M[s.mat].color;
          for (let i = 0; i < p.count; i++) { P.push(p.getX(i) + pv[0], p.getY(i) + pv[1], p.getZ(i) + pv[2]); N.push(n.getX(i), n.getY(i), n.getZ(i)); C.push(c.r, c.g, c.b); }
          if (g !== s.geo) g.dispose();
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      flats[id] = geo;
    }
    flatMat = flatMat || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 });
    const m = new THREE.Mesh(flats[id], flatMat); m.castShadow = !!opt.shadow;
    return m;
  }

  // One part of a weapon alone, around the part's own origin (the rocket that flies).
  function piece(id, name, opt = {}) {
    const g = new THREE.Group();
    for (const s of def(id).shapes[name] || []) { const m = new THREE.Mesh(s.geo, M[s.mat]); m.castShadow = !!opt.shadow; g.add(m); }
    return g;
  }

  // ---------- an arm for one's own view ----------
  // side: 1 the right arm, -1 the left. skin, sleeve: colours; bare: a short sleeve (the fore-arm is skin).
  // The hand is closed around a handle that runs along its y axis; the fingers go round the front (-z) of it.
  // { group (the hand: place it on the handle), fore (the fore-arm: aim it with aimArm) }
  const armGeo = {};
  function arm(side, skin, sleeve, bare) {
    const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.72, metalness: 0 }), cloth = new THREE.MeshStandardMaterial({ color: sleeve, roughness: 0.85, metalness: 0 });
    if (!armGeo.hand) {
      const b = builder(), seg = (r, ax, ay, az, bx, by, bz) => {
        const len = Math.hypot(bx - ax, by - ay, bz - az), g = new THREE.CapsuleGeometry(r, len, 3, 8);
        Q.setFromUnitVectors(V.set(0, 1, 0), new THREE.Vector3(bx - ax, by - ay, bz - az).normalize());
        E.setFromQuaternion(Q);
        b.add(g, 'skin', (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, E.x, E.y, E.z);
      };
      b.add(new THREE.SphereGeometry(1, 12, 10).scale(0.021, 0.047, 0.044), 'skin', 0.031, 0, 0.022);       // the palm and the back of the hand
      const ring = a => [Math.cos(a * DEG) * 0.0285, -Math.sin(a * DEG) * 0.0285];          // a place around the handle: 0 at the palm, 90 in front
      for (let i = 0; i < 4; i++) {
        const y = 0.033 - i * 0.022, k = i === 3 ? 0.84 : 1, r = i === 3 ? 0.0085 : 0.0098, a = ring(32), c = ring(100), d = ring(100 + 72 * k), e = ring(100 + 72 * k + 56 * k);
        seg(r, a[0], y, a[1], c[0], y, c[1]); seg(r * 0.96, c[0], y, c[1], d[0], y, d[1]); seg(r * 0.9, d[0], y, d[1], e[0], y, e[1]);
      }
      seg(0.0115, 0.03, 0.03, 0.04, 0.012, 0.056, 0.03); seg(0.0102, 0.012, 0.056, 0.03, -0.014, 0.056, 0.008); seg(0.0095, -0.014, 0.056, 0.008, -0.026, 0.05, -0.012);      // the thumb, over the back
      b.add(new THREE.SphereGeometry(1, 10, 8).scale(0.024, 0.034, 0.03), 'skin', 0.033, -0.004, 0.058);     // the wrist
      const s = b.done();
      armGeo.hand = s.body[0].geo.scale(0.93, 0.93, 0.93);
      armGeo.fore = new THREE.CylinderGeometry(0.041, 0.026, 0.44, 12).translate(0, 0.22, 0);          // from the wrist (y = 0) to the elbow
      armGeo.sleeve = new THREE.CylinderGeometry(0.0455, 0.033, 0.37, 12).translate(0, 0.255, 0);
      armGeo.cuff = new THREE.CylinderGeometry(0.0345, 0.0345, 0.022, 12).translate(0, 0.075, 0);
    }
    const group = new THREE.Group(), hand = new THREE.Mesh(armGeo.hand, skinM), fore = new THREE.Group();
    group.add(hand);
    fore.position.set(0.031, -0.006, 0.061);
    fore.add(new THREE.Mesh(armGeo.fore, skinM));
    if (!bare) { fore.add(new THREE.Mesh(armGeo.sleeve, cloth)); fore.add(new THREE.Mesh(armGeo.cuff, cloth)); }
    group.add(fore);
    if (side < 0) group.scale.x = -1;
    return { group, fore, side, dispose() { skinM.dispose(); cloth.dispose(); } };
  }
  // Points an arm's fore-arm at its elbow. elbow: a Vector3 in the frame that `ref` (an ancestor of the arm) lives in.
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
  function aimArm(a, elbowWorld) {
    a.group.updateWorldMatrix(true, false);
    _m.copy(a.group.matrixWorld).invert();
    _a.copy(elbowWorld).applyMatrix4(_m).sub(a.fore.position).normalize();
    a.fore.quaternion.setFromUnitVectors(UP, _a);
  }

  // ---------- small things ----------
  const shellGeo = tube(0.0042, 0.0046, 0.019, 8), flashGeo = (() => {
    // the fire at a muzzle: three pointed tongues along the barrel (seen from the side) and a star (seen from behind)
    const b = builder(), tongue = new THREE.Shape(), star = new THREE.Shape();
    [[0, 0], [0.026, 0.035], [0.012, 0.09], [0, 0.2], [-0.012, 0.09], [-0.026, 0.035]].forEach((p, i) => { if (i) tongue.lineTo(p[0], p[1]); else tongue.moveTo(p[0], p[1]); });
    for (let i = 0; i < 14; i++) { const r = i % 2 ? 0.024 : 0.05 + (i % 4 ? 0.022 : 0), a = i / 14 * Math.PI * 2; if (i) star.lineTo(Math.cos(a) * r, Math.sin(a) * r); else star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    for (let i = 0; i < 3; i++) b.add(new THREE.ShapeGeometry(tongue).rotateX(-Math.PI / 2), 'x', 0, 0, 0, 0, 0, i * Math.PI / 3);
    b.add(new THREE.ShapeGeometry(star), 'x', 0, 0, -0.02);
    return b.done().body[0].geo;
  })();
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });

  function dispose() {
    for (const k of Object.keys(made)) for (const list of Object.values(made[k].shapes)) for (const s of list) s.geo.dispose();
    for (const m of Object.values(M)) m.dispose();
    for (const g of Object.values(armGeo)) g.dispose();
    shellGeo.dispose(); flashGeo.dispose(); flashMat.dispose();
    for (const g of Object.values(flats)) g.dispose();
    if (flatMat) flatMat.dispose();
    if (env) env.dispose();
  }
  return { build, flat, piece, def, arm, aimArm, materials: M, shellGeo, flashGeo, flashMat, env, dispose, ids: Object.keys(DEFS) };
}
