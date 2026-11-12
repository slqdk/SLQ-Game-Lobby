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
  const dinoGunMat = mat(0x33351f, 0.6);
  function buildDino(team) {
    const g = new THREE.Group(), acc = TEAM_COL[team] || 0x999999;
    const bodyCol = team === 'A' ? 0xc23a44 : 0x3a58c2, bellyCol = team === 'A' ? 0xe07680 : 0x7690e0;
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.8 });   // pr-dino (så blink er individuelt)
    const bellyMat = new THREE.MeshStandardMaterial({ color: bellyCol, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.85), bodyMat); body.position.set(0, 0.75, 0); body.rotation.x = -0.15; body.castShadow = true; g.add(body);
    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.6), bellyMat); belly.position.set(0, 0.62, 0.06); g.add(belly);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.4, 0.26), bodyMat); neck.position.set(0, 1.05, 0.3); neck.rotation.x = 0.5; g.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.44), bodyMat); head.position.set(0, 1.25, 0.52); head.castShadow = true; g.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.24), bodyMat); snout.position.set(0, 1.2, 0.8); g.add(snout);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x14171c });
    for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeMat); eye.position.set(sx * 0.1, 1.34, 0.66); g.add(eye); }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.75, 6), bodyMat); tail.rotation.x = Math.PI / 2; tail.position.set(0, 0.72, -0.64); g.add(tail);
    for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.5, 0.22), bodyMat); leg.position.set(s * 0.16, 0.28, 0); g.add(leg); }
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.17, 0.48), new THREE.MeshStandardMaterial({ color: acc, emissive: acc, emissiveIntensity: 0.4 })); collar.position.set(0, 0.99, 0.24); g.add(collar);
    const gb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.3), dinoGunMat); gb.position.set(0.22, 0.78, 0.4); g.add(gb);
    const brl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28, 8), dinoGunMat); brl.rotation.x = Math.PI / 2; brl.position.set(0.22, 0.8, 0.65); g.add(brl);
    for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1), bodyMat); arm.position.set(s * 0.22, 0.8, 0.3); arm.rotation.x = -1.0; g.add(arm); }
    g.scale.setScalar(1.45);   // større dino
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
