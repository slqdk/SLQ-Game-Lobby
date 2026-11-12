// SLQ Game Lobby — joins the arena's many still pieces (every wall, step and tree is a mesh of its own when it
// is built) into a few big ones, one per kind of surface. The picture is the same; the graphics card is asked a
// few dozen times a frame instead of a couple of thousand, which is what makes the game run smoothly.
// keep: a Set of objects that must stay as they are (things that move, such as the train's wagons).
export function mergeStatic(THREE, scene, keep) {
  scene.updateMatrixWorld(true);
  const kinds = new Map();
  const keyOf = (o, m) => [m.type, m.color ? m.color.getHex() : 0, m.map ? m.map.source.uuid : '', m.roughness, m.metalness, m.transparent ? m.opacity : 1,
    m.emissive ? m.emissive.getHex() : 0, m.emissiveIntensity, m.side, m.fog, m.depthWrite, m.flatShading, o.castShadow, o.receiveShadow, o.renderOrder].join('|');
  const visit = o => {
    if (keep.has(o) || o.isLight || o.isCamera || !o.visible) return;
    if (o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material) && !o.material.vertexColors) {
      const a = o.geometry.attributes;
      if (a.position && a.normal && a.uv) {
        const k = keyOf(o, o.material);
        if (!kinds.has(k)) kinds.set(k, []);
        kinds.get(k).push(o);
      }
    }
    for (const c of o.children) visit(c);
  };
  for (const c of scene.children) visit(c);

  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let before = 0, after = 0;
  for (const list of kinds.values()) {
    before += list.length;
    if (list.length < 2) continue;
    let nv = 0, ni = 0;
    for (const o of list) { const g = o.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    for (const o of list) {
      const g = o.geometry, p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv, map = o.material.map;
      const rx = map ? map.repeat.x : 1, ry = map ? map.repeat.y : 1, flip = o.matrixWorld.determinant() < 0;
      nm.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
        v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
        uv[(vo + i) * 2] = t.getX(i) * rx; uv[(vo + i) * 2 + 1] = t.getY(i) * ry;
      }
      const count = g.index ? g.index.count : p.count;
      for (let i = 0; i < count; i += 3) {
        const a = g.index ? g.index.getX(i) : i, b = g.index ? g.index.getX(i + 1) : i + 1, c = g.index ? g.index.getX(i + 2) : i + 2;
        idx[io + i] = vo + a; idx[io + i + 1] = vo + (flip ? c : b); idx[io + i + 2] = vo + (flip ? b : c);
      }
      vo += p.count; io += count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const first = list[0], mat = first.material.clone();
    if (mat.map) { mat.map = mat.map.clone(); mat.map.repeat.set(1, 1); mat.map.needsUpdate = true; }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow; mesh.renderOrder = first.renderOrder;
    mesh.matrixAutoUpdate = false;
    for (const o of list) o.removeFromParent();
    scene.add(mesh);
    after++;
  }
  return { before, after: after + [...kinds.values()].filter(l => l.length < 2).length };
}
