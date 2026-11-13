// SLQ Game Lobby — the shooter's small things: sparks, the flash at a muzzle, the weapons and health packs that
// lie ready, the golden star and the dinos. Only what one sees; the rules about them are on the server.
// arsenal: makeArsenal() from weapons.js: the weapons that lie ready are its models, and so is the fire at a muzzle.
export function makeFx(THREE, scene, PICKUPS, HEALTH_PACKS, arsenal) {
  const mat = function (color, rough) { return new THREE.MeshStandardMaterial({ color: color, roughness: rough == null ? 0.95 : rough, metalness: 0.0 }); };
  const TEAM_COL = { A: 0xcf4a58, B: 0x4a78cf };

  /* ---- partikler + mundingsild -------------------------------------------- */
  const particles = [], partGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  function spawnParticles(pos, color, n, spd, ttl, up) {
    const m = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1 });
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(partGeo, m); p.position.copy(pos); scene.add(p);
      particles.push({ m: p, mat: m, vx: (Math.random() * 2 - 1) * spd, vy: Math.random() * spd * (up || 1), vz: (Math.random() * 2 - 1) * spd, t: 0, ttl: ttl });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.t += dt;
      if (p.t >= p.ttl) { scene.remove(p.m); particles.splice(i, 1); continue; }
      p.vy -= 14 * dt; p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      if (p.m.position.y < 0.04 && p.vy < 0) { p.m.position.y = 0.04; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
      p.mat.opacity = Math.max(0, 1 - p.t / p.ttl);
    }
  }
  const muzzle = new THREE.PointLight(0xffc266, 0, 10); scene.add(muzzle); let muzzleT = 0;
  function flashMuzzle(pos, strength) { muzzle.position.copy(pos); muzzle.intensity = strength || 26; muzzleT = 0.06; }
  function tickMuzzle(dt) { if (muzzleT > 0) { muzzleT -= dt; muzzle.intensity = muzzleT <= 0 ? 0 : muzzle.intensity * 0.72; } }
  // the fire one sees at somebody else's muzzle: pos, the way the shot goes, how big
  const flashes = [], AHEAD = new THREE.Vector3(0, 0, -1);
  function flashAt(pos, dir, size) {
    if (!arsenal) return;
    let f = flashes.find(x => x.t <= 0);
    if (!f) { if (flashes.length >= 8) f = flashes[0]; else { f = { m: new THREE.Mesh(arsenal.flashGeo, arsenal.flashMat.clone()), t: 0 }; scene.add(f.m); flashes.push(f); } }
    f.m.position.copy(pos); f.m.quaternion.setFromUnitVectors(AHEAD, dir); f.m.rotateZ(Math.random() * Math.PI); f.m.scale.setScalar(size || 2);
    f.m.visible = true; f.t = 0.065;
  }

  // smoke: soft grey balls that grow, rise and fade (behind a rocket)
  const puffs = [], puffGeo = new THREE.SphereGeometry(1, 8, 6);
  function smoke(pos, size, ttl, rise) {
    let p = puffs.find(x => x.t >= x.ttl);
    if (!p) { if (puffs.length >= 48) return; p = { m: new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xbdb9b0, transparent: true, opacity: 0, depthWrite: false })), t: 0, ttl: 0, s: 1, rise: 0 }; scene.add(p.m); puffs.push(p); }
    p.m.position.copy(pos); p.m.scale.setScalar(size); p.m.visible = true; p.t = 0; p.ttl = ttl; p.s = size; p.rise = rise || 0.4;
  }

  // The weapons that lie ready: the real thing, bigger than life, turning slowly over a ring of light in the
  // colour of its kind, with a faint pillar of the same light so that it is seen from far away.
  const BIG = { knife: 2.6, pistol: 3.1, badgun: 2.7, sniper: 1.45, bazooka: 1.3 };
  const ringGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.04, 28), glowGeo = new THREE.CylinderGeometry(0.34, 0.6, 2.3, 24, 1, true);
  const pickups = PICKUPS.map(function (p, i) {
    const g = new THREE.Group(), spin = new THREE.Group();
    if (arsenal) {
      const w = arsenal.build(p.type, { shadow: true }), s = BIG[p.type] || 2.5, len = w.def.len, tilt = new THREE.Group();
      w.group.scale.setScalar(s); w.group.position.set(0, -0.03 * s, -(len[0] + len[1]) / 2 * s);       // its middle over the middle of the ring
      tilt.rotation.x = 0.3; tilt.add(w.group); spin.add(tilt);
    }
    g.add(spin);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: p.color, transparent: true, opacity: 0.6, emissive: p.color, emissiveIntensity: 0.55, depthWrite: false }));
    ring.position.y = -1.07; g.add(ring);
    const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    glow.position.y = 0.06; g.add(glow);
    g.position.set(p.x, (p.y || 0) + 1.1, p.z);
    scene.add(g);
    return { type: p.type, x: p.x, z: p.z, y: p.y || 0, mesh: g, spin, phase: i * 1.7, active: true, respawn: 0, ride: p.ride || false };
  });


  const healthPacks = HEALTH_PACKS.map(function (h) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }));
    box.castShadow = true; g.add(box);
    const cm = new THREE.MeshStandardMaterial({ color: 0xd23b3b, emissive: 0xd23b3b, emissiveIntensity: 0.35 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.52), cm));   // rødt kors
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.52), cm));
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 20), new THREE.MeshStandardMaterial({ color: h.col, transparent: true, opacity: 0.5, emissive: h.col, emissiveIntensity: 0.3 }));
    ring.position.y = -0.5; g.add(ring);
    g.position.set(h.x, 1.0, h.z); scene.add(g);
    return { team: h.team, x: h.x, z: h.z, y: 0, mesh: g, active: true, respawn: 0 };
  });

  function makeStar(s) {
    const shape = new THREE.Shape(), spikes = 5, outer = 0.5 * s, inner = 0.22 * s;
    for (let i = 0; i < spikes * 2; i++) { const r = i % 2 ? inner : outer, a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2, x = Math.cos(a) * r, y = Math.sin(a) * r; i ? shape.lineTo(x, y) : shape.moveTo(x, y); }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16 * s, bevelEnabled: true, bevelSize: 0.03 * s, bevelThickness: 0.03 * s, bevelSegments: 1 }); geo.center();
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffcf33, emissive: 0xd98a10, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.7 }));
  }
  // A dino that walks. It is a small rig of round shapes: hips that carry a body, a neck with the head, a tail in
  // three pieces and two legs with a knee each; the bad pistol is in its hand. The shapes of each piece are joined
  // by colour and made once for all dinos. buildDino() hands back the group; in its userData:
  //   step(dt, speed, t)  every frame: speed over the ground in metres a second, t any even clock
  //   fire()              it shot: the arm kicks
  //   body                the body's material, one per dino (the game makes it flash when the dino is hit)
  // The walk is driven by how far it has come, not by time, so the feet do not slide: a leg swings forward with the
  // knee bent and the foot lifted, is set down, and carries the body over it while the hips dip between two steps.
  const DINO_SCALE = 1.45, HIP = 0.65, THIGH = 0.3, SHIN = 0.33, STRIDE = 0.96 * DINO_SCALE;
  let dinoGeo = null;
  function dinoShapes() {
    const ball = new THREE.SphereGeometry(1, 14, 10), limb = new THREE.CapsuleGeometry(1, 1, 3, 8), spike = new THREE.ConeGeometry(1, 1, 4);
    const S = {}, M4 = (x, y, z, sx, sy, sz, rx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, 0, 0)), new THREE.Vector3(sx, sy, sz));
    // a shape into a piece: where (from the piece's own joint), how big, tipped how far
    const put = function (piece, geo, sx, sy, sz, x, y, z, rx) { (S[piece] || (S[piece] = [])).push([geo, M4(x, y, z, sx, sy, sz, rx)]); };
    const taper = function (r0, r1, len) { return new THREE.CylinderGeometry(r1, r0, len, 10); };       // from r0 at the joint to r1 at the far end
    // the body, from the hips
    put('torso', ball, 0.3, 0.36, 0.46, 0, 0.74 - HIP, 0, -0.2);
    put('torsoBelly', ball, 0.24, 0.3, 0.36, 0, 0.68 - HIP, 0.1, -0.2);
    for (let i = 0; i < 4; i++) put('torsoBelly', spike, 0.045, 0.11, 0.07, 0, 1.09 - i * 0.075 - (i > 1 ? 0.03 * i : 0) - HIP, 0.1 - i * 0.19, -0.35);
    for (const s of [-1, 1]) { put('arms', limb, 0.045, 0.1, 0.045, s * 0.24, 0, 0.1, -1.1); put('arms', ball, 0.055, 0.05, 0.06, s * 0.24, -0.075, 0.24); }       // from the shoulders
    // neck and head, from the foot of the neck
    const NX = 0.92, NZ = 0.2;
    put('head', limb, 0.13, 0.2, 0.13, 0, 1.04 - NX, 0.3 - NZ, 0.55);
    put('head', ball, 0.2, 0.19, 0.24, 0, 1.26 - NX, 0.5 - NZ);
    put('head', ball, 0.15, 0.12, 0.2, 0, 1.2 - NX, 0.72 - NZ);
    for (const s of [-1, 1]) put('head', ball, 0.075, 0.05, 0.07, s * 0.115, 1.415 - NX, 0.585 - NZ);                 // brows
    put('headBelly', ball, 0.13, 0.07, 0.17, 0, 1.13 - NX, 0.7 - NZ);
    for (const s of [-1, 1]) { put('eyeWhite', ball, 0.06, 0.07, 0.05, s * 0.13, 0, 0); put('eyeDark', ball, 0.035, 0.045, 0.03, s * 0.145, 0.005, 0.035); put('headDark', ball, 0.012, 0.012, 0.012, s * 0.05, 1.22 - NX, 0.9 - NZ); }
    // the tail: three pieces, each from its own joint towards the back
    [[0.2, 0.125, 0.32], [0.125, 0.065, 0.3], [0.065, 0.008, 0.3]].forEach(function (q, i) { put('tail' + i, taper(q[0], q[1], q[2]).rotateX(-Math.PI / 2), 1, 1, 1, 0, 0, -q[2] / 2); put('tail' + i, ball, q[0], q[0], q[0], 0, 0, 0); });
    // a leg: the thigh from the hip, the shin from the knee, the foot from the ankle
    put('thigh', taper(0.125, 0.085, THIGH), 1, 1, 1, 0, -THIGH / 2, 0); put('thigh', ball, 0.13, 0.13, 0.13, 0, 0, 0); put('thigh', ball, 0.088, 0.088, 0.088, 0, -THIGH, 0);
    put('shin', taper(0.082, 0.055, SHIN), 1, 1, 1, 0, -SHIN / 2, 0); put('shin', ball, 0.06, 0.06, 0.06, 0, -SHIN, 0);
    put('foot', ball, 0.085, 0.045, 0.16, 0, -0.02, 0.085);
    for (const s of [-1, 0, 1]) put('footBelly', spike, 0.022, 0.07, 0.022, s * 0.05, -0.03, 0.235, Math.PI / 2 - 0.2);      // claws
    const join = function (list) {
      const P = [], N = [], v = new THREE.Vector3(), nm = new THREE.Matrix3();
      for (const part of list) {
        const g = part[0].index ? part[0].toNonIndexed() : part[0], p = g.attributes.position, n = g.attributes.normal;
        nm.getNormalMatrix(part[1]);
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(part[1]); P.push(v.x, v.y, v.z); v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z); }
        if (g !== part[0]) g.dispose();
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      return out;
    };
    const out = { collar: new THREE.TorusGeometry(1, 0.22, 6, 16) };
    for (const k of Object.keys(S)) out[k] = join(S[k]);
    ball.dispose(); limb.dispose(); spike.dispose();
    return out;
  }
  const dinoDark = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.3 }), dinoWhite = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.5 });
  function buildDino(team) {
    const g = new THREE.Group(), acc = TEAM_COL[team] || 0x999999, G = dinoGeo || (dinoGeo = dinoShapes());
    const bodyMat = new THREE.MeshStandardMaterial({ color: team === 'A' ? 0xc23a44 : 0x3a58c2, roughness: 0.75 }), bellyMat = new THREE.MeshStandardMaterial({ color: team === 'A' ? 0xe98d94 : 0x8da3ea, roughness: 0.8 });
    const grp = function (parent, x, y, z) { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
    const mesh = function (parent, geo, m, shadow) { const o = new THREE.Mesh(geo, m); o.castShadow = !!shadow; parent.add(o); return o; };
    const hips = grp(g, 0, HIP, 0);
    mesh(hips, G.torso, bodyMat, true); mesh(hips, G.torsoBelly, bellyMat);
    const collar = mesh(hips, G.collar, new THREE.MeshStandardMaterial({ color: acc, emissive: acc, emissiveIntensity: 0.4, roughness: 0.5 }));
    collar.scale.set(0.2, 0.2, 0.16); collar.position.set(0, 0.98 - HIP, 0.25); collar.rotation.x = Math.PI / 2 + 0.55;
    const arms = grp(hips, 0, 0.8 - HIP, 0.24); mesh(arms, G.arms, bodyMat);
    if (arsenal) { const w = arsenal.flat('badgun'); w.scale.setScalar(1.7); w.rotation.y = Math.PI; w.position.set(0.24, -0.1, 0.27); arms.add(w); }
    const neck = grp(hips, 0, 0.92 - HIP, 0.2); mesh(neck, G.head, bodyMat, true); mesh(neck, G.headBelly, bellyMat); mesh(neck, G.headDark, dinoDark);
    const eyes = grp(neck, 0, 1.35 - 0.92, 0.6 - 0.2); mesh(eyes, G.eyeWhite, dinoWhite); mesh(eyes, G.eyeDark, dinoDark);
    const tail = []; let at = grp(hips, 0, 0.66 - HIP, -0.3);
    for (let i = 0; i < 3; i++) { mesh(at, G['tail' + i], bodyMat, i === 0); tail.push(at); if (i < 2) at = grp(at, 0, 0, -[0.32, 0.3][i]); }
    const legs = [-1, 1].map(function (s) {
      const thigh = grp(hips, s * 0.17, 0, -0.02), shin = grp(thigh, 0, -THIGH, 0), foot = grp(shin, 0, -SHIN, 0);
      mesh(thigh, G.thigh, bodyMat, true); mesh(shin, G.shin, bodyMat); mesh(foot, G.foot, bodyMat); mesh(foot, G.footBelly, bellyMat);
      return { thigh: thigh, shin: shin, foot: foot };
    });
    g.scale.setScalar(DINO_SCALE);
    // ---- how it moves ----
    const seed = Math.random() * 20;
    let ph = Math.random() * 6.28, amp = 0, kick = 0, blink = 2 + Math.random() * 3, born = 0;
    g.userData.body = bodyMat;
    g.userData.fire = function () { kick = 1; };
    g.userData.step = function (dt, speed, t) {
      amp += (Math.min(1, speed / 1.6) - amp) * Math.min(1, dt * 8);
      ph += speed / STRIDE * 6.2832 * dt;
      const idle = 1 - amp, sn = Math.sin(ph);
      legs.forEach(function (L, i) {
        const p = ph + i * Math.PI, s = Math.sin(p) * amp, lift = Math.max(0, Math.cos(p)) * amp;
        const rt = -0.5 - 0.45 * s, rs = 1.0 + 0.75 * lift;
        L.thigh.rotation.x = rt; L.shin.rotation.x = rs; L.foot.rotation.x = -(rt + rs) + 0.55 * lift;
      });
      // the hips dip between two steps and are highest over the standing leg; they roll and turn a little with the legs
      hips.position.y = HIP - 0.055 * sn * sn * amp + Math.sin(t * 2.1 + seed) * 0.006 * idle;
      hips.rotation.set(0.07 * amp + Math.sin(t * 2.1 + seed) * 0.012 * idle, 0.07 * sn * amp, 0.05 * sn * amp);
      // the tail swings against the steps, each piece a little after the one before, and never hangs quite still
      tail.forEach(function (o, i) { o.rotation.y = (-0.16 * Math.sin(ph - 0.7 * i) - 0.05 * sn) * amp + 0.09 * Math.sin(t * 1.2 + seed - 0.6 * i) * (0.4 + 0.6 * idle); o.rotation.x = 0.1 - 0.02 * i + 0.05 * Math.sin(2 * ph - 0.5 * i) * amp + 0.02 * Math.sin(t * 0.9 + seed + i); });
      // the head nods with the steps; standing, it looks about
      neck.rotation.set(-0.05 * Math.sin(2 * ph + 0.5) * amp - 0.07 * amp - kick * 0.08, 0.34 * Math.sin(t * 0.55 + seed) * idle - 0.05 * sn * amp, 0.04 * Math.sin(t * 0.8 + seed) * idle);
      arms.rotation.x = -kick * 0.55 + 0.05 * Math.sin(2 * ph) * amp;
      if (kick > 0) kick = Math.max(0, kick - dt / 0.16);
      blink -= dt; if (blink < -0.11) blink = 2.2 + Math.random() * 4;
      eyes.scale.y = blink < 0 ? 0.12 : 1;
      if (born < 1) { born = Math.min(1, born + dt / 0.35); const k = 1 - (1 - born) * (1 - born); g.scale.setScalar(DINO_SCALE * (0.3 + 0.7 * k)); }
    };
    g.userData.step(0, 0, 0);
    return g;
  }

  // every frame: what lies ready turns and bobs, and the fire at the muzzles dies out. t: seconds, any clock
  function tick(dt, t) {
    for (const p of pickups) { p.spin.rotation.y += dt * 1.5; p.spin.position.y = Math.sin(t * 2.1 + p.phase) * 0.07; }
    for (const p of healthPacks) p.mesh.rotation.y += dt * 1.4;
    for (const f of flashes) if (f.t > 0) { f.t -= dt; f.m.material.opacity = Math.max(0, f.t / 0.065) * 0.95; if (f.t <= 0) f.m.visible = false; }
    for (const p of puffs) if (p.t < p.ttl) { p.t += dt; const k = p.t / p.ttl; if (k >= 1) { p.m.visible = false; continue; } p.m.position.y += p.rise * dt; p.m.scale.setScalar(p.s * (1 + k * 2.6)); p.m.material.opacity = 0.5 * (1 - k); }
  }

  return { spawnParticles: spawnParticles, updateParticles: updateParticles, flashMuzzle: flashMuzzle, tickMuzzle: tickMuzzle, flashAt: flashAt, smoke: smoke, tick: tick, pickups: pickups, healthPacks: healthPacks, makeStar: makeStar, buildDino: buildDino };
}
