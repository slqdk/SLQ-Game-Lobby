// SLQ Game Lobby — the weapon one sees in one's own hands. Moved here unchanged from the stand-alone shooter.
export function makeViewModel(THREE, camera) {
  const vm = new THREE.Group();
  camera.add(vm);
  let weapon = 'knife';

  function isViewModel(obj) { let o = obj; while (o) { if (o === vm) return true; o = o.parent; } return false; }
  function clearGroup(g) { while (g.children.length) { const c = g.children.pop(); c.traverse(function (n) { if (n.geometry) n.geometry.dispose(); }); } }
  function vmMat(c, rough, metal) { return new THREE.MeshStandardMaterial({ color: c, roughness: rough == null ? 0.45 : rough, metalness: metal == null ? 0.5 : metal }); }
  function setViewModel() {
    clearGroup(vm);
    const grp = new THREE.Group();
    function B(x, y, z) { return new THREE.BoxGeometry(x, y, z); }
    function C(r1, r2, h, s) { return new THREE.CylinderGeometry(r1, r2, h, s || 12); }
    function CO(r, h, s) { return new THREE.ConeGeometry(r, h, s || 12); }
    function add(geo, m, px, py, pz, rx, ry, rz) { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.rotation.set(rx || 0, ry || 0, rz || 0); grp.add(o); return o; }
    const gun = vmMat(0x2b2f34, 0.45, 0.6), dark = vmMat(0x161819, 0.5, 0.5), steel = vmMat(0x50565c, 0.4, 0.75),
      gripM = vmMat(0x2a2420, 0.8, 0.1), olive = vmMat(0x4b5320, 0.6, 0.25), oliveD = vmMat(0x353a17, 0.7, 0.2),
      blade = vmMat(0xc7ccd2, 0.28, 0.85), brass = vmMat(0xb08a3a, 0.4, 0.7), lens = vmMat(0x2a4a66, 0.2, 0.9), tip = vmMat(0xff7a33, 0.5, 0.2);
    const H = Math.PI / 2;
    if (weapon === 'bazooka') {
      add(C(0.055, 0.055, 0.62, 16), olive, 0, 0, -0.16, H);      // rør
      add(C(0.058, 0.11, 0.14, 16), oliveD, 0, 0, 0.18, H);       // bag-flare
      add(C(0.078, 0.062, 0.09, 16), dark, 0, 0, -0.47, H);       // mundstykke
      add(CO(0.045, 0.12, 12), tip, 0, 0, -0.42, -H);             // raket-spids
      add(B(0.05, 0.11, 0.07), gripM, 0, -0.1, 0.0, 0.3);         // greb
      add(B(0.09, 0.03, 0.14), oliveD, 0, 0.075, -0.16);          // top-skinne
      add(C(0.012, 0.012, 0.05, 8), dark, 0, 0.11, -0.28);        // sigte
      add(B(0.14, 0.1, 0.03), oliveD, 0.0, -0.02, 0.22);          // skulderstøtte
    } else if (weapon === 'pistol') {
      add(B(0.05, 0.055, 0.23), gun, 0, 0.02, -0.09);             // slæde
      add(B(0.045, 0.03, 0.2), dark, 0, -0.015, -0.085);          // ramme
      add(C(0.014, 0.014, 0.06, 10), dark, 0, 0.02, -0.22, H);    // løb
      add(B(0.048, 0.12, 0.07), gripM, 0, -0.07, 0.02, 0.28);     // greb
      add(B(0.04, 0.03, 0.05), dark, 0, -0.03, -0.02);            // aftrækkerbøjle
      add(B(0.008, 0.012, 0.012), steel, 0, 0.05, -0.19);         // korn
      add(B(0.02, 0.014, 0.012), steel, 0, 0.05, 0.0);            // kærv
    } else if (weapon === 'sniper') {
      add(B(0.05, 0.08, 0.34), gun, 0, 0, -0.16);                 // baskyle
      add(C(0.02, 0.02, 0.5, 12), dark, 0, 0.01, -0.44, H);       // løb
      add(C(0.032, 0.032, 0.06, 12), steel, 0, 0.01, -0.68, H);   // mundingsbremse
      add(C(0.032, 0.032, 0.22, 16), dark, 0, 0.075, -0.14, H);   // kikkert
      add(C(0.03, 0.03, 0.012, 16), lens, 0, 0.075, -0.25, H);    // linse
      add(B(0.012, 0.03, 0.02), steel, 0, 0.05, -0.06); add(B(0.012, 0.03, 0.02), steel, 0, 0.05, -0.22); // ringe
      add(B(0.05, 0.11, 0.08), gripM, 0, -0.08, 0.02, 0.26);      // greb
      add(B(0.045, 0.09, 0.05), dark, 0, -0.06, -0.1);            // magasin
      add(B(0.05, 0.07, 0.16), gripM, 0, -0.005, 0.16);           // kolbe
      add(C(0.008, 0.008, 0.14, 8), steel, -0.03, -0.1, -0.4, 0, 0, 0.5);  // bipod
      add(C(0.008, 0.008, 0.14, 8), steel, 0.03, -0.1, -0.4, 0, 0, -0.5);
    } else if (weapon === 'badgun') {
      add(B(0.05, 0.085, 0.2), vmMat(0x55552f, 0.7, 0.2), 0, 0, -0.08);   // krop
      add(C(0.013, 0.013, 0.12, 10), dark, 0, 0.005, -0.22, H);           // løb
      add(B(0.04, 0.1, 0.05), vmMat(0x3a3a1f, 0.8, 0.1), 0, -0.08, -0.04, 0.15); // magasin
      add(B(0.045, 0.1, 0.06), gripM, 0, -0.075, 0.04, 0.3);              // greb
      add(B(0.04, 0.05, 0.1), vmMat(0x45451f, 0.8, 0.1), 0, 0.0, 0.13);   // kolbe-stub
    } else { // kniv
      add(B(0.014, 0.24, 0.05), blade, 0, 0.06, -0.09, 0, 0, 0.04);       // klinge
      add(CO(0.03, 0.06, 4), blade, 0, 0.19, -0.09, 0, 0, 0.04);          // spids
      add(B(0.05, 0.02, 0.02), brass, 0, -0.06, -0.06);                   // parérstang
      add(B(0.028, 0.11, 0.03), gripM, 0, -0.12, -0.03, 0.05);            // skæfte
      add(C(0.02, 0.02, 0.02, 8), brass, 0, -0.18, -0.02);               // knop
    }
    grp.position.set(0.23, -0.21, -0.36);
    grp.rotation.y = -0.12;
    vm.add(grp);
  }
  setViewModel();
  return { group: vm, set: function (w) { if (w !== weapon) { weapon = w; setViewModel(); } } };
}
