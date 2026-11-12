// SLQ Game Lobby — the shooter's textures, drawn on canvases when the game starts (no picture files).
// Moved here unchanged from the stand-alone shooter.
export function makeTextures(THREE) {

  function tint(hex, k) {
    const r = Math.min(255, ((hex >> 16) & 255) * k | 0), g = Math.min(255, ((hex >> 8) & 255) * k | 0), b = Math.min(255, (hex & 255) * k | 0);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function makeTex(draw) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    draw(c.getContext('2d'), 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function speckle(g, w, h, n, a) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '0,0,0' : '255,255,255') + ',' + (Math.random() * a).toFixed(3) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }
  function brickTex(base, mortar) {
    return makeTex(function (g, w, h) {
      g.fillStyle = mortar; g.fillRect(0, 0, w, h);
      const bh = 32, bw = 64, m = 4;
      for (let r = 0; r < h / bh; r++) {
        const off = (r % 2) ? -bw / 2 : 0;
        for (let c = 0; c <= w / bw; c++) {
          g.fillStyle = tint(base, 0.82 + Math.random() * 0.36);
          g.fillRect(c * bw + off + m / 2, r * bh + m / 2, bw - m, bh - m);
        }
      }
      speckle(g, w, h, 700, 0.07);
    });
  }
  function flatTex(base, n, a, streaks) {
    return makeTex(function (g, w, h) {
      g.fillStyle = tint(base, 1); g.fillRect(0, 0, w, h);
      speckle(g, w, h, n, a);
      if (streaks) for (let i = 0; i < 7; i++) {
        g.fillStyle = 'rgba(0,0,0,' + (0.03 + Math.random() * 0.05).toFixed(3) + ')';
        g.fillRect(Math.random() * w, 0, 2 + Math.random() * 5, h);
      }
    });
  }
  function woodTex(base) {
    return makeTex(function (g, w, h) {
      const pw = 42;
      for (let p = 0; p <= w / pw; p++) {
        g.fillStyle = tint(base, 0.8 + Math.random() * 0.4);
        g.fillRect(p * pw, 0, pw - 2, h);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(p * pw + pw - 2, 0, 2, h);
        for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(60,35,15,' + (0.06 + Math.random() * 0.1).toFixed(3) + ')'; g.fillRect(p * pw + Math.random() * (pw - 4), 0, 1.5, h); }
      }
      speckle(g, w, h, 300, 0.05);
    });
  }
  function roofTileTex(base) {
    return makeTex(function (g, w, h) {
      const th = 32, tw = 42;
      for (let r = 0; r < h / th; r++) {
        const off = (r % 2) ? -tw / 2 : 0;
        for (let c = 0; c <= w / tw + 1; c++) {
          g.fillStyle = tint(base, 0.78 + Math.random() * 0.42);
          g.fillRect(c * tw + off, r * th, tw - 2, th - 3);
        }
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, r * th + th - 3, w, 3);
      }
      speckle(g, w, h, 400, 0.06);
    });
  }
  function hedgeTex(base) {
    return makeTex(function (g, w, h) {
      g.fillStyle = tint(base, 0.6); g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2000; i++) {                       // løvklumper
        g.fillStyle = tint(base, 0.5 + Math.random() * 1.0);
        g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 0, 6.283); g.fill();
      }
      for (let i = 0; i < 220; i++) {                        // mørke huller = dybde
        g.fillStyle = 'rgba(10,24,8,' + (0.14 + Math.random() * 0.26).toFixed(2) + ')';
        g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 0, 6.283); g.fill();
      }
    });
  }
  const TEX = {
    brickRed: brickTex(0x8a4438, '#9a9086'),
    brickTan: brickTex(0xa08055, '#a89e8f'),
    plaster: flatTex(0xbcb5a8, 900, 0.06, false),
    concrete: flatTex(0x8f949a, 1100, 0.07, true),
    wood: woodTex(0x8a6a44),
    tile: roofTileTex(0x86463a),
    asphalt: flatTex(0x3a3f45, 1600, 0.09, false),
    hedge: hedgeTex(0x3b5a24),
  };
  return { TEX: TEX, makeTex: makeTex, tint: tint };
}
