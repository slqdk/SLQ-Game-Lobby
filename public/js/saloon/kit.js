// SLQ Game Lobby — small tools for building the saloon in three dimensions: many shapes gathered in one mesh, each
// corner with a colour of its own, so that a whole room of furniture is a handful of meshes for the graphics card.
// Measures are the clubhouse's own: x across the room, z from the back wall towards the viewer (the room's "y"),
// y up. One unit is about a metre; a figure is a good two units tall.

export function makeKit(THREE) {
  const V = new THREE.Vector3(), V2 = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), M = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
  const n3 = new THREE.Vector3(), p3 = new THREE.Vector3(), nm = new THREE.Matrix3();
  // where a shape goes: place, turning (radians about x, y, z) and size
  const at = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => M.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz));
  // ... or standing at a place with its own "up" pointing along a line (a leg, a rail, a pipe)
  const along = (x, y, z, dx, dy, dz, sx = 1, sy = sx, sz = sx) => M.compose(V.set(x, y, z), Q.setFromUnitVectors(UP, V2.set(dx, dy, dz).normalize()), S.set(sx, sy, sz));

  function batch() {
    const P = [], N = [], C = [], U = [];
    const B = {
      // a shape, placed with a matrix. col: [r, g, b] or (x, y, z, normal) => [r, g, b]. uv: metres per repeat of a
      // picture (laid on by the way each face looks); without it the shape's own.
      add(geo, m, col = [1, 1, 1], uv = 0) {
        const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, nn = g.attributes.normal, t = g.attributes.uv;
        nm.getNormalMatrix(m);
        for (let i = 0; i < p.count; i++) {
          p3.fromBufferAttribute(p, i).applyMatrix4(m); n3.fromBufferAttribute(nn, i).applyMatrix3(nm).normalize();
          P.push(p3.x, p3.y, p3.z); N.push(n3.x, n3.y, n3.z);
          if (uv) { const k = 1 / uv; if (Math.abs(n3.y) > 0.7) U.push(p3.x * k, p3.z * k); else if (Math.abs(n3.x) > Math.abs(n3.z)) U.push(p3.z * k, p3.y * k); else U.push(p3.x * k, p3.y * k); }
          else U.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
          const c = typeof col === 'function' ? col(p3.x, p3.y, p3.z, n3) : col;
          C.push(c[0], c[1], c[2]);
        }
        if (g !== geo) g.dispose();
        geo.dispose();
        return B;
      },
      vert(x, y, z, nx, ny, nz, u, v, c) { P.push(x, y, z); N.push(nx, ny, nz); U.push(u, v); C.push(c[0], c[1], c[2]); },
      // the everyday shapes. A box by its middle; a round thing standing on (x, y, z) or lying along a line.
      box(x, y, z, w, h, d, col, rx = 0, ry = 0, rz = 0) { return B.add(new THREE.BoxGeometry(w, h, d), at(x, y, z, rx, ry, rz), col); },
      cyl(x, y, z, r, h, col, seg = 12, r2 = r) { return B.add(new THREE.CylinderGeometry(r2, r, h, seg), at(x, y + h / 2, z), col); },
      rod(x0, y0, z0, x1, y1, z1, r, col, seg = 6) { const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, l = Math.hypot(dx, dy, dz); return B.add(new THREE.CylinderGeometry(r, r, l, seg), along((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, dx, dy, dz), col); },
      ball(x, y, z, r, col, sx = 1, sy = 1, sz = 1, seg = 12) { return B.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)), at(x, y, z, 0, 0, 0, sx, sy, sz), col); },
      // a flat picture-less sheet with four corners (a, b along the bottom, then up), seen from the side its corners go round anticlockwise
      quad(a, b, c, d, col, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
        n3.subVectors(V.set(b[0], b[1], b[2]), V2.set(a[0], a[1], a[2])).cross(p3.subVectors(S.set(d[0], d[1], d[2]), V2)).normalize();
        for (const [q, u, v] of [[a, u0, v0], [b, u1, v0], [c, u1, v1], [a, u0, v0], [c, u1, v1], [d, u0, v1]]) B.vert(q[0], q[1], q[2], n3.x, n3.y, n3.z, u, v, col);
        return B;
      },
      get size() { return P.length / 9; },
      mesh(material, parent, name = '') {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        const mesh = new THREE.Mesh(g, material);
        mesh.name = name; mesh.matrixAutoUpdate = false;
        if (parent) parent.add(mesh);
        return mesh;
      },
    };
    return B;
  }
  // a picture drawn on the spot (the page allows no picture files from elsewhere)
  function picture(w, h, draw, repeat = false) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  // a colour, a little lighter or darker
  const tone = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  // wood: the colour wanders a little from board to board
  const wood = (c, grain = 0.12) => (x, y, z) => { const k = 1 - grain + grain * 2 * (0.5 + 0.5 * Math.sin(x * 7.3 + z * 5.1 + y * 3.7 + Math.sin(x * 2.1 + y * 1.3) * 2)); return [c[0] * k, c[1] * k, c[2] * k]; };
  return { batch, at, along, picture, tone, wood };
}
